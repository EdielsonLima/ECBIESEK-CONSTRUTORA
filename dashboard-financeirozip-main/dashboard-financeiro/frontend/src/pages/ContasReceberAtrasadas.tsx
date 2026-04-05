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
    ? items.filter(i => String(i.id).toLowerCase().includes(busca.toLowerCase()) || i.nome.toLowerCase().includes(busca.toLowerCase()))
    : items;

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:border-red-500 focus:outline-none"
      >
        <span className={selected.length > 0 ? 'text-gray-900' : 'text-gray-500'}>
          {selected.length === 0 ? 'Todos' : selected.length === items.length ? 'Todos' : `${selected.length} selecionado(s)`}
        </span>
        <svg
          className={`absolute right-3 top-9 h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute z-20 mt-1 w-full min-w-[250px] rounded-lg border border-gray-300 bg-white shadow-lg">
          <div className="border-b border-gray-200 p-2 flex gap-2">
            <button type="button" onClick={() => setSelected(items.map(i => i.id))} className="text-xs text-red-600 hover:underline">Todos</button>
            <button type="button" onClick={() => setSelected([])} className="text-xs text-gray-500 hover:underline">Limpar</button>
          </div>
          {searchable && (
            <div className="border-b border-gray-200 p-2">
              <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..."
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-red-400 focus:outline-none" />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto p-2">
            {itensFiltrados.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-center gap-2 py-1 hover:bg-gray-50 rounded px-1">
                <input type="checkbox" checked={selected.includes(item.id)}
                  onChange={() => {
                    if (selected.includes(item.id)) setSelected(selected.filter((s: any) => s !== item.id));
                    else setSelected([...selected, item.id]);
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-gray-700">{item.id}{item.nome ? ` - ${item.nome}` : ''}</span>
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
}

interface DadosPorCliente {
  cliente: string;
  valor: number;
  quantidade: number;
}

interface DadosPorFaixaAtraso {
  faixa: string;
  valor: number;
  quantidade: number;
  ordem: number;
}

type AbaAtiva = 'dados' | 'analises' | 'por-cliente' | 'por-unidade';

const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1'];

export const ContasReceberAtrasadas: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('dados');
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [dadosPorCliente, setDadosPorCliente] = useState<DadosPorCliente[]>([]);
  const [dadosPorFaixaAtraso, setDadosPorFaixaAtraso] = useState<DadosPorFaixaAtraso[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<number | null>(null);
  const [filtroCentroCusto, setFiltroCentroCusto] = useState<number | null>(null);
  const [todasContas, setTodasContas] = useState<ContaReceber[]>([]);
  const [ordenacao, setOrdenacao] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'dias_atraso', direcao: 'desc' });
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumentoOption[]>([]);
  const [filtroTipoDocumento, setFiltroTipoDocumento] = useState<string[]>([]);
  const [tipoDocDropdownAberto, setTipoDocDropdownAberto] = useState(false);
  const [contasCriticas, setContasCriticas] = useState<{ quantidade: number; valor: number }>({ quantidade: 0, valor: 0 });
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [filtroCliente, setFiltroCliente] = useState<string | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [linhaExpandida, setLinhaExpandida] = useState<number | null>(null);

  // Por Cliente
  const [clienteExpandido, setClienteExpandido] = useState<string | null>(null);
  const [subAbaCliente, setSubAbaCliente] = useState<'tabela' | 'grafico'>('tabela');
  const [ordInterna, setOrdInterna] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'dias_atraso', direcao: 'desc' });

  // Por Unidade
  const [unidadeExpandida, setUnidadeExpandida] = useState<string | null>(null);
  const [subAbaUnidade, setSubAbaUnidade] = useState<'tabela' | 'grafico'>('tabela');
  const [ordInternaUnidade, setOrdInternaUnidade] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'dias_atraso', direcao: 'desc' });
  const [filtroUnidades, setFiltroUnidades] = useState<string[]>([]);
  const [unidadeDropdownAberto, setUnidadeDropdownAberto] = useState(false);

  // Tipo Condicao
  const [filtroTipoCondicao, setFiltroTipoCondicao] = useState<string[]>([]);
  const [tipoCondicaoDropdownAberto, setTipoCondicaoDropdownAberto] = useState(false);

  const calcularDiasAtraso = (dataVencimento: string | undefined) => {
    if (!dataVencimento) return 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const [ano, mes, dia] = dataVencimento.split('T')[0].split('-').map(Number);
    const vencimento = new Date(ano, mes - 1, dia);
    vencimento.setHours(0, 0, 0, 0);
    const diffTime = hoje.getTime() - vencimento.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const descTipoCondicao = (tc: string | undefined): string => {
    if (!tc) return '';
    switch (tc.trim().toUpperCase()) {
      case 'PM': return 'Parcelas Mensais';
      case 'PS': return 'Parcelas Semestrais';
      case 'CO': return 'Contrato';
      case 'CR': return 'Credito';
      case 'AT': return 'Ato';
      case 'FI': return 'Financiamento';
      case 'RE': return 'Residuo';
      case 'PB': return 'Parcelas Balao';
      case 'PE': return 'Parcelas Especiais';
      case 'PI': return 'Parcelas Intermediarias';
      default: return tc.trim();
    }
  };

  const corTipoCondicao = (tc: string | undefined): string => {
    if (!tc) return 'bg-gray-100 text-gray-600';
    switch (tc.trim().toUpperCase()) {
      case 'PM': return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'PS': return 'bg-purple-100 text-purple-700 border border-purple-200';
      case 'CO': return 'bg-green-100 text-green-700 border border-green-200';
      case 'CR': return 'bg-teal-100 text-teal-700 border border-teal-200';
      case 'AT': return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
      case 'FI': return 'bg-orange-100 text-orange-700 border border-orange-200';
      case 'RE': return 'bg-red-100 text-red-700 border border-red-200';
      case 'PB': return 'bg-pink-100 text-pink-700 border border-pink-200';
      case 'PE': return 'bg-indigo-100 text-indigo-700 border border-indigo-200';
      case 'PI': return 'bg-cyan-100 text-cyan-700 border border-cyan-200';
      default: return 'bg-gray-100 text-gray-600 border border-gray-200';
    }
  };

  const ordenarContas = (contasParaOrdenar: ContaReceber[]) => {
    return [...contasParaOrdenar].sort((a, b) => {
      let valorA: any, valorB: any;
      switch (ordenacao.campo) {
        case 'cliente': valorA = (a.cliente || '').toLowerCase(); valorB = (b.cliente || '').toLowerCase(); break;
        case 'data_vencimento': valorA = (a.data_vencimento || '').split('T')[0]; valorB = (b.data_vencimento || '').split('T')[0]; break;
        case 'dias_atraso': valorA = calcularDiasAtraso(a.data_vencimento); valorB = calcularDiasAtraso(b.data_vencimento); break;
        case 'valor_total': valorA = a.saldo_atual || a.valor_total || 0; valorB = b.saldo_atual || b.valor_total || 0; break;
        case 'nome_centrocusto': valorA = (a.nome_centrocusto || '').toLowerCase(); valorB = (b.nome_centrocusto || '').toLowerCase(); break;
        case 'tipo_condicao': valorA = ((a as any).tipo_condicao || '').toLowerCase(); valorB = ((b as any).tipo_condicao || '').toLowerCase(); break;
        default: return 0;
      }
      if (valorA < valorB) return ordenacao.direcao === 'asc' ? -1 : 1;
      if (valorA > valorB) return ordenacao.direcao === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const toggleOrdenacao = (campo: string) => {
    setOrdenacao(prev => ({ campo, direcao: prev.campo === campo && prev.direcao === 'asc' ? 'desc' : 'asc' }));
  };

  const renderSortIcon = (campo: string) => (
    <span className="ml-1 inline-block">
      {ordenacao.campo === campo ? (ordenacao.direcao === 'asc' ? '▲' : '▼') : <span className="text-gray-300">▼</span>}
    </span>
  );

  const toggleOrdInterna = (campo: string) => {
    setOrdInterna(prev => ({ campo, direcao: prev.campo === campo && prev.direcao === 'asc' ? 'desc' : 'asc' }));
  };

  const renderSortIconInterna = (campo: string) => (
    <span className="ml-1 inline-block">
      {ordInterna.campo === campo ? (ordInterna.direcao === 'asc' ? '▲' : '▼') : <span className="text-gray-300">▼</span>}
    </span>
  );

  const toggleOrdInternaUnidade = (campo: string) => {
    setOrdInternaUnidade(prev => ({ campo, direcao: prev.campo === campo && prev.direcao === 'asc' ? 'desc' : 'asc' }));
  };

  const renderSortIconUnidade = (campo: string) => (
    <span className="ml-1 inline-block">
      {ordInternaUnidade.campo === campo ? (ordInternaUnidade.direcao === 'asc' ? '▲' : '▼') : <span className="text-gray-300">▼</span>}
    </span>
  );

  const ordenarContasInternas = (contasInt: ContaReceber[]) => {
    return [...contasInt].sort((a, b) => {
      let vA: any, vB: any;
      switch (ordInterna.campo) {
        case 'data_vencimento': vA = (a.data_vencimento || '').split('T')[0]; vB = (b.data_vencimento || '').split('T')[0]; break;
        case 'dias_atraso': vA = calcularDiasAtraso(a.data_vencimento); vB = calcularDiasAtraso(b.data_vencimento); break;
        case 'titulo': vA = String(a.titulo || a.lancamento || ''); vB = String(b.titulo || b.lancamento || ''); break;
        case 'parcela': vA = parseInt(a.numero_parcela || '0'); vB = parseInt(b.numero_parcela || '0'); break;
        case 'documento': vA = (a.numero_documento || a.id_documento || '').toLowerCase(); vB = (b.numero_documento || b.id_documento || '').toLowerCase(); break;
        case 'tipo_condicao': vA = ((a as any).tipo_condicao || '').toLowerCase(); vB = ((b as any).tipo_condicao || '').toLowerCase(); break;
        case 'centro_custo': vA = (a.nome_centrocusto || '').toLowerCase(); vB = (b.nome_centrocusto || '').toLowerCase(); break;
        case 'valor': vA = a.saldo_atual || a.valor_total || 0; vB = b.saldo_atual || b.valor_total || 0; break;
        default: return 0;
      }
      if (vA < vB) return ordInterna.direcao === 'asc' ? -1 : 1;
      if (vA > vB) return ordInterna.direcao === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const ordenarContasInternasUnidade = (contasInt: ContaReceber[]) => {
    return [...contasInt].sort((a, b) => {
      let vA: any, vB: any;
      switch (ordInternaUnidade.campo) {
        case 'cliente': vA = (a.cliente || '').toLowerCase(); vB = (b.cliente || '').toLowerCase(); break;
        case 'data_vencimento': vA = (a.data_vencimento || '').split('T')[0]; vB = (b.data_vencimento || '').split('T')[0]; break;
        case 'dias_atraso': vA = calcularDiasAtraso(a.data_vencimento); vB = calcularDiasAtraso(b.data_vencimento); break;
        case 'titulo': vA = String(a.titulo || a.lancamento || ''); vB = String(b.titulo || b.lancamento || ''); break;
        case 'parcela': vA = parseInt(a.numero_parcela || '0'); vB = parseInt(b.numero_parcela || '0'); break;
        case 'tipo_condicao': vA = ((a as any).tipo_condicao || '').toLowerCase(); vB = ((b as any).tipo_condicao || '').toLowerCase(); break;
        case 'centro_custo': vA = (a.nome_centrocusto || '').toLowerCase(); vB = (b.nome_centrocusto || '').toLowerCase(); break;
        case 'valor': vA = a.saldo_atual || a.valor_total || 0; vB = b.saldo_atual || b.valor_total || 0; break;
        default: return 0;
      }
      if (vA < vB) return ordInternaUnidade.direcao === 'asc' ? -1 : 1;
      if (vA > vB) return ordInternaUnidade.direcao === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const formatCurrency = (value: number | undefined) => {
    if (!value) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatCurrencyShort = (value: number) => {
    if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}K`;
    return formatCurrency(value);
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('T')[0].split('-');
    return `${day}/${month}/${year}`;
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
      const data = await apiService.getContasReceber('em_atraso', 2000);
      setTodasContas(data);
    } catch (err) {
      setError('Erro ao carregar contas atrasadas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltrosLocais = (
    dados: ContaReceber[],
    empresa: number | null,
    cc: number | null,
    tiposDocSelecionados: string[],
    cliente: string | null,
    tiposCondicao: string[]
  ) => {
    let contasFiltradas = [...dados];
    if (empresa) contasFiltradas = contasFiltradas.filter(c => c.id_interno_empresa === empresa);
    if (cc) contasFiltradas = contasFiltradas.filter(c => c.id_interno_centro_custo === cc);
    if (tiposDocSelecionados.length > 0) contasFiltradas = contasFiltradas.filter(c => c.id_documento && tiposDocSelecionados.includes(c.id_documento));
    if (cliente) contasFiltradas = contasFiltradas.filter(c => c.cliente === cliente);
    if (tiposCondicao.length > 0) contasFiltradas = contasFiltradas.filter(c => (c as any).tipo_condicao && tiposCondicao.includes((c as any).tipo_condicao.trim().toUpperCase()));
    return contasFiltradas;
  };

  useEffect(() => {
    if (todasContas.length === 0) return;

    const clientesUnicos = Array.from(new Set(todasContas.map(c => c.cliente).filter(Boolean)))
      .sort((a, b) => (a || '').localeCompare(b || ''))
      .map(c => ({ id: c || '', nome: '' }));
    setClientes(clientesUnicos);

    const contasFiltradas = aplicarFiltrosLocais(todasContas, filtroEmpresa, filtroCentroCusto, filtroTipoDocumento, filtroCliente, filtroTipoCondicao);
    setContas(contasFiltradas);

    const total = contasFiltradas.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0);
    setEstatisticas({
      quantidade_titulos: contasFiltradas.length,
      valor_total: total,
      valor_medio: contasFiltradas.length > 0 ? total / contasFiltradas.length : 0,
    });

    const criticas = contasFiltradas.filter(c => calcularDiasAtraso(c.data_vencimento) > 30);
    setContasCriticas({
      quantidade: criticas.length,
      valor: criticas.reduce((acc, c) => acc + (c.saldo_atual || c.valor_total || 0), 0),
    });

    const clienteMap = new Map<string, { valor: number; quantidade: number }>();
    contasFiltradas.forEach(c => {
      const cliente = c.cliente || 'Sem Cliente';
      const atual = clienteMap.get(cliente) || { valor: 0, quantidade: 0 };
      clienteMap.set(cliente, { valor: atual.valor + (c.saldo_atual || c.valor_total || 0), quantidade: atual.quantidade + 1 });
    });
    setDadosPorCliente(Array.from(clienteMap.entries()).map(([cliente, data]) => ({ cliente, ...data })).sort((a, b) => b.valor - a.valor).slice(0, 15));

    const faixas = [
      { faixa: '1-7 dias', min: 1, max: 7, ordem: 1 },
      { faixa: '8-15 dias', min: 8, max: 15, ordem: 2 },
      { faixa: '16-30 dias', min: 16, max: 30, ordem: 3 },
      { faixa: '31-60 dias', min: 31, max: 60, ordem: 4 },
      { faixa: '61-90 dias', min: 61, max: 90, ordem: 5 },
      { faixa: '+90 dias', min: 91, max: Infinity, ordem: 6 },
    ];
    const faixaMap = new Map<string, { valor: number; quantidade: number; ordem: number }>();
    faixas.forEach(f => faixaMap.set(f.faixa, { valor: 0, quantidade: 0, ordem: f.ordem }));
    contasFiltradas.forEach(c => {
      const dias = calcularDiasAtraso(c.data_vencimento);
      const faixa = faixas.find(f => dias >= f.min && dias <= f.max);
      if (faixa) {
        const atual = faixaMap.get(faixa.faixa)!;
        faixaMap.set(faixa.faixa, { valor: atual.valor + (c.saldo_atual || c.valor_total || 0), quantidade: atual.quantidade + 1, ordem: atual.ordem });
      }
    });
    setDadosPorFaixaAtraso(Array.from(faixaMap.entries()).map(([faixa, data]) => ({ faixa, ...data })).filter(d => d.quantidade > 0).sort((a, b) => a.ordem - b.ordem));
  }, [todasContas, filtroEmpresa, filtroCentroCusto, filtroTipoDocumento, filtroCliente, filtroTipoCondicao]);

  useEffect(() => {
    carregarDados();
    // Carregar filtros padrão salvos
    const filtrosSalvos = localStorage.getItem('contas_receber_atrasadas_filtros_padrao');
    if (filtrosSalvos) {
      try {
        const f = JSON.parse(filtrosSalvos);
        if (f.filtroEmpresa != null) setFiltroEmpresa(f.filtroEmpresa);
        if (f.filtroCentroCusto != null) setFiltroCentroCusto(f.filtroCentroCusto);
        if (f.filtroTipoDocumento?.length) setFiltroTipoDocumento(f.filtroTipoDocumento);
        if (f.filtroCliente != null) setFiltroCliente(f.filtroCliente);
        if (f.filtroTipoCondicao?.length) setFiltroTipoCondicao(f.filtroTipoCondicao);
        if (f.filtroUnidades?.length) setFiltroUnidades(f.filtroUnidades);
      } catch (err) {
        console.error('Erro ao carregar filtros padrão:', err);
      }
    }
  }, []);

  const limparFiltros = () => {
    setFiltroEmpresa(null);
    setFiltroCentroCusto(null);
    setFiltroTipoDocumento([]);
    setFiltroCliente(null);
    setFiltroTipoCondicao([]);
    setFiltroUnidades([]);
  };

  const FILTROS_PADRAO_KEY = 'contas_receber_atrasadas_filtros_padrao';

  const salvarFiltrosPadrao = () => {
    const filtros = {
      filtroEmpresa,
      filtroCentroCusto,
      filtroTipoDocumento,
      filtroCliente,
      filtroTipoCondicao,
      filtroUnidades,
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

  // Tipo condicao options from data
  const tipoCondicaoOptions = Array.from(new Set(todasContas.map(c => ((c as any).tipo_condicao || '').trim().toUpperCase()).filter(Boolean)))
    .sort()
    .map(tc => ({ id: tc, nome: descTipoCondicao(tc) }));

  // Filtros ativos
  const filtrosAtivos: string[] = [];
  if (filtroEmpresa) filtrosAtivos.push(`Empresa: ${empresas.find(e => e.id === filtroEmpresa)?.nome || filtroEmpresa}`);
  if (filtroCentroCusto) filtrosAtivos.push(`CC: ${centrosCusto.find(c => c.id === filtroCentroCusto)?.nome || filtroCentroCusto}`);
  if (filtroCliente) filtrosAtivos.push(`Cliente: ${filtroCliente}`);
  if (filtroTipoDocumento.length > 0) filtrosAtivos.push(`Tipo Doc: ${filtroTipoDocumento.length}`);
  if (filtroTipoCondicao.length > 0) filtrosAtivos.push(`TC: ${filtroTipoCondicao.length}`);

  const exportarPDF = () => {
    const abaLabel = abaAtiva === 'dados' ? 'Dados' : abaAtiva === 'analises' ? 'Análises' : abaAtiva === 'por-cliente' ? 'Por Cliente' : 'Por Unidade';
    const { doc, pageWidth, margin, dataGeracao } = criarPDFBase('Contas a Receber - Atrasadas', `Aba: ${abaLabel}`);
    let y = 34;

    const filtros = filtrosAtivos.map(f => {
      const [label, ...rest] = f.split(': ');
      return { label, valor: rest.join(': ') };
    });
    y = adicionarFiltrosAtivos(doc, filtros, y, pageWidth, margin);

    const totalVal = estatisticas?.valor_total ?? 0;
    y = adicionarResumoCards(doc, [
      { label: 'Total em Atraso', valor: totalVal, cor: [239, 68, 68] },
      { label: 'Quantidade', valor: String(estatisticas?.quantidade_titulos ?? 0), cor: [249, 115, 22] },
      { label: 'Ticket Médio', valor: estatisticas?.valor_medio ?? 0, cor: [139, 92, 246] },
    ], y, pageWidth, margin);

    if (abaAtiva === 'dados') {
      const dados = ordenarContas(contas);
      adicionarTabela(doc, {
        head: [['Cliente', 'Vencimento', 'Dias Atraso', 'Centro Custo', 'Titulo', 'Parcela', 'Documento', 'TC', 'Valor']],
        body: dados.map(c => [
          c.cliente || '-', formatDatePDF(c.data_vencimento), String(calcularDiasAtraso(c.data_vencimento)),
          c.nome_centrocusto || '-', String(c.titulo || '-'), String(c.numero_parcela || '-'),
          c.numero_documento || c.id_documento || '-', (c as any).tipo_condicao || '-',
          `R$ ${formatCurrencyPDF(c.saldo_atual || c.valor_total || 0)}`,
        ]),
        foot: [['TOTAL', '', '', '', '', '', '', '', `R$ ${formatCurrencyPDF(dados.reduce((s, c) => s + (c.saldo_atual || c.valor_total || 0), 0))}`]],
        columnStyles: { 2: { halign: 'center' }, 8: { halign: 'right' } },
      }, y, margin);
    } else if (abaAtiva === 'por-cliente' || abaAtiva === 'por-unidade') {
      const isUnidade = abaAtiva === 'por-unidade';
      const totalGeral = contas.reduce((s, c) => s + (c.saldo_atual || c.valor_total || 0), 0);
      const agrupado = Object.entries(
        contas.reduce((acc, c) => {
          const chave = isUnidade ? ((c.numero_documento || c.id_documento || '').trim() || 'Sem Unidade') : (c.cliente || 'Sem Cliente');
          if (!acc[chave]) acc[chave] = { valor: 0, qtd: 0 };
          acc[chave].valor += c.saldo_atual || c.valor_total || 0;
          acc[chave].qtd++;
          return acc;
        }, {} as Record<string, { valor: number; qtd: number }>)
      ).sort((a, b) => b[1].valor - a[1].valor);

      let acum = 0;
      const body = agrupado.map(([nome, d], i) => {
        const pct = totalGeral > 0 ? (d.valor / totalGeral * 100) : 0;
        acum += pct;
        return [String(i + 1), nome, String(d.qtd), `R$ ${formatCurrencyPDF(d.valor)}`, `${pct.toFixed(2)}%`, `${acum.toFixed(2)}%`];
      });

      adicionarTabela(doc, {
        head: [['#', isUnidade ? 'Unidade' : 'Cliente', 'Qtd', 'Valor', '% Total', '% Acumulado']],
        body,
        foot: [['', 'TOTAL', String(contas.length), `R$ ${formatCurrencyPDF(totalGeral)}`, '100%', '']],
        columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 5) {
            const val = parseFloat(data.cell.raw);
            if (val <= 80) { data.cell.styles.textColor = [22, 163, 74]; data.cell.styles.fontStyle = 'bold'; }
            else if (val <= 95) { data.cell.styles.textColor = [202, 138, 4]; data.cell.styles.fontStyle = 'bold'; }
            else { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = 'bold'; }
          }
        },
      }, y, margin);
    }

    finalizarPDF(doc, gerarNomeArquivo('receber_atrasadas', abaLabel), dataGeracao);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-red-600 border-r-transparent"></div>
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inadimplência</h1>
          <p className="mt-1 text-sm text-gray-500">
            {estatisticas?.quantidade_titulos.toLocaleString('pt-BR')} titulo(s) pendente(s)
            {contas.length >= 2000 && <span className="text-red-500 font-medium"> (lista limitada a 2000)</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportarPDF}
            disabled={contas.length === 0}
            className="flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            Exportar PDF
          </button>
          <button
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${mostrarFiltros ? 'bg-red-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
            {mostrarFiltros ? 'Ocultar Filtros' : 'Mostrar Filtros'}
          </button>
        </div>
      </div>

      {/* Filtros ativos */}
      {filtrosAtivos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filtrosAtivos.map((filtro, index) => (
            <span key={index} className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">{filtro}</span>
          ))}
          <button type="button" onClick={limparFiltros} className="text-sm text-gray-500 hover:text-gray-700 underline">Limpar todos</button>
        </div>
      )}

      {/* Filtros */}
      {mostrarFiltros && (
        <div className="rounded-lg bg-gray-50 p-4 shadow">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <SearchableSelect options={empresas} value={filtroEmpresa ?? undefined} onChange={(value) => setFiltroEmpresa(value as number | null)} label="Empresa" placeholder="Selecione uma empresa..." emptyText="Todas" />
            <SearchableSelect options={centrosCusto.map(cc => ({ ...cc, nome: cc.codigo ? `${cc.codigo} - ${cc.nome}` : cc.nome }))} value={filtroCentroCusto ?? undefined} onChange={(value) => setFiltroCentroCusto(value as number | null)} label="Centro de Custo" placeholder="Selecione um centro de custo..." emptyText="Todos" />
            <SearchableSelect options={clientes} value={filtroCliente ?? undefined} onChange={(value) => setFiltroCliente(value as string | null)} label="Cliente" placeholder="Digite o nome do cliente..." emptyText="Todos" />
            <MultiSelectDropdown label="Tipo Documento" items={tiposDocumento.map(t => ({ id: t.id, nome: t.nome }))} selected={filtroTipoDocumento} setSelected={setFiltroTipoDocumento} isOpen={tipoDocDropdownAberto} setIsOpen={setTipoDocDropdownAberto} searchable={true} />
            <MultiSelectDropdown label="Tipo Condicao" items={tipoCondicaoOptions} selected={filtroTipoCondicao} setSelected={setFiltroTipoCondicao} isOpen={tipoCondicaoDropdownAberto} setIsOpen={setTipoCondicaoDropdownAberto} searchable={true} />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={limparFiltros} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">Limpar Filtros</button>
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
      )}

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Total em Atraso</p>
          <p className="mt-2 text-2xl font-extrabold text-red-600">{formatCurrency(estatisticas?.valor_total)}</p>
          <p className="mt-1 text-sm text-gray-400">{estatisticas?.quantidade_titulos} titulos</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Valor Medio</p>
          <p className="mt-2 text-2xl font-extrabold text-gray-700">{formatCurrency(estatisticas?.valor_medio)}</p>
          <p className="mt-1 text-sm text-gray-400">por titulo</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow border-l-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Criticos (+30 dias)</p>
          <p className="mt-2 text-2xl font-extrabold text-red-700">{formatCurrency(contasCriticas.valor)}</p>
          <p className="mt-1 text-sm text-gray-400">{contasCriticas.quantidade} titulos</p>
        </div>
        <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">% Critico</p>
          <p className="mt-2 text-2xl font-extrabold text-orange-600">
            {estatisticas && estatisticas.valor_total > 0 ? ((contasCriticas.valor / estatisticas.valor_total) * 100).toFixed(1) : 0}%
          </p>
          <p className="mt-1 text-sm text-gray-400">do total em atraso</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Clientes Unicos</p>
          <p className="mt-2 text-2xl font-extrabold text-blue-600">
            {new Set(contas.map(c => c.cliente).filter(Boolean)).size}
          </p>
          <p className="mt-1 text-sm text-gray-400">com atraso</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(['dados', 'analises', 'por-cliente', 'por-unidade'] as AbaAtiva[]).map(aba => (
            <button
              key={aba}
              onClick={() => setAbaAtiva(aba)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                abaAtiva === aba
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {aba === 'dados' ? 'Dados' : aba === 'analises' ? 'Analises' : aba === 'por-cliente' ? 'Por Cliente' : 'Por Unidade'}
            </button>
          ))}
        </nav>
      </div>

      {/* Aba Dados */}
      {abaAtiva === 'dados' && (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-red-50">
                <tr>
                  <th onClick={() => toggleOrdenacao('cliente')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-red-100">Cliente {renderSortIcon('cliente')}</th>
                  <th onClick={() => toggleOrdenacao('data_vencimento')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-red-100">Vencimento {renderSortIcon('data_vencimento')}</th>
                  <th onClick={() => toggleOrdenacao('dias_atraso')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-red-100">Dias Atraso {renderSortIcon('dias_atraso')}</th>
                  <th onClick={() => toggleOrdenacao('nome_centrocusto')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-red-100">Centro de Custo {renderSortIcon('nome_centrocusto')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Titulo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Parcela</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Documento</th>
                  <th onClick={() => toggleOrdenacao('tipo_condicao')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-red-100">Tipo Condicao {renderSortIcon('tipo_condicao')}</th>
                  <th onClick={() => toggleOrdenacao('valor_total')} className="cursor-pointer px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-red-100">Valor {renderSortIcon('valor_total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {ordenarContas(contas).map((conta, index) => {
                  const diasAtraso = calcularDiasAtraso(conta.data_vencimento);
                  return (
                    <tr key={index} className={`hover:bg-gray-50 cursor-pointer ${linhaExpandida === index ? 'bg-red-50/50' : ''}`} onClick={() => setLinhaExpandida(linhaExpandida === index ? null : index)}>
                      <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-900">{conta.cliente || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500">{formatDate(conta.data_vencimento)}</td>
                      <td className="whitespace-nowrap px-6 py-3 text-sm">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          diasAtraso > 90 ? 'bg-red-200 text-red-900' :
                          diasAtraso > 30 ? 'bg-red-100 text-red-800' :
                          diasAtraso > 15 ? 'bg-orange-100 text-orange-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {diasAtraso}d
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500" title={`${(conta as any).codigo_centrocusto || ''} - ${conta.nome_centrocusto || ''}`}>{(conta as any).codigo_centrocusto ? <span className="inline-flex items-center justify-center rounded bg-blue-100 text-blue-700 font-bold font-mono text-[11px] px-1 min-w-[20px]">{(conta as any).codigo_centrocusto}</span> : null}{(conta as any).codigo_centrocusto ? ' ' : ''}{conta.nome_centrocusto || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500">{conta.titulo || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500">{conta.numero_parcela || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500">{conta.numero_documento || conta.id_documento || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-3 text-sm">
                        {(conta as any).tipo_condicao ? (
                          <span title={descTipoCondicao((conta as any).tipo_condicao)} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold cursor-help ${corTipoCondicao((conta as any).tipo_condicao)}`}>
                            {(conta as any).tipo_condicao}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-red-600 text-right">{formatCurrency(conta.saldo_atual || conta.valor_total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100">
                <tr className="font-bold">
                  <td className="px-6 py-3 text-sm text-gray-900" colSpan={8}>TOTAL</td>
                  <td className="px-6 py-3 text-sm text-red-700 text-right">{formatCurrency(estatisticas?.valor_total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Aba Analises */}
      {abaAtiva === 'analises' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Atraso por Faixa de Dias</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosPorFaixaAtraso} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} />
                  <YAxis type="category" dataKey="faixa" width={80} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="valor" fill="#EF4444">
                    {dadosPorFaixaAtraso.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                    <LabelList dataKey="quantidade" position="right" formatter={(value: number) => `${value}`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Top 15 Clientes em Atraso</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosPorCliente} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} />
                  <YAxis type="category" dataKey="cliente" width={150} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="valor" fill="#EF4444">
                    {dadosPorCliente.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {contasCriticas.quantidade > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-6 shadow">
              <h3 className="mb-2 text-lg font-semibold text-red-800">Atencao: Contas Criticas</h3>
              <p className="text-red-700">
                Existem <strong>{contasCriticas.quantidade}</strong> titulo(s) com mais de 30 dias de atraso,
                totalizando <strong>{formatCurrency(contasCriticas.valor)}</strong>.
              </p>
              <p className="mt-2 text-sm text-red-600">
                Recomenda-se acao imediata de cobranca para estes clientes.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Aba Por Cliente */}
      {abaAtiva === 'por-cliente' && (() => {
        const clienteMap = new Map<string, { valor: number; quantidade: number }>();
        contas.forEach(c => {
          const cliente = c.cliente || 'Sem Cliente';
          const atual = clienteMap.get(cliente) || { valor: 0, quantidade: 0 };
          clienteMap.set(cliente, { valor: atual.valor + (c.saldo_atual || c.valor_total || 0), quantidade: atual.quantidade + 1 });
        });
        const clientesPorValor = Array.from(clienteMap.entries()).map(([cliente, data]) => ({ cliente, ...data })).sort((a, b) => b.valor - a.valor);
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
              <h2 className="text-2xl font-bold text-gray-900">Atraso por Cliente</h2>
              <p className="mt-1 text-sm text-gray-600">{clientesComPareto.length} cliente(s) | Total: {formatCurrency(totalGeral)}</p>
              <div className="mt-4 flex gap-2 border-b border-gray-200 pb-2">
                <button onClick={() => setSubAbaCliente('tabela')} className={`rounded-t-lg px-4 py-2 text-sm font-medium ${subAbaCliente === 'tabela' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Tabela</button>
                <button onClick={() => setSubAbaCliente('grafico')} className={`rounded-t-lg px-4 py-2 text-sm font-medium ${subAbaCliente === 'grafico' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Grafico</button>
              </div>
            </div>

            {subAbaCliente === 'tabela' && (
              <div className="overflow-hidden rounded-lg bg-white shadow">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-red-50">
                      <tr>
                        <th onClick={() => toggleOrdenacao('rank')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 w-12 cursor-pointer hover:bg-red-100">#{renderSortIcon('rank')}</th>
                        <th onClick={() => toggleOrdenacao('cliente')} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-red-100">Cliente{renderSortIcon('cliente')}</th>
                        <th onClick={() => toggleOrdenacao('quantidade')} className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-red-100">Qtd Titulos{renderSortIcon('quantidade')}</th>
                        <th onClick={() => toggleOrdenacao('valor')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-red-100">Valor{renderSortIcon('valor')}</th>
                        <th onClick={() => toggleOrdenacao('percentual')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-red-100">% do Total{renderSortIcon('percentual')}</th>
                        <th onClick={() => toggleOrdenacao('acumulado')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-red-100">% Acumulado{renderSortIcon('acumulado')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {clientesExibidos.map((c, index) => (
                        <React.Fragment key={index}>
                          <tr
                            onClick={() => setClienteExpandido(clienteExpandido === c.cliente ? null : c.cliente)}
                            className={`cursor-pointer transition-colors ${clienteExpandido === c.cliente ? 'bg-red-100 border-l-4 border-red-600 shadow-sm' : `hover:bg-gray-50 ${c.acumulado <= 80 ? 'bg-red-50/30' : c.acumulado <= 95 ? 'bg-yellow-50/30' : ''}`}`}
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400 font-mono">
                              <span className={`inline-block transition-transform mr-2 text-[10px] ${clienteExpandido === c.cliente ? 'rotate-90' : ''}`}>&#9654;</span>
                              {c.rank}
                            </td>
                            <td className={`whitespace-nowrap px-6 py-3 text-sm text-gray-900 ${clienteExpandido === c.cliente ? 'font-bold text-red-800' : 'font-medium'}`}>{c.cliente}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 text-center">{c.quantidade}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-red-600 text-right">{formatCurrency(c.valor)}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-2">
                                  <div className="bg-red-500 h-2 rounded-full" style={{ width: `${Math.min(c.percentual * 2, 100)}%` }}></div>
                                </div>
                                <span className="w-14 text-right">{c.percentual.toFixed(2)}%</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-right">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.acumulado <= 80 ? 'bg-red-100 text-red-700' : c.acumulado <= 95 ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'}`}>
                                {c.acumulado.toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                          {clienteExpandido === c.cliente && (
                            <tr className="bg-red-50/40">
                              <td colSpan={6} className="px-8 py-4 border-l-4 border-red-600">
                                <div className="overflow-hidden rounded-lg border border-red-200 bg-white shadow-md">
                                  <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th onClick={() => toggleOrdInterna('data_vencimento')} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Vencimento{renderSortIconInterna('data_vencimento')}</th>
                                        <th onClick={() => toggleOrdInterna('dias_atraso')} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Dias{renderSortIconInterna('dias_atraso')}</th>
                                        <th onClick={() => toggleOrdInterna('titulo')} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Titulo{renderSortIconInterna('titulo')}</th>
                                        <th onClick={() => toggleOrdInterna('parcela')} className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Parcela{renderSortIconInterna('parcela')}</th>
                                        <th onClick={() => toggleOrdInterna('documento')} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Documento{renderSortIconInterna('documento')}</th>
                                        <th onClick={() => toggleOrdInterna('tipo_condicao')} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Tipo Condicao{renderSortIconInterna('tipo_condicao')}</th>
                                        <th onClick={() => toggleOrdInterna('centro_custo')} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Centro Custo{renderSortIconInterna('centro_custo')}</th>
                                        <th onClick={() => toggleOrdInterna('valor')} className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Valor{renderSortIconInterna('valor')}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {ordenarContasInternas(contas.filter(conta => (conta.cliente || 'Sem Cliente') === c.cliente)).map((conta, j) => {
                                        const dias = calcularDiasAtraso(conta.data_vencimento);
                                        return (
                                          <tr key={j} className="hover:bg-red-50/50">
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{formatDate(conta.data_vencimento)}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm">
                                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${dias > 30 ? 'bg-red-100 text-red-800' : dias > 15 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}`}>{dias}d</span>
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900">{String(conta.titulo || conta.lancamento || '-').split('/')[0]}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 text-center">{conta.numero_parcela || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{conta.numero_documento || conta.id_documento || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm">
                                              {(conta as any).tipo_condicao ? (
                                                <span title={descTipoCondicao((conta as any).tipo_condicao)} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold cursor-help ${corTipoCondicao((conta as any).tipo_condicao)}`}>{(conta as any).tipo_condicao}</span>
                                              ) : '-'}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500" title={`${(conta as any).codigo_centrocusto || ''} - ${conta.nome_centrocusto || ''}`}>{(conta as any).codigo_centrocusto ? <span className="inline-flex items-center justify-center rounded bg-blue-100 text-blue-700 font-bold font-mono text-[11px] px-1 min-w-[20px]">{(conta as any).codigo_centrocusto}</span> : null}{(conta as any).codigo_centrocusto ? ' ' : ''}{conta.nome_centrocusto || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-red-600 font-semibold text-right">{formatCurrency(conta.saldo_atual || conta.valor_total)}</td>
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
                        <td className="px-6 py-3 text-sm text-red-700 text-right">{formatCurrency(totalGeral)}</td>
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
                <p className="mb-4 text-sm text-gray-500">Distribuicao de valores em atraso por cliente</p>
                <div style={{ height: Math.max(300, clientesExibidos.length * 45) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={clientesExibidos} layout="vertical" margin={{ top: 5, right: 30, left: 150, bottom: 5 }}>
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
                                <p className="text-sm text-red-600">{formatCurrency(data.valor)}</p>
                                <p className="text-xs text-gray-500">{data.quantidade} titulo(s) | {data.percentual.toFixed(2)}%</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="valor" fill="#EF4444" radius={[0, 4, 4, 0]}>
                        {clientesExibidos.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.acumulado <= 80 ? '#EF4444' : entry.acumulado <= 95 ? '#F59E0B' : '#F97316'} />
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

      {/* Aba Por Unidade */}
      {abaAtiva === 'por-unidade' && (() => {
        const unidadeMap = new Map<string, { valor: number; quantidade: number }>();
        contas.forEach(c => {
          const unidade = (c.numero_documento || c.id_documento || '').trim() || 'Sem Unidade';
          const atual = unidadeMap.get(unidade) || { valor: 0, quantidade: 0 };
          unidadeMap.set(unidade, { valor: atual.valor + (c.saldo_atual || c.valor_total || 0), quantidade: atual.quantidade + 1 });
        });
        const unidadesPorValor = Array.from(unidadeMap.entries()).map(([unidade, data]) => ({ unidade, ...data })).sort((a, b) => b.valor - a.valor);
        const totalGeral = unidadesPorValor.reduce((acc, u) => acc + u.valor, 0);
        let acumuladoVal = 0;
        const unidadesComPareto = unidadesPorValor.map((u, i) => {
          const percentual = totalGeral > 0 ? (u.valor / totalGeral) * 100 : 0;
          acumuladoVal += percentual;
          return { ...u, rank: i + 1, percentual, acumulado: acumuladoVal };
        });

        const unidadesFiltradas = filtroUnidades.length > 0 ? unidadesComPareto.filter(u => filtroUnidades.includes(u.unidade)) : unidadesComPareto;

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

        const allUnidades = unidadesComPareto.map(u => ({ id: u.unidade, nome: u.unidade }));

        return (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Atraso por Unidade</h2>
              <p className="mt-1 text-sm text-gray-600">{unidadesComPareto.length} unidade(s) | Total: {formatCurrency(totalGeral)}</p>
              <div className="mt-3 max-w-sm">
                <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar Unidades</label>
                <MultiSelectDropdown label="Todos" items={allUnidades} selected={filtroUnidades} setSelected={setFiltroUnidades} isOpen={unidadeDropdownAberto} setIsOpen={setUnidadeDropdownAberto} searchable={true} />
              </div>
              <div className="mt-4 flex gap-2 border-b border-gray-200 pb-2">
                <button onClick={() => setSubAbaUnidade('tabela')} className={`rounded-t-lg px-4 py-2 text-sm font-medium ${subAbaUnidade === 'tabela' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Tabela</button>
                <button onClick={() => setSubAbaUnidade('grafico')} className={`rounded-t-lg px-4 py-2 text-sm font-medium ${subAbaUnidade === 'grafico' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Grafico</button>
              </div>
            </div>

            {subAbaUnidade === 'tabela' && (
              <div className="overflow-hidden rounded-lg bg-white shadow">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-red-50">
                      <tr>
                        <th onClick={() => toggleOrdenacao('rank')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 w-12 cursor-pointer hover:bg-red-100">#{renderSortIcon('rank')}</th>
                        <th onClick={() => toggleOrdenacao('unidade')} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-red-100">Unidade{renderSortIcon('unidade')}</th>
                        <th onClick={() => toggleOrdenacao('quantidade')} className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-red-100">Qtd Titulos{renderSortIcon('quantidade')}</th>
                        <th onClick={() => toggleOrdenacao('valor')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-red-100">Valor{renderSortIcon('valor')}</th>
                        <th onClick={() => toggleOrdenacao('percentual')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-red-100">% do Total{renderSortIcon('percentual')}</th>
                        <th onClick={() => toggleOrdenacao('acumulado')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-red-100">% Acumulado{renderSortIcon('acumulado')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {unidadesExibidas.map((u, index) => (
                        <React.Fragment key={index}>
                          <tr
                            onClick={() => setUnidadeExpandida(unidadeExpandida === u.unidade ? null : u.unidade)}
                            className={`cursor-pointer transition-colors ${unidadeExpandida === u.unidade ? 'bg-red-100 border-l-4 border-red-600 shadow-sm' : `hover:bg-gray-50 ${u.acumulado <= 80 ? 'bg-red-50/30' : u.acumulado <= 95 ? 'bg-yellow-50/30' : ''}`}`}
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400 font-mono">
                              <span className={`inline-block transition-transform mr-2 text-[10px] ${unidadeExpandida === u.unidade ? 'rotate-90' : ''}`}>&#9654;</span>
                              {u.rank}
                            </td>
                            <td className={`whitespace-nowrap px-6 py-3 text-sm text-gray-900 ${unidadeExpandida === u.unidade ? 'font-bold text-red-800' : 'font-medium'}`}>{u.unidade}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 text-center">{u.quantidade}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-red-600 text-right">{formatCurrency(u.valor)}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-2">
                                  <div className="bg-red-500 h-2 rounded-full" style={{ width: `${Math.min(u.percentual * 2, 100)}%` }}></div>
                                </div>
                                <span className="w-14 text-right">{u.percentual.toFixed(2)}%</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-right">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${u.acumulado <= 80 ? 'bg-red-100 text-red-700' : u.acumulado <= 95 ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'}`}>
                                {u.acumulado.toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                          {unidadeExpandida === u.unidade && (
                            <tr className="bg-red-50/40">
                              <td colSpan={6} className="px-8 py-4 border-l-4 border-red-600">
                                <div className="overflow-hidden rounded-lg border border-red-200 bg-white shadow-md">
                                  <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th onClick={() => toggleOrdInternaUnidade('cliente')} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Cliente{renderSortIconUnidade('cliente')}</th>
                                        <th onClick={() => toggleOrdInternaUnidade('data_vencimento')} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Vencimento{renderSortIconUnidade('data_vencimento')}</th>
                                        <th onClick={() => toggleOrdInternaUnidade('dias_atraso')} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Dias{renderSortIconUnidade('dias_atraso')}</th>
                                        <th onClick={() => toggleOrdInternaUnidade('titulo')} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Titulo{renderSortIconUnidade('titulo')}</th>
                                        <th onClick={() => toggleOrdInternaUnidade('parcela')} className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Parcela{renderSortIconUnidade('parcela')}</th>
                                        <th onClick={() => toggleOrdInternaUnidade('tipo_condicao')} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Tipo Condicao{renderSortIconUnidade('tipo_condicao')}</th>
                                        <th onClick={() => toggleOrdInternaUnidade('centro_custo')} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Centro Custo{renderSortIconUnidade('centro_custo')}</th>
                                        <th onClick={() => toggleOrdInternaUnidade('valor')} className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Valor{renderSortIconUnidade('valor')}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {ordenarContasInternasUnidade(contas.filter(conta => {
                                        const unidadeConta = (conta.numero_documento || conta.id_documento || '').trim() || 'Sem Unidade';
                                        return unidadeConta === u.unidade;
                                      })).map((conta, j) => {
                                        const dias = calcularDiasAtraso(conta.data_vencimento);
                                        return (
                                          <tr key={j} className="hover:bg-red-50/50">
                                            <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900">{conta.cliente || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{formatDate(conta.data_vencimento)}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm">
                                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${dias > 30 ? 'bg-red-100 text-red-800' : dias > 15 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}`}>{dias}d</span>
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900">{String(conta.titulo || conta.lancamento || '-').split('/')[0]}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 text-center">{conta.numero_parcela || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm">
                                              {(conta as any).tipo_condicao ? (
                                                <span title={descTipoCondicao((conta as any).tipo_condicao)} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold cursor-help ${corTipoCondicao((conta as any).tipo_condicao)}`}>{(conta as any).tipo_condicao}</span>
                                              ) : '-'}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500" title={`${(conta as any).codigo_centrocusto || ''} - ${conta.nome_centrocusto || ''}`}>{(conta as any).codigo_centrocusto ? <span className="inline-flex items-center justify-center rounded bg-blue-100 text-blue-700 font-bold font-mono text-[11px] px-1 min-w-[20px]">{(conta as any).codigo_centrocusto}</span> : null}{(conta as any).codigo_centrocusto ? ' ' : ''}{conta.nome_centrocusto || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-red-600 font-semibold text-right">{formatCurrency(conta.saldo_atual || conta.valor_total)}</td>
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
                        <td className="px-6 py-3 text-sm text-red-700 text-right">{formatCurrency(totalGeral)}</td>
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
                <p className="mb-4 text-sm text-gray-500">Distribuicao de valores em atraso por unidade</p>
                <div style={{ height: Math.max(300, unidadesExibidas.length * 45) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={unidadesExibidas} layout="vertical" margin={{ top: 5, right: 30, left: 150, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="unidade" type="category" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="rounded-lg border bg-white p-3 shadow-lg">
                                <p className="font-semibold text-gray-900">{data.unidade}</p>
                                <p className="text-sm text-red-600">{formatCurrency(data.valor)}</p>
                                <p className="text-xs text-gray-500">{data.quantidade} titulo(s) | {data.percentual.toFixed(2)}%</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="valor" fill="#EF4444" radius={[0, 4, 4, 0]}>
                        {unidadesExibidas.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.acumulado <= 80 ? '#EF4444' : entry.acumulado <= 95 ? '#F59E0B' : '#F97316'} />
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
