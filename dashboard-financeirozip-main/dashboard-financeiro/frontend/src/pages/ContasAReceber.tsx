import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { ContaReceber, EmpresaOption, CentroCustoOption, TipoDocumentoOption } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { SearchableSelect } from '../components/SearchableSelect';
import { criarPDFBase, adicionarFiltrosAtivos, adicionarResumoCards, adicionarTabela, finalizarPDF, gerarNomeArquivo, formatCurrencyPDF, formatDatePDF } from '../utils/pdfExport';

interface MultiSelectDropdownProps {
  label: string;
  items: { id: string | number; nome: string }[];
  selected: (string | number)[];
  setSelected: (val: any[]) => void;
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  searchable?: boolean;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({ label, items, selected, setSelected, isOpen, setIsOpen, searchable = false }) => {
  const [busca, setBusca] = useState('');
  const itensFiltrados = searchable && busca
    ? items.filter(i => i.nome.toLowerCase().includes(busca.toLowerCase()))
    : items;

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:border-green-500 focus:outline-none"
      >
        <span className={selected.length > 0 ? 'text-gray-900' : 'text-gray-500'}>
          {selected.length === 0 ? 'Todos' : selected.length === items.length ? 'Todos' : `${selected.length} selecionado(s)`}
        </span>
        <svg
          className={`absolute right-3 top-9 h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute z-20 mt-1 w-full min-w-[250px] rounded-lg border border-gray-300 bg-white shadow-lg">
          <div className="border-b border-gray-200 p-2 flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(items.map(i => i.id))}
              className="text-xs text-green-600 hover:underline"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-xs text-gray-500 hover:underline"
            >
              Limpar
            </button>
          </div>
          {searchable && (
            <div className="border-b border-gray-200 p-2">
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-green-400 focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto p-2">
            {itensFiltrados.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-center gap-2 py-1 hover:bg-gray-50 rounded px-1">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => {
                    if (selected.includes(item.id)) {
                      setSelected(selected.filter((s: any) => s !== item.id));
                    } else {
                      setSelected([...selected, item.id]);
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm text-gray-700">{item.nome}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface Estatisticas {
  quantidade_titulos: number;
  valor_total: number;
  valor_medio: number;
  quantidade_atrasados: number;
  valor_atrasados: number;
  quantidade_vence_hoje: number;
  valor_vence_hoje: number;
}

interface DadosPorCliente {
  cliente: string;
  valor: number;
  quantidade: number;
}

interface DadosPorVencimento {
  faixa: string;
  valor: number;
  quantidade: number;
  ordem: number;
}

type AbaAtiva = 'dados' | 'analises' | 'por-cliente' | 'por-unidade';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];

export const ContasAReceber: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('dados');
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [dadosPorCliente, setDadosPorCliente] = useState<DadosPorCliente[]>([]);
  const [dadosPorVencimento, setDadosPorVencimento] = useState<DadosPorVencimento[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<number | null>(null);
  const [filtroCentroCusto, setFiltroCentroCusto] = useState<number | null>(null);
  const [filtroPrazo, setFiltroPrazo] = useState<string>('todos');
  const [filtroAno, setFiltroAno] = useState<number | null>(null);
  const [filtroMes, setFiltroMes] = useState<number[]>([]);
  const [todasContas, setTodasContas] = useState<ContaReceber[]>([]);
  const [mesDropdownAberto, setMesDropdownAberto] = useState(false);
  const [ordenacao, setOrdenacao] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'data_vencimento', direcao: 'asc' });
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumentoOption[]>([]);
  const [filtroTipoDocumento, setFiltroTipoDocumento] = useState<string[]>([]);
  const [tipoDocDropdownAberto, setTipoDocDropdownAberto] = useState(false);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [filtroCliente, setFiltroCliente] = useState<string | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [linhaExpandida, setLinhaExpandida] = useState<number | null>(null);
  const [clienteExpandido, setClienteExpandido] = useState<string | null>(null);
  const [subAbaCliente, setSubAbaCliente] = useState<'tabela' | 'grafico'>('tabela');
  const [unidadeExpandida, setUnidadeExpandida] = useState<string | null>(null);
  const [subAbaUnidade, setSubAbaUnidade] = useState<'tabela' | 'grafico'>('tabela');
  const [ordInternaUnidade, setOrdInternaUnidade] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'data_vencimento', direcao: 'asc' });
  const [filtroUnidades, setFiltroUnidades] = useState<string[]>([]);
  const [unidadeDropdownAberto, setUnidadeDropdownAberto] = useState(false);
  const [filtroDocumentos, setFiltroDocumentos] = useState<string[]>([]);
  const [documentoDropdownAberto, setDocumentoDropdownAberto] = useState(false);
  const [documentosDisponiveis, setDocumentosDisponiveis] = useState<{ id: string; nome: string }[]>([]);
  const [filtroTipoCondicao, setFiltroTipoCondicao] = useState<string[]>([]);
  const [tipoCondicaoDropdownAberto, setTipoCondicaoDropdownAberto] = useState(false);
  const [tiposCondicaoDisponiveis, setTiposCondicaoDisponiveis] = useState<{ id: string; nome: string }[]>([]);

  const ordenarContas = (contasParaOrdenar: ContaReceber[]) => {
    return [...contasParaOrdenar].sort((a, b) => {
      let valorA: any;
      let valorB: any;
      
      switch (ordenacao.campo) {
        case 'cliente':
          valorA = (a.cliente || '').toLowerCase();
          valorB = (b.cliente || '').toLowerCase();
          break;
        case 'data_vencimento':
          valorA = (a.data_vencimento || '').split('T')[0];
          valorB = (b.data_vencimento || '').split('T')[0];
          break;
        case 'dias':
          valorA = calcularDiasAteVencimento(a.data_vencimento);
          valorB = calcularDiasAteVencimento(b.data_vencimento);
          break;
        case 'valor_total':
          valorA = a.valor_total || 0;
          valorB = b.valor_total || 0;
          break;
        case 'saldo_atual':
          valorA = a.saldo_atual || a.valor_total || 0;
          valorB = b.saldo_atual || b.valor_total || 0;
          break;
        case 'numero_documento':
          valorA = (a.numero_documento || '').toLowerCase();
          valorB = (b.numero_documento || '').toLowerCase();
          break;
        case 'nome_empresa':
          valorA = (a.nome_empresa || '').toLowerCase();
          valorB = (b.nome_empresa || '').toLowerCase();
          break;
        case 'nome_centrocusto':
          valorA = (a.nome_centrocusto || '').toLowerCase();
          valorB = (b.nome_centrocusto || '').toLowerCase();
          break;
        case 'indexador':
          valorA = (a.indexador || '').toLowerCase();
          valorB = (b.indexador || '').toLowerCase();
          break;
        case 'tipo_condicao':
          valorA = (a.tipo_condicao || '').toLowerCase();
          valorB = (b.tipo_condicao || '').toLowerCase();
          break;
        default:
          return 0;
      }
      
      if (valorA < valorB) return ordenacao.direcao === 'asc' ? -1 : 1;
      if (valorA > valorB) return ordenacao.direcao === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const toggleOrdenacao = (campo: string) => {
    setOrdenacao(prev => ({
      campo,
      direcao: prev.campo === campo && prev.direcao === 'asc' ? 'desc' : 'asc'
    }));
  };

  const renderSortIcon = (campo: string) => (
    <span className="ml-1 inline-block">
      {ordenacao.campo === campo ? (
        ordenacao.direcao === 'asc' ? '▲' : '▼'
      ) : (
        <span className="text-gray-300">▼</span>
      )}
    </span>
  );

  const meses = [
    { valor: 1, nome: 'Janeiro' },
    { valor: 2, nome: 'Fevereiro' },
    { valor: 3, nome: 'Marco' },
    { valor: 4, nome: 'Abril' },
    { valor: 5, nome: 'Maio' },
    { valor: 6, nome: 'Junho' },
    { valor: 7, nome: 'Julho' },
    { valor: 8, nome: 'Agosto' },
    { valor: 9, nome: 'Setembro' },
    { valor: 10, nome: 'Outubro' },
    { valor: 11, nome: 'Novembro' },
    { valor: 12, nome: 'Dezembro' },
  ];

  const anosDisponiveis = () => {
    const anoAtual = new Date().getFullYear();
    return [anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2];
  };

  const formatCurrency = (value: number | undefined) => {
    if (!value) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatCurrencyShort = (value: number) => {
    if (value >= 1000000) {
      return `R$ ${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `R$ ${(value / 1000).toFixed(0)}K`;
    }
    return formatCurrency(value);
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    const parts = dateString.split('T')[0].split('-');
    if (parts.length !== 3) return '-';
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  };

  const calcularDiasAteVencimento = (dataVencimento: string | undefined) => {
    if (!dataVencimento) return 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const [ano, mes, dia] = dataVencimento.split('T')[0].split('-').map(Number);
    const vencimento = new Date(ano, mes - 1, dia);
    vencimento.setHours(0, 0, 0, 0);
    const diffTime = vencimento.getTime() - hoje.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  useEffect(() => {
    const carregarFiltros = async () => {
      try {
        const [empresasData, ccData, tiposDocData] = await Promise.all([
          apiService.getEmpresas(),
          apiService.getCentrosCusto(),
          apiService.getTiposDocumento(),
        ]);
        setEmpresas(empresasData);
        setCentrosCusto(ccData);
        setTiposDocumento(tiposDocData);
      } catch (err) {
        console.error('Erro ao carregar filtros:', err);
      }
    };
    carregarFiltros();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const data = await apiService.getContasReceber('a_receber', 2000);
      setTodasContas(data);
    } catch (err) {
      setError('Erro ao carregar contas a receber');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltrosLocais = (
    dados: ContaReceber[],
    empresa: number | null,
    cc: number | null,
    prazo: string,
    ano: number | null,
    mesesSelecionados: number[],
    tiposDocSelecionados: string[],
    cliente: string | null,
    documentosSelecionados: string[] = [],
    tiposCondicaoSelecionados: string[] = []
  ) => {
    let contasFiltradas = [...dados];
    
    if (empresa) {
      contasFiltradas = contasFiltradas.filter(c => c.id_interno_empresa === empresa);
    }
    if (cliente) {
      contasFiltradas = contasFiltradas.filter(c => c.cliente === cliente);
    }
    if (cc) {
      contasFiltradas = contasFiltradas.filter(c => c.id_interno_centro_custo === cc);
    }
    if (ano) {
      contasFiltradas = contasFiltradas.filter(c => {
        if (!c.data_vencimento) return false;
        const anoVenc = parseInt(c.data_vencimento.split('T')[0].split('-')[0]);
        return anoVenc === ano;
      });
    }
    if (mesesSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        if (!c.data_vencimento) return false;
        const mesVenc = parseInt(c.data_vencimento.split('T')[0].split('-')[1]);
        return mesesSelecionados.includes(mesVenc);
      });
    }
    if (tiposDocSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        return c.id_documento && tiposDocSelecionados.includes(c.id_documento);
      });
    }
    if (documentosSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        const doc = (c.numero_documento || c.id_documento || '').trim();
        return documentosSelecionados.includes(doc);
      });
    }
    if (tiposCondicaoSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        return c.tipo_condicao && tiposCondicaoSelecionados.includes(c.tipo_condicao);
      });
    }
    if (prazo !== 'todos') {
      contasFiltradas = contasFiltradas.filter(c => {
        const dias = calcularDiasAteVencimento(c.data_vencimento);
        switch (prazo) {
          case 'hoje': return dias === 0;
          case '7dias': return dias >= 1 && dias <= 7;
          case '15dias': return dias >= 1 && dias <= 15;
          case '30dias': return dias >= 1 && dias <= 30;
          default: return true;
        }
      });
    }
    
    return contasFiltradas;
  };

  useEffect(() => {
    if (todasContas.length === 0) return;
    
    const clienteMap = new Map<string, string>();
    todasContas.forEach(c => {
      if (c.cliente) {
        const normalized = c.cliente.trim().toUpperCase();
        if (!clienteMap.has(normalized)) {
          clienteMap.set(normalized, c.cliente.trim());
        }
      }
    });
    const clientesUnicos = Array.from(clienteMap.values())
      .sort()
      .map(nome => ({ id: nome, nome }));
    setClientes(clientesUnicos);

    const docsSet = new Set<string>();
    todasContas.forEach(c => {
      const doc = (c.numero_documento || c.id_documento || '').trim();
      if (doc) docsSet.add(doc);
    });
    const docsUnicos = Array.from(docsSet).sort().map(d => ({ id: d, nome: d }));
    setDocumentosDisponiveis(docsUnicos);

    const tcSet = new Set<string>();
    todasContas.forEach(c => {
      if (c.tipo_condicao) tcSet.add(c.tipo_condicao);
    });
    setTiposCondicaoDisponiveis(Array.from(tcSet).sort().map(t => ({ id: t, nome: t })));

    const contasSemAtraso = todasContas.filter(c => calcularDiasAteVencimento(c.data_vencimento) >= 0);

    const contasFiltradas = aplicarFiltrosLocais(contasSemAtraso, filtroEmpresa, filtroCentroCusto, filtroPrazo, filtroAno, filtroMes, filtroTipoDocumento, filtroCliente, filtroDocumentos, filtroTipoCondicao);
    setContas(contasFiltradas);

    const venceHoje = contasFiltradas.filter(c => calcularDiasAteVencimento(c.data_vencimento) === 0);

    const stats: Estatisticas = {
      quantidade_titulos: contasFiltradas.length,
      valor_total: contasFiltradas.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0),
      valor_medio: contasFiltradas.length > 0
        ? contasFiltradas.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0) / contasFiltradas.length
        : 0,
      quantidade_atrasados: 0,
      valor_atrasados: 0,
      quantidade_vence_hoje: venceHoje.length,
      valor_vence_hoje: venceHoje.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0),
    };
    setEstatisticas(stats);

    const clienteAnaliseMap = new Map<string, { valor: number; quantidade: number }>();
    contasFiltradas.forEach(c => {
      const cliente = c.cliente || 'Sem Cliente';
      const atual = clienteAnaliseMap.get(cliente) || { valor: 0, quantidade: 0 };
      clienteAnaliseMap.set(cliente, {
        valor: atual.valor + (c.saldo_atual || c.valor_total || 0),
        quantidade: atual.quantidade + 1,
      });
    });
    const clienteArray = Array.from(clienteAnaliseMap.entries())
      .map(([cliente, data]) => ({ cliente, ...data }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 15);
    setDadosPorCliente(clienteArray);

    const faixas = [
      { faixa: 'Hoje', min: 0, max: 0, ordem: 1 },
      { faixa: '1-7 dias', min: 1, max: 7, ordem: 2 },
      { faixa: '8-15 dias', min: 8, max: 15, ordem: 3 },
      { faixa: '16-30 dias', min: 16, max: 30, ordem: 4 },
      { faixa: '31-60 dias', min: 31, max: 60, ordem: 5 },
      { faixa: '+60 dias', min: 61, max: Infinity, ordem: 6 },
    ];
    
    const vencimentoMap = new Map<string, { valor: number; quantidade: number; ordem: number }>();
    faixas.forEach(f => vencimentoMap.set(f.faixa, { valor: 0, quantidade: 0, ordem: f.ordem }));
    
    contasFiltradas.forEach(c => {
      const dias = calcularDiasAteVencimento(c.data_vencimento);
      if (dias >= 0) {
        const faixa = faixas.find(f => dias >= f.min && dias <= f.max);
        if (faixa) {
          const atual = vencimentoMap.get(faixa.faixa)!;
          vencimentoMap.set(faixa.faixa, {
            valor: atual.valor + (c.saldo_atual || c.valor_total || 0),
            quantidade: atual.quantidade + 1,
            ordem: atual.ordem,
          });
        }
      }
    });
    
    const vencimentoArray = Array.from(vencimentoMap.entries())
      .map(([faixa, data]) => ({ faixa, ...data }))
      .filter(d => d.quantidade > 0)
      .sort((a, b) => a.ordem - b.ordem);
    setDadosPorVencimento(vencimentoArray);
  }, [todasContas, filtroEmpresa, filtroCentroCusto, filtroPrazo, filtroAno, filtroMes, filtroTipoDocumento, filtroCliente, filtroDocumentos, filtroTipoCondicao]);

  useEffect(() => {
    carregarDados();

    // Carregar filtros padrão salvos
    const filtrosSalvos = localStorage.getItem('contas_a_receber_filtros_padrao');
    if (filtrosSalvos) {
      try {
        const f = JSON.parse(filtrosSalvos);
        if (f.filtroEmpresa != null) setFiltroEmpresa(f.filtroEmpresa);
        if (f.filtroCentroCusto != null) setFiltroCentroCusto(f.filtroCentroCusto);
        if (f.filtroPrazo && f.filtroPrazo !== 'todos') setFiltroPrazo(f.filtroPrazo);
        if (f.filtroAno != null) setFiltroAno(f.filtroAno);
        if (f.filtroMes?.length) setFiltroMes(f.filtroMes);
        if (f.filtroTipoDocumento?.length) setFiltroTipoDocumento(f.filtroTipoDocumento);
        if (f.filtroCliente != null) setFiltroCliente(f.filtroCliente);
        if (f.filtroUnidades?.length) setFiltroUnidades(f.filtroUnidades);
        if (f.filtroDocumentos?.length) setFiltroDocumentos(f.filtroDocumentos);
        if (f.filtroTipoCondicao?.length) setFiltroTipoCondicao(f.filtroTipoCondicao);
      } catch (err) {
        console.error('Erro ao carregar filtros padrão:', err);
      }
    }
  }, []);

  const limparFiltros = () => {
    setFiltroEmpresa(null);
    setFiltroCentroCusto(null);
    setFiltroPrazo('todos');
    setFiltroAno(null);
    setFiltroMes([]);
    setFiltroTipoDocumento([]);
    setFiltroCliente(null);
    setFiltroUnidades([]);
    setFiltroDocumentos([]);
    setFiltroTipoCondicao([]);
  };

  const FILTROS_PADRAO_KEY = 'contas_a_receber_filtros_padrao';

  const salvarFiltrosPadrao = () => {
    const filtros = {
      filtroEmpresa,
      filtroCentroCusto,
      filtroPrazo,
      filtroAno,
      filtroMes,
      filtroTipoDocumento,
      filtroCliente,
      filtroUnidades,
      filtroDocumentos,
      filtroTipoCondicao,
    };
    localStorage.setItem(FILTROS_PADRAO_KEY, JSON.stringify(filtros));
    alert('Filtros salvos como padrão! Serão aplicados automaticamente ao abrir a página.');
  };

  const removerFiltrosPadrao = () => {
    localStorage.removeItem(FILTROS_PADRAO_KEY);
    alert('Filtros padrão removidos.');
  };

  const temFiltrosPadrao = () => {
    return localStorage.getItem(FILTROS_PADRAO_KEY) !== null;
  };

  const exportarPDF = () => {
    const abaLabels: Record<AbaAtiva, string> = {
      'dados': 'Dados',
      'analises': 'Analises',
      'por-cliente': 'Por Cliente',
      'por-unidade': 'Por Unidade',
    };
    const abaLabel = abaLabels[abaAtiva];
    const { doc, pageWidth, margin, y: startY, dataGeracao } = criarPDFBase('Contas a Receber', `Aba: ${abaLabel}`);

    const empresaNome = filtroEmpresa ? empresas.find(e => e.id === filtroEmpresa)?.nome || '' : 'Todos';
    const ccNome = filtroCentroCusto ? centrosCusto.find(c => c.id === filtroCentroCusto)?.nome || '' : 'Todos';
    const prazoLabels: Record<string, string> = { todos: 'Todos', hoje: 'Vence Hoje', '7dias': 'Proximos 7 dias', '15dias': 'Proximos 15 dias', '30dias': 'Proximos 30 dias' };
    const mesesNomes = filtroMes.length > 0 ? filtroMes.map(m => meses.find(ms => ms.valor === m)?.nome || '').join(', ') : 'Todos';
    const clienteNome = filtroCliente || 'Todos';
    const tipoDocNomes = filtroTipoDocumento.length > 0 ? filtroTipoDocumento.join(', ') : 'Todos';
    const docNomes = filtroDocumentos.length > 0 ? filtroDocumentos.join(', ') : 'Todos';
    const tipoCondNomes = filtroTipoCondicao.length > 0 ? filtroTipoCondicao.join(', ') : 'Todos';

    const filtrosAtivos = [
      { label: 'Empresa', valor: empresaNome },
      { label: 'Centro de Custo', valor: ccNome },
      { label: 'Prazo', valor: prazoLabels[filtroPrazo] || 'Todos' },
      { label: 'Ano', valor: filtroAno ? String(filtroAno) : 'Todos' },
      { label: 'Mes', valor: mesesNomes },
      { label: 'Cliente', valor: clienteNome },
      { label: 'Tipo Documento', valor: tipoDocNomes },
      { label: 'Documento', valor: docNomes },
      { label: 'Tipo Condição', valor: tipoCondNomes },
    ];

    let y = adicionarFiltrosAtivos(doc, filtrosAtivos, startY, pageWidth, margin);

    const contasHoje = contas.filter(c => calcularDiasAteVencimento(c.data_vencimento) === 0);
    const contas7dias = contas.filter(c => { const d = calcularDiasAteVencimento(c.data_vencimento); return d >= 1 && d <= 7; });
    const contas15dias = contas.filter(c => { const d = calcularDiasAteVencimento(c.data_vencimento); return d >= 1 && d <= 15; });
    const contas30dias = contas.filter(c => { const d = calcularDiasAteVencimento(c.data_vencimento); return d >= 1 && d <= 30; });
    const valorHoje = contasHoje.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0);
    const valor7dias = contas7dias.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0);
    const valor15dias = contas15dias.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0);
    const valor30dias = contas30dias.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0);

    const cards = [
      { label: 'Total a Receber', valor: estatisticas?.valor_total || 0, cor: [22, 163, 74] as [number, number, number] },
      { label: 'Vencendo Hoje', valor: valorHoje, cor: [234, 179, 8] as [number, number, number] },
      { label: 'Proximos 7 dias', valor: valor7dias, cor: [20, 184, 166] as [number, number, number] },
      { label: 'Proximos 15 dias', valor: valor15dias, cor: [16, 185, 129] as [number, number, number] },
      { label: 'Proximos 30 dias', valor: valor30dias, cor: [8, 145, 178] as [number, number, number] },
    ];
    y = adicionarResumoCards(doc, cards, y, pageWidth, margin);

    if (abaAtiva === 'dados') {
      const contasOrdenadas = ordenarContas(contas);
      const body = contasOrdenadas.map(c => {
        const dias = calcularDiasAteVencimento(c.data_vencimento);
        const diasStr = dias === 0 ? 'Hoje' : dias < 0 ? `${Math.abs(dias)}d atrasado` : `${dias}d`;
        return [
          c.cliente || '-',
          formatDatePDF(c.data_vencimento),
          diasStr,
          c.titulo || c.lancamento || '-',
          c.numero_parcela || '-',
          c.numero_documento || c.id_documento || '-',
          c.nome_centrocusto || '-',
          c.tipo_condicao || '-',
          c.indexador || 'REAL',
          `R$ ${formatCurrencyPDF(c.valor_total || 0)}`,
          `R$ ${formatCurrencyPDF((c.saldo_atual || c.valor_total || 0) - (c.valor_total || 0))}`,
          c.valor_total ? (((c.saldo_atual || c.valor_total) - c.valor_total) / c.valor_total * 100).toFixed(2) + '%' : '0,00%',
          `R$ ${formatCurrencyPDF(c.saldo_atual || c.valor_total || 0)}`,
        ];
      });

      const totalSaldoAtual = contas.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0);

      adicionarTabela(doc, {
        head: [['Cliente', 'Vencimento', 'Dias', 'Titulo', 'Parcela', 'Documento', 'Centro Custo', 'Tipo Cond.', 'Indexador', 'Valor Orig.', 'Correção', '% Corr.', 'Saldo Atual']],
        body,
        foot: [['TOTAL', '', '', '', '', '', '', '', '', '', '', '', `R$ ${formatCurrencyPDF(totalSaldoAtual)}`]],
        columnStyles: {
          0: { cellWidth: 35 },
          6: { cellWidth: 28 },
          7: { cellWidth: 20 },
          8: { cellWidth: 18 },
          9: { halign: 'right', cellWidth: 22 },
          10: { halign: 'right', cellWidth: 18 },
          11: { halign: 'right', cellWidth: 16 },
          12: { halign: 'right', cellWidth: 24 },
        },
      }, y, margin);
    } else if (abaAtiva === 'por-cliente') {
      const clienteMap = new Map<string, { valor: number; quantidade: number }>();
      contas.forEach(c => {
        const cliente = c.cliente || 'Sem Cliente';
        const atual = clienteMap.get(cliente) || { valor: 0, quantidade: 0 };
        clienteMap.set(cliente, { valor: atual.valor + (c.saldo_atual || c.valor_total || 0), quantidade: atual.quantidade + 1 });
      });
      const clientesPorValor = Array.from(clienteMap.entries())
        .map(([cliente, data]) => ({ cliente, ...data }))
        .sort((a, b) => b.valor - a.valor);
      const totalGeral = clientesPorValor.reduce((acc, c) => acc + c.valor, 0);
      let acumuladoVal = 0;
      const body = clientesPorValor.map((c, i) => {
        const percentual = totalGeral > 0 ? (c.valor / totalGeral) * 100 : 0;
        acumuladoVal += percentual;
        return [
          String(i + 1),
          c.cliente,
          String(c.quantidade),
          `R$ ${formatCurrencyPDF(c.valor)}`,
          `${percentual.toFixed(2)}%`,
          `${acumuladoVal.toFixed(2)}%`,
        ];
      });

      adicionarTabela(doc, {
        head: [['#', 'Cliente', 'Qtd', 'Valor', '% Total', '% Acumulado']],
        body,
        foot: [['', 'TOTAL', String(contas.length), `R$ ${formatCurrencyPDF(totalGeral)}`, '100,00%', '']],
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        },
      }, y, margin);
    } else if (abaAtiva === 'por-unidade') {
      const unidadeMap = new Map<string, { valor: number; quantidade: number }>();
      contas.forEach(c => {
        const unidade = (c.numero_documento || c.id_documento || '').trim() || 'Sem Unidade';
        const atual = unidadeMap.get(unidade) || { valor: 0, quantidade: 0 };
        unidadeMap.set(unidade, { valor: atual.valor + (c.saldo_atual || c.valor_total || 0), quantidade: atual.quantidade + 1 });
      });
      const unidadesPorValor = Array.from(unidadeMap.entries())
        .map(([unidade, data]) => ({ unidade, ...data }))
        .sort((a, b) => b.valor - a.valor);
      const totalGeral = unidadesPorValor.reduce((acc, u) => acc + u.valor, 0);
      let acumuladoVal = 0;
      const body = unidadesPorValor.map((u, i) => {
        const percentual = totalGeral > 0 ? (u.valor / totalGeral) * 100 : 0;
        acumuladoVal += percentual;
        return [
          String(i + 1),
          u.unidade,
          String(u.quantidade),
          `R$ ${formatCurrencyPDF(u.valor)}`,
          `${percentual.toFixed(2)}%`,
          `${acumuladoVal.toFixed(2)}%`,
        ];
      });

      adicionarTabela(doc, {
        head: [['#', 'Unidade', 'Qtd', 'Valor', '% Total', '% Acumulado']],
        body,
        foot: [['', 'TOTAL', String(contas.length), `R$ ${formatCurrencyPDF(totalGeral)}`, '100,00%', '']],
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        },
      }, y, margin);
    } else if (abaAtiva === 'analises') {
      // Tabela de distribuicao por vencimento
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Distribuicao por Vencimento', margin, y);
      y += 5;

      const bodyVencimento = dadosPorVencimento.map(d => [
        d.faixa,
        String(d.quantidade),
        `R$ ${formatCurrencyPDF(d.valor)}`,
      ]);
      y = adicionarTabela(doc, {
        head: [['Faixa', 'Quantidade', 'Valor']],
        body: bodyVencimento,
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
      }, y, margin);

      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Top 15 Clientes', margin, y);
      y += 5;

      const bodyClientes = dadosPorCliente.map(d => [
        d.cliente,
        String(d.quantidade),
        `R$ ${formatCurrencyPDF(d.valor)}`,
      ]);
      adicionarTabela(doc, {
        head: [['Cliente', 'Quantidade', 'Valor']],
        body: bodyClientes,
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
      }, y, margin);
    }

    finalizarPDF(doc, gerarNomeArquivo('contas_a_receber', abaLabel), dataGeracao);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-green-600 border-r-transparent"></div>
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  const renderFiltros = () => (
    <div className="mb-6 rounded-lg bg-gray-50 p-4 shadow">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <SearchableSelect
          options={empresas}
          value={filtroEmpresa ?? undefined}
          onChange={(value) => setFiltroEmpresa(value as number | null)}
          label="Empresa"
          placeholder="Selecione uma empresa..."
          emptyText="Todas"
        />
        <SearchableSelect
          options={centrosCusto.map(cc => ({ ...cc, nome: cc.codigo ? `${cc.codigo} - ${cc.nome}` : cc.nome }))}
          value={filtroCentroCusto ?? undefined}
          onChange={(value) => setFiltroCentroCusto(value as number | null)}
          label="Centro de Custo"
          placeholder="Selecione um centro de custo..."
          emptyText="Todos"
        />
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Prazo de Vencimento</label>
          <select
            value={filtroPrazo}
            onChange={(e) => setFiltroPrazo(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none"
          >
            <option value="todos">Todos</option>
            <option value="hoje">Vence Hoje</option>
            <option value="7dias">Proximos 7 dias</option>
            <option value="15dias">Proximos 15 dias</option>
            <option value="30dias">Proximos 30 dias</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Ano</label>
          <select
            value={filtroAno || ''}
            onChange={(e) => setFiltroAno(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none"
          >
            <option value="">Todos</option>
            {anosDisponiveis().map((ano) => (
              <option key={ano} value={ano}>{ano}</option>
            ))}
          </select>
        </div>
        <MultiSelectDropdown
          label="Mes"
          items={meses.map(m => ({ id: m.valor, nome: m.nome }))}
          selected={filtroMes}
          setSelected={setFiltroMes}
          isOpen={mesDropdownAberto}
          setIsOpen={setMesDropdownAberto}
          searchable={false}
        />
        <div>
          <SearchableSelect
            label="Cliente"
            options={clientes.map(c => ({ id: c.id, nome: c.nome }))}
            value={filtroCliente ?? undefined}
            onChange={(value) => setFiltroCliente(value as string | null)}
            placeholder="Selecione um cliente..."
          />
        </div>
        <MultiSelectDropdown
          label="Tipo Documento"
          items={tiposDocumento.map(t => ({ id: t.id, nome: `${t.id} - ${t.nome}` }))}
          selected={filtroTipoDocumento}
          setSelected={setFiltroTipoDocumento}
          isOpen={tipoDocDropdownAberto}
          setIsOpen={setTipoDocDropdownAberto}
          searchable={true}
        />
        <MultiSelectDropdown
          label="Documento"
          items={documentosDisponiveis}
          selected={filtroDocumentos}
          setSelected={setFiltroDocumentos}
          isOpen={documentoDropdownAberto}
          setIsOpen={setDocumentoDropdownAberto}
          searchable={true}
        />
        <MultiSelectDropdown
          label="Tipo Condição"
          items={tiposCondicaoDisponiveis}
          selected={filtroTipoCondicao}
          setSelected={setFiltroTipoCondicao}
          isOpen={tipoCondicaoDropdownAberto}
          setIsOpen={setTipoCondicaoDropdownAberto}
          searchable={true}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={limparFiltros}
          className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
        >
          Limpar Filtros
        </button>
        <button
          type="button"
          onClick={salvarFiltrosPadrao}
          className="flex items-center rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
        >
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Salvar Padrão
        </button>
        {temFiltrosPadrao() && (
          <button
            type="button"
            onClick={removerFiltrosPadrao}
            className="flex items-center rounded-lg border border-red-300 px-4 py-2 text-red-600 hover:bg-red-50"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Remover Padrão
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 -mt-4">

      {(() => {
        const contasHoje = contas.filter(c => calcularDiasAteVencimento(c.data_vencimento) === 0);
        const contas7dias = contas.filter(c => { const d = calcularDiasAteVencimento(c.data_vencimento); return d >= 1 && d <= 7; });
        const contas15dias = contas.filter(c => { const d = calcularDiasAteVencimento(c.data_vencimento); return d >= 1 && d <= 15; });
        const contas30dias = contas.filter(c => { const d = calcularDiasAteVencimento(c.data_vencimento); return d >= 1 && d <= 30; });

        const valorHoje = contasHoje.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0);
        const valor7dias = contas7dias.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0);
        const valor15dias = contas15dias.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0);
        const valor30dias = contas30dias.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0);

        const clientesTotal = new Set(contas.map(c => c.cliente)).size;
        const clientesHoje = new Set(contasHoje.map(c => c.cliente)).size;
        const clientes7dias = new Set(contas7dias.map(c => c.cliente)).size;
        const clientes15dias = new Set(contas15dias.map(c => c.cliente)).size;
        const clientes30dias = new Set(contas30dias.map(c => c.cliente)).size;

        const totalTitulos = estatisticas?.quantidade_titulos || 0;
        const pct = (v: number, total: number) =>
          total > 0 ? (v / total * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : '0%';

        const formatarDataCurta = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
        const fim7 = new Date(hoje); fim7.setDate(fim7.getDate() + 7);
        const fim15 = new Date(hoje); fim15.setDate(fim15.getDate() + 15);
        const fim30 = new Date(hoje); fim30.setDate(fim30.getDate() + 30);

        return (
          <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg bg-gradient-to-br from-green-600 to-green-700 p-5 text-white shadow-lg">
              <div className="mb-1 text-xs font-medium opacity-90">Total a Receber</div>
              <div className="text-xl font-bold">{formatCurrency(estatisticas?.valor_total)}</div>
              <div className="mt-1 text-xs opacity-75">
                {totalTitulos.toLocaleString('pt-BR')} titulos | {clientesTotal} clientes
              </div>
            </div>

            <div className="rounded-lg bg-gradient-to-br from-yellow-500 to-yellow-600 p-5 text-white shadow-lg">
              <div className="mb-1 text-xs font-medium opacity-90">Vencendo Hoje</div>
              <div className="text-xl font-bold">{formatCurrency(valorHoje)}</div>
              <div className="mt-1 text-xs opacity-75">
                {contasHoje.length} titulo(s)
                <span className="ml-1 font-semibold opacity-90">({pct(contasHoje.length, totalTitulos)})</span>
                {' | '}
                {clientesHoje} clientes
                <span className="ml-1 font-semibold opacity-90">({pct(clientesHoje, clientesTotal)})</span>
              </div>
            </div>

            <div className="rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 p-5 text-white shadow-lg">
              <div className="mb-1 text-xs font-medium opacity-90">Proximos 7 dias</div>
              <div className="text-xs opacity-75 mb-1">de {formatarDataCurta(amanha)} ate {formatarDataCurta(fim7)}</div>
              <div className="text-xl font-bold">{formatCurrency(valor7dias)}</div>
              <div className="mt-1 text-xs opacity-75">
                {contas7dias.length} titulo(s)
                <span className="ml-1 font-semibold opacity-90">({pct(contas7dias.length, totalTitulos)})</span>
                {' | '}
                {clientes7dias} clientes
                <span className="ml-1 font-semibold opacity-90">({pct(clientes7dias, clientesTotal)})</span>
              </div>
            </div>

            <div className="rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 text-white shadow-lg">
              <div className="mb-1 text-xs font-medium opacity-90">Proximos 15 dias</div>
              <div className="text-xs opacity-75 mb-1">de {formatarDataCurta(amanha)} ate {formatarDataCurta(fim15)}</div>
              <div className="text-xl font-bold">{formatCurrency(valor15dias)}</div>
              <div className="mt-1 text-xs opacity-75">
                {contas15dias.length} titulo(s)
                <span className="ml-1 font-semibold opacity-90">({pct(contas15dias.length, totalTitulos)})</span>
                {' | '}
                {clientes15dias} clientes
                <span className="ml-1 font-semibold opacity-90">({pct(clientes15dias, clientesTotal)})</span>
              </div>
            </div>

            <div className="rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-700 p-5 text-white shadow-lg">
              <div className="mb-1 text-xs font-medium opacity-90">Proximos 30 dias</div>
              <div className="text-xs opacity-75 mb-1">de {formatarDataCurta(amanha)} ate {formatarDataCurta(fim30)}</div>
              <div className="text-xl font-bold">{formatCurrency(valor30dias)}</div>
              <div className="mt-1 text-xs opacity-75">
                {contas30dias.length} titulo(s)
                <span className="ml-1 font-semibold opacity-90">({pct(contas30dias.length, totalTitulos)})</span>
                {' | '}
                {clientes30dias} clientes
                <span className="ml-1 font-semibold opacity-90">({pct(clientes30dias, clientesTotal)})</span>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {contas.length} titulo(s) pendente(s)
          {todasContas.length >= 2000 && <span className="ml-2 text-orange-500">(lista limitada a 2000)</span>}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={exportarPDF} disabled={contas.length === 0}
            className="flex items-center rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50">
            <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Exportar PDF
          </button>
          <button
            type="button"
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className="flex items-center rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
          </button>
        </div>
      </div>
      {mostrarFiltros && renderFiltros()}

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setAbaAtiva('dados')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              abaAtiva === 'dados'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Dados
          </button>
          <button
            onClick={() => setAbaAtiva('analises')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              abaAtiva === 'analises'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Analises
          </button>
          <button
            onClick={() => setAbaAtiva('por-cliente')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              abaAtiva === 'por-cliente'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Por Cliente
          </button>
          <button
            onClick={() => setAbaAtiva('por-unidade')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              abaAtiva === 'por-unidade'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Por Unidade
          </button>
        </nav>
      </div>

      {abaAtiva === 'dados' && (
        <div className="rounded-lg bg-white p-3 shadow">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Lista de Contas a Receber</h2>
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            <table className="w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th onClick={() => toggleOrdenacao('cliente')} className="cursor-pointer px-2 py-2 text-left text-[10px] font-semibold uppercase text-gray-500 hover:bg-gray-100 whitespace-nowrap">
                    Cliente {renderSortIcon('cliente')}
                  </th>
                  <th onClick={() => toggleOrdenacao('data_vencimento')} className="cursor-pointer px-2 py-2 text-left text-[10px] font-semibold uppercase text-gray-500 hover:bg-gray-100 whitespace-nowrap">
                    Vencim. {renderSortIcon('data_vencimento')}
                  </th>
                  <th onClick={() => toggleOrdenacao('dias')} className="cursor-pointer px-1 py-2 text-center text-[10px] font-semibold uppercase text-gray-500 hover:bg-gray-100 whitespace-nowrap">
                    Dias {renderSortIcon('dias')}
                  </th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase text-gray-500 whitespace-nowrap">Titulo</th>
                  <th className="px-1 py-2 text-center text-[10px] font-semibold uppercase text-gray-500 whitespace-nowrap">Parc.</th>
                  <th onClick={() => toggleOrdenacao('numero_documento')} className="cursor-pointer px-2 py-2 text-left text-[10px] font-semibold uppercase text-gray-500 hover:bg-gray-100 whitespace-nowrap">
                    Documento {renderSortIcon('numero_documento')}
                  </th>
                  <th onClick={() => toggleOrdenacao('nome_centrocusto')} className="cursor-pointer px-2 py-2 text-left text-[10px] font-semibold uppercase text-gray-500 hover:bg-gray-100 whitespace-nowrap">
                    Centro Custo {renderSortIcon('nome_centrocusto')}
                  </th>
                  <th onClick={() => toggleOrdenacao('tipo_condicao')} className="cursor-pointer px-2 py-2 text-left text-[10px] font-semibold uppercase text-gray-500 hover:bg-gray-100 whitespace-nowrap">
                    Tipo Cond. {renderSortIcon('tipo_condicao')}
                  </th>
                  <th onClick={() => toggleOrdenacao('indexador')} className="cursor-pointer px-1 py-2 text-center text-[10px] font-semibold uppercase text-gray-500 hover:bg-gray-100 whitespace-nowrap">
                    Index. {renderSortIcon('indexador')}
                  </th>
                  <th onClick={() => toggleOrdenacao('valor_total')} className="cursor-pointer px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500 hover:bg-gray-100 whitespace-nowrap">
                    Valor Orig. {renderSortIcon('valor_total')}
                  </th>
                  <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500 whitespace-nowrap">Correção</th>
                  <th className="px-1 py-2 text-right text-[10px] font-semibold uppercase text-gray-500 whitespace-nowrap">%</th>
                  <th onClick={() => toggleOrdenacao('saldo_atual')} className="cursor-pointer px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500 hover:bg-gray-100 whitespace-nowrap">
                    Saldo Atual {renderSortIcon('saldo_atual')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {ordenarContas(contas).slice(0, 100).map((conta, index) => {
                  const dias = calcularDiasAteVencimento(conta.data_vencimento);
                  const tituloBase = conta.lancamento ? conta.lancamento.split('/')[0] : '';
                  const isExpanded = linhaExpandida === index;
                  return (
                    <React.Fragment key={index}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setLinhaExpandida(isExpanded ? null : index)}
                      >
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-gray-900 max-w-[180px] truncate">
                          <div className="flex items-center gap-1">
                            <span className={`text-gray-400 text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                            {conta.cliente || '-'}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-gray-500">
                          {formatDate(conta.data_vencimento)}
                        </td>
                        <td className="whitespace-nowrap px-1 py-2 text-center">
                          <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            dias < 0 ? 'bg-red-100 text-red-800' :
                            dias === 0 ? 'bg-yellow-100 text-yellow-800' :
                            dias <= 7 ? 'bg-orange-100 text-orange-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {dias === 0 ? 'Hoje' : dias < 0 ? `${Math.abs(dias)}d` : `${dias}d`}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-gray-500">
                          {conta.titulo || conta.lancamento || '-'}
                        </td>
                        <td className="whitespace-nowrap px-1 py-2 text-xs text-center text-gray-500">
                          {conta.numero_parcela || '-'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-gray-500">
                          {conta.numero_documento || conta.id_documento || '-'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-gray-500 max-w-[120px] truncate" title={`${(conta as any).codigo_centrocusto || ''} - ${conta.nome_centrocusto || ''}`}>
                          {(conta as any).codigo_centrocusto ? <span className="inline-flex items-center justify-center rounded bg-blue-100 text-blue-700 font-bold font-mono text-[11px] px-1 min-w-[20px]">{(conta as any).codigo_centrocusto}</span> : null}
                          {(conta as any).codigo_centrocusto ? ' ' : ''}{conta.nome_centrocusto || '-'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-gray-500 max-w-[100px] truncate">
                          {conta.tipo_condicao || '-'}
                        </td>
                        <td className="whitespace-nowrap px-1 py-2 text-xs text-center text-gray-500">
                          {conta.indexador || 'REAL'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-right font-medium text-gray-900">
                          {formatCurrency(conta.valor_total)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-right text-blue-600">
                          {formatCurrency((conta.saldo_atual || conta.valor_total) - (conta.valor_total || 0))}
                        </td>
                        <td className="whitespace-nowrap px-1 py-2 text-xs text-right text-blue-600">
                          {conta.valor_total ? (((conta.saldo_atual || conta.valor_total) - conta.valor_total) / conta.valor_total * 100).toFixed(1) + '%' : '0,0%'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-right font-semibold text-green-700">
                          {formatCurrency(conta.saldo_atual || conta.valor_total)}
                        </td>
                      </tr>
                      {isExpanded && tituloBase && (() => {
                        const parcelas = todasContas
                          .filter(c => c.lancamento && c.lancamento.split('/')[0] === tituloBase && c.lancamento !== conta.lancamento)
                          .sort((a, b) => {
                            const pa = parseInt(a.numero_parcela || '0');
                            const pb = parseInt(b.numero_parcela || '0');
                            return pa - pb;
                          });
                        const totalParcelas = todasContas.filter(c => c.lancamento && c.lancamento.split('/')[0] === tituloBase).length;
                        const valorTotalTitulo = todasContas
                          .filter(c => c.lancamento && c.lancamento.split('/')[0] === tituloBase)
                          .reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0);
                        return (
                          <tr>
                            <td colSpan={12} className="p-0">
                              <div className="bg-green-50 border-t border-b border-green-200 px-8 py-3">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    Titulo {tituloBase} — {totalParcelas} parcela(s) — Total: {formatCurrency(valorTotalTitulo)}
                                  </p>
                                  <span className="text-xs text-gray-400">{conta.tipo_condicao || '-'} | {conta.nome_empresa || '-'}</span>
                                </div>
                                {parcelas.length > 0 ? (
                                  <div className="max-h-60 overflow-y-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-xs text-gray-400 uppercase">
                                          <th className="text-left py-1 pr-3">Parcela</th>
                                          <th className="text-left py-1 pr-3">Vencimento</th>
                                          <th className="text-left py-1 pr-3">Dias</th>
                                          <th className="text-left py-1 pr-3">Documento</th>
                                          <th className="text-left py-1 pr-3">Indexador</th>
                                          <th className="text-right py-1 pr-3">Valor Original</th>
                                          <th className="text-right py-1 pr-3">Correção</th>
                                          <th className="text-right py-1 pr-3">%</th>
                                          <th className="text-right py-1">Saldo Atual</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {parcelas.map((p, pi) => {
                                          const diasP = calcularDiasAteVencimento(p.data_vencimento);
                                          return (
                                            <tr key={pi} className="border-t border-green-100 hover:bg-green-100">
                                              <td className="py-1.5 pr-3 text-gray-700 font-mono">{p.numero_parcela || '-'}</td>
                                              <td className="py-1.5 pr-3 text-gray-500">{formatDate(p.data_vencimento)}</td>
                                              <td className="py-1.5 pr-3">
                                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                  diasP < 0 ? 'bg-red-100 text-red-800' :
                                                  diasP === 0 ? 'bg-yellow-100 text-yellow-800' :
                                                  diasP <= 7 ? 'bg-orange-100 text-orange-800' :
                                                  'bg-green-100 text-green-800'
                                                }`}>
                                                  {diasP === 0 ? 'Hoje' : diasP < 0 ? `${Math.abs(diasP)}d atrasado` : `${diasP}d`}
                                                </span>
                                              </td>
                                              <td className="py-1.5 pr-3 text-gray-500 font-mono text-xs">{p.numero_documento || p.id_documento || '-'}</td>
                                              <td className="py-1.5 pr-3 text-gray-500">{p.indexador || 'REAL'}</td>
                                              <td className="py-1.5 pr-3 text-right font-semibold text-gray-700">{formatCurrency(p.valor_total)}</td>
                                              <td className="py-1.5 pr-3 text-right text-blue-600">{formatCurrency((p.saldo_atual || p.valor_total) - (p.valor_total || 0))}</td>
                                              <td className="py-1.5 pr-3 text-right text-blue-600">{p.valor_total ? (((p.saldo_atual || p.valor_total) - p.valor_total) / p.valor_total * 100).toFixed(2) + '%' : '0,00%'}</td>
                                              <td className="py-1.5 text-right font-semibold text-green-700">{formatCurrency(p.saldo_atual || p.valor_total)}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400 italic">Esta e a unica parcela deste titulo.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {contas.length > 100 && (
              <p className="mt-4 text-center text-sm text-gray-500">
                Mostrando 100 de {contas.length} registros
              </p>
            )}
          </div>
        </div>
      )}

      {abaAtiva === 'analises' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Distribuicao por Vencimento</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosPorVencimento} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} />
                  <YAxis type="category" dataKey="faixa" width={80} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="valor" fill="#10B981">
                    {dadosPorVencimento.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                    <LabelList dataKey="quantidade" position="right" formatter={(value: number) => `${value}`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Top 15 Clientes</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosPorCliente} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} />
                  <YAxis type="category" dataKey="cliente" width={150} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="valor" fill="#10B981">
                    {dadosPorCliente.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {abaAtiva === 'por-cliente' && (() => {
        const clienteMap = new Map<string, { valor: number; quantidade: number }>();
        contas.forEach(c => {
          const cliente = c.cliente || 'Sem Cliente';
          const atual = clienteMap.get(cliente) || { valor: 0, quantidade: 0 };
          clienteMap.set(cliente, {
            valor: atual.valor + (c.saldo_atual || c.valor_total || 0),
            quantidade: atual.quantidade + 1,
          });
        });
        const clientesPorValor = Array.from(clienteMap.entries())
          .map(([cliente, data]) => ({ cliente, ...data }))
          .sort((a, b) => b.valor - a.valor);

        const totalGeral = clientesPorValor.reduce((acc, c) => acc + c.valor, 0);
        let acumuladoVal = 0;
        const clientesComPareto = clientesPorValor.map((c, i) => {
          const percentual = totalGeral > 0 ? (c.valor / totalGeral) * 100 : 0;
          acumuladoVal += percentual;
          return { ...c, rank: i + 1, percentual, acumulado: acumuladoVal };
        });

        const clientesExibidos = [...clientesComPareto].sort((a, b) => {
          const dir = ordenacao.direcao === 'asc' ? 1 : -1;
          switch (ordenacao.campo) {
            case 'cliente': return a.cliente.localeCompare(b.cliente) * dir;
            case 'quantidade': return (a.quantidade - b.quantidade) * dir;
            case 'valor': return (a.valor - b.valor) * dir;
            case 'percentual': return (a.percentual - b.percentual) * dir;
            case 'acumulado': return (a.acumulado - b.acumulado) * dir;
            case 'rank': return (a.rank - b.rank) * dir;
            default: return (a.rank - b.rank) * dir;
          }
        });

        return (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Contas a Receber por Cliente</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {clientesComPareto.length} cliente(s) | Total: {formatCurrency(totalGeral)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarFiltros(!mostrarFiltros)}
                  className="flex items-center rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                >
                  <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
                </button>
              </div>

              <div className="mt-4 flex gap-2 border-b border-gray-200 pb-2">
                <button
                  onClick={() => setSubAbaCliente('tabela')}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium ${subAbaCliente === 'tabela' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Tabela
                </button>
                <button
                  onClick={() => setSubAbaCliente('grafico')}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium ${subAbaCliente === 'grafico' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Grafico
                </button>
              </div>

              {mostrarFiltros && renderFiltros()}
            </div>

            {subAbaCliente === 'tabela' && (
              <div className="overflow-hidden rounded-lg bg-white shadow">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-green-50">
                      <tr>
                        <th onClick={() => toggleOrdenacao('rank')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 w-12 cursor-pointer hover:bg-green-100">#{renderSortIcon('rank')}</th>
                        <th onClick={() => toggleOrdenacao('cliente')} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">Cliente{renderSortIcon('cliente')}</th>
                        <th onClick={() => toggleOrdenacao('quantidade')} className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">Qtd Titulos{renderSortIcon('quantidade')}</th>
                        <th onClick={() => toggleOrdenacao('valor')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">Valor{renderSortIcon('valor')}</th>
                        <th onClick={() => toggleOrdenacao('percentual')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">% do Total{renderSortIcon('percentual')}</th>
                        <th onClick={() => toggleOrdenacao('acumulado')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">% Acumulado{renderSortIcon('acumulado')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {clientesExibidos.map((c, index) => (
                        <React.Fragment key={index}>
                          <tr
                            onClick={() => setClienteExpandido(clienteExpandido === c.cliente ? null : c.cliente)}
                            className={`cursor-pointer hover:bg-gray-50 transition-colors ${clienteExpandido === c.cliente ? 'bg-green-50/50' : c.acumulado <= 80 ? 'bg-green-50/30' : c.acumulado <= 95 ? 'bg-yellow-50/30' : ''}`}
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400 font-mono">
                              <span className={`inline-block transition-transform mr-2 text-[10px] ${clienteExpandido === c.cliente ? 'rotate-90' : ''}`}>&#9654;</span>
                              {c.rank}
                            </td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-medium text-gray-900">{c.cliente}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 text-center">{c.quantidade}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-green-600 text-right">{formatCurrency(c.valor)}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-2">
                                  <div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(c.percentual * 2, 100)}%` }}></div>
                                </div>
                                <span className="w-14 text-right">{c.percentual.toFixed(2)}%</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-right">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.acumulado <= 80 ? 'bg-green-100 text-green-700' :
                                c.acumulado <= 95 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                {c.acumulado.toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                          {clienteExpandido === c.cliente && (
                            <tr className="bg-gray-50">
                              <td colSpan={6} className="px-8 py-4">
                                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-inner">
                                  <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vencimento</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Titulo</th>
                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Parcela</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">N Doc.</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dias</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo Condicao</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {contas.filter(conta => (conta.cliente || 'Sem Cliente') === c.cliente).map((conta, j) => {
                                        const dias = calcularDiasAteVencimento(conta.data_vencimento);
                                        const corDias = dias < 0 ? 'text-red-600' : dias === 0 ? 'text-orange-600' : 'text-green-600';
                                        return (
                                          <tr key={j} className="hover:bg-green-50/50">
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{formatDate(conta.data_vencimento)}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900">{conta.lancamento ? conta.lancamento.split('/')[0] : '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 text-center">{conta.numero_parcela || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{conta.numero_documento || conta.id_documento || '-'}</td>
                                            <td className={`whitespace-nowrap px-4 py-2 text-sm font-semibold ${corDias}`}>
                                              {dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias}d`}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{conta.nome_empresa || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{conta.tipo_condicao || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-green-600 font-semibold text-right">{formatCurrency(conta.valor_total || 0)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100">
                      <tr className="font-bold">
                        <td className="px-4 py-3 text-sm"></td>
                        <td className="px-6 py-3 text-sm text-gray-900">TOTAL</td>
                        <td className="px-6 py-3 text-sm text-gray-900 text-center">{contas.length}</td>
                        <td className="px-6 py-3 text-sm text-green-700 text-right">{formatCurrency(totalGeral)}</td>
                        <td className="px-6 py-3 text-sm text-gray-900 text-right">100,00%</td>
                        <td className="px-6 py-3 text-sm"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {subAbaCliente === 'grafico' && (
              <div className="mb-6 rounded-lg bg-white p-6 shadow">
                <p className="mb-4 text-sm text-gray-500">Distribuicao de valores a receber por cliente</p>
                <div style={{ height: Math.max(300, clientesExibidos.length * 45) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={clientesExibidos}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="cliente" type="category" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="rounded-lg border bg-white p-3 shadow-lg">
                                <p className="font-semibold text-gray-900">{data.cliente}</p>
                                <p className="text-sm text-green-600">{formatCurrency(data.valor)}</p>
                                <p className="text-xs text-gray-500">{data.quantidade} titulo(s) | {data.percentual.toFixed(2)}%</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="valor" fill="#10B981" radius={[0, 4, 4, 0]}>
                        {clientesExibidos.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.acumulado <= 80 ? '#10B981' : entry.acumulado <= 95 ? '#F59E0B' : '#EF4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {abaAtiva === 'por-unidade' && (() => {
        const unidadeMap = new Map<string, { valor: number; quantidade: number }>();
        contas.forEach(c => {
          const unidade = (c.numero_documento || c.id_documento || '').trim() || 'Sem Unidade';
          const atual = unidadeMap.get(unidade) || { valor: 0, quantidade: 0 };
          unidadeMap.set(unidade, {
            valor: atual.valor + (c.saldo_atual || c.valor_total || 0),
            quantidade: atual.quantidade + 1,
          });
        });
        const unidadesPorValor = Array.from(unidadeMap.entries())
          .map(([unidade, data]) => ({ unidade, ...data }))
          .sort((a, b) => b.valor - a.valor);

        const totalGeral = unidadesPorValor.reduce((acc, u) => acc + u.valor, 0);
        let acumuladoVal = 0;
        const unidadesComPareto = unidadesPorValor.map((u, i) => {
          const percentual = totalGeral > 0 ? (u.valor / totalGeral) * 100 : 0;
          acumuladoVal += percentual;
          return { ...u, rank: i + 1, percentual, acumulado: acumuladoVal };
        });

        const unidadesFiltradas = filtroUnidades.length > 0
          ? unidadesComPareto.filter(u => filtroUnidades.includes(u.unidade))
          : unidadesComPareto;

        const unidadesExibidas = [...unidadesFiltradas].sort((a, b) => {
          const dir = ordenacao.direcao === 'asc' ? 1 : -1;
          switch (ordenacao.campo) {
            case 'unidade': return a.unidade.localeCompare(b.unidade) * dir;
            case 'quantidade': return (a.quantidade - b.quantidade) * dir;
            case 'valor': return (a.valor - b.valor) * dir;
            case 'percentual': return (a.percentual - b.percentual) * dir;
            case 'acumulado': return (a.acumulado - b.acumulado) * dir;
            case 'rank': return (a.rank - b.rank) * dir;
            default: return (a.rank - b.rank) * dir;
          }
        });

        return (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Contas a Receber por Unidade</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {unidadesComPareto.length} unidade(s) | Total: {formatCurrency(totalGeral)}
                  </p>
                </div>
              </div>

              <div className="mt-4 mb-4">
                <div className="w-64">
                  <MultiSelectDropdown
                    label="Filtrar Unidades"
                    items={unidadesComPareto.map(u => ({ id: u.unidade, nome: u.unidade }))}
                    selected={filtroUnidades}
                    setSelected={setFiltroUnidades}
                    isOpen={unidadeDropdownAberto}
                    setIsOpen={setUnidadeDropdownAberto}
                    searchable={true}
                  />
                </div>
              </div>

              <div className="flex gap-2 border-b border-gray-200 pb-2">
                <button
                  onClick={() => setSubAbaUnidade('tabela')}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium ${subAbaUnidade === 'tabela' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Tabela
                </button>
                <button
                  onClick={() => setSubAbaUnidade('grafico')}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium ${subAbaUnidade === 'grafico' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Grafico
                </button>
              </div>
            </div>

            {subAbaUnidade === 'tabela' && (
              <div className="overflow-hidden rounded-lg bg-white shadow">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-green-50">
                      <tr>
                        <th onClick={() => toggleOrdenacao('rank')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 w-12 cursor-pointer hover:bg-green-100">#{renderSortIcon('rank')}</th>
                        <th onClick={() => toggleOrdenacao('unidade')} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">Unidade{renderSortIcon('unidade')}</th>
                        <th onClick={() => toggleOrdenacao('quantidade')} className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">Qtd Titulos{renderSortIcon('quantidade')}</th>
                        <th onClick={() => toggleOrdenacao('valor')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">Valor{renderSortIcon('valor')}</th>
                        <th onClick={() => toggleOrdenacao('percentual')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">% do Total{renderSortIcon('percentual')}</th>
                        <th onClick={() => toggleOrdenacao('acumulado')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">% Acumulado{renderSortIcon('acumulado')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {unidadesExibidas.map((u, index) => (
                        <React.Fragment key={index}>
                          <tr
                            onClick={() => setUnidadeExpandida(unidadeExpandida === u.unidade ? null : u.unidade)}
                            className={`cursor-pointer transition-colors ${unidadeExpandida === u.unidade ? 'bg-green-100 border-l-4 border-green-600 shadow-sm' : `hover:bg-gray-50 ${u.acumulado <= 80 ? 'bg-green-50/30' : u.acumulado <= 95 ? 'bg-yellow-50/30' : ''}`}`}
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400 font-mono">
                              <span className={`inline-block transition-transform mr-2 text-[10px] ${unidadeExpandida === u.unidade ? 'rotate-90' : ''}`}>&#9654;</span>
                              {u.rank}
                            </td>
                            <td className={`whitespace-nowrap px-6 py-3 text-sm text-gray-900 ${unidadeExpandida === u.unidade ? 'font-bold text-green-800' : 'font-medium'}`}>{u.unidade}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 text-center">{u.quantidade}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-green-600 text-right">{formatCurrency(u.valor)}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-2">
                                  <div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(u.percentual * 2, 100)}%` }}></div>
                                </div>
                                <span className="w-14 text-right">{u.percentual.toFixed(2)}%</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-right">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${u.acumulado <= 80 ? 'bg-green-100 text-green-700' :
                                u.acumulado <= 95 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                {u.acumulado.toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                          {unidadeExpandida === u.unidade && (
                            <tr className="bg-green-50/40">
                              <td colSpan={6} className="px-8 py-4 border-l-4 border-green-600">
                                <div className="overflow-hidden rounded-lg border border-green-200 bg-white shadow-md">
                                  <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => setOrdInternaUnidade(prev => ({ campo: 'cliente', direcao: prev.campo === 'cliente' && prev.direcao === 'asc' ? 'desc' : 'asc' }))}>Cliente {ordInternaUnidade.campo === 'cliente' ? (ordInternaUnidade.direcao === 'asc' ? '▲' : '▼') : <span className="text-gray-300">↕</span>}</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => setOrdInternaUnidade(prev => ({ campo: 'data_vencimento', direcao: prev.campo === 'data_vencimento' && prev.direcao === 'asc' ? 'desc' : 'asc' }))}>Vencimento {ordInternaUnidade.campo === 'data_vencimento' ? (ordInternaUnidade.direcao === 'asc' ? '▲' : '▼') : <span className="text-gray-300">↕</span>}</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => setOrdInternaUnidade(prev => ({ campo: 'titulo', direcao: prev.campo === 'titulo' && prev.direcao === 'asc' ? 'desc' : 'asc' }))}>Titulo {ordInternaUnidade.campo === 'titulo' ? (ordInternaUnidade.direcao === 'asc' ? '▲' : '▼') : <span className="text-gray-300">↕</span>}</th>
                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => setOrdInternaUnidade(prev => ({ campo: 'parcela', direcao: prev.campo === 'parcela' && prev.direcao === 'asc' ? 'desc' : 'asc' }))}>Parcela {ordInternaUnidade.campo === 'parcela' ? (ordInternaUnidade.direcao === 'asc' ? '▲' : '▼') : <span className="text-gray-300">↕</span>}</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => setOrdInternaUnidade(prev => ({ campo: 'dias', direcao: prev.campo === 'dias' && prev.direcao === 'asc' ? 'desc' : 'asc' }))}>Dias {ordInternaUnidade.campo === 'dias' ? (ordInternaUnidade.direcao === 'asc' ? '▲' : '▼') : <span className="text-gray-300">↕</span>}</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => setOrdInternaUnidade(prev => ({ campo: 'centrocusto', direcao: prev.campo === 'centrocusto' && prev.direcao === 'asc' ? 'desc' : 'asc' }))}>Centro de Custo {ordInternaUnidade.campo === 'centrocusto' ? (ordInternaUnidade.direcao === 'asc' ? '▲' : '▼') : <span className="text-gray-300">↕</span>}</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => setOrdInternaUnidade(prev => ({ campo: 'tipo_condicao', direcao: prev.campo === 'tipo_condicao' && prev.direcao === 'asc' ? 'desc' : 'asc' }))}>Tipo Condicao {ordInternaUnidade.campo === 'tipo_condicao' ? (ordInternaUnidade.direcao === 'asc' ? '▲' : '▼') : <span className="text-gray-300">↕</span>}</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => setOrdInternaUnidade(prev => ({ campo: 'valor', direcao: prev.campo === 'valor' && prev.direcao === 'asc' ? 'desc' : 'asc' }))}>Valor {ordInternaUnidade.campo === 'valor' ? (ordInternaUnidade.direcao === 'asc' ? '▲' : '▼') : <span className="text-gray-300">↕</span>}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {contas.filter(conta => ((conta.numero_documento || conta.id_documento || '').trim() || 'Sem Unidade') === u.unidade)
                                        .sort((a, b) => {
                                          const dir = ordInternaUnidade.direcao === 'asc' ? 1 : -1;
                                          switch (ordInternaUnidade.campo) {
                                            case 'cliente': return (a.cliente || '').localeCompare(b.cliente || '') * dir;
                                            case 'data_vencimento': return (a.data_vencimento || '').localeCompare(b.data_vencimento || '') * dir;
                                            case 'titulo': return ((a.lancamento || '').split('/')[0]).localeCompare((b.lancamento || '').split('/')[0]) * dir;
                                            case 'parcela': return ((a.numero_parcela || 0) as number - ((b.numero_parcela || 0) as number)) * dir;
                                            case 'dias': return (calcularDiasAteVencimento(a.data_vencimento) - calcularDiasAteVencimento(b.data_vencimento)) * dir;
                                            case 'centrocusto': return (a.nome_centrocusto || '').localeCompare(b.nome_centrocusto || '') * dir;
                                            case 'tipo_condicao': return (a.tipo_condicao || '').localeCompare(b.tipo_condicao || '') * dir;
                                            case 'valor': return ((a.valor_total || 0) - (b.valor_total || 0)) * dir;
                                            default: return 0;
                                          }
                                        })
                                        .map((conta, j) => {
                                        const dias = calcularDiasAteVencimento(conta.data_vencimento);
                                        const corDias = dias < 0 ? 'text-red-600' : dias === 0 ? 'text-orange-600' : 'text-green-600';
                                        return (
                                          <tr key={j} className="hover:bg-green-50/50">
                                            <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900">{conta.cliente || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{formatDate(conta.data_vencimento)}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900">{conta.lancamento ? conta.lancamento.split('/')[0] : '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 text-center">{conta.numero_parcela || '-'}</td>
                                            <td className={`whitespace-nowrap px-4 py-2 text-sm font-semibold ${corDias}`}>
                                              {dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias}d`}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500" title={`${(conta as any).codigo_centrocusto || ''} - ${conta.nome_centrocusto || ''}`}>{(conta as any).codigo_centrocusto ? <span className="inline-flex items-center justify-center rounded bg-blue-100 text-blue-700 font-bold font-mono text-[11px] px-1 min-w-[20px]">{(conta as any).codigo_centrocusto}</span> : null}{(conta as any).codigo_centrocusto ? ' ' : ''}{conta.nome_centrocusto || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{conta.tipo_condicao || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-green-600 font-semibold text-right">{formatCurrency(conta.valor_total || 0)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100">
                      <tr className="font-bold">
                        <td className="px-4 py-3 text-sm"></td>
                        <td className="px-6 py-3 text-sm text-gray-900">TOTAL</td>
                        <td className="px-6 py-3 text-sm text-gray-900 text-center">{contas.length}</td>
                        <td className="px-6 py-3 text-sm text-green-700 text-right">{formatCurrency(totalGeral)}</td>
                        <td className="px-6 py-3 text-sm text-gray-900 text-right">100,00%</td>
                        <td className="px-6 py-3 text-sm"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {subAbaUnidade === 'grafico' && (
              <div className="mb-6 rounded-lg bg-white p-6 shadow">
                <p className="mb-4 text-sm text-gray-500">Distribuicao de valores a receber por unidade</p>
                <div style={{ height: Math.max(300, unidadesExibidas.length * 45) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={unidadesExibidas}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="unidade" type="category" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="rounded-lg border bg-white p-3 shadow-lg">
                                <p className="font-bold text-gray-900">{data.unidade}</p>
                                <p className="text-sm text-green-600">{formatCurrency(data.valor)}</p>
                                <p className="text-xs text-gray-500">{data.quantidade} titulo(s) | {data.percentual.toFixed(2)}%</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="valor" fill="#10B981" radius={[0, 4, 4, 0]}>
                        {unidadesExibidas.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.acumulado <= 80 ? '#10B981' : entry.acumulado <= 95 ? '#F59E0B' : '#EF4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
};
