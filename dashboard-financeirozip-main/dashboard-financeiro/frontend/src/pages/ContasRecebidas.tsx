import React, { useEffect, useState, useCallback } from 'react';
import { apiService } from '../services/api';
import { ContaReceber, EmpresaOption, TipoDocumentoOption, CentroCustoOption } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { SearchableSelect } from '../components/SearchableSelect';

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
            <button type="button" onClick={() => setSelected(items.map(i => i.id))} className="text-xs text-green-600 hover:underline">Todos</button>
            <button type="button" onClick={() => setSelected([])} className="text-xs text-gray-500 hover:underline">Limpar</button>
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
}

interface DadosPorCliente {
  cliente: string;
  valor: number;
  quantidade: number;
  percentual: number;
  percentual_acumulado: number;
}

interface TipoBaixaItem {
  id: number;
  nome: string;
  flag: string;
  descricao: string;
}

type AbaAtiva = 'dados' | 'analises' | 'por-cliente';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];

export const ContasRecebidas: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('dados');
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [dadosPorCliente, setDadosPorCliente] = useState<DadosPorCliente[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<number | null>(null);
  const [filtroAno, setFiltroAno] = useState<number | null>(null);
  const [filtroMes, setFiltroMes] = useState<number[]>([]);
  const [todasContas, setTodasContas] = useState<ContaReceber[]>([]);
  const [mesDropdownAberto, setMesDropdownAberto] = useState(false);
  const [ordenacao, setOrdenacao] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'data_recebimento', direcao: 'desc' });
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumentoOption[]>([]);
  const [filtroTipoDocumento, setFiltroTipoDocumento] = useState<string[]>([]);
  const [tipoDocDropdownAberto, setTipoDocDropdownAberto] = useState(false);
  const [paretoResumo, setParetoResumo] = useState<{ count: number; total: number } | null>(null);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [filtroCliente, setFiltroCliente] = useState<string | null>(null);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [filtroCentroCusto, setFiltroCentroCusto] = useState<number | null>(null);

  // Tipo de Baixa
  const [tiposBaixa, setTiposBaixa] = useState<TipoBaixaItem[]>([]);
  const [filtroTipoBaixa, setFiltroTipoBaixa] = useState<number[]>([]);
  const [tipoBaixaDropdownAberto, setTipoBaixaDropdownAberto] = useState(false);

  // Total real do servidor (sem LIMIT)
  const [totalServidor, setTotalServidor] = useState<{ total: number; quantidade: number } | null>(null);
  const [loadingTotal, setLoadingTotal] = useState(false);

  // UI
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [linhaExpandida, setLinhaExpandida] = useState<number | null>(null);
  const [clienteExpandido, setClienteExpandido] = useState<string | null>(null);
  const [subAbaCliente, setSubAbaCliente] = useState<'tabela' | 'grafico'>('tabela');

  const calcularDiasDesdeRecebimento = (dataRecebimento: string | undefined) => {
    if (!dataRecebimento) return 999;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const [ano, mes, dia] = dataRecebimento.split('T')[0].split('-').map(Number);
    const recebimento = new Date(ano, mes - 1, dia);
    recebimento.setHours(0, 0, 0, 0);
    const diffTime = hoje.getTime() - recebimento.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const ordenarContas = (contasParaOrdenar: ContaReceber[]) => {
    return [...contasParaOrdenar].sort((a, b) => {
      let valorA: any;
      let valorB: any;

      switch (ordenacao.campo) {
        case 'cliente':
          valorA = (a.cliente || '').toLowerCase();
          valorB = (b.cliente || '').toLowerCase();
          break;
        case 'data_recebimento':
          valorA = (a.data_recebimento || '').split('T')[0];
          valorB = (b.data_recebimento || '').split('T')[0];
          break;
        case 'valor_total':
          valorA = a.valor_total || 0;
          valorB = b.valor_total || 0;
          break;
        case 'nome_empresa':
          valorA = (a.nome_empresa || '').toLowerCase();
          valorB = (b.nome_empresa || '').toLowerCase();
          break;
        case 'nome_centrocusto':
          valorA = (a.nome_centrocusto || '').toLowerCase();
          valorB = (b.nome_centrocusto || '').toLowerCase();
          break;
        case 'tipo_condicao':
          valorA = ((a as any).tipo_condicao || '').toLowerCase();
          valorB = ((b as any).tipo_condicao || '').toLowerCase();
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
    return [anoAtual - 3, anoAtual - 2, anoAtual - 1, anoAtual];
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

  useEffect(() => {
    const carregarFiltros = async () => {
      try {
        const [empresasData, tiposDocData, centrosData, tiposBaixaData] = await Promise.all([
          apiService.getEmpresasRecebidas(),
          apiService.getTiposDocumento(),
          apiService.getCentrosCustoRecebidas(),
          apiService.getTiposBaixaCompleto(),
        ]);
        setEmpresas(empresasData);
        setTiposDocumento(tiposDocData);
        setCentrosCusto(centrosData);
        setTiposBaixa(tiposBaixaData);
      } catch (err) {
        console.error('Erro ao carregar filtros:', err);
      }
    };
    carregarFiltros();
  }, []);

  const carregarDados = async (centroCusto?: number | null) => {
    try {
      setLoading(true);
      const data = await apiService.getContasRecebidasFiltradas({
        centro_custo: centroCusto ?? undefined,
        tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
        limite: 2000,
      });
      setTodasContas(data);
    } catch (err) {
      setError('Erro ao carregar contas recebidas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const carregarTotais = useCallback(async () => {
    setLoadingTotal(true);
    try {
      const result = await apiService.getContasRecebidasTotais({
        empresa: filtroEmpresa ?? undefined,
        centro_custo: filtroCentroCusto ?? undefined,
        cliente: filtroCliente ?? undefined,
        id_documento: filtroTipoDocumento.length > 0 ? filtroTipoDocumento.join(',') : undefined,
        ano: filtroAno ? String(filtroAno) : undefined,
        mes: filtroMes.length > 0 ? filtroMes.join(',') : undefined,
        tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
      });
      setTotalServidor(result);
    } catch {
      setTotalServidor(null);
    } finally {
      setLoadingTotal(false);
    }
  }, [filtroEmpresa, filtroCentroCusto, filtroCliente, filtroTipoDocumento, filtroAno, filtroMes, filtroTipoBaixa]);

  useEffect(() => {
    carregarTotais();
  }, [carregarTotais]);

  const aplicarFiltrosLocais = (
    dados: ContaReceber[],
    empresa: number | null,
    ano: number | null,
    mesesSelecionados: number[],
    tiposDocSelecionados: string[],
    cliente: string | null,
    centroCusto: number | null,
    tiposBaixaSelecionados: number[],
  ) => {
    let contasFiltradas = [...dados];

    if (empresa) {
      contasFiltradas = contasFiltradas.filter(c => c.id_interno_empresa === empresa);
    }
    if (cliente) {
      contasFiltradas = contasFiltradas.filter(c => c.cliente === cliente);
    }
    if (ano) {
      contasFiltradas = contasFiltradas.filter(c => {
        if (!c.data_recebimento) return false;
        const anoRec = parseInt(c.data_recebimento.split('T')[0].split('-')[0]);
        return anoRec === ano;
      });
    }
    if (mesesSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        if (!c.data_recebimento) return false;
        const mesRec = parseInt(c.data_recebimento.split('T')[0].split('-')[1]);
        return mesesSelecionados.includes(mesRec);
      });
    }
    if (tiposDocSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        return c.id_documento && tiposDocSelecionados.includes(c.id_documento);
      });
    }
    if (tiposBaixaSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c =>
        c.id_tipo_baixa !== undefined && tiposBaixaSelecionados.includes(c.id_tipo_baixa)
      );
    }
    if (centroCusto) {
      contasFiltradas = contasFiltradas.filter(c => c.id_interno_centro_custo === centroCusto);
    }

    return contasFiltradas;
  };

  useEffect(() => {
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

    const contasFiltradas = aplicarFiltrosLocais(
      todasContas, filtroEmpresa, filtroAno, filtroMes, filtroTipoDocumento,
      filtroCliente, filtroCentroCusto, filtroTipoBaixa
    );
    setContas(contasFiltradas);

    const total = contasFiltradas.reduce((acc, c) => acc + (c.valor_total || 0), 0);
    const stats: Estatisticas = {
      quantidade_titulos: contasFiltradas.length,
      valor_total: total,
      valor_medio: contasFiltradas.length > 0 ? total / contasFiltradas.length : 0,
    };
    setEstatisticas(stats);

    const clienteAnaliseMap = new Map<string, { valor: number; quantidade: number }>();
    contasFiltradas.forEach(c => {
      const cliente = c.cliente || 'Sem Cliente';
      const atual = clienteAnaliseMap.get(cliente) || { valor: 0, quantidade: 0 };
      clienteAnaliseMap.set(cliente, {
        valor: atual.valor + (c.valor_total || 0),
        quantidade: atual.quantidade + 1,
      });
    });

    const clienteList = Array.from(clienteAnaliseMap.entries())
      .map(([cliente, data]) => ({ cliente, ...data }))
      .sort((a, b) => b.valor - a.valor);

    let acumulado = 0;
    const clienteArray: DadosPorCliente[] = clienteList.map(c => {
      const percentual = total > 0 ? (c.valor / total) * 100 : 0;
      acumulado += percentual;
      return {
        ...c,
        percentual,
        percentual_acumulado: acumulado,
      };
    });

    const count80 = clienteArray.filter(c => c.percentual_acumulado <= 80).length;
    setParetoResumo({
      count: count80 || 1,
      total: clienteArray.length,
    });

    setDadosPorCliente(clienteArray.slice(0, 20));
  }, [todasContas, filtroEmpresa, filtroAno, filtroMes, filtroTipoDocumento, filtroCliente, filtroCentroCusto, filtroTipoBaixa]);

  useEffect(() => {
    if (filtroCentroCusto !== null && centrosCusto.length > 0) {
      const centroAtual = centrosCusto.find(cc => cc.id === filtroCentroCusto);
      if (centroAtual && centroAtual.id_empresa !== filtroEmpresa) {
        setFiltroCentroCusto(null);
      }
    }
  }, [filtroEmpresa]);

  useEffect(() => {
    carregarDados(filtroCentroCusto);
  }, [filtroCentroCusto, filtroTipoBaixa]);

  const limparFiltros = () => {
    setFiltroEmpresa(null);
    setFiltroAno(null);
    setFiltroMes([]);
    setFiltroTipoDocumento([]);
    setFiltroCliente(null);
    setFiltroCentroCusto(null);
    setFiltroTipoBaixa([]);
  };

  const exportarCSV = () => {
    const headers = ['Cliente', 'Data Recebimento', 'Valor', 'Titulo', 'Parcela', 'Documento', 'Empresa', 'Centro de Custo'];
    const rows = ordenarContas(contas).map(c => [
      c.cliente || '',
      formatDate(c.data_recebimento),
      (c.valor_total || 0).toFixed(2).replace('.', ','),
      c.titulo || (c as any).lancamento || '',
      c.numero_parcela || '',
      c.id_documento || '',
      c.nome_empresa || '',
      c.nome_centrocusto || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contas_recebidas.csv';
    a.click();
    URL.revokeObjectURL(url);
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SearchableSelect
          options={empresas}
          value={filtroEmpresa ?? undefined}
          onChange={(value) => setFiltroEmpresa(value as number | null)}
          label="Empresa"
          placeholder="Selecione uma empresa..."
          emptyText="Todas"
        />
        <SearchableSelect
          options={filtroEmpresa ? centrosCusto.filter(cc => cc.id_empresa === filtroEmpresa) : centrosCusto}
          value={filtroCentroCusto ?? undefined}
          onChange={(value) => setFiltroCentroCusto(value as number | null)}
          label="Centro de Custo"
          placeholder={filtroEmpresa ? "Selecione um centro de custo..." : "Selecione uma empresa primeiro..."}
          emptyText="Todos"
        />
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
          label="Tipo de Baixa"
          items={tiposBaixa.map(t => ({ id: t.id, nome: `${t.flag} - ${t.nome}` }))}
          selected={filtroTipoBaixa}
          setSelected={setFiltroTipoBaixa}
          isOpen={tipoBaixaDropdownAberto}
          setIsOpen={setTipoBaixaDropdownAberto}
          searchable={true}
        />
      </div>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={limparFiltros}
          className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
        >
          Limpar Filtros
        </button>
      </div>
    </div>
  );

  // Filtros ativos para badge no botão
  const filtrosAtivos: string[] = [];
  if (filtroEmpresa) {
    const emp = empresas.find(e => e.id === filtroEmpresa);
    if (emp) filtrosAtivos.push(`Empresa: ${emp.nome}`);
  }
  if (filtroCentroCusto) {
    const cc = centrosCusto.find(c => c.id === filtroCentroCusto);
    if (cc) filtrosAtivos.push(`Centro Custo: ${cc.nome}`);
  }
  if (filtroCliente) filtrosAtivos.push(`Cliente: ${filtroCliente}`);
  if (filtroTipoDocumento.length > 0) filtrosAtivos.push(`Docs: ${filtroTipoDocumento.length} selecionado(s)`);
  if (filtroTipoBaixa.length > 0) filtrosAtivos.push(`Tipos Baixa: ${filtroTipoBaixa.length} selecionado(s)`);
  if (filtroAno) filtrosAtivos.push(`Ano: ${filtroAno}`);
  if (filtroMes.length > 0) {
    const mesesNomes = filtroMes.map(m => meses.find(mes => mes.valor === m)?.nome).filter(Boolean);
    filtrosAtivos.push(`Meses: ${mesesNomes.join(', ')}`);
  }

  return (
    <div className="space-y-6">
      {/* Cards de período no topo */}
      {(() => {
        const contasHoje = contas.filter(c => calcularDiasDesdeRecebimento(c.data_recebimento) === 0);
        const contas7dias = contas.filter(c => { const d = calcularDiasDesdeRecebimento(c.data_recebimento); return d >= 0 && d <= 7; });
        const contas15dias = contas.filter(c => { const d = calcularDiasDesdeRecebimento(c.data_recebimento); return d >= 0 && d <= 15; });
        const contas30dias = contas.filter(c => { const d = calcularDiasDesdeRecebimento(c.data_recebimento); return d >= 0 && d <= 30; });

        const valorHoje = contasHoje.reduce((acc, c) => acc + (c.valor_total || 0), 0);
        const valor7dias = contas7dias.reduce((acc, c) => acc + (c.valor_total || 0), 0);
        const valor15dias = contas15dias.reduce((acc, c) => acc + (c.valor_total || 0), 0);
        const valor30dias = contas30dias.reduce((acc, c) => acc + (c.valor_total || 0), 0);

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
        const ini7 = new Date(hoje); ini7.setDate(ini7.getDate() - 7);
        const ini15 = new Date(hoje); ini15.setDate(ini15.getDate() - 15);
        const ini30 = new Date(hoje); ini30.setDate(ini30.getDate() - 30);

        return (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg bg-gradient-to-br from-green-600 to-green-700 p-5 text-white shadow-lg">
              <div className="mb-1 text-xs font-medium opacity-90">Total Recebido</div>
              <div className="text-xl font-bold">
                {loadingTotal ? <span className="text-base opacity-75">calculando...</span> : formatCurrency(totalServidor?.total ?? estatisticas?.valor_total)}
              </div>
              <div className="mt-1 text-xs opacity-75">
                {!loadingTotal && `${(totalServidor?.quantidade ?? totalTitulos).toLocaleString('pt-BR')} titulos | ${clientesTotal} clientes`}
                {!loadingTotal && todasContas.length >= 2000 && (
                  <span className="ml-1 opacity-90">(lista limitada a 2000)</span>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-gradient-to-br from-yellow-500 to-yellow-600 p-5 text-white shadow-lg">
              <div className="mb-1 text-xs font-medium opacity-90">Recebido Hoje</div>
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
              <div className="mb-1 text-xs font-medium opacity-90">Ultimos 7 dias</div>
              <div className="text-xs opacity-75 mb-1">de {formatarDataCurta(ini7)} ate {formatarDataCurta(hoje)}</div>
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
              <div className="mb-1 text-xs font-medium opacity-90">Ultimos 15 dias</div>
              <div className="text-xs opacity-75 mb-1">de {formatarDataCurta(ini15)} ate {formatarDataCurta(hoje)}</div>
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
              <div className="mb-1 text-xs font-medium opacity-90">Ultimos 30 dias</div>
              <div className="text-xs opacity-75 mb-1">de {formatarDataCurta(ini30)} ate {formatarDataCurta(hoje)}</div>
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

      {/* Botão filtros + badges */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {contas.length} conta(s) recebida(s)
          {todasContas.length >= 2000 && (
            <span className="ml-2 text-amber-600">(lista limitada a 2000)</span>
          )}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportarCSV}
            disabled={contas.length === 0}
            className="flex items-center rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
          >
            <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar CSV
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
            {filtrosAtivos.length > 0 && (
              <span className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-green-600">
                {filtrosAtivos.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {!mostrarFiltros && filtrosAtivos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filtrosAtivos.map((filtro, index) => (
            <span key={index} className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
              {filtro}
            </span>
          ))}
          <button type="button" onClick={limparFiltros} className="text-sm text-gray-500 hover:text-gray-700 underline">
            Limpar todos
          </button>
        </div>
      )}

      {mostrarFiltros && renderFiltros()}

      {/* Tabs */}
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
        </nav>
      </div>

      {/* Aba Dados */}
      {abaAtiva === 'dados' && (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-green-50">
                <tr>
                  <th onClick={() => toggleOrdenacao('cliente')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                    Cliente {renderSortIcon('cliente')}
                  </th>
                  <th onClick={() => toggleOrdenacao('data_recebimento')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                    Data Recebimento {renderSortIcon('data_recebimento')}
                  </th>
                  <th onClick={() => toggleOrdenacao('valor_total')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                    Valor {renderSortIcon('valor_total')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Titulo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Parcela</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Documento</th>
                  <th onClick={() => toggleOrdenacao('nome_empresa')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                    Empresa {renderSortIcon('nome_empresa')}
                  </th>
                  <th onClick={() => toggleOrdenacao('nome_centrocusto')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                    Centro de Custo {renderSortIcon('nome_centrocusto')}
                  </th>
                  <th onClick={() => toggleOrdenacao('tipo_condicao')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                    Tipo Condicao {renderSortIcon('tipo_condicao')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {ordenarContas(contas).slice(0, 500).map((conta, index) => {
                  const tituloBase = String(conta.titulo || (conta as any).lancamento || '').split('/')[0];
                  const isExpanded = linhaExpandida === index;
                  return (
                    <React.Fragment key={index}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setLinhaExpandida(isExpanded ? null : index)}
                      >
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                          <div className="flex items-center gap-2">
                            <span className={`text-gray-400 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                            {conta.cliente || '-'}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{formatDate(conta.data_recebimento)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-green-600">{formatCurrency(conta.valor_total)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{conta.titulo || (conta as any).lancamento || '-'}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{conta.numero_parcela || '-'}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{conta.id_documento || '-'}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{conta.nome_empresa || '-'}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {conta.nome_centrocusto ? (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100">
                              {conta.nome_centrocusto}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{(conta as any).tipo_condicao || '-'}</td>
                      </tr>
                      {isExpanded && tituloBase && (() => {
                        const parcelas = todasContas
                          .filter(c => {
                            const t = String(c.titulo || (c as any).lancamento || '');
                            return t.split('/')[0] === tituloBase && t !== String(conta.titulo || (conta as any).lancamento);
                          })
                          .sort((a, b) => {
                            const pa = parseInt(a.numero_parcela || '0');
                            const pb = parseInt(b.numero_parcela || '0');
                            return pa - pb;
                          });
                        const todasParcelas = todasContas.filter(c => {
                          const t = String(c.titulo || (c as any).lancamento || '');
                          return t.split('/')[0] === tituloBase;
                        });
                        const totalParcelas = todasParcelas.length;
                        const valorTotalTitulo = todasParcelas.reduce((acc, c) => acc + (c.valor_total || 0), 0);
                        return (
                          <tr>
                            <td colSpan={9} className="p-0">
                              <div className="bg-green-50 border-t border-b border-green-200 px-8 py-3">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    Titulo {tituloBase} — {totalParcelas} parcela(s) — Total: {formatCurrency(valorTotalTitulo)}
                                  </p>
                                  <span className="text-xs text-gray-400">{conta.nome_empresa || '-'}</span>
                                </div>
                                {parcelas.length > 0 ? (
                                  <div className="max-h-60 overflow-y-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-xs text-gray-400 uppercase">
                                          <th className="text-left py-1 pr-3">Parcela</th>
                                          <th className="text-left py-1 pr-3">Data Recebimento</th>
                                          <th className="text-right py-1 pr-3">Valor</th>
                                          <th className="text-left py-1 pr-3">Documento</th>
                                          <th className="text-left py-1 pr-3">Centro Custo</th>
                                          <th className="text-left py-1">Tipo Condicao</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {parcelas.map((p, pi) => (
                                          <tr key={pi} className="border-t border-green-100 hover:bg-green-100">
                                            <td className="py-1.5 pr-3 text-gray-700 font-mono">{p.numero_parcela || '-'}</td>
                                            <td className="py-1.5 pr-3 text-gray-500">{formatDate(p.data_recebimento)}</td>
                                            <td className="py-1.5 pr-3 text-right font-semibold text-green-700">{formatCurrency(p.valor_total)}</td>
                                            <td className="py-1.5 pr-3 text-gray-500 font-mono text-xs">{p.id_documento || '-'}</td>
                                            <td className="py-1.5 pr-3 text-gray-500">{p.nome_centrocusto || '-'}</td>
                                            <td className="py-1.5 text-gray-500">{(p as any).tipo_condicao || '-'}</td>
                                          </tr>
                                        ))}
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
            {contas.length > 500 && (
              <p className="mt-4 text-center text-sm text-gray-500 py-4">
                Mostrando 500 de {contas.length} registros na lista
              </p>
            )}
          </div>
        </div>
      )}

      {/* Aba Analises */}
      {abaAtiva === 'analises' && (
        <div className="space-y-6">
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Analise Pareto - Top 20 Clientes</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={dadosPorCliente} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} />
                <YAxis type="category" dataKey="cliente" width={180} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'valor') return formatCurrency(value);
                    return `${value.toFixed(1)}%`;
                  }}
                />
                <Bar dataKey="valor" fill="#10B981" name="Valor Recebido">
                  {dadosPorCliente.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                  <LabelList
                    dataKey="percentual_acumulado"
                    position="right"
                    formatter={(value: number) => `${value.toFixed(0)}%`}
                    style={{ fontSize: 10 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {paretoResumo && (
            <div className="rounded-lg bg-green-50 p-6 shadow">
              <h3 className="mb-2 text-lg font-semibold text-green-800">Resumo da Concentracao</h3>
              <p className="text-green-700">
                <strong>{paretoResumo.count}</strong> cliente(s) de um total de <strong>{paretoResumo.total}</strong> representam
                <strong> 80%</strong> do valor total recebido.
              </p>
              <p className="mt-2 text-sm text-green-600">
                Isso equivale a <strong>{paretoResumo.total > 0 ? ((paretoResumo.count / paretoResumo.total) * 100).toFixed(1) : '0'}%</strong> dos clientes.
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
          clienteMap.set(cliente, {
            valor: atual.valor + (c.valor_total || 0),
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
                  <h2 className="text-2xl font-bold text-gray-900">Contas Recebidas por Cliente</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {clientesComPareto.length} cliente(s) | Total: {formatCurrency(totalGeral)}
                  </p>
                </div>
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
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data Recebimento</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Titulo</th>
                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Parcela</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Centro Custo</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo Condicao</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {contas.filter(conta => (conta.cliente || 'Sem Cliente') === c.cliente).map((conta, j) => (
                                        <tr key={j} className="hover:bg-green-50/50">
                                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{formatDate(conta.data_recebimento)}</td>
                                          <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900">{String(conta.titulo || (conta as any).lancamento || '-').split('/')[0]}</td>
                                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 text-center">{conta.numero_parcela || '-'}</td>
                                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{conta.id_documento || '-'}</td>
                                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{conta.nome_empresa || '-'}</td>
                                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{conta.nome_centrocusto || '-'}</td>
                                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{(conta as any).tipo_condicao || '-'}</td>
                                          <td className="whitespace-nowrap px-4 py-2 text-sm text-green-600 font-semibold text-right">{formatCurrency(conta.valor_total || 0)}</td>
                                        </tr>
                                      ))}
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
                <p className="mb-4 text-sm text-gray-500">Distribuicao de valores recebidos por cliente</p>
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
    </div>
  );
};
