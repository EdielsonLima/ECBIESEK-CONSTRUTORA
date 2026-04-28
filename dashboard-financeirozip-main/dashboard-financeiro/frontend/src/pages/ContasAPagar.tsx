import React, { useEffect, useState, useRef } from 'react';
import { apiService } from '../services/api';
import { ContaPagar, TituloDetalhe, EmpresaOption, CentroCustoOption, TipoDocumentoOption } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, Line, ComposedChart } from 'recharts';
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itensFiltrados = searchable && busca
    ? items.filter(i => i.nome.toLowerCase().includes(busca.toLowerCase()))
    : items;

  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-left focus:border-blue-500 focus:outline-none"
      >
        <span className={selected.length > 0 ? 'text-gray-900 dark:text-slate-100' : 'text-gray-500 dark:text-slate-400'}>
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
        <div className="absolute z-50 mt-1 w-full min-w-[250px] rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg">
          {searchable && (
            <div className="border-b border-gray-200 dark:border-slate-700 p-2">
              <input
                ref={searchInputRef}
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded border border-gray-200 dark:border-slate-700 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
          )}
          <div className="border-b border-gray-200 dark:border-slate-700 p-2 flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(items.map(i => i.id))}
              className="text-xs text-blue-600 hover:underline"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => { setSelected([]); setBusca(''); if (searchInputRef.current) searchInputRef.current.focus(); }}
              className="text-xs text-gray-500 dark:text-slate-400 hover:underline"
            >
              Limpar
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto p-2">
            {itensFiltrados.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-center gap-2 py-1 hover:bg-gray-50 dark:bg-slate-900 rounded px-1">
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
                  className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-slate-300">{item.nome}</span>
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

interface DadosPorCredor {
  credor: string;
  valor: number;
  quantidade: number;
}

interface DadosPorEmpresa {
  centroCusto: string;
  valor: number;
  quantidade: number;
}

interface DadosPorVencimento {
  faixa: string;
  valor: number;
  quantidade: number;
  ordem: number;
}

type AbaAtiva = 'dados' | 'analises' | 'por-credor' | 'por-centro-custo' | 'por-semana' | 'por-origem' | 'mudancas';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];

export const ContasAPagar: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('dados');
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [dadosPorCredor, setDadosPorCredor] = useState<DadosPorCredor[]>([]);
  const [dadosPorEmpresa, setDadosPorEmpresa] = useState<DadosPorEmpresa[]>([]);
  const [dadosPorVencimento, setDadosPorVencimento] = useState<DadosPorVencimento[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<number[]>([]);
  const [filtroCentroCusto, setFiltroCentroCusto] = useState<number[]>([]);
  const classificacoesCentrosCusto = new Map<number, string>();
  const filtroClassificacao: string[] = [];
  const [filtroPrazo, setFiltroPrazo] = useState<string>('todos');
  const [filtroAno, setFiltroAno] = useState<number[]>([]);
  const [filtroMes, setFiltroMes] = useState<number[]>([]);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [todasContas, setTodasContas] = useState<ContaPagar[]>([]);
  const [todasContasCompletas, setTodasContasCompletas] = useState<ContaPagar[]>([]);
  const [mesDropdownAberto, setMesDropdownAberto] = useState(false);
  const [ordenacao, setOrdenacao] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'data_vencimento', direcao: 'asc' });
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumentoOption[]>([]);
  const [filtroTipoDocumento, setFiltroTipoDocumento] = useState<string[]>([]);
  const [tipoDocDropdownAberto, setTipoDocDropdownAberto] = useState(false);
  const [empresaDropdownAberto, setEmpresaDropdownAberto] = useState(false);
  const [ccDropdownAberto, setCcDropdownAberto] = useState(false);
  const [credorDropdownAberto, setCredorDropdownAberto] = useState(false);
  const [filtroCredor, setFiltroCredor] = useState<string[]>([]);
  const [filtroDias, setFiltroDias] = useState<string[]>([]);
  const [diasDropdownAberto, setDiasDropdownAberto] = useState(false);
  const [filtroPlanoFinanceiro, setFiltroPlanoFinanceiro] = useState<string[]>([]);
  const [planoFinDropdownAberto, setPlanoFinDropdownAberto] = useState(false);
  const [filtroTipoPagamento, setFiltroTipoPagamento] = useState<number[]>([]);
  const [tipoPagDropdownAberto, setTipoPagDropdownAberto] = useState(false);
  const [tiposPagamento, setTiposPagamento] = useState<Array<{ id: number; nome: string }>>([]);
  const [filtroAutorizacao, setFiltroAutorizacao] = useState<string[]>([]);
  const [autorizacaoDropdownAberto, setAutorizacaoDropdownAberto] = useState(false);
  const [filtroTitulo, setFiltroTitulo] = useState<string[]>([]);
  const [tituloDropdownAberto, setTituloDropdownAberto] = useState(false);
  const [dataReferencia, setDataReferencia] = useState<string>('');
  const [linhaExpandida, setLinhaExpandida] = useState<number | null>(null);
  const [detalheCarregando, setDetalheCarregando] = useState(false);
  const [detalheCache, setDetalheCache] = useState<Record<number, TituloDetalhe>>({});
  const [autorizacoesBulk, setAutorizacoesBulk] = useState<Record<string, string>>({});
  const [autorizacoesLoading, setAutorizacoesLoading] = useState(false);
  const autorizacoesTitulosConsultados = useRef<Set<string>>(new Set());
  const [anoDropdownAberto, setAnoDropdownAberto] = useState(false);
  const [feriados, setFeriados] = useState<Set<string>>(new Set());
  const [snapshotsDisponiveis, setSnapshotsDisponiveis] = useState<Array<{ data_snapshot: string; created_at: string }>>([]);
  const [snapshotSelecionado, setSnapshotSelecionado] = useState<string>('');
  const [snapshotDados, setSnapshotDados] = useState<Record<string, { faixa: string; data_inicio: string | null; data_fim: string | null; valor_total: number; quantidade_titulos: number; quantidade_credores: number }> | null>(null);
  const [salvandoSnapshot, setSalvandoSnapshot] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);
  const [snapshotComparacao, setSnapshotComparacao] = useState<any>(null);
  const [mudancasDataInicio, setMudancasDataInicio] = useState<string>(() => { const d = new Date(); d.setDate(d.getDate() - 3); return d.toISOString().split('T')[0]; });
  const [mudancasDataFim, setMudancasDataFim] = useState<string>(new Date().toISOString().split('T')[0]);
  const [mudancasResultados, setMudancasResultados] = useState<any[]>([]);
  const [mudancasLoading, setMudancasLoading] = useState(false);
  const [filtroAnoSemana, setFiltroAnoSemana] = useState<number>(new Date().getFullYear());
  const [filtroSemanas, setFiltroSemanas] = useState<number[]>([]);
  const [subAbaCentroCusto, setSubAbaCentroCusto] = useState<'tabela' | 'grafico'>('tabela');
  const [subAbaCredor, setSubAbaCredor] = useState<'tabela' | 'grafico'>('tabela');
  const [contasAno, setContasAno] = useState<ContaPagar[]>([]);
  const [loadingContasAno, setLoadingContasAno] = useState(false);
  const [semanaExpandida, setSemanaExpandida] = useState<number | null>(null);
  const [credorExpandido, setCredorExpandido] = useState<string | null>(null);
  const [buscaTexto, setBuscaTexto] = useState<string>('');
  const [buscaTextoDebounced, setBuscaTextoDebounced] = useState<string>('');

  // Debounce do campo de busca global (400ms)
  useEffect(() => {
    const t = setTimeout(() => setBuscaTextoDebounced(buscaTexto), 400);
    return () => clearTimeout(t);
  }, [buscaTexto]);

  // Carregar contas do ano inteiro quando a aba Por Semana e ativada
  useEffect(() => {
    if (abaAtiva === 'por-semana') {
      const carregarContasAno = async () => {
        try {
          setLoadingContasAno(true);
          const data = await apiService.getContasAno(filtroAnoSemana);
          setContasAno(data);
        } catch (err) {
          console.error('Erro ao carregar contas do ano:', err);
        } finally {
          setLoadingContasAno(false);
        }
      };
      carregarContasAno();
    }
  }, [abaAtiva, filtroAnoSemana]);

  const getAutorizacaoConta = (conta: ContaPagar): 'S' | 'N' => {
    const authApi = conta.lancamento ? autorizacoesBulk[conta.lancamento] : undefined;
    return (authApi || (conta as any).flautorizacao) === 'S' ? 'S' : 'N';
  };

  const ordenarContas = (contasParaOrdenar: ContaPagar[]) => {
    return [...contasParaOrdenar].sort((a, b) => {
      let valorA: any;
      let valorB: any;

      switch (ordenacao.campo) {
        case 'credor':
          valorA = (a.credor || '').toLowerCase();
          valorB = (b.credor || '').toLowerCase();
          break;
        case 'data_vencimento':
          valorA = (a.data_vencimento || '').split('T')[0];
          valorB = (b.data_vencimento || '').split('T')[0];
          break;
        case 'dias':
          valorA = calcularDiasAteVencimento(a.data_vencimento as any);
          valorB = calcularDiasAteVencimento(b.data_vencimento as any);
          break;
        case 'valor_total':
          valorA = a.valor_total || 0;
          valorB = b.valor_total || 0;
          break;
        case 'lancamento':
          valorA = parseInt((a.lancamento || '0').split('/')[0]) || 0;
          valorB = parseInt((b.lancamento || '0').split('/')[0]) || 0;
          break;
        case 'nome_empresa':
          valorA = (a.nome_empresa || '').toLowerCase();
          valorB = (b.nome_empresa || '').toLowerCase();
          break;
        case 'codigo_centrocusto':
          valorA = (a as any).codigo_centrocusto || 0;
          valorB = (b as any).codigo_centrocusto || 0;
          break;
        case 'nome_centrocusto':
          valorA = ((a as any).nome_centrocusto || '').toLowerCase();
          valorB = ((b as any).nome_centrocusto || '').toLowerCase();
          break;
        case 'nome_plano_financeiro':
          valorA = ((a as any).nome_plano_financeiro || '').toLowerCase();
          valorB = ((b as any).nome_plano_financeiro || '').toLowerCase();
          break;
        case 'nome_tipo_pagamento':
          valorA = ((a as any).nome_tipo_pagamento || '').toLowerCase();
          valorB = ((b as any).nome_tipo_pagamento || '').toLowerCase();
          break;
        case 'id_documento':
          valorA = (a.id_documento || '').toLowerCase();
          valorB = (b.id_documento || '').toLowerCase();
          break;
        case 'data_cadastro':
          valorA = (a.data_cadastro || '').split('T')[0];
          valorB = (b.data_cadastro || '').split('T')[0];
          break;
        case 'prazo_cadastro':
          valorA = a.data_cadastro && a.data_vencimento ? Math.round((new Date(a.data_vencimento as any).getTime() - new Date(a.data_cadastro as any).getTime()) / (1000 * 60 * 60 * 24)) : 0;
          valorB = b.data_cadastro && b.data_vencimento ? Math.round((new Date(b.data_vencimento as any).getTime() - new Date(b.data_cadastro as any).getTime()) / (1000 * 60 * 60 * 24)) : 0;
          break;
        case 'flautorizacao':
          valorA = getAutorizacaoConta(a);
          valorB = getAutorizacaoConta(b);
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
    <span className="ml-1 inline-block text-[10px]">
      {ordenacao.campo === campo ? (
        ordenacao.direcao === 'asc' ? '\u25B2' : '\u25BC'
      ) : (
        <span className="text-gray-300">{'\u25BC'}</span>
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
  const anosDisponiveis = React.useMemo(() => {
    const anos = new Set<number>();
    todasContas.forEach(c => {
      if (c.data_vencimento) {
        const anoVenc = parseInt(c.data_vencimento.split('T')[0].split('-')[0]);
        if (!isNaN(anoVenc)) anos.add(anoVenc);
      }
    });

    if (anos.size === 0) {
      const anoAtual = new Date().getFullYear();
      return [anoAtual - 1, anoAtual, anoAtual + 1];
    }

    return Array.from(anos).sort((a, b) => a - b);
  }, [todasContas]);

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

  const calcularTitulosUnicos = (listaContas: ContaPagar[]): number => {
    const unicos = new Set<string>();
    listaContas.forEach(c => {
      if (c.lancamento && String(c.lancamento).includes('/')) {
        // Ex: "10589/22" -> usa só a parte "10589" (ID base do título que gerou as parcelas)
        unicos.add(String(c.lancamento).split('/')[0]);
      } else if (c.numero_documento) {
        unicos.add(String(c.numero_documento));
      } else {
        unicos.add(`fallback-${c.id}`);
      }
    });
    return unicos.size;
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

  // Verifica se uma conta vence "hoje" considerando fins de semana e feriados:
  // Inclui contas cujo vencimento cai em dias não-úteis consecutivos antes de hoje
  const isVenceHoje = (dataVencimento: string | undefined) => {
    if (!dataVencimento) return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const [ano, mes, dia] = dataVencimento.split('T')[0].split('-').map(Number);
    const vencimento = new Date(ano, mes - 1, dia);
    vencimento.setHours(0, 0, 0, 0);
    // Vence exatamente hoje
    if (vencimento.getTime() === hoje.getTime()) return true;
    // Se o vencimento é no futuro, não é "hoje"
    if (vencimento.getTime() > hoje.getTime()) return false;
    // Verificar se o vencimento cai em dias não-úteis consecutivos antes de hoje
    // (fins de semana ou feriados)
    const check = new Date(hoje);
    check.setDate(check.getDate() - 1);
    while (check.getTime() >= vencimento.getTime()) {
      const dow = check.getDay(); // 0=dom, 6=sab
      const dateStr = check.toISOString().split('T')[0];
      const isWeekend = dow === 0 || dow === 6;
      const isFeriado = feriados.has(dateStr);
      if (!isWeekend && !isFeriado) {
        // Hit a normal business day that's before today — stop
        return false;
      }
      if (check.getTime() === vencimento.getTime()) {
        // The vencimento date is a weekend or feriado, and all days between it and today are non-business days
        return true;
      }
      check.setDate(check.getDate() - 1);
    }
    return false;
  };

  useEffect(() => {
    const carregarFiltros = async () => {
      try {
        const [empresasData, ccData, tiposDocData, tiposPagData, feriadosData] = await Promise.all([
          apiService.getEmpresas().catch(() => []),
          apiService.getCentrosCusto().catch(() => []),
          apiService.getTiposDocumento().catch(() => []),
          apiService.getTiposPagamento().catch(() => []),
          apiService.getFeriados().catch(() => []),
        ]);
        setEmpresas(empresasData);
        setCentrosCusto(ccData);
        setTiposDocumento(tiposDocData);
        setTiposPagamento(tiposPagData);
        setFeriados(new Set(feriadosData.map((f: { data: string }) => f.data.split('T')[0])));
      } catch (err) {
        console.error('Erro ao carregar filtros:', err);
      }
    };
    carregarFiltros();

    // Carregar filtros padrão salvos
    const filtrosSalvos = localStorage.getItem('contas_a_pagar_filtros_padrao');
    if (filtrosSalvos) {
      try {
        const f = JSON.parse(filtrosSalvos);
        if (f.filtroEmpresa?.length) setFiltroEmpresa(f.filtroEmpresa);
        if (f.filtroCentroCusto?.length) setFiltroCentroCusto(f.filtroCentroCusto);
        if (f.filtroPrazo && f.filtroPrazo !== 'todos') setFiltroPrazo(f.filtroPrazo);
        if (f.filtroAno?.length) setFiltroAno(f.filtroAno);
        if (f.filtroMes?.length) setFiltroMes(f.filtroMes);
        if (f.filtroTipoDocumento?.length) setFiltroTipoDocumento(f.filtroTipoDocumento);
        if (f.filtroCredor?.length) setFiltroCredor(f.filtroCredor);
        if (f.filtroDias?.length) setFiltroDias(f.filtroDias);
        if (f.filtroPlanoFinanceiro?.length) setFiltroPlanoFinanceiro(f.filtroPlanoFinanceiro);
        if (f.filtroTipoPagamento?.length) setFiltroTipoPagamento(f.filtroTipoPagamento);
        if (f.filtroAutorizacao?.length) setFiltroAutorizacao(f.filtroAutorizacao);
        if (f.filtroTitulo?.length) setFiltroTitulo(f.filtroTitulo);
        if (f.dataReferencia) setDataReferencia(f.dataReferencia);
      } catch (err) {
        console.error('Erro ao carregar filtros padrão:', err);
      }
    }
  }, []);

  const carregarAutorizacoes = async (refresh: boolean = false) => {
    setAutorizacoesLoading(true);
    try {
      if (refresh) {
        autorizacoesTitulosConsultados.current.clear();
      }
      const data = await apiService.getAutorizacoesBulk(refresh);
      setAutorizacoesBulk(data);
    } catch (err) {
      console.error('Erro ao carregar autorizações:', err);
    } finally {
      setAutorizacoesLoading(false);
    }
  };

  const conferirAutorizacoesTitulos = async (lista: ContaPagar[]) => {
    const lancamentos = Array.from(new Set(
      lista
        .map(c => c.lancamento)
        .filter((l): l is string => Boolean(l))
        .filter(l => !autorizacoesTitulosConsultados.current.has(l))
    ));
    if (lancamentos.length === 0) return;

    lancamentos.forEach(l => autorizacoesTitulosConsultados.current.add(l));
    try {
      const data = await apiService.getAutorizacoesTitulos(lancamentos);
      if (Object.keys(data).length > 0) {
        setAutorizacoesBulk(prev => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('Erro ao conferir autorizações por título:', err);
    }
  };

  useEffect(() => {
    carregarAutorizacoes();
  }, []);

  useEffect(() => {
    const carregarSnapshots = async () => {
      try {
        const lista = await apiService.listarSnapshotsCardsPagar();
        setSnapshotsDisponiveis(lista);
      } catch (err) {
        console.error('Erro ao carregar snapshots:', err);
      }
    };
    carregarSnapshots();
  }, []);

  useEffect(() => {
    if (!snapshotSelecionado) {
      setSnapshotDados(null);
      setSnapshotComparacao(null);
      return;
    }
    const carregarSnapshot = async () => {
      try {
        const data = await apiService.getSnapshotCardsPagar(snapshotSelecionado);
        setSnapshotDados(data.cards);
        // Carrega comparação detalhada
        const comp = await apiService.compararSnapshot(snapshotSelecionado).catch(() => null);
        setSnapshotComparacao(comp);
      } catch (err) {
        console.error('Erro ao carregar snapshot:', err);
        setSnapshotDados(null);
        setSnapshotComparacao(null);
      }
    };
    carregarSnapshot();
  }, [snapshotSelecionado]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const data = await apiService.getContas('a_pagar', 10000, buscaTextoDebounced || undefined);

      setTodasContasCompletas(data);

      // Incluir contas não vencidas + contas de fim de semana (na segunda-feira)
      const contasNaoVencidas = data.filter(c => {
        const dias = calcularDiasAteVencimento(c.data_vencimento as any);
        if (dias >= 0) return true;
        // Na segunda-feira, incluir contas de sábado (-2) e domingo (-1)
        return isVenceHoje(c.data_vencimento as any);
      });

      setTodasContas(contasNaoVencidas);
    } catch (err) {
      setError('Erro ao carregar contas a pagar');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltrosLocais = (
    dados: ContaPagar[],
    empresa: number[],
    cc: number[],
    classificacao: string[],
    classificacoesMap: Map<number, string>,
    prazo: string,
    ano: number[],
    mesesSelecionados: number[],
    tiposDocSelecionados: string[],
    credoresSelecionados: string[],
    diasSelecionados: string[],
    planosFinSelecionados?: string[],
    tiposPagSelecionados?: number[],
    autorizacaoSelecionada?: string[],
    autorizacoesBulkMap?: Record<string, string>,
    titulosSelecionados?: string[]
  ) => {
    let contasFiltradas = [...dados];

    if (empresa.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => empresa.includes(c.id_sienge_empresa as number));
    }
    if (cc.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => cc.includes(c.id_interno_centro_custo as number));
    }
    if (classificacao.length > 0 && classificacoesMap && classificacoesMap.size > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        const classif = classificacoesMap.get(c.id_interno_centro_custo || 0);
        return classif && classificacao.includes(classif);
      });
    }
    if (ano.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        if (!c.data_vencimento) return false;
        const anoVenc = parseInt(c.data_vencimento.split('T')[0].split('-')[0]);
        return ano.includes(anoVenc);
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
    if (credoresSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        return c.credor && credoresSelecionados.includes(c.credor);
      });
    }
    if (diasSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        const dias = calcularDiasAteVencimento(c.data_vencimento as any);
        return diasSelecionados.includes(String(dias));
      });
    }
    if (planosFinSelecionados && planosFinSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        const nome = (c as any).nome_plano_financeiro || 'Sem Plano';
        return planosFinSelecionados.includes(nome);
      });
    }
    if (tiposPagSelecionados && tiposPagSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        return (c as any).id_tipo_pagamento && tiposPagSelecionados.includes((c as any).id_tipo_pagamento);
      });
    }
    if (autorizacaoSelecionada && autorizacaoSelecionada.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        const authApi = c.lancamento && autorizacoesBulkMap ? autorizacoesBulkMap[c.lancamento] : undefined;
        const auth = (authApi || (c as any).flautorizacao) === 'S' ? 'S' : 'N';
        return autorizacaoSelecionada.includes(auth);
      });
    }
    if (titulosSelecionados && titulosSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        const titulo = c.lancamento ? c.lancamento.split('/')[0] : '';
        return titulosSelecionados.includes(titulo);
      });
    }
    if (prazo !== 'todos') {
      contasFiltradas = contasFiltradas.filter(c => {
        const dias = calcularDiasAteVencimento(c.data_vencimento as any);
        switch (prazo) {
          case 'hoje': return isVenceHoje(c.data_vencimento as any);
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

    const contasFiltradas = aplicarFiltrosLocais(todasContas, filtroEmpresa, filtroCentroCusto, filtroClassificacao, classificacoesCentrosCusto, filtroPrazo, filtroAno, filtroMes, filtroTipoDocumento, filtroCredor, filtroDias, filtroPlanoFinanceiro, filtroTipoPagamento, filtroAutorizacao, autorizacoesBulk, filtroTitulo);
    setContas(contasFiltradas);
    conferirAutorizacoesTitulos(contasFiltradas.slice(0, 100).filter(c => getAutorizacaoConta(c) !== 'S'));

    // Card "Total a Pagar" usa as contas filtradas (hoje + futuro, com lógica de segunda-feira)
    const stats: Estatisticas = {
      quantidade_titulos: calcularTitulosUnicos(contasFiltradas),
      valor_total: contasFiltradas.reduce((acc, c) => acc + (c.valor_total || 0), 0),
      valor_medio: contasFiltradas.length > 0
        ? contasFiltradas.reduce((acc, c) => acc + (c.valor_total || 0), 0) / contasFiltradas.length
        : 0,
    };
    setEstatisticas(stats);

    const credorMap = new Map<string, { valor: number; quantidade: number }>();
    contasFiltradas.forEach(c => {
      const credor = c.credor || 'Sem Credor';
      const atual = credorMap.get(credor) || { valor: 0, quantidade: 0 };
      credorMap.set(credor, {
        valor: atual.valor + (c.valor_total || 0),
        quantidade: atual.quantidade + 1,
      });
    });
    const credorArray = Array.from(credorMap.entries())
      .map(([credor, data]) => ({ credor, ...data }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 15);
    setDadosPorCredor(credorArray);

    const ccMap = new Map<string, { valor: number; quantidade: number }>();
    contasFiltradas.forEach(c => {
      const cc = (c as any).nome_centrocusto || 'Sem Centro de Custo';
      const atual = ccMap.get(cc) || { valor: 0, quantidade: 0 };
      ccMap.set(cc, {
        valor: atual.valor + (c.valor_total || 0),
        quantidade: atual.quantidade + 1,
      });
    });
    const empresaArray = Array.from(ccMap.entries())
      .map(([centroCusto, data]) => ({ centroCusto, ...data }))
      .sort((a, b) => b.valor - a.valor);
    setDadosPorEmpresa(empresaArray);

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
      const dias = calcularDiasAteVencimento(c.data_vencimento as any);
      const faixa = faixas.find(f => dias >= f.min && dias <= f.max);
      if (faixa) {
        const atual = vencimentoMap.get(faixa.faixa)!;
        vencimentoMap.set(faixa.faixa, {
          valor: atual.valor + (c.valor_total || 0),
          quantidade: atual.quantidade + 1,
          ordem: atual.ordem,
        });
      }
    });

    const vencimentoArray = Array.from(vencimentoMap.entries())
      .map(([faixa, data]) => ({ faixa, ...data }))
      .filter(d => d.quantidade > 0)
      .sort((a, b) => a.ordem - b.ordem);
    setDadosPorVencimento(vencimentoArray);
  }, [todasContas, todasContasCompletas, filtroEmpresa, filtroCentroCusto, filtroClassificacao, classificacoesCentrosCusto, filtroPrazo, filtroAno, filtroMes, filtroTipoDocumento, filtroCredor, filtroDias, filtroPlanoFinanceiro, filtroTipoPagamento, filtroAutorizacao, autorizacoesBulk, filtroTitulo]);

  useEffect(() => {
    carregarDados();
  }, [feriados, buscaTextoDebounced]);

  const aplicarFiltros = () => {
    // Filtros ja sao aplicados automaticamente pelo useEffect
  };

  const limparFiltros = () => {
    setFiltroEmpresa([]);
    setFiltroCentroCusto([]);
    setFiltroPrazo('todos');
    setFiltroAno([]);
    setFiltroMes([]);
    setFiltroTipoDocumento([]);
    setFiltroCredor([]);
    setFiltroDias([]);
    setFiltroPlanoFinanceiro([]);
    setFiltroTipoPagamento([]);
    setFiltroAutorizacao([]);
    setFiltroTitulo([]);
    setDataReferencia('');
  };

  const FILTROS_PADRAO_KEY = 'contas_a_pagar_filtros_padrao';

  const salvarFiltrosPadrao = () => {
    const filtros = {
      filtroEmpresa,
      filtroCentroCusto,
      filtroPrazo,
      filtroAno,
      filtroMes,
      filtroTipoDocumento,
      filtroCredor,
      filtroDias,
      filtroPlanoFinanceiro,
      filtroTipoPagamento,
      filtroAutorizacao,
      filtroTitulo,
      dataReferencia,
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

  const credoresDisponiveis = React.useMemo(() => {
    const credorSet = new Set<string>();
    todasContas.forEach(c => {
      if (c.credor) credorSet.add(c.credor);
    });
    return Array.from(credorSet).sort((a, b) => a.localeCompare(b));
  }, [todasContas]);

  const diasDisponiveis = React.useMemo(() => {
    const diasSet = new Set<number>();
    todasContas.forEach(c => {
      const dias = calcularDiasAteVencimento(c.data_vencimento as any);
      diasSet.add(dias);
    });
    return Array.from(diasSet).sort((a, b) => a - b);
  }, [todasContas]);

  const planosFinDisponiveis = React.useMemo(() => {
    const planoSet = new Set<string>();
    todasContas.forEach(c => {
      const nome = (c as any).nome_plano_financeiro;
      if (nome) planoSet.add(nome);
    });
    return Array.from(planoSet).sort((a, b) => a.localeCompare(b));
  }, [todasContas]);

  const titulosDisponiveis = React.useMemo(() => {
    const tituloSet = new Set<string>();
    todasContas.forEach(c => {
      if (c.lancamento) {
        const titulo = c.lancamento.split('/')[0];
        if (titulo) tituloSet.add(titulo);
      }
    });
    return Array.from(tituloSet).sort((a, b) => parseInt(a) - parseInt(b));
  }, [todasContas]);

  const exportarCSV = () => {
    const contasOrdenadas = ordenarContas(contas);
    const headers = ['Credor', 'Cadastro', 'Vencimento', 'Prazo', 'Dias', 'Titulo', 'Doc.', 'Aut.', 'Cod. CC', 'Centro de Custo', 'Plano Financeiro', 'Tipo Pagamento', 'Observação', 'Valor'];
    const rows = contasOrdenadas.map(c => {
      const dias = calcularDiasAteVencimento(c.data_vencimento as any);
      const diasStr = dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias}d`;
      const prazoDias = c.data_cadastro && c.data_vencimento
        ? Math.round((new Date(c.data_vencimento as any).getTime() - new Date(c.data_cadastro as any).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      const authApi = c.lancamento ? autorizacoesBulk[c.lancamento] : undefined;
      const auth = (authApi || (c as any).flautorizacao) === 'S' ? 'Sim' : 'Nao';
      return [
        c.credor || '-',
        c.data_cadastro ? formatDate(c.data_cadastro as any) : '-',
        formatDate(c.data_vencimento as any),
        `${prazoDias}d`,
        diasStr,
        c.lancamento ? c.lancamento.split('/')[0] : '-',
        c.id_documento || '-',
        auth,
        (c as any).codigo_centrocusto ? String((c as any).codigo_centrocusto) : '-',
        (c as any).nome_centrocusto || '-',
        (c as any).nome_plano_financeiro || '-',
        (c as any).nome_tipo_pagamento || '-',
        ((c as any).descricao_observacao || '').replace(/\n/g, ' '),
        (c.valor_total || 0).toFixed(2).replace('.', ','),
      ];
    });
    const csvContent = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contas_a_pagar_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPDF = () => {
    const abaLabels: Record<AbaAtiva, string> = {
      'dados': 'Dados',
      'analises': 'Analises',
      'por-credor': 'Por Credor',
      'por-centro-custo': 'Por Centro de Custo',
      'por-semana': 'Por Semana',
      'por-origem': 'Por Origem',
      'mudancas': 'Mudancas',
    };
    const abaLabel = abaLabels[abaAtiva] || abaAtiva;
    const { doc, pageWidth, margin, y: startY, dataGeracao } = criarPDFBase('Contas a Pagar', `Aba: ${abaLabel}`);
    let y = startY;

    // Filtros ativos
    const filtros = [
      { label: 'Empresa', valor: filtroEmpresa.length > 0 ? filtroEmpresa.map(id => empresas.find(e => e.id === id)?.nome).filter(Boolean).join(', ') : 'Todos' },
      { label: 'Centro de Custo', valor: filtroCentroCusto.length > 0 ? filtroCentroCusto.map(id => centrosCusto.find(c => c.id === id)?.nome).filter(Boolean).join(', ') : 'Todos' },
      { label: 'Credor', valor: filtroCredor.length > 0 ? (filtroCredor.length <= 3 ? filtroCredor.join(', ') : `${filtroCredor.length} credores`) : 'Todos' },
      { label: 'Prazo', valor: filtroPrazo !== 'todos' ? (getPrazoNome(filtroPrazo) || filtroPrazo) : 'Todos' },
      { label: 'Ano', valor: filtroAno.length > 0 ? filtroAno.join(', ') : 'Todos' },
      { label: 'Mes', valor: filtroMes.length > 0 ? filtroMes.map(m => meses.find(mes => mes.valor === m)?.nome).filter(Boolean).join(', ') : 'Todos' },
      { label: 'Tipo Documento', valor: filtroTipoDocumento.length > 0 ? filtroTipoDocumento.join(', ') : 'Todos' },
      { label: 'Dias', valor: filtroDias.length > 0 ? filtroDias.map(d => d === '0' ? 'Hoje' : parseInt(d) < 0 ? `${Math.abs(parseInt(d))}d atraso` : `${d}d`).join(', ') : 'Todos' },
    ];
    y = adicionarFiltrosAtivos(doc, filtros, y, pageWidth, margin);

    // Cards de resumo
    if (estatisticas) {
      const contasHojePDF = contas.filter(c => calcularDiasAteVencimento(c.data_vencimento as any) === 0);
      const contas7diasPDF = contas.filter(c => { const dias = calcularDiasAteVencimento(c.data_vencimento as any); return dias >= 1 && dias <= 7; });
      const contas15diasPDF = contas.filter(c => { const dias = calcularDiasAteVencimento(c.data_vencimento as any); return dias >= 1 && dias <= 15; });
      const contas30diasPDF = contas.filter(c => { const dias = calcularDiasAteVencimento(c.data_vencimento as any); return dias >= 1 && dias <= 30; });
      const valorHojePDF = contasHojePDF.reduce((acc, c) => acc + (c.valor_total || 0), 0);
      const valor7diasPDF = contas7diasPDF.reduce((acc, c) => acc + (c.valor_total || 0), 0);
      const valor15diasPDF = contas15diasPDF.reduce((acc, c) => acc + (c.valor_total || 0), 0);
      const valor30diasPDF = contas30diasPDF.reduce((acc, c) => acc + (c.valor_total || 0), 0);

      y = adicionarResumoCards(doc, [
        { label: 'Total a Pagar', valor: estatisticas.valor_total, cor: [59, 130, 246] },
        { label: 'Vencendo Hoje', valor: valorHojePDF, cor: [249, 115, 22] },
        { label: 'Proximos 7 dias', valor: valor7diasPDF, cor: [168, 85, 247] },
        { label: 'Proximos 15 dias', valor: valor15diasPDF, cor: [20, 184, 166] },
        { label: 'Proximos 30 dias', valor: valor30diasPDF, cor: [99, 102, 241] },
      ], y, pageWidth, margin);
    }

    if (abaAtiva === 'dados') {
      const contasOrdenadas = ordenarContas(contas);
      y = adicionarTabela(doc, {
        head: [['Credor', 'Venc.', 'Dias', 'Titulo', 'Aut.', 'Cod.', 'Centro de Custo', 'Tipo Doc.', 'Plano Fin.', 'Tipo Pag.', 'Observação', 'Valor']],
        body: contasOrdenadas.map(c => {
          const dias = calcularDiasAteVencimento(c.data_vencimento as any);
          const diasStr = dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias}d`;
          const authApi = c.lancamento ? autorizacoesBulk[c.lancamento] : undefined;
          const auth = authApi || (c as any).flautorizacao;
          return [
            c.credor || '-',
            formatDatePDF(c.data_vencimento),
            diasStr,
            c.lancamento ? c.lancamento.split('/')[0] : '-',
            auth === 'S' ? 'Sim' : 'Nao',
            (c as any).codigo_centrocusto ? String((c as any).codigo_centrocusto) : '-',
            (c as any).nome_centrocusto || '-',
            c.id_documento || '-',
            (c as any).nome_plano_financeiro || '-',
            (c as any).nome_tipo_pagamento || '-',
            (c as any).descricao_observacao || '-',
            `R$ ${formatCurrencyPDF(c.valor_total || 0)}`,
          ];
        }),
        foot: [['TOTAL', '', '', '', '', '', '', '', '', '', '', `R$ ${formatCurrencyPDF(contas.reduce((a, c) => a + (c.valor_total || 0), 0))}`]],
        columnStyles: { 4: { halign: 'center' }, 5: { halign: 'center' }, 11: { halign: 'right' } },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 4) {
            if (data.cell.raw === 'Sim') {
              data.cell.styles.textColor = [22, 163, 74];
              data.cell.styles.fontStyle = 'bold';
            } else if (data.cell.raw === 'Nao') {
              data.cell.styles.textColor = [220, 38, 38];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
      }, y, margin);
    } else if (abaAtiva === 'por-credor') {
      // Recalculate Pareto data for PDF
      const credorMapPDF = new Map<string, { valor: number; quantidade: number }>();
      contas.forEach(c => {
        const credor = c.credor || 'Sem Credor';
        const atual = credorMapPDF.get(credor) || { valor: 0, quantidade: 0 };
        credorMapPDF.set(credor, { valor: atual.valor + (c.valor_total || 0), quantidade: atual.quantidade + 1 });
      });
      const credoresPorValorPDF = Array.from(credorMapPDF.entries())
        .map(([credor, data]) => ({ credor, ...data }))
        .sort((a, b) => b.valor - a.valor);
      const totalGeralCredor = credoresPorValorPDF.reduce((acc, c) => acc + c.valor, 0);
      let acumCredor = 0;
      const credoresParetoPDF = credoresPorValorPDF.map((c, i) => {
        const pct = totalGeralCredor > 0 ? (c.valor / totalGeralCredor) * 100 : 0;
        acumCredor += pct;
        return { ...c, rank: i + 1, percentual: pct, acumulado: acumCredor };
      });

      y = adicionarTabela(doc, {
        head: [['#', 'Credor', 'Qtd', 'Valor', '%', '% Acumulado']],
        body: credoresParetoPDF.map(c => [
          String(c.rank),
          c.credor,
          String(c.quantidade),
          `R$ ${formatCurrencyPDF(c.valor)}`,
          `${c.percentual.toFixed(2)}%`,
          `${c.acumulado.toFixed(2)}%`,
        ]),
        foot: [['', 'TOTAL', String(contas.length), `R$ ${formatCurrencyPDF(totalGeralCredor)}`, '100,00%', '']],
        columnStyles: { 0: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      }, y, margin);
    } else if (abaAtiva === 'por-centro-custo') {
      const ccMapPDF = new Map<string, { valor: number; quantidade: number }>();
      contas.forEach(c => {
        const cc = (c as any).nome_centrocusto || 'Sem Centro de Custo';
        const atual = ccMapPDF.get(cc) || { valor: 0, quantidade: 0 };
        ccMapPDF.set(cc, { valor: atual.valor + (c.valor_total || 0), quantidade: atual.quantidade + 1 });
      });
      const ccPorValorPDF = Array.from(ccMapPDF.entries())
        .map(([centroCusto, data]) => ({ centroCusto, ...data }))
        .sort((a, b) => b.valor - a.valor);
      const totalGeralCC = ccPorValorPDF.reduce((acc, c) => acc + c.valor, 0);
      let acumCC = 0;
      const ccParetoPDF = ccPorValorPDF.map((c, i) => {
        const pct = totalGeralCC > 0 ? (c.valor / totalGeralCC) * 100 : 0;
        acumCC += pct;
        return { ...c, rank: i + 1, percentual: pct, acumulado: acumCC };
      });

      y = adicionarTabela(doc, {
        head: [['#', 'Centro de Custo', 'Qtd', 'Valor', '%', '% Acumulado']],
        body: ccParetoPDF.map(c => [
          String(c.rank),
          c.centroCusto,
          String(c.quantidade),
          `R$ ${formatCurrencyPDF(c.valor)}`,
          `${c.percentual.toFixed(2)}%`,
          `${c.acumulado.toFixed(2)}%`,
        ]),
        foot: [['', 'TOTAL', String(contas.length), `R$ ${formatCurrencyPDF(totalGeralCC)}`, '100,00%', '']],
        columnStyles: { 0: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      }, y, margin);
    } else if (abaAtiva === 'por-semana') {
      const getWeekNumberPDF = (d: Date): [number, number] => {
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
        return [date.getUTCFullYear(), weekNo];
      };
      const getWeekDatesPDF = (year: number, week: number): [Date, Date] => {
        const jan1 = new Date(year, 0, 1);
        const dayOffset = jan1.getDay() <= 4 ? jan1.getDay() - 1 : jan1.getDay() - 8;
        const startDate = new Date(year, 0, 1 + (week - 1) * 7 - dayOffset);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        return [startDate, endDate];
      };
      const formatDateShortPDF = (d: Date) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(2);
        return `${dd}/${mm}/${yy}`;
      };

      const semanaMapPDF = new Map<number, { valor: number; quantidade: number }>();
      contasAno.forEach(c => {
        if (!c.data_vencimento) return;
        const dv = new Date(c.data_vencimento.split('T')[0]);
        const [ano, semana] = getWeekNumberPDF(dv);
        if (ano !== filtroAnoSemana) return;
        if (filtroSemanas.length > 0 && !filtroSemanas.includes(semana)) return;
        const atual = semanaMapPDF.get(semana) || { valor: 0, quantidade: 0 };
        semanaMapPDF.set(semana, { valor: atual.valor + (c.valor_total || 0), quantidade: atual.quantidade + 1 });
      });

      const semanasOrdPDF: { semana: number; periodo: string; valor: number; quantidade: number }[] = [];
      for (let s = 1; s <= 52; s++) {
        const [inicio, fim] = getWeekDatesPDF(filtroAnoSemana, s);
        const dados = semanaMapPDF.get(s) || { valor: 0, quantidade: 0 };
        if (filtroSemanas.length > 0 && !filtroSemanas.includes(s)) continue;
        if (dados.valor === 0 && dados.quantidade === 0) continue;
        semanasOrdPDF.push({ semana: s, periodo: `${formatDateShortPDF(inicio)} - ${formatDateShortPDF(fim)}`, ...dados });
      }

      const totalGeralSem = semanasOrdPDF.reduce((acc, s) => acc + s.valor, 0);
      let acumSem = 0;
      const semanasPorValorPDF = [...semanasOrdPDF].sort((a, b) => b.valor - a.valor);
      const rankMapPDF = new Map<number, { rank: number; percentual: number; acumulado: number }>();
      semanasPorValorPDF.forEach((s, i) => {
        const pct = totalGeralSem > 0 ? (s.valor / totalGeralSem) * 100 : 0;
        acumSem += pct;
        rankMapPDF.set(s.semana, { rank: i + 1, percentual: pct, acumulado: acumSem });
      });

      // Subtitle with year
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Ano: ${filtroAnoSemana}${filtroSemanas.length > 0 ? ` | Semanas: ${filtroSemanas.join(', ')}` : ''}`, margin, y);
      y += 5;

      y = adicionarTabela(doc, {
        head: [['Sem.', 'Periodo', 'Qtd', 'Valor', '%', '% Acum']],
        body: semanasOrdPDF.map(s => {
          const pareto = rankMapPDF.get(s.semana) || { rank: 0, percentual: 0, acumulado: 0 };
          return [
            `S${s.semana}`,
            s.periodo,
            String(s.quantidade),
            `R$ ${formatCurrencyPDF(s.valor)}`,
            `${pareto.percentual.toFixed(2)}%`,
            `${pareto.acumulado.toFixed(2)}%`,
          ];
        }),
        foot: [['Total', '-', String(semanasOrdPDF.reduce((a, s) => a + s.quantidade, 0)), `R$ ${formatCurrencyPDF(totalGeralSem)}`, '100,00%', '']],
        columnStyles: { 0: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      }, y, margin);
    } else if (abaAtiva === 'por-origem') {
      const NOMES_ORIGEM_PDF: Record<string, string> = {
        'CP': 'Contas a Pagar', 'AC': 'Acordo', 'ME': 'Medicao', 'CO': 'Contrato',
        'NF': 'Nota Fiscal', 'GR': 'Guia de Recolhimento', 'RE': 'Recibo',
        'BO': 'Boleto', 'CH': 'Cheque', 'DP': 'Deposito',
      };
      const origemMapPDF = new Map<string, { valor: number; quantidade: number }>();
      contas.forEach(c => {
        const origem = (c.id_origem || 'Outros').trim();
        const atual = origemMapPDF.get(origem) || { valor: 0, quantidade: 0 };
        origemMapPDF.set(origem, { valor: atual.valor + (c.valor_total || 0), quantidade: atual.quantidade + 1 });
      });
      const origensOrdPDF = Array.from(origemMapPDF.entries())
        .map(([origem, data]) => ({ origem, ...data }))
        .sort((a, b) => b.valor - a.valor);
      const totalGeralOrig = origensOrdPDF.reduce((acc, o) => acc + o.valor, 0);
      let acumOrig = 0;
      const origensParetoPDF = origensOrdPDF.map((o, i) => {
        const pct = totalGeralOrig > 0 ? (o.valor / totalGeralOrig) * 100 : 0;
        acumOrig += pct;
        return { ...o, rank: i + 1, percentual: pct, acumulado: acumOrig };
      });

      y = adicionarTabela(doc, {
        head: [['#', 'Origem', 'Descricao', 'Qtd', 'Valor', '%', '% Acumulado']],
        body: origensParetoPDF.map(o => [
          String(o.rank),
          o.origem,
          NOMES_ORIGEM_PDF[o.origem] || '-',
          String(o.quantidade),
          `R$ ${formatCurrencyPDF(o.valor)}`,
          `${o.percentual.toFixed(2)}%`,
          `${o.acumulado.toFixed(2)}%`,
        ]),
        foot: [['', 'TOTAL', '', String(origensParetoPDF.reduce((a, o) => a + o.quantidade, 0)), `R$ ${formatCurrencyPDF(totalGeralOrig)}`, '100,00%', '']],
        columnStyles: { 0: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      }, y, margin);
    } else if (abaAtiva === 'analises') {
      // Export vencimento breakdown table
      y = adicionarTabela(doc, {
        head: [['Faixa de Vencimento', 'Quantidade', 'Valor']],
        body: dadosPorVencimento.map(d => [
          d.faixa,
          String(d.quantidade),
          `R$ ${formatCurrencyPDF(d.valor)}`,
        ]),
        foot: [['TOTAL', String(dadosPorVencimento.reduce((a, d) => a + d.quantidade, 0)), `R$ ${formatCurrencyPDF(dadosPorVencimento.reduce((a, d) => a + d.valor, 0))}`]],
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
      }, y, margin);
    }

    finalizarPDF(doc, gerarNomeArquivo('contas_a_pagar', abaLabel), dataGeracao);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-slate-400">Carregando dados...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  const renderFiltros = () => (
    <div className="mb-6 rounded-lg bg-gray-50 dark:bg-slate-900 p-4 shadow">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <MultiSelectDropdown
          label="Empresa"
          items={empresas.map(e => ({ id: e.id, nome: e.nome }))}
          selected={filtroEmpresa}
          setSelected={setFiltroEmpresa}
          isOpen={empresaDropdownAberto}
          setIsOpen={setEmpresaDropdownAberto}
          searchable={true}
        />
        <MultiSelectDropdown
          label="Centro de Custo"
          items={centrosCusto.map(c => ({ id: c.id, nome: c.codigo ? `${c.codigo} - ${c.nome}` : c.nome }))}
          selected={filtroCentroCusto}
          setSelected={setFiltroCentroCusto}
          isOpen={ccDropdownAberto}
          setIsOpen={setCcDropdownAberto}
          searchable={true}
        />
        <MultiSelectDropdown
          label="Credor"
          items={credoresDisponiveis.map(c => ({ id: c, nome: c }))}
          selected={filtroCredor}
          setSelected={setFiltroCredor}
          isOpen={credorDropdownAberto}
          setIsOpen={setCredorDropdownAberto}
          searchable={true}
        />
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
          label="Ano"
          items={anosDisponiveis.map(a => ({ id: a, nome: String(a) }))}
          selected={filtroAno}
          setSelected={setFiltroAno}
          isOpen={anoDropdownAberto}
          setIsOpen={setAnoDropdownAberto}
        />
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Prazo de Vencimento</label>
          <select
            value={filtroPrazo}
            onChange={(e) => setFiltroPrazo(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 focus:border-blue-500 focus:outline-none"
          >
            <option value="todos">Todos</option>
            <option value="hoje">Vence Hoje</option>
            <option value="7dias">Proximos 7 dias</option>
            <option value="15dias">Proximos 15 dias</option>
            <option value="30dias">Proximos 30 dias</option>
          </select>
        </div>
        <MultiSelectDropdown
          label="Mes"
          items={meses.map(m => ({ id: m.valor, nome: m.nome }))}
          selected={filtroMes}
          setSelected={setFiltroMes}
          isOpen={mesDropdownAberto}
          setIsOpen={setMesDropdownAberto}
        />
        <MultiSelectDropdown
          label="Dias"
          items={diasDisponiveis.map(d => ({ id: String(d), nome: d === 0 ? 'Hoje' : d < 0 ? `${Math.abs(d)}d atraso` : `${d}d` }))}
          selected={filtroDias}
          setSelected={setFiltroDias}
          isOpen={diasDropdownAberto}
          setIsOpen={setDiasDropdownAberto}
          searchable={true}
        />
        <MultiSelectDropdown
          label="Plano Financeiro"
          items={planosFinDisponiveis.map(p => ({ id: p, nome: p }))}
          selected={filtroPlanoFinanceiro}
          setSelected={setFiltroPlanoFinanceiro}
          isOpen={planoFinDropdownAberto}
          setIsOpen={setPlanoFinDropdownAberto}
          searchable={true}
        />
        <MultiSelectDropdown
          label="Tipo Pagamento"
          items={tiposPagamento.map(t => ({ id: t.id, nome: `${t.id} - ${t.nome}` }))}
          selected={filtroTipoPagamento}
          setSelected={setFiltroTipoPagamento}
          isOpen={tipoPagDropdownAberto}
          setIsOpen={setTipoPagDropdownAberto}
          searchable={true}
        />
        <MultiSelectDropdown
          label="Autorização"
          items={[{ id: 'S', nome: 'Autorizado' }, { id: 'N', nome: 'Não Autorizado' }]}
          selected={filtroAutorizacao}
          setSelected={setFiltroAutorizacao}
          isOpen={autorizacaoDropdownAberto}
          setIsOpen={setAutorizacaoDropdownAberto}
          searchable={true}
        />
        <MultiSelectDropdown
          label="Titulo"
          items={titulosDisponiveis.map(t => ({ id: t, nome: t }))}
          selected={filtroTitulo}
          setSelected={setFiltroTitulo}
          isOpen={tituloDropdownAberto}
          setIsOpen={setTituloDropdownAberto}
          searchable={true}
        />
      </div>
      <div className="mt-4">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Destacar novos apos</label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dataReferencia}
            onChange={(e) => setDataReferencia(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
          />
          {dataReferencia && (
            <button type="button" onClick={() => setDataReferencia('')} className="text-xs text-gray-500 dark:text-slate-400 hover:underline">Limpar</button>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={aplicarFiltros}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Aplicar Filtros
        </button>
        <button
          type="button"
          onClick={limparFiltros}
          className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:bg-slate-900"
        >
          Limpar
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
        <button
          type="button"
          onClick={() => carregarAutorizacoes(true)}
          disabled={autorizacoesLoading}
          className="flex items-center rounded-lg border border-blue-200 px-4 py-2 text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/20"
        >
          <svg className={`mr-2 h-4 w-4 ${autorizacoesLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 00-14.32-3.91L4 6M4 16a8 8 0 0014.32 3.91L20 18" />
          </svg>
          {autorizacoesLoading ? 'Atualizando...' : 'Atualizar Autorizações'}
        </button>
        {temFiltrosPadrao() && (
          <button
            type="button"
            onClick={removerFiltrosPadrao}
            className="flex items-center rounded-lg border border-red-300 px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/20"
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

  const getPrazoNome = (prazo: string) => {
    switch (prazo) {
      case 'hoje': return 'Vence Hoje';
      case '7dias': return 'Proximos 7 dias';
      case '15dias': return 'Proximos 15 dias';
      case '30dias': return 'Proximos 30 dias';
      default: return null;
    }
  };

  const renderFiltrosTags = () => {
    const tags: { label: string; value: string; onRemove: () => void }[] = [];

    if (filtroEmpresa.length > 0) {
      const nomes = filtroEmpresa.map(id => empresas.find(e => e.id === id)?.nome).filter(Boolean).join(', ');
      tags.push({ label: 'Empresas', value: nomes, onRemove: () => setFiltroEmpresa([]) });
    }

    if (filtroCentroCusto.length > 0) {
      const nomes = filtroCentroCusto.map(id => centrosCusto.find(c => c.id === id)?.nome).filter(Boolean).join(', ');
      tags.push({ label: 'Centros de Custo', value: nomes, onRemove: () => setFiltroCentroCusto([]) });
    }

    if (filtroCredor.length > 0) {
      tags.push({ label: 'Credor', value: filtroCredor.length === 1 ? filtroCredor[0] : `${filtroCredor.length} credores`, onRemove: () => setFiltroCredor([]) });
    }

    if (filtroPlanoFinanceiro.length > 0) {
      tags.push({ label: 'Plano Financeiro', value: filtroPlanoFinanceiro.length === 1 ? filtroPlanoFinanceiro[0] : `${filtroPlanoFinanceiro.length} planos`, onRemove: () => setFiltroPlanoFinanceiro([]) });
    }

    const prazoNome = getPrazoNome(filtroPrazo);
    if (prazoNome) {
      tags.push({ label: 'Prazo', value: prazoNome, onRemove: () => setFiltroPrazo('todos') });
    }

    if (filtroAno.length > 0) {
      tags.push({ label: 'Ano', value: filtroAno.join(', '), onRemove: () => setFiltroAno([]) });
    }

    if (filtroMes.length > 0) {
      const mesesNomes = filtroMes.map(m => meses.find(mes => mes.valor === m)?.nome).filter(Boolean).join(', ');
      tags.push({ label: 'Meses', value: mesesNomes, onRemove: () => setFiltroMes([]) });
    }

    if (filtroTipoDocumento.length > 0 && filtroTipoDocumento.length < tiposDocumento.length) {
      const tiposNomes = filtroTipoDocumento.map(t => {
        const tipo = tiposDocumento.find(tipo => tipo.id === t);
        return tipo ? `${tipo.id}` : '';
      }).filter(Boolean).join(', ');
      tags.push({ label: 'Tipo Documento', value: tiposNomes, onRemove: () => setFiltroTipoDocumento([]) });
    }

    if (dataReferencia) {
      const dataRef = new Date(dataReferencia + 'T00:00:00').toLocaleDateString('pt-BR');
      tags.push({ label: 'Ref', value: `Novos apos ${dataRef}`, onRemove: () => setDataReferencia('') });
    }

    if (filtroTipoPagamento.length > 0) {
      const nomes = filtroTipoPagamento.map(id => {
        const tp = tiposPagamento.find(t => t.id === id);
        return tp ? tp.nome : String(id);
      });
      tags.push({ label: 'Tipo Pagamento', value: nomes.length === 1 ? nomes[0] : `${nomes.length} tipos`, onRemove: () => setFiltroTipoPagamento([]) });
    }

    if (filtroAutorizacao.length > 0) {
      const nomes = filtroAutorizacao.map(v => v === 'S' ? 'Autorizado' : 'Não Autorizado');
      tags.push({ label: 'Autorização', value: nomes.join(', '), onRemove: () => setFiltroAutorizacao([]) });
    }

    if (filtroTitulo.length > 0) {
      tags.push({ label: 'Titulo', value: filtroTitulo.length > 3 ? `${filtroTitulo.length} titulo(s)` : filtroTitulo.join(', '), onRemove: () => setFiltroTitulo([]) });
    }

    if (tags.length === 0) return null;

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800"
          >
            <span className="text-blue-600">{tag.label}:</span>
            <span className="ml-1">{tag.value}</span>
            <button
              type="button"
              onClick={tag.onRemove}
              className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-600 hover:bg-blue-200 hover:text-blue-800"
            >
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </span>
        ))}
        {tags.length > 0 && (
          <button
            type="button"
            onClick={limparFiltros}
            className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300 underline"
          >
            Limpar todos
          </button>
        )}
      </div>
    );
  };

  const renderAbaDados = () => (
    <>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Contas a Pagar</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
              {calcularTitulosUnicos(contas)} título(s) pendente(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportarPDF} disabled={contas.length === 0}
              className="flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50">
              <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Exportar PDF
            </button>
            <button type="button" onClick={exportarCSV} disabled={contas.length === 0}
              className="flex items-center rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50">
              <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => setMostrarFiltros(!mostrarFiltros)}
              className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
            </button>
          </div>
        </div>
        {mostrarFiltros && renderFiltros()}
        {!mostrarFiltros && renderFiltrosTags()}

        {/* Busca global em credor, titulo, documento e observacao */}
        <div className="mt-4 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
          </svg>
          <input
            type="text"
            value={buscaTexto}
            onChange={(e) => setBuscaTexto(e.target.value)}
            placeholder="Buscar em credor, titulo, documento ou observacao..."
            className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {buscaTexto && (
            <button type="button" onClick={() => setBuscaTexto('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Limpar busca">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {dataReferencia && (() => {
        const novos = contas.filter(c => c.data_cadastro && c.data_cadastro.split('T')[0] > dataReferencia);
        const qtd = novos.length;
        const valor = novos.reduce((sum, c) => sum + (c.valor_total || 0), 0);
        const dataRef = new Date(dataReferencia + 'T00:00:00').toLocaleDateString('pt-BR');
        return qtd > 0 ? (
          <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-yellow-200 px-2.5 py-1 text-xs font-bold text-yellow-800">{qtd}</span>
            <span className="text-sm text-yellow-800">
              titulo(s) inserido(s) apos <strong>{dataRef}</strong> | Impacto: <strong className="text-red-600 dark:text-red-400">+ {valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
            </span>
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
            Nenhum titulo novo inserido apos {dataRef}
          </div>
        );
      })()}

      <div className="rounded-lg bg-white dark:bg-slate-800 shadow overflow-visible">
        <div>
          <table className="w-full divide-y divide-gray-200 table-fixed text-[11px]">
            <colgroup>
              <col className="w-[13%]" />{/* Credor */}
              <col className="w-[5%]" />{/* Cadastro */}
              <col className="w-[5%]" />{/* Vencimento */}
              <col className="w-[4%]" />{/* Prazo */}
              <col className="w-[5%]" />{/* Dias */}
              <col className="w-[4%]" />{/* Titulo */}
              <col className="w-[4%]" />{/* Doc */}
              <col className="w-[3%]" />{/* Aut */}
              <col className="w-[14%]" />{/* C. Custo (com cod) */}
              <col className="w-[12%]" />{/* Plano Fin */}
              <col className="w-[10%]" />{/* Tipo Pag */}
              <col className="w-[14%]" />{/* Observação */}
              <col className="w-[7%]" />{/* Valor */}
            </colgroup>
            <thead className="bg-blue-50 sticky top-[85px] z-30 shadow-[0_2px_4px_rgba(0,0,0,0.1)]">
              <tr>
                <th onClick={() => toggleOrdenacao('credor')} className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  Credor{renderSortIcon('credor')}
                </th>
                <th onClick={() => toggleOrdenacao('data_cadastro')} className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  Cadastro{renderSortIcon('data_cadastro')}
                </th>
                <th onClick={() => toggleOrdenacao('data_vencimento')} className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  Vencimento{renderSortIcon('data_vencimento')}
                </th>
                <th onClick={() => toggleOrdenacao('prazo_cadastro')} className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  Prazo{renderSortIcon('prazo_cadastro')}
                </th>
                <th onClick={() => toggleOrdenacao('dias')} className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  Dias{renderSortIcon('dias')}
                </th>
                <th onClick={() => toggleOrdenacao('lancamento')} className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  Titulo{renderSortIcon('lancamento')}
                </th>
                <th onClick={() => toggleOrdenacao('id_documento')} className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  Doc.{renderSortIcon('id_documento')}
                </th>
                <th onClick={() => toggleOrdenacao('flautorizacao')} className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  Aut.{renderSortIcon('flautorizacao')}
                </th>
                <th onClick={() => toggleOrdenacao('nome_centrocusto')} className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  C. Custo{renderSortIcon('nome_centrocusto')}
                </th>
                <th onClick={() => toggleOrdenacao('nome_plano_financeiro')} className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  Plano Fin.{renderSortIcon('nome_plano_financeiro')}
                </th>
                <th onClick={() => toggleOrdenacao('nome_tipo_pagamento')} className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  Tipo Pag.{renderSortIcon('nome_tipo_pagamento')}
                </th>
                <th onClick={() => toggleOrdenacao('descricao_observacao')} className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  Observação{renderSortIcon('descricao_observacao')}
                </th>
                <th onClick={() => toggleOrdenacao('valor_total')} className="px-1.5 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">
                  Valor{renderSortIcon('valor_total')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:bg-slate-800">
              {ordenarContas(contas).slice(0, 100).map((conta, index) => {
                const dias = calcularDiasAteVencimento(conta.data_vencimento as any);
                const corDias = dias < 0 ? 'text-red-600 dark:text-red-400' : dias <= 7 ? 'text-orange-600' : 'text-green-600';
                const isExpanded = linhaExpandida === index;
                const tituloId = conta.lancamento ? parseInt(conta.lancamento.split('/')[0]) : null;
                const detalhe = tituloId ? detalheCache[tituloId] : null;
                const isNovoAposRef = dataReferencia && conta.data_cadastro
                  && conta.data_cadastro.split('T')[0] > dataReferencia;

                const handleExpand = async () => {
                  if (isExpanded) {
                    setLinhaExpandida(null);
                    return;
                  }
                  setLinhaExpandida(index);
                  if (tituloId && !detalheCache[tituloId]) {
                    setDetalheCarregando(true);
                    try {
                      const data = await apiService.getTituloDetalhe(tituloId);
                      setDetalheCache(prev => ({ ...prev, [tituloId]: data }));
                    } catch (err) {
                      console.error('Erro ao buscar detalhe:', err);
                    } finally {
                      setDetalheCarregando(false);
                    }
                  }
                };

                return (
                  <React.Fragment key={index}>
                    <tr className={`${isExpanded ? 'bg-blue-100 border-l-4 border-l-blue-600' : isNovoAposRef ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-gray-50 dark:bg-slate-900'} cursor-pointer transition-colors duration-150`} onClick={handleExpand}>
                      <td className="px-1.5 py-2 font-medium text-gray-900 dark:text-slate-100">
                        <div className="flex items-center gap-1">
                          <span className={`text-gray-400 text-[10px] transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                          <span className="truncate" title={conta.credor || '-'}>{conta.credor || '-'}</span>
                          {isNovoAposRef && <span className="inline-flex items-center rounded-full bg-yellow-200 px-1 py-0.5 text-[9px] font-semibold text-yellow-800 flex-shrink-0">NOVO</span>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-2 text-gray-400">{conta.data_cadastro ? formatDate(conta.data_cadastro as any) : '-'}</td>
                      <td className="whitespace-nowrap px-1.5 py-2 text-gray-500 dark:text-slate-400">{formatDate(conta.data_vencimento as any)}</td>
                      <td className="whitespace-nowrap px-1.5 py-2 text-gray-500 dark:text-slate-400">
                        {conta.data_cadastro && conta.data_vencimento
                          ? (() => {
                              const prazoDias = Math.round((new Date(conta.data_vencimento as any).getTime() - new Date(conta.data_cadastro as any).getTime()) / (1000 * 60 * 60 * 24));
                              return prazoDias <= 2
                                ? <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400">{prazoDias}d</span>
                                : `${prazoDias}d`;
                            })()
                          : '-'}
                      </td>
                      <td className={`whitespace-nowrap px-1.5 py-2 font-semibold ${corDias}`}>
                        {dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias}d`}
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-2 text-gray-500 dark:text-slate-400">{conta.lancamento ? conta.lancamento.split('/')[0] : '-'}</td>
                      <td className="whitespace-nowrap px-1.5 py-2 text-gray-500 dark:text-slate-400 font-mono">{conta.id_documento || '-'}</td>
                      <td className="whitespace-nowrap px-1.5 py-2 text-center">
                        {(() => {
                          const authApi = conta.lancamento ? autorizacoesBulk[conta.lancamento] : undefined;
                          const auth = authApi || (conta as any).flautorizacao;
                          return auth === 'S'
                            ? <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">Sim</span>
                            : <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400">Nao</span>;
                        })()}
                      </td>
                      <td className="px-1.5 py-2 text-gray-500 dark:text-slate-400 truncate" title={`${(conta as any).codigo_centrocusto || ''} - ${(conta as any).nome_centrocusto || ''}`}>
                        {(conta as any).codigo_centrocusto ? <span className="inline-flex items-center justify-center rounded bg-blue-100 text-blue-700 font-bold font-mono text-[11px] px-1 min-w-[20px]">{(conta as any).codigo_centrocusto}</span> : null}
                        {(conta as any).codigo_centrocusto ? ' ' : ''}{(conta as any).nome_centrocusto || '-'}
                      </td>
                      <td className="px-1.5 py-2 text-gray-500 dark:text-slate-400 truncate" title={(conta as any).nome_plano_financeiro || '-'}>{(conta as any).nome_plano_financeiro || '-'}</td>
                      <td className="px-1.5 py-2 text-gray-500 dark:text-slate-400 truncate" title={(conta as any).nome_tipo_pagamento || '-'}>{(conta as any).nome_tipo_pagamento || '-'}</td>
                      <td className="px-1.5 py-2 text-gray-600 dark:text-slate-400 truncate" title={(conta as any).descricao_observacao || ''}>{(conta as any).descricao_observacao || '-'}</td>
                      <td className="whitespace-nowrap px-1.5 py-2 font-semibold text-blue-600 text-right">{formatCurrency(conta.valor_total)}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={13} className="p-0">
                          <div className="bg-gradient-to-r from-blue-50 via-blue-50 to-indigo-50 border-l-4 border-l-blue-600 border-t-2 border-b-2 border-t-blue-300 border-b-blue-300 px-8 py-5 shadow-inner">
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-blue-200">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center min-w-[3rem] h-12 px-3 rounded-full bg-blue-600 text-white text-sm font-bold">
                                  {conta.lancamento ? conta.lancamento.split('/')[0] : '#'}
                                </div>
                                <div>
                                  <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">{conta.credor || 'Sem credor'}</h3>
                                  <p className="text-xs text-gray-500 dark:text-slate-400">Titulo {conta.lancamento || '-'} | {formatCurrency(conta.valor_total)}</p>
                                </div>
                              </div>
                              <span className="text-xs text-blue-600 font-medium bg-blue-100 px-2 py-1 rounded">Detalhes do Titulo</span>
                            </div>
                            {detalheCarregando && !detalhe ? (
                              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
                                <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Carregando detalhes do Sienge...
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {detalhe?.registeredBy && (
                                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-md border border-blue-200 hover:shadow-lg transition-shadow">
                                    <p className="text-xs text-gray-500 dark:text-slate-400 uppercase font-medium">Cadastrado por</p>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">{detalhe.registeredBy}</p>
                                  </div>
                                )}
                                {detalhe?.registeredDate && (
                                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-md border border-blue-200 hover:shadow-lg transition-shadow">
                                    <p className="text-xs text-gray-500 dark:text-slate-400 uppercase font-medium">Data Cadastro</p>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                                      {new Date(detalhe.registeredDate).toLocaleString('pt-BR')}
                                    </p>
                                  </div>
                                )}
                                {detalhe?.changedBy && (
                                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-md border border-blue-200 hover:shadow-lg transition-shadow">
                                    <p className="text-xs text-gray-500 dark:text-slate-400 uppercase font-medium">Alterado por</p>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">{detalhe.changedBy}</p>
                                  </div>
                                )}
                                {detalhe?.changedDate && (
                                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-md border border-blue-200 hover:shadow-lg transition-shadow">
                                    <p className="text-xs text-gray-500 dark:text-slate-400 uppercase font-medium">Data Alteracao</p>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                                      {new Date(detalhe.changedDate).toLocaleString('pt-BR')}
                                    </p>
                                  </div>
                                )}
                                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-md border border-blue-200 hover:shadow-lg transition-shadow">
                                  <p className="text-xs text-gray-500 dark:text-slate-400 uppercase font-medium">Data Emissao</p>
                                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                                    {(conta as any).data_emissao ? formatDate((conta as any).data_emissao) : detalhe?.issueDate ? formatDate(detalhe.issueDate) : '-'}
                                  </p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-md border border-blue-200 hover:shadow-lg transition-shadow">
                                  <p className="text-xs text-gray-500 dark:text-slate-400 uppercase font-medium">N Documento</p>
                                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">{conta.numero_documento || '-'}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-md border border-blue-200 hover:shadow-lg transition-shadow">
                                  <p className="text-xs text-gray-500 dark:text-slate-400 uppercase font-medium">Parcela</p>
                                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                                    {conta.lancamento ? conta.lancamento.split('/')[1] || '1' : '-'}
                                  </p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-md border border-blue-200 hover:shadow-lg transition-shadow">
                                  <p className="text-xs text-gray-500 dark:text-slate-400 uppercase font-medium">Origem</p>
                                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                                    {detalhe?.origem_nome || conta.id_origem || '-'}
                                  </p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-md border border-blue-200 hover:shadow-lg transition-shadow">
                                  <p className="text-xs text-gray-500 dark:text-slate-400 uppercase font-medium">Empresa</p>
                                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">{(conta as any).nome_empresa || '-'}</p>
                                </div>
                                {(detalhe?.observation || (conta as any).descricao_observacao) && (
                                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm border border-blue-100 col-span-2 md:col-span-4">
                                    <p className="text-xs text-gray-500 dark:text-slate-400 uppercase font-medium">Observacao</p>
                                    <p className="text-sm text-gray-900 dark:text-slate-100 mt-1">{detalhe?.observation || (conta as any).descricao_observacao}</p>
                                  </div>
                                )}
                                {!detalhe && !detalheCarregando && (
                                  <div className="col-span-2 md:col-span-4 text-sm text-gray-400 italic">
                                    Dados do Sienge indisponiveis
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const renderAbaAnalises = () => (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
          </button>
        </div>
        {mostrarFiltros && renderFiltros()}
      </div>

      {dadosPorVencimento.length > 0 && (
        <div className="rounded-lg bg-white dark:bg-slate-800 p-6 shadow">
          <h3 className="mb-2 text-xl font-semibold text-gray-900 dark:text-slate-100">Distribuicao por Prazo de Vencimento</h3>
          <p className="mb-4 text-sm text-gray-500 dark:text-slate-400">Valores a pagar agrupados por faixa de vencimento</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosPorVencimento} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="faixa" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-lg">
                          <p className="mb-2 font-semibold text-gray-900 dark:text-slate-100">{label}</p>
                          <p className="text-sm text-blue-600">Valor: {formatCurrency(data.valor)}</p>
                          <p className="text-sm text-gray-600 dark:text-slate-400">Quantidade: {data.quantidade} titulo(s)</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="valor" fill="#3B82F6" radius={[4, 4, 0, 0]}>
                  {dadosPorVencimento.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.faixa === 'Hoje' ? '#F59E0B' : COLORS[index % COLORS.length]}
                    />
                  ))}
                  <LabelList dataKey="valor" position="top" formatter={(value: number) => formatCurrencyShort(value)} style={{ fontSize: 10, fill: '#374151' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

    </div>
  );

  const formatarDataSnapshot = (dataStr: string) => {
    const [ano, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  const renderComparacao = (faixa: string, valorAtual: number) => {
    if (!snapshotDados || !snapshotDados[faixa]) return null;
    const snap = snapshotDados[faixa];
    const diff = valorAtual - snap.valor_total;
    if (Math.abs(diff) < 0.01) {
      return (
        <div className="mt-1 text-xs font-medium opacity-90">
          = snapshot {formatarDataSnapshot(snapshotSelecionado)}
        </div>
      );
    }
    const isUp = diff > 0;
    return (
      <div className={`mt-1 text-xs font-bold ${isUp ? 'text-yellow-200' : 'text-green-200'}`}>
        {isUp ? '+' : ''}{formatCurrency(diff)} vs {formatarDataSnapshot(snapshotSelecionado)}
      </div>
    );
  };

  const handleSalvarSnapshot = async () => {
    if (!estatisticas) return;
    setSalvandoSnapshot(true);
    setSnapshotMsg(null);
    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
      const fim7 = new Date(hoje); fim7.setDate(fim7.getDate() + 7);
      const fim15 = new Date(hoje); fim15.setDate(fim15.getDate() + 15);
      const fim30 = new Date(hoje); fim30.setDate(fim30.getDate() + 30);
      const toISO = (d: Date) => d.toISOString().split('T')[0];

      const contasHoje = contas.filter(c => calcularDiasAteVencimento(c.data_vencimento as any) === 0);
      const contas7dias = contas.filter(c => { const dias = calcularDiasAteVencimento(c.data_vencimento as any); return dias >= 1 && dias <= 7; });
      const contas15dias = contas.filter(c => { const dias = calcularDiasAteVencimento(c.data_vencimento as any); return dias >= 1 && dias <= 15; });
      const contas30dias = contas.filter(c => { const dias = calcularDiasAteVencimento(c.data_vencimento as any); return dias >= 1 && dias <= 30; });

      const cards = [
        { faixa: 'total', data_inicio: null, data_fim: null, valor_total: estatisticas.valor_total, quantidade_titulos: estatisticas.quantidade_titulos, quantidade_credores: new Set(contas.map(c => c.credor)).size },
        { faixa: 'hoje', data_inicio: toISO(hoje), data_fim: toISO(hoje), valor_total: contasHoje.reduce((acc, c) => acc + (c.valor_total || 0), 0), quantidade_titulos: calcularTitulosUnicos(contasHoje), quantidade_credores: new Set(contasHoje.map(c => c.credor)).size },
        { faixa: '7dias', data_inicio: toISO(amanha), data_fim: toISO(fim7), valor_total: contas7dias.reduce((acc, c) => acc + (c.valor_total || 0), 0), quantidade_titulos: calcularTitulosUnicos(contas7dias), quantidade_credores: new Set(contas7dias.map(c => c.credor)).size },
        { faixa: '15dias', data_inicio: toISO(amanha), data_fim: toISO(fim15), valor_total: contas15dias.reduce((acc, c) => acc + (c.valor_total || 0), 0), quantidade_titulos: calcularTitulosUnicos(contas15dias), quantidade_credores: new Set(contas15dias.map(c => c.credor)).size },
        { faixa: '30dias', data_inicio: toISO(amanha), data_fim: toISO(fim30), valor_total: contas30dias.reduce((acc, c) => acc + (c.valor_total || 0), 0), quantidade_titulos: calcularTitulosUnicos(contas30dias), quantidade_credores: new Set(contas30dias.map(c => c.credor)).size },
      ];

      await apiService.salvarSnapshotCardsPagar({ data_snapshot: toISO(hoje), cards });
      // Salva títulos individuais para comparação detalhada
      const titulosParaSalvar = todasContas.map(c => ({
        lancamento: c.lancamento, credor: c.credor, valor_total: c.valor_total,
        data_vencimento: typeof c.data_vencimento === 'string' ? c.data_vencimento.split('T')[0] : null,
        data_cadastro: typeof c.data_cadastro === 'string' ? c.data_cadastro.split('T')[0] : null,
        id_documento: c.id_documento, nome_centrocusto: (c as any).nome_centrocusto,
      }));
      await apiService.salvarSnapshotTitulos({ data_snapshot: toISO(hoje), titulos: titulosParaSalvar }).catch(() => {});
      setSnapshotMsg('Snapshot salvo com sucesso!');
      const lista = await apiService.listarSnapshotsCardsPagar();
      setSnapshotsDisponiveis(lista);
      setTimeout(() => setSnapshotMsg(null), 3000);
    } catch (err) {
      console.error('Erro ao salvar snapshot:', err);
      setSnapshotMsg('Erro ao salvar snapshot');
    } finally {
      setSalvandoSnapshot(false);
    }
  };

  return (
    <div>
      {estatisticas && (() => {
        const contasHoje = contas.filter(c => isVenceHoje(c.data_vencimento));
        const contas7dias = contas.filter(c => { const dias = calcularDiasAteVencimento(c.data_vencimento as any); return dias >= 1 && dias <= 7; });
        const contas15dias = contas.filter(c => { const dias = calcularDiasAteVencimento(c.data_vencimento as any); return dias >= 1 && dias <= 15; });
        const contas30dias = contas.filter(c => { const dias = calcularDiasAteVencimento(c.data_vencimento as any); return dias >= 1 && dias <= 30; });
        const credoresTotal = new Set(contas.map(c => c.credor)).size;
        const credoresHoje = new Set(contasHoje.map(c => c.credor)).size;
        const credores7dias = new Set(contas7dias.map(c => c.credor)).size;
        const credores15dias = new Set(contas15dias.map(c => c.credor)).size;
        const credores30dias = new Set(contas30dias.map(c => c.credor)).size;

        const totalTitulos = estatisticas.quantidade_titulos;
        const pct = (v: number, total: number) =>
          total > 0 ? (v / total * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : '0%';

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const formatarDataCurta = (d: Date) => {
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          return `${dd}/${mm}`;
        };
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);
        const fim7 = new Date(hoje);
        fim7.setDate(fim7.getDate() + 7);
        const fim15 = new Date(hoje);
        fim15.setDate(fim15.getDate() + 15);
        const fim30 = new Date(hoje);
        fim30.setDate(fim30.getDate() + 30);

        const valorHoje = contasHoje.reduce((acc, c) => acc + (c.valor_total || 0), 0);
        const valor7dias = contas7dias.reduce((acc, c) => acc + (c.valor_total || 0), 0);
        const valor15dias = contas15dias.reduce((acc, c) => acc + (c.valor_total || 0), 0);
        const valor30dias = contas30dias.reduce((acc, c) => acc + (c.valor_total || 0), 0);

        const cardDocs: Record<string, Record<string, { titulo: string; descricao: string; fonte: string; filtros: string[] }>> = {
          total: {
            valor: {
              titulo: 'Valor Total a Pagar',
              descricao: 'Soma de todos os titulos pendentes (hoje + futuro). Inclui feriados/fins de semana no proximo dia util.',
              fonte: 'SUM(contas_a_pagar.valor_total) WHERE vencimento >= hoje',
              filtros: ['Exclusoes gerais (empresas, CCs, docs)', 'Filtros locais da pagina', 'Logica Vence Hoje (feriados + fds)'],
            },
            titulos: {
              titulo: 'Quantidade de Titulos',
              descricao: 'Total de titulos unicos pendentes. Cada numero de titulo (SPLIT_PART) e contado uma unica vez.',
              fonte: 'COUNT(DISTINCT SPLIT_PART(numero_titulo, \'/\', 1))',
              filtros: ['Exclusoes gerais', 'Filtros locais'],
            },
            credores: {
              titulo: 'Quantidade de Credores',
              descricao: 'Numero de credores distintos com titulos pendentes no periodo.',
              fonte: 'COUNT(DISTINCT credor)',
              filtros: ['Exclusoes gerais', 'Filtros locais'],
            },
          },
          hoje: {
            valor: {
              titulo: 'Valor Vencendo Hoje',
              descricao: 'Soma dos titulos que vencem hoje. Na segunda inclui sabado/domingo. Apos feriados, inclui dias de feriado (cascata).',
              fonte: 'SUM(valor_total) WHERE isVenceHoje(vencimento)',
              filtros: ['isVenceHoje()', 'Feriados (config_feriados)', 'Fins de semana (sabado/domingo)'],
            },
            titulos: {
              titulo: 'Titulos Vencendo Hoje',
              descricao: 'Titulos unicos com vencimento hoje (inclui logica feriados/fds).',
              fonte: 'COUNT(DISTINCT SPLIT_PART(numero_titulo, \'/\', 1)) WHERE isVenceHoje()',
              filtros: ['isVenceHoje()', 'Percentual sobre total de titulos'],
            },
            credores: {
              titulo: 'Credores Vencendo Hoje',
              descricao: 'Credores distintos com titulos vencendo hoje.',
              fonte: 'COUNT(DISTINCT credor) WHERE isVenceHoje()',
              filtros: ['isVenceHoje()', 'Percentual sobre total de credores'],
            },
          },
          '7dias': {
            valor: {
              titulo: 'Valor Proximos 7 Dias',
              descricao: 'Soma dos titulos com vencimento entre amanha e +7 dias.',
              fonte: 'SUM(valor_total) WHERE vencimento BETWEEN amanha AND +7d',
              filtros: ['Exclusoes gerais', 'Filtros locais'],
            },
            titulos: {
              titulo: 'Titulos Proximos 7 Dias',
              descricao: 'Titulos unicos com vencimento nos proximos 7 dias (exclui hoje).',
              fonte: 'COUNT(DISTINCT SPLIT_PART(numero_titulo, \'/\', 1))',
              filtros: ['Percentual sobre total de titulos'],
            },
            credores: {
              titulo: 'Credores Proximos 7 Dias',
              descricao: 'Credores distintos com titulos nos proximos 7 dias.',
              fonte: 'COUNT(DISTINCT credor)',
              filtros: ['Percentual sobre total de credores'],
            },
          },
          '15dias': {
            valor: {
              titulo: 'Valor Proximos 15 Dias',
              descricao: 'Soma dos titulos com vencimento entre amanha e +15 dias.',
              fonte: 'SUM(valor_total) WHERE vencimento BETWEEN amanha AND +15d',
              filtros: ['Exclusoes gerais', 'Filtros locais'],
            },
            titulos: {
              titulo: 'Titulos Proximos 15 Dias',
              descricao: 'Titulos unicos com vencimento nos proximos 15 dias (exclui hoje).',
              fonte: 'COUNT(DISTINCT SPLIT_PART(numero_titulo, \'/\', 1))',
              filtros: ['Percentual sobre total de titulos'],
            },
            credores: {
              titulo: 'Credores Proximos 15 Dias',
              descricao: 'Credores distintos com titulos nos proximos 15 dias.',
              fonte: 'COUNT(DISTINCT credor)',
              filtros: ['Percentual sobre total de credores'],
            },
          },
          '30dias': {
            valor: {
              titulo: 'Valor Proximos 30 Dias',
              descricao: 'Soma dos titulos com vencimento entre amanha e +30 dias.',
              fonte: 'SUM(valor_total) WHERE vencimento BETWEEN amanha AND +30d',
              filtros: ['Exclusoes gerais', 'Filtros locais'],
            },
            titulos: {
              titulo: 'Titulos Proximos 30 Dias',
              descricao: 'Titulos unicos com vencimento nos proximos 30 dias (exclui hoje).',
              fonte: 'COUNT(DISTINCT SPLIT_PART(numero_titulo, \'/\', 1))',
              filtros: ['Percentual sobre total de titulos'],
            },
            credores: {
              titulo: 'Credores Proximos 30 Dias',
              descricao: 'Credores distintos com titulos nos proximos 30 dias.',
              fonte: 'COUNT(DISTINCT credor)',
              filtros: ['Percentual sobre total de credores'],
            },
          },
        };

        const renderMiniTooltip = (faixa: string, tipo: 'valor' | 'titulos' | 'credores', groupName: string) => {
          const doc = cardDocs[faixa][tipo];
          return (
            <div className={`pointer-events-none absolute left-0 top-full z-50 mt-1 w-72 rounded-lg bg-black p-3 text-xs text-white shadow-xl transition-all duration-200 invisible ${groupName === 'valor' ? 'group-hover/valor:visible group-hover/valor:opacity-100' : groupName === 'titulos' ? 'group-hover/titulos:visible group-hover/titulos:opacity-100' : 'group-hover/credores:visible group-hover/credores:opacity-100'} opacity-0`}>
              <p className="mb-1.5 font-semibold text-white">{doc.titulo}</p>
              <p className="mb-2 text-gray-300">{doc.descricao}</p>
              <div className="mb-1">
                <span className="text-gray-400">Fonte:</span>
                <span className="ml-1 font-mono text-blue-300">{doc.fonte}</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {doc.filtros.map(f => (
                  <span key={f} className="rounded bg-gray-700 px-1.5 py-0.5 text-amber-300">{f}</span>
                ))}
              </div>
            </div>
          );
        };

        return (
          <>
            <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="relative rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-white shadow-lg">
                <div className="mb-1 text-xs font-medium opacity-90">Total a Pagar</div>
                <div className="group/valor relative cursor-help">
                  <div className="text-xl font-bold underline decoration-dotted decoration-white/40 underline-offset-4">{formatCurrency(estatisticas.valor_total)}</div>
                  {renderMiniTooltip('total', 'valor', 'valor')}
                </div>
                <div className="mt-1 text-xs opacity-75 flex items-center gap-1">
                  <span className="group/titulos relative cursor-help">
                    <span className="underline decoration-dotted decoration-white/30 underline-offset-2">{estatisticas.quantidade_titulos.toLocaleString('pt-BR')} titulos</span>
                    {renderMiniTooltip('total', 'titulos', 'titulos')}
                  </span>
                  <span>|</span>
                  <span className="group/credores relative cursor-help">
                    <span className="underline decoration-dotted decoration-white/30 underline-offset-2">{credoresTotal} credores</span>
                    {renderMiniTooltip('total', 'credores', 'credores')}
                  </span>
                </div>
                {renderComparacao('total', estatisticas.valor_total)}
              </div>

              <div className="relative rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 p-5 text-white shadow-lg">
                <div className="mb-1 text-xs font-medium opacity-90">Vencendo Hoje</div>
                <div className="group/valor relative cursor-help">
                  <div className="text-xl font-bold underline decoration-dotted decoration-white/40 underline-offset-4">{formatCurrency(valorHoje)}</div>
                  {renderMiniTooltip('hoje', 'valor', 'valor')}
                </div>
                <div className="mt-1 text-xs opacity-75 flex items-center gap-1">
                  <span className="group/titulos relative cursor-help">
                    <span className="underline decoration-dotted decoration-white/30 underline-offset-2">
                      {calcularTitulosUnicos(contasHoje)} titulo(s)
                      <span className="ml-1 font-semibold opacity-90">({pct(calcularTitulosUnicos(contasHoje), totalTitulos)})</span>
                    </span>
                    {renderMiniTooltip('hoje', 'titulos', 'titulos')}
                  </span>
                  <span>|</span>
                  <span className="group/credores relative cursor-help">
                    <span className="underline decoration-dotted decoration-white/30 underline-offset-2">
                      {credoresHoje} credores
                      <span className="ml-1 font-semibold opacity-90">({pct(credoresHoje, credoresTotal)})</span>
                    </span>
                    {renderMiniTooltip('hoje', 'credores', 'credores')}
                  </span>
                </div>
                {renderComparacao('hoje', valorHoje)}
              </div>

              <div className="relative rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 p-5 text-white shadow-lg">
                <div className="mb-1 text-xs font-medium opacity-90">Proximos 7 dias</div>
                <div className="text-xs opacity-75 mb-1">de {formatarDataCurta(amanha)} ate {formatarDataCurta(fim7)}</div>
                <div className="group/valor relative cursor-help">
                  <div className="text-xl font-bold underline decoration-dotted decoration-white/40 underline-offset-4">{formatCurrency(valor7dias)}</div>
                  {renderMiniTooltip('7dias', 'valor', 'valor')}
                </div>
                <div className="mt-1 text-xs opacity-75 flex items-center gap-1">
                  <span className="group/titulos relative cursor-help">
                    <span className="underline decoration-dotted decoration-white/30 underline-offset-2">
                      {calcularTitulosUnicos(contas7dias)} titulo(s)
                      <span className="ml-1 font-semibold opacity-90">({pct(calcularTitulosUnicos(contas7dias), totalTitulos)})</span>
                    </span>
                    {renderMiniTooltip('7dias', 'titulos', 'titulos')}
                  </span>
                  <span>|</span>
                  <span className="group/credores relative cursor-help">
                    <span className="underline decoration-dotted decoration-white/30 underline-offset-2">
                      {credores7dias} credores
                      <span className="ml-1 font-semibold opacity-90">({pct(credores7dias, credoresTotal)})</span>
                    </span>
                    {renderMiniTooltip('7dias', 'credores', 'credores')}
                  </span>
                </div>
                {renderComparacao('7dias', valor7dias)}
              </div>

              <div className="relative rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 p-5 text-white shadow-lg">
                <div className="mb-1 text-xs font-medium opacity-90">Proximos 15 dias</div>
                <div className="text-xs opacity-75 mb-1">de {formatarDataCurta(amanha)} ate {formatarDataCurta(fim15)}</div>
                <div className="group/valor relative cursor-help">
                  <div className="text-xl font-bold underline decoration-dotted decoration-white/40 underline-offset-4">{formatCurrency(valor15dias)}</div>
                  {renderMiniTooltip('15dias', 'valor', 'valor')}
                </div>
                <div className="mt-1 text-xs opacity-75 flex items-center gap-1">
                  <span className="group/titulos relative cursor-help">
                    <span className="underline decoration-dotted decoration-white/30 underline-offset-2">
                      {calcularTitulosUnicos(contas15dias)} titulo(s)
                      <span className="ml-1 font-semibold opacity-90">({pct(calcularTitulosUnicos(contas15dias), totalTitulos)})</span>
                    </span>
                    {renderMiniTooltip('15dias', 'titulos', 'titulos')}
                  </span>
                  <span>|</span>
                  <span className="group/credores relative cursor-help">
                    <span className="underline decoration-dotted decoration-white/30 underline-offset-2">
                      {credores15dias} credores
                      <span className="ml-1 font-semibold opacity-90">({pct(credores15dias, credoresTotal)})</span>
                    </span>
                    {renderMiniTooltip('15dias', 'credores', 'credores')}
                  </span>
                </div>
                {renderComparacao('15dias', valor15dias)}
              </div>

              <div className="relative rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 p-5 text-white shadow-lg">
                <div className="mb-1 text-xs font-medium opacity-90">Proximos 30 dias</div>
                <div className="text-xs opacity-75 mb-1">de {formatarDataCurta(amanha)} ate {formatarDataCurta(fim30)}</div>
                <div className="group/valor relative cursor-help">
                  <div className="text-xl font-bold underline decoration-dotted decoration-white/40 underline-offset-4">{formatCurrency(valor30dias)}</div>
                  {renderMiniTooltip('30dias', 'valor', 'valor')}
                </div>
                <div className="mt-1 text-xs opacity-75 flex items-center gap-1">
                  <span className="group/titulos relative cursor-help">
                    <span className="underline decoration-dotted decoration-white/30 underline-offset-2">
                      {calcularTitulosUnicos(contas30dias)} titulo(s)
                      <span className="ml-1 font-semibold opacity-90">({pct(calcularTitulosUnicos(contas30dias), totalTitulos)})</span>
                    </span>
                    {renderMiniTooltip('30dias', 'titulos', 'titulos')}
                  </span>
                  <span>|</span>
                  <span className="group/credores relative cursor-help">
                    <span className="underline decoration-dotted decoration-white/30 underline-offset-2">
                      {credores30dias} credores
                      <span className="ml-1 font-semibold opacity-90">({pct(credores30dias, credoresTotal)})</span>
                    </span>
                    {renderMiniTooltip('30dias', 'credores', 'credores')}
                  </span>
                </div>
                {renderComparacao('30dias', valor30dias)}
              </div>
            </div>
          </>
        );
      })()}

      {snapshotComparacao && snapshotComparacao.resumo && (snapshotComparacao.resumo.qtd_adicionados > 0 || snapshotComparacao.resumo.qtd_removidos > 0 || snapshotComparacao.resumo.qtd_alterados > 0) && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-white dark:bg-slate-800 p-4 shadow">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">Comparacao detalhada vs snapshot {snapshotSelecionado ? new Date(snapshotSelecionado + 'T00:00:00').toLocaleDateString('pt-BR') : ''}</h3>
          <div className="flex gap-4 mb-3 text-sm">
            {snapshotComparacao.resumo.qtd_adicionados > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-green-800 font-medium">
                +{snapshotComparacao.resumo.qtd_adicionados} adicionado(s) ({formatCurrency(snapshotComparacao.resumo.valor_adicionados)})
              </span>
            )}
            {snapshotComparacao.resumo.qtd_removidos > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/40 px-3 py-1 text-red-800 font-medium">
                -{snapshotComparacao.resumo.qtd_removidos} removido(s) ({formatCurrency(snapshotComparacao.resumo.valor_removidos)})
              </span>
            )}
            {snapshotComparacao.resumo.qtd_alterados > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-3 py-1 text-yellow-800 font-medium">
                {snapshotComparacao.resumo.qtd_alterados} alterado(s)
              </span>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400">Credor</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400">Titulo</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400">Vencimento</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-slate-400">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {snapshotComparacao.adicionados?.map((t: any, i: number) => (
                  <tr key={`add-${i}`} className="bg-green-50">
                    <td className="px-3 py-1"><span className="rounded-full bg-green-200 px-2 py-0.5 text-xs font-semibold text-green-800">NOVO</span></td>
                    <td className="px-3 py-1 text-gray-900 dark:text-slate-100">{t.credor}</td>
                    <td className="px-3 py-1 text-gray-500 dark:text-slate-400">{t.lancamento}</td>
                    <td className="px-3 py-1 text-gray-500 dark:text-slate-400">{t.data_vencimento ? new Date(t.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                    <td className="px-3 py-1 text-right font-semibold text-green-700">{formatCurrency(t.valor_total)}</td>
                  </tr>
                ))}
                {snapshotComparacao.removidos?.map((t: any, i: number) => (
                  <tr key={`rem-${i}`} className="bg-red-50 dark:bg-red-900/20">
                    <td className="px-3 py-1"><span className="rounded-full bg-red-200 px-2 py-0.5 text-xs font-semibold text-red-800">REMOVIDO</span></td>
                    <td className="px-3 py-1 text-gray-900 dark:text-slate-100">{t.credor}</td>
                    <td className="px-3 py-1 text-gray-500 dark:text-slate-400">{t.lancamento}</td>
                    <td className="px-3 py-1 text-gray-500 dark:text-slate-400">{t.data_vencimento ? new Date(t.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                    <td className="px-3 py-1 text-right font-semibold text-red-700 dark:text-red-400">{formatCurrency(t.valor_total)}</td>
                  </tr>
                ))}
                {snapshotComparacao.alterados?.map((t: any, i: number) => (
                  <tr key={`alt-${i}`} className="bg-yellow-50">
                    <td className="px-3 py-1"><span className="rounded-full bg-yellow-200 px-2 py-0.5 text-xs font-semibold text-yellow-800">ALTERADO</span></td>
                    <td className="px-3 py-1 text-gray-900 dark:text-slate-100">{t.credor}</td>
                    <td className="px-3 py-1 text-gray-500 dark:text-slate-400">{t.lancamento}</td>
                    <td className="px-3 py-1 text-gray-500 dark:text-slate-400">{t.data_vencimento ? new Date(t.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                    <td className="px-3 py-1 text-right font-semibold text-yellow-700">{formatCurrency(t.valor_total)} <span className="text-xs text-gray-400">(era {formatCurrency(t.valor_anterior)})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="border-b border-gray-200 dark:border-slate-700">
          <nav className="-mb-px flex space-x-8">
            <button
              type="button"
              onClick={() => setAbaAtiva('dados')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'dados'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:border-slate-600 hover:text-gray-700 dark:text-slate-300'
                }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Dados
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('analises')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'analises'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:border-slate-600 hover:text-gray-700 dark:text-slate-300'
                }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Analises
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('por-credor')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'por-credor'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:border-slate-600 hover:text-gray-700 dark:text-slate-300'
                }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Por Credor
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('por-centro-custo')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'por-centro-custo'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:border-slate-600 hover:text-gray-700 dark:text-slate-300'
                }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Por Centro de Custo
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('por-semana')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'por-semana'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:border-slate-600 hover:text-gray-700 dark:text-slate-300'
                }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Por Semana
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('por-origem')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'por-origem'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:border-slate-600 hover:text-gray-700 dark:text-slate-300'
                }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Por Origem
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('mudancas')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'mudancas'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:border-slate-600 hover:text-gray-700 dark:text-slate-300'
                }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Mudancas
            </button>
          </nav>
        </div>
      </div>

      {abaAtiva === 'dados' && renderAbaDados()}
      {abaAtiva === 'analises' && renderAbaAnalises()}
      {abaAtiva === 'por-credor' && (() => {
        // Calcular dados de Pareto por credor
        const credorMap = new Map<string, { valor: number; quantidade: number }>();
        contas.forEach(c => {
          const credor = c.credor || 'Sem Credor';
          const atual = credorMap.get(credor) || { valor: 0, quantidade: 0 };
          credorMap.set(credor, {
            valor: atual.valor + (c.valor_total || 0),
            quantidade: atual.quantidade + 1,
          });
        });
        // Sempre ordenar por valor para calcular o Pareto (rank + acumulado)
        const credoresPorValor = Array.from(credorMap.entries())
          .map(([credor, data]) => ({ credor, ...data }))
          .sort((a, b) => b.valor - a.valor);

        const totalGeral = credoresPorValor.reduce((acc, c) => acc + c.valor, 0);
        let acumulado = 0;
        const credoresComPareto = credoresPorValor.map((c, i) => {
          const percentual = totalGeral > 0 ? (c.valor / totalGeral) * 100 : 0;
          acumulado += percentual;
          return { ...c, rank: i + 1, percentual, acumulado };
        });

        // Aplicar ordenacao selecionada pelo usuario para exibicao
        const credoresExibidos = [...credoresComPareto].sort((a, b) => {
          const dir = ordenacao.direcao === 'asc' ? 1 : -1;
          switch (ordenacao.campo) {
            case 'credor': return a.credor.localeCompare(b.credor) * dir;
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
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Contas a Pagar por Credor</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                    {credoresComPareto.length} credor(es) | Total: {formatCurrency(totalGeral)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarFiltros(!mostrarFiltros)}
                  className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
                </button>
              </div>

              <div className="mt-4 flex gap-2 border-b border-gray-200 dark:border-slate-700 pb-2">
                <button
                  onClick={() => setSubAbaCredor('tabela')}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium ${subAbaCredor === 'tabela' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:text-slate-400 hover:bg-gray-200'}`}
                >
                  Tabela
                </button>
                <button
                  onClick={() => setSubAbaCredor('grafico')}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium ${subAbaCredor === 'grafico' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:text-slate-400 hover:bg-gray-200'}`}
                >
                  Grafico
                </button>
              </div>

              {mostrarFiltros && renderFiltros()}
              {!mostrarFiltros && renderFiltrosTags()}
            </div>

            {subAbaCredor === 'tabela' && (
              <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-800 shadow">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-blue-50">
                      <tr>
                        <th onClick={() => toggleOrdenacao('rank')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 w-12 cursor-pointer hover:bg-blue-100">#{renderSortIcon('rank')}</th>
                        <th onClick={() => toggleOrdenacao('credor')} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Credor{renderSortIcon('credor')}</th>
                        <th onClick={() => toggleOrdenacao('quantidade')} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Qtd Titulos{renderSortIcon('quantidade')}</th>
                        <th onClick={() => toggleOrdenacao('valor')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Valor{renderSortIcon('valor')}</th>
                        <th onClick={() => toggleOrdenacao('percentual')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">% do Total{renderSortIcon('percentual')}</th>
                        <th onClick={() => toggleOrdenacao('acumulado')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">% Acumulado{renderSortIcon('acumulado')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:bg-slate-800">
                      {credoresExibidos.map((c, index) => (
                        <React.Fragment key={index}>
                          <tr
                            onClick={() => setCredorExpandido(credorExpandido === c.credor ? null : c.credor)}
                            className={`cursor-pointer hover:bg-gray-50 dark:bg-slate-900 transition-colors ${credorExpandido === c.credor ? 'bg-blue-50/50' : c.acumulado <= 80 ? 'bg-green-50/30' : c.acumulado <= 95 ? 'bg-yellow-50/30' : ''}`}
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400 font-mono">
                              <span className={`inline-block transition-transform mr-2 text-[10px] ${credorExpandido === c.credor ? 'rotate-90' : ''}`}>▶</span>
                              {c.rank}
                            </td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-medium text-gray-900 dark:text-slate-100">{c.credor}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 dark:text-slate-400 text-center">{c.quantidade}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-blue-600 text-right">{formatCurrency(c.valor)}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700 dark:text-slate-300 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-2">
                                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(c.percentual * 2, 100)}%` }}></div>
                                </div>
                                <span className="w-14 text-right">{c.percentual.toFixed(2)}%</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-right">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.acumulado <= 80 ? 'bg-green-100 text-green-700' :
                                c.acumulado <= 95 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                                }`}>
                                {c.acumulado.toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                          {credorExpandido === c.credor && (
                            <tr className="bg-gray-50 dark:bg-slate-900">
                              <td colSpan={6} className="px-8 py-4">
                                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-inner">
                                  <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50 dark:bg-slate-900">
                                      <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Vencimento</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Título</th>
                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Parcela</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Nº Doc.</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Centro de Custo</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Observação</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Valor</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {contas.filter(conta => (conta.credor || 'Sem Credor') === c.credor).map((conta, j) => {
                                        const dias = calcularDiasAteVencimento(conta.data_vencimento as any);
                                        const corDias = dias < 0 ? 'text-red-600 dark:text-red-400' : dias === 0 ? 'text-orange-600' : 'text-green-600';
                                        return (
                                          <tr key={j} className="hover:bg-blue-50/50">
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-slate-400">{formatDate(conta.data_vencimento as any)}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900 dark:text-slate-100">{conta.lancamento ? conta.lancamento.split('/')[0] : '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-slate-400 text-center">{conta.numero_parcela || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-slate-400">{conta.numero_documento || '-'}</td>
                                            <td className={`whitespace-nowrap px-4 py-2 text-sm font-semibold ${corDias}`}>
                                              {dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias}d`}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-slate-400" title={`${(conta as any).codigo_centrocusto || ''} - ${(conta as any).nome_centrocusto || ''}`}>{(conta as any).codigo_centrocusto ? <span className="inline-flex items-center justify-center rounded bg-blue-100 text-blue-700 font-bold font-mono text-[11px] px-1 min-w-[20px]">{(conta as any).codigo_centrocusto}</span> : null}{(conta as any).codigo_centrocusto ? ' ' : ''}{(conta as any).nome_centrocusto || '-'}</td>
                                            <td className="px-4 py-2 text-xs text-gray-600 dark:text-slate-400 max-w-xs truncate" title={conta.descricao_observacao || ''}>{conta.descricao_observacao || '-'}</td>
                                            <td className="whitespace-nowrap px-4 py-2 text-sm text-blue-600 font-semibold text-right">{formatCurrency(conta.valor_total || 0)}</td>
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
                        <td className="px-6 py-3 text-sm text-gray-900 dark:text-slate-100">TOTAL</td>
                        <td className="px-6 py-3 text-sm text-gray-900 dark:text-slate-100 text-center">{contas.length}</td>
                        <td className="px-6 py-3 text-sm text-blue-700 text-right">{formatCurrency(totalGeral)}</td>
                        <td className="px-6 py-3 text-sm text-gray-900 dark:text-slate-100 text-right">100,00%</td>
                        <td className="px-6 py-3 text-sm"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {subAbaCredor === 'grafico' && (
              <div className="mb-6 rounded-lg bg-white dark:bg-slate-800 p-6 shadow">
                <p className="mb-4 text-sm text-gray-500 dark:text-slate-400">Distribuição de valores pendentes por credor</p>
                <div style={{ height: Math.max(300, credoresExibidos.length * 45) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={credoresExibidos}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="credor" type="category" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-lg">
                                <p className="mb-1 font-semibold text-gray-900 dark:text-slate-100">{data.credor}</p>
                                <p className="text-sm font-semibold text-blue-600">Valor: {formatCurrency(data.valor)}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">Representatividade: {data.percentual.toFixed(2)}%</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">Títulos: {data.quantidade}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                        {credoresExibidos.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.acumulado <= 80 ? '#10B981' : entry.acumulado <= 95 ? '#EAB308' : '#EF4444'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Legenda Pareto */}
            <div className="mt-4 flex items-center gap-6 text-xs text-gray-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-green-100 border border-green-300"></span>
                A (ate 80%) - Principais credores
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-yellow-100 border border-yellow-300"></span>
                B (80-95%) - Credores intermediarios
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-red-100 dark:bg-red-900/40 border border-red-300"></span>
                C (95-100%) - Credores menores
              </div>
            </div>
          </>
        );
      })()}
      {abaAtiva === 'por-centro-custo' && (() => {
        const ccMap = new Map<string, { valor: number; quantidade: number }>();
        contas.forEach(c => {
          const cc = (c as any).nome_centrocusto || 'Sem Centro de Custo';
          const atual = ccMap.get(cc) || { valor: 0, quantidade: 0 };
          ccMap.set(cc, {
            valor: atual.valor + (c.valor_total || 0),
            quantidade: atual.quantidade + 1,
          });
        });
        const ccPorValor = Array.from(ccMap.entries())
          .map(([centroCusto, data]) => ({ centroCusto, ...data }))
          .sort((a, b) => b.valor - a.valor);

        const totalGeral = ccPorValor.reduce((acc, c) => acc + c.valor, 0);
        let acumulado = 0;
        const ccComPareto = ccPorValor.map((c, i) => {
          const percentual = totalGeral > 0 ? (c.valor / totalGeral) * 100 : 0;
          acumulado += percentual;
          return { ...c, rank: i + 1, percentual, acumulado };
        });

        const ccExibidos = [...ccComPareto].sort((a, b) => {
          const dir = ordenacao.direcao === 'asc' ? 1 : -1;
          switch (ordenacao.campo) {
            case 'centroCusto': return a.centroCusto.localeCompare(b.centroCusto) * dir;
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
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Contas a Pagar por Centro de Custo</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                    {ccComPareto.length} centro(s) de custo | Total: {formatCurrency(totalGeral)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarFiltros(!mostrarFiltros)}
                  className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
                </button>
              </div>

              <div className="mt-4 flex gap-2 border-b border-gray-200 dark:border-slate-700 pb-2">
                <button
                  onClick={() => setSubAbaCentroCusto('tabela')}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium ${subAbaCentroCusto === 'tabela' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:text-slate-400 hover:bg-gray-200'}`}
                >
                  Tabela
                </button>
                <button
                  onClick={() => setSubAbaCentroCusto('grafico')}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium ${subAbaCentroCusto === 'grafico' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:text-slate-400 hover:bg-gray-200'}`}
                >
                  Grafico
                </button>
              </div>

              {mostrarFiltros && renderFiltros()}
              {!mostrarFiltros && renderFiltrosTags()}
            </div>

            {subAbaCentroCusto === 'tabela' && (

              <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-800 shadow">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-blue-50">
                      <tr>
                        <th onClick={() => toggleOrdenacao('rank')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 w-12 cursor-pointer hover:bg-blue-100">#{renderSortIcon('rank')}</th>
                        <th onClick={() => toggleOrdenacao('centroCusto')} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Centro de Custo{renderSortIcon('centroCusto')}</th>
                        <th onClick={() => toggleOrdenacao('quantidade')} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Qtd Titulos{renderSortIcon('quantidade')}</th>
                        <th onClick={() => toggleOrdenacao('valor')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Valor{renderSortIcon('valor')}</th>
                        <th onClick={() => toggleOrdenacao('percentual')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">% do Total{renderSortIcon('percentual')}</th>
                        <th onClick={() => toggleOrdenacao('acumulado')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">% Acumulado{renderSortIcon('acumulado')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:bg-slate-800">
                      {ccExibidos.map((c, index) => (
                        <tr key={index} className={`hover:bg-gray-50 dark:bg-slate-900 ${c.acumulado <= 80 ? 'bg-green-50/30' : c.acumulado <= 95 ? 'bg-yellow-50/30' : ''}`}>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400 font-mono">{c.rank}</td>
                          <td className="whitespace-nowrap px-6 py-3 text-sm font-medium text-gray-900 dark:text-slate-100">{c.centroCusto}</td>
                          <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 dark:text-slate-400 text-center">{c.quantidade}</td>
                          <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-blue-600 text-right">{formatCurrency(c.valor)}</td>
                          <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700 dark:text-slate-300 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-20 bg-gray-200 rounded-full h-2">
                                <div className="bg-teal-500 h-2 rounded-full" style={{ width: `${Math.min(c.percentual * 2, 100)}%` }}></div>
                              </div>
                              <span className="w-14 text-right">{c.percentual.toFixed(2)}%</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-right">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.acumulado <= 80 ? 'bg-green-100 text-green-700' :
                              c.acumulado <= 95 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                              }`}>
                              {c.acumulado.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100">
                      <tr className="font-bold">
                        <td className="px-4 py-3 text-sm"></td>
                        <td className="px-6 py-3 text-sm text-gray-900 dark:text-slate-100">TOTAL</td>
                        <td className="px-6 py-3 text-sm text-gray-900 dark:text-slate-100 text-center">{contas.length}</td>
                        <td className="px-6 py-3 text-sm text-blue-700 text-right">{formatCurrency(totalGeral)}</td>
                        <td className="px-6 py-3 text-sm text-gray-900 dark:text-slate-100 text-right">100,00%</td>
                        <td className="px-6 py-3 text-sm"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {subAbaCentroCusto === 'grafico' && (
              <div className="mb-6 rounded-lg bg-white dark:bg-slate-800 p-6 shadow">
                <p className="mb-4 text-sm text-gray-500 dark:text-slate-400">Distribuição de valores pendentes por centro de custo</p>
                <div style={{ height: Math.max(300, ccExibidos.length * 45) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={ccExibidos}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="centroCusto" type="category" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-lg">
                                <p className="mb-1 font-semibold text-gray-900 dark:text-slate-100">{data.centroCusto}</p>
                                <p className="text-sm font-semibold text-blue-600">Valor: {formatCurrency(data.valor)}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">Representatividade: {data.percentual.toFixed(2)}%</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">Títulos: {data.quantidade}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                        {ccExibidos.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.acumulado <= 80 ? '#10B981' : entry.acumulado <= 95 ? '#EAB308' : '#EF4444'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Legenda Pareto */}
            <div className="mt-4 flex items-center gap-6 text-xs text-gray-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-green-100 border border-green-300"></span>
                A (ate 80%) - Principais centros de custo
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-yellow-100 border border-yellow-300"></span>
                B (80-95%) - Centros intermediarios
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-red-100 dark:bg-red-900/40 border border-red-300"></span>
                C (95-100%) - Centros menores
              </div>
            </div>
          </>
        );
      })()}
      {abaAtiva === 'por-semana' && (() => {
        // Funcao para obter o numero da semana ISO
        const getWeekNumber = (d: Date): [number, number] => {
          const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
          date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
          const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
          const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
          return [date.getUTCFullYear(), weekNo];
        };

        // Funcao para obter datas de inicio e fim de uma semana
        const getWeekDates = (year: number, week: number): [Date, Date] => {
          const jan1 = new Date(year, 0, 1);
          const dayOffset = jan1.getDay() <= 4 ? jan1.getDay() - 1 : jan1.getDay() - 8;
          const startDate = new Date(year, 0, 1 + (week - 1) * 7 - dayOffset);
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 6);
          return [startDate, endDate];
        };

        const formatDateShort = (d: Date) => {
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yy = String(d.getFullYear()).slice(2);
          return `${dd}/${mm}/${yy}`;
        };

        // Agrupar contas por semana do ano selecionado
        const semanaMap = new Map<number, { valor: number; quantidade: number }>();
        const anosDisp = new Set<number>();

        if (loadingContasAno) {
          return (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-slate-400">Carregando dados do ano {filtroAnoSemana}...</p>
              </div>
            </div>
          );
        }

        contasAno.forEach(c => {
          if (!c.data_vencimento) return;
          const dv = new Date(c.data_vencimento.split('T')[0]);
          const [ano, semana] = getWeekNumber(dv);
          anosDisp.add(ano);
          if (ano !== filtroAnoSemana) return;
          if (filtroSemanas.length > 0 && !filtroSemanas.includes(semana)) return;
          const atual = semanaMap.get(semana) || { valor: 0, quantidade: 0 };
          semanaMap.set(semana, {
            valor: atual.valor + (c.valor_total || 0),
            quantidade: atual.quantidade + 1,
          });
        });

        // Gerar todas as 52 semanas do ano
        const totalSemanasAno = 52;
        const semanasOrdenadas: { semana: number; periodo: string; valor: number; quantidade: number }[] = [];
        for (let s = 1; s <= totalSemanasAno; s++) {
          const [inicio, fim] = getWeekDates(filtroAnoSemana, s);
          const dados = semanaMap.get(s) || { valor: 0, quantidade: 0 };
          if (filtroSemanas.length > 0 && !filtroSemanas.includes(s)) continue;
          semanasOrdenadas.push({
            semana: s,
            periodo: `${formatDateShort(inicio)} - ${formatDateShort(fim)}`,
            ...dados,
          });
        }

        const totalGeral = semanasOrdenadas.reduce((acc, s) => acc + s.valor, 0);
        let acumulado = 0;
        // Pareto calculado pela ordem de valor decrescente
        const semanasPorValor = [...semanasOrdenadas].sort((a, b) => b.valor - a.valor);
        const rankMap = new Map<number, { rank: number; percentual: number; acumulado: number }>();
        semanasPorValor.forEach((s, i) => {
          const percentual = totalGeral > 0 ? (s.valor / totalGeral) * 100 : 0;
          acumulado += percentual;
          rankMap.set(s.semana, { rank: i + 1, percentual, acumulado });
        });

        const semanasComPareto = semanasOrdenadas.map(s => {
          const pareto = rankMap.get(s.semana) || { rank: 0, percentual: 0, acumulado: 0 };
          return { ...s, ...pareto };
        });

        // Ordenacao da tabela
        const semanasExibidas = [...semanasComPareto].sort((a, b) => {
          const dir = ordenacao.direcao === 'asc' ? 1 : -1;
          switch (ordenacao.campo) {
            case 'semana': return (a.semana - b.semana) * dir;
            case 'periodo': return a.periodo.localeCompare(b.periodo) * dir;
            case 'quantidade': return (a.quantidade - b.quantidade) * dir;
            case 'valor': return (a.valor - b.valor) * dir;
            case 'percentual': return (a.percentual - b.percentual) * dir;
            case 'acumulado': return (a.acumulado - b.acumulado) * dir;
            default: return (a.semana - b.semana) * dir;
          }
        });

        // Dados para grafico
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
        const semanaSelecionadaUnica = filtroSemanas.length === 1 ? filtroSemanas[0] : null;

        let dadosGrafico: { name: string; valor: number; quantidade: number; periodo: string }[];

        if (semanaSelecionadaUnica) {
          // Visao diaria: mostrar todos os dias da semana selecionada
          const [inicioSemana, fimSemana] = getWeekDates(filtroAnoSemana, semanaSelecionadaUnica);
          const diasMap = new Map<string, { valor: number; quantidade: number }>();

          // Inicializar todos os 7 dias da semana
          for (let d = new Date(inicioSemana); d <= fimSemana; d.setDate(d.getDate() + 1)) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            diasMap.set(key, { valor: 0, quantidade: 0 });
          }

          // Preencher com dados das contas
          contasAno.forEach(c => {
            if (!c.data_vencimento) return;
            const dStr = c.data_vencimento.split('T')[0];
            if (diasMap.has(dStr)) {
              const atual = diasMap.get(dStr)!;
              diasMap.set(dStr, {
                valor: atual.valor + (c.valor_total || 0),
                quantidade: atual.quantidade + 1,
              });
            }
          });

          dadosGrafico = Array.from(diasMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateStr, data]) => {
              const dt = new Date(dateStr + 'T12:00:00');
              const diaSemana = diasSemana[dt.getDay()];
              const dd = dateStr.split('-')[2];
              const mm = dateStr.split('-')[1];
              return {
                name: `${diaSemana} ${dd}/${mm}`,
                valor: data.valor,
                quantidade: data.quantidade,
                periodo: `${dd}/${mm}/${dateStr.split('-')[0].slice(2)}`,
              };
            });
        } else {
          // Visao semanal padrao
          dadosGrafico = semanasOrdenadas.map(s => ({
            name: `S${s.semana}`,
            valor: s.valor,
            quantidade: s.quantidade,
            periodo: s.periodo,
          }));
        }

        // Semanas disponiveis para filtro
        const semanasDisponiveis = Array.from(semanaMap.keys()).sort((a, b) => a - b);
        const semanasParaFiltro = Array.from({ length: totalSemanasAno }, (_, i) => i + 1);

        const anosArray = Array.from(anosDisp).sort();
        // Adicionar ano atual se nao tiver
        if (!anosArray.includes(new Date().getFullYear())) anosArray.push(new Date().getFullYear());
        anosArray.sort();

        // Semana atual para highlight
        const [, semanaAtual] = getWeekNumber(new Date());

        const tituloGrafico = semanaSelecionadaUnica
          ? `Valores por Dia - Semana ${semanaSelecionadaUnica} de ${filtroAnoSemana}`
          : `Valores por Semana - ${filtroAnoSemana}`;

        return (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Contas a Pagar por Semana do Ano</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                    {semanasComPareto.length} semana(s) | Total: {formatCurrency(totalGeral)}
                  </p>
                </div>
              </div>

              {/* Filtros de Ano e Semana */}
              <div className="mt-4 flex flex-wrap items-end gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Ano</label>
                  <select
                    value={filtroAnoSemana}
                    onChange={(e) => { setFiltroAnoSemana(Number(e.target.value)); setFiltroSemanas([]); }}
                    className="rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 focus:border-blue-500 focus:outline-none"
                  >
                    {anosArray.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Semanas ({filtroSemanas.length > 0 ? filtroSemanas.length + ' selecionada(s)' : 'Todas'})</label>
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-2 border rounded-lg bg-gray-50 dark:bg-slate-900">
                    {semanasParaFiltro.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setFiltroSemanas(prev =>
                            prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                          );
                        }}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${filtroSemanas.includes(s)
                          ? 'bg-blue-600 text-white'
                          : s === semanaAtual
                            ? 'bg-orange-100 text-orange-700 border border-orange-300'
                            : 'bg-gray-200 text-gray-700 dark:text-slate-300 hover:bg-gray-300'
                          }`}
                      >
                        S{s}
                      </button>
                    ))}
                  </div>
                </div>
                {filtroSemanas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFiltroSemanas([])}
                    className="rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:bg-slate-900"
                  >
                    Limpar semanas
                  </button>
                )}
              </div>
            </div>

            {/* Insights dinamicos */}
            {(() => {
              const semanasComValor = semanasComPareto.filter(s => s.valor > 0);
              if (semanasComValor.length === 0) return null;
              const maiorSemana = semanasComValor.reduce((prev, curr) => curr.valor > prev.valor ? curr : prev);
              const menorSemana = semanasComValor.reduce((prev, curr) => curr.valor < prev.valor ? curr : prev);
              const mediaSemanal = totalGeral / semanasComValor.length;
              return (
                <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      <span className="text-sm font-semibold text-green-700">Semana com maior valor</span>
                    </div>
                    <p className="text-lg font-bold text-green-800">
                      Semana {maiorSemana.semana} <span className="text-sm font-normal text-green-600">({maiorSemana.periodo})</span>
                    </p>
                    <p className="text-xl font-bold text-green-900">{formatCurrency(maiorSemana.valor)}</p>
                    <p className="text-xs text-green-600">{maiorSemana.quantidade} titulo(s) | {maiorSemana.percentual.toFixed(2)}% do total</p>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                      </svg>
                      <span className="text-sm font-semibold text-blue-700">Semana com menor valor</span>
                    </div>
                    <p className="text-lg font-bold text-blue-800">
                      Semana {menorSemana.semana} <span className="text-sm font-normal text-blue-600">({menorSemana.periodo})</span>
                    </p>
                    <p className="text-xl font-bold text-blue-900">{formatCurrency(menorSemana.valor)}</p>
                    <p className="text-xs text-blue-600">{menorSemana.quantidade} titulo(s) | {menorSemana.percentual.toFixed(2)}% do total</p>
                  </div>
                  <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <span className="text-sm font-semibold text-purple-700">Media semanal</span>
                    </div>
                    <p className="text-xl font-bold text-purple-900">{formatCurrency(mediaSemanal)}</p>
                    <p className="text-xs text-purple-600">{semanasComValor.length} semana(s) com valores</p>
                    <p className="text-xs text-purple-600">Media de {Math.round(semanasComValor.reduce((a, s) => a + s.quantidade, 0) / semanasComValor.length)} titulo(s)/semana</p>
                  </div>
                </div>
              );
            })()}

            {/* Grafico */}
            {dadosGrafico.length > 0 && (() => {
              // Calcular media movel de 4 semanas
              const dadosComMedia = dadosGrafico.map((d, i) => {
                if (semanaSelecionadaUnica) return { ...d, media: undefined };
                const janela = dadosGrafico.slice(Math.max(0, i - 3), i + 1).filter(x => x.valor > 0);
                const media = janela.length > 0 ? janela.reduce((a, x) => a + x.valor, 0) / janela.length : 0;
                return { ...d, media: media > 0 ? media : undefined };
              });

              return (
                <div className="mb-6 rounded-lg bg-white dark:bg-slate-800 p-6 shadow">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{tituloGrafico}</h3>
                    {!semanaSelecionadaUnica && (
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-3 h-3 rounded bg-blue-400"></span> Valor semanal
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-6 h-0.5 bg-red-50 dark:bg-red-900/200"></span> Media movel (4 sem.)
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={dadosComMedia} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: semanaSelecionadaUnica ? 14 : 11 }} />
                        <YAxis tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: semanaSelecionadaUnica ? 13 : 11 }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-lg">
                                  <p className="mb-1 font-semibold text-gray-900 dark:text-slate-100">{data.name}</p>
                                  <p className="text-sm text-blue-600">Valor: {formatCurrency(data.valor)}</p>
                                  <p className="text-sm text-gray-600 dark:text-slate-400">Titulos: {data.quantidade}</p>
                                  {data.media && <p className="text-sm text-red-500 dark:text-red-400">Media movel: {formatCurrency(data.media)}</p>}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                          {dadosComMedia.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={semanaSelecionadaUnica
                                ? (entry.valor === 0 ? '#E5E7EB' : COLORS[index % COLORS.length])
                                : (entry.name === `S${semanaAtual}` ? '#F59E0B' : COLORS[index % COLORS.length])
                              }
                            />
                          ))}
                          <LabelList dataKey="valor" position="top" formatter={(value: number) => value > 0 ? formatCurrencyShort(value) : ''} style={{ fontSize: semanaSelecionadaUnica ? 14 : 9, fontWeight: semanaSelecionadaUnica ? 600 : 400, fill: '#374151' }} />
                        </Bar>
                        {!semanaSelecionadaUnica && (
                          <Line type="monotone" dataKey="media" stroke="#EF4444" strokeWidth={2} dot={false} connectNulls />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}

            {/* Tabela */}
            <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-800 shadow">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-blue-50">
                    <tr>
                      <th onClick={() => toggleOrdenacao('semana')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Sem.{renderSortIcon('semana')}</th>
                      <th onClick={() => toggleOrdenacao('periodo')} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Periodo{renderSortIcon('periodo')}</th>
                      <th onClick={() => toggleOrdenacao('quantidade')} className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Qtd{renderSortIcon('quantidade')}</th>
                      <th onClick={() => toggleOrdenacao('valor')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Valor{renderSortIcon('valor')}</th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">Var.</th>
                      <th onClick={() => toggleOrdenacao('percentual')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">%{renderSortIcon('percentual')}</th>
                      <th onClick={() => toggleOrdenacao('acumulado')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">% Acum{renderSortIcon('acumulado')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:bg-slate-800">
                    {semanasExibidas.map((s, index) => {
                      // Calcular variacao com semana anterior
                      const semanaAnterior = semanasComPareto.find(x => x.semana === s.semana - 1);
                      const variacao = semanaAnterior && semanaAnterior.valor > 0 && s.valor > 0
                        ? ((s.valor - semanaAnterior.valor) / semanaAnterior.valor) * 100
                        : null;
                      return (
                        <React.Fragment key={index}>
                          <tr
                            onClick={() => s.valor > 0 ? setSemanaExpandida(semanaExpandida === s.semana ? null : s.semana) : null}
                            className={`${s.valor > 0 ? 'cursor-pointer' : ''} hover:bg-gray-50 dark:bg-slate-900 ${s.semana === semanaAtual ? 'bg-orange-50/50 border-l-4 border-l-orange-400' : s.acumulado <= 80 ? 'bg-green-50/30' : s.acumulado <= 95 ? 'bg-yellow-50/30' : ''}`}
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-sm font-mono font-semibold text-gray-700 dark:text-slate-300">
                              <div className="flex items-center gap-1.5">
                                {s.valor > 0 && (
                                  <span className={`text-gray-400 text-xs transition-transform ${semanaExpandida === s.semana ? 'rotate-90' : ''}`}>{'\u25B6'}</span>
                                )}
                                {s.semana}
                                {s.semana === semanaAtual && (
                                  <span className="px-1.5 py-0.5 bg-orange-400 text-white text-[10px] font-bold rounded">ATUAL</span>
                                )}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-600 dark:text-slate-400">{s.periodo}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 dark:text-slate-400 text-center">{s.quantidade > 0 ? s.quantidade : ''}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-blue-600 text-right">{s.valor > 0 ? formatCurrency(s.valor) : ''}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-center">
                              {variacao !== null && (
                                <span className={`text-xs font-semibold ${variacao > 0 ? 'text-red-500 dark:text-red-400' : variacao < 0 ? 'text-green-500' : 'text-gray-400'
                                  }`}>
                                  {variacao > 0 ? "\u2191" : variacao < 0 ? "\u2193" : "\u2192"}
                                  {Math.abs(variacao).toFixed(0)}%
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700 dark:text-slate-300 text-right">{s.percentual > 0 ? s.percentual.toFixed(2) + '%' : ''}</td>
                            <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-right">
                              {s.acumulado > 0 && (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.acumulado <= 80 ? 'bg-green-100 text-green-700' :
                                  s.acumulado <= 95 ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                                  }`}>
                                  {s.acumulado.toFixed(2)}%
                                </span>
                              )}
                            </td>
                          </tr>
                          {/* Linha expandida com detalhes */}
                          {semanaExpandida === s.semana && s.valor > 0 && (() => {
                            const titulosSemana = contasAno.filter(c => {
                              if (!c.data_vencimento) return false;
                              const dv = new Date(c.data_vencimento.split('T')[0]);
                              const [, sem] = getWeekNumber(dv);
                              return sem === s.semana;
                            }).sort((a, b) => (b.valor_total || 0) - (a.valor_total || 0));
                            return (
                              <tr>
                                <td colSpan={7} className="p-0">
                                  <div className="bg-gray-50 dark:bg-slate-900 border-t border-b border-gray-200 dark:border-slate-700 px-8 py-3">
                                    <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2 uppercase tracking-wider">Titulos da Semana {s.semana} ({titulosSemana.length} registro(s))</p>
                                    <div className="max-h-60 overflow-y-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="text-xs text-gray-400 uppercase">
                                            <th className="text-left py-1 pr-3">Credor</th>
                                            <th className="text-left py-1 pr-3">Vencimento</th>
                                            <th className="text-left py-1 pr-3">Documento</th>
                                            <th className="text-left py-1 pr-3">Centro Custo</th>
                                            <th className="text-right py-1">Valor</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {titulosSemana.map((t, ti) => (
                                            <tr key={ti} className="border-t border-gray-100 dark:border-slate-700/50 hover:bg-gray-100">
                                              <td className="py-1.5 pr-3 text-gray-700 dark:text-slate-300 max-w-[250px] truncate" title={t.credor}>{t.credor}</td>
                                              <td className="py-1.5 pr-3 text-gray-500 dark:text-slate-400">
                                                {t.data_vencimento ? new Date(t.data_vencimento.toString().split('T')[0] + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                                              </td>
                                              <td className="py-1.5 pr-3 text-gray-500 dark:text-slate-400 font-mono text-xs">{t.numero_documento || '-'}</td>
                                              <td className="py-1.5 pr-3 text-gray-500 dark:text-slate-400 max-w-[200px] truncate" title={`${(t as any).codigo_centrocusto || ''} - ${t.nome_centrocusto || ''}`}>{(t as any).codigo_centrocusto ? <span className="inline-flex items-center justify-center rounded bg-blue-100 text-blue-700 font-bold font-mono text-[11px] px-1 min-w-[20px]">{(t as any).codigo_centrocusto}</span> : null}{(t as any).codigo_centrocusto ? ' ' : ''}{t.nome_centrocusto || '-'}</td>
                                              <td className="py-1.5 text-right font-semibold text-blue-600">{formatCurrency(t.valor_total || 0)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })()}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-100">
                    <tr className="font-bold">
                      <td className="px-4 py-3 text-sm">Total</td>
                      <td className="px-6 py-3 text-sm text-gray-500 dark:text-slate-400">-</td>
                      <td className="px-6 py-3 text-sm text-gray-900 dark:text-slate-100 text-center">{contasAno.length}</td>
                      <td className="px-6 py-3 text-sm text-blue-700 text-right">{formatCurrency(totalGeral)}</td>
                      <td className="px-4 py-3 text-sm"></td>
                      <td className="px-6 py-3 text-sm text-gray-900 dark:text-slate-100 text-right">100,00%</td>
                      <td className="px-6 py-3 text-sm text-gray-900 dark:text-slate-100 text-right">100,00%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        );
      })()}

      {abaAtiva === 'por-origem' && (() => {
        const NOMES_ORIGEM: Record<string, string> = {
          'CP': 'Contas a Pagar',
          'AC': 'Acordo',
          'ME': 'Medicao',
          'CO': 'Contrato',
          'NF': 'Nota Fiscal',
          'GR': 'Guia de Recolhimento',
          'RE': 'Recibo',
          'BO': 'Boleto',
          'CH': 'Cheque',
          'DP': 'Deposito',
        };

        const origemMap = new Map<string, { valor: number; quantidade: number }>();
        contas.forEach(c => {
          const origem = (c.id_origem || 'Outros').trim();
          const atual = origemMap.get(origem) || { valor: 0, quantidade: 0 };
          origemMap.set(origem, {
            valor: atual.valor + (c.valor_total || 0),
            quantidade: atual.quantidade + 1,
          });
        });

        const origensOrdenadas = Array.from(origemMap.entries())
          .map(([origem, data]) => ({ origem, ...data }))
          .sort((a, b) => b.valor - a.valor);

        const totalGeral = origensOrdenadas.reduce((acc, o) => acc + o.valor, 0);
        let acumulado = 0;
        const origensComPareto = origensOrdenadas.map((o, i) => {
          const percentual = totalGeral > 0 ? (o.valor / totalGeral) * 100 : 0;
          acumulado += percentual;
          return { ...o, rank: i + 1, percentual, acumulado };
        });

        const origensExibidas = [...origensComPareto].sort((a, b) => {
          const dir = ordenacao.direcao === 'asc' ? 1 : -1;
          switch (ordenacao.campo) {
            case 'rank': return (a.rank - b.rank) * dir;
            case 'credor': return a.origem.localeCompare(b.origem) * dir;
            case 'quantidade': return (a.quantidade - b.quantidade) * dir;
            case 'valor': return (a.valor - b.valor) * dir;
            case 'percentual': return (a.percentual - b.percentual) * dir;
            case 'acumulado': return (a.acumulado - b.acumulado) * dir;
            default: return (a.rank - b.rank) * dir;
          }
        });

        const dadosGrafico = origensComPareto.slice(0, 10).map(o => ({
          name: o.origem,
          nomeCompleto: NOMES_ORIGEM[o.origem] || o.origem,
          valor: o.valor,
          quantidade: o.quantidade,
          percentual: o.percentual,
        }));

        return (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Contas a Pagar por Origem</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                    {origensComPareto.length} origem(s) | Total: {formatCurrency(totalGeral)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarFiltros(!mostrarFiltros)}
                  className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
                </button>
              </div>
              {mostrarFiltros && renderFiltros()}
              {!mostrarFiltros && renderFiltrosTags()}
            </div>

            {dadosGrafico.length > 0 && (
              <div className="mb-6 rounded-lg bg-white dark:bg-slate-800 p-6 shadow">
                <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-slate-100">Distribuicao por Origem</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dadosGrafico} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fontWeight: 600 }} width={50} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-lg">
                                <p className="mb-1 font-semibold text-gray-900 dark:text-slate-100">{data.name} - {data.nomeCompleto}</p>
                                <p className="text-sm text-blue-600">Valor: {formatCurrency(data.valor)}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">Titulos: {data.quantidade}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{data.percentual.toFixed(2)}% do total</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                        {dadosGrafico.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                        <LabelList dataKey="valor" position="right" formatter={(value: number) => formatCurrencyShort(value)} style={{ fontSize: 11, fill: '#374151' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-800 shadow">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-blue-50">
                    <tr>
                      <th onClick={() => toggleOrdenacao('rank')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">#</th>
                      <th onClick={() => toggleOrdenacao('credor')} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Origem{renderSortIcon('credor')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">Descricao</th>
                      <th onClick={() => toggleOrdenacao('quantidade')} className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Qtd{renderSortIcon('quantidade')}</th>
                      <th onClick={() => toggleOrdenacao('valor')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">Valor{renderSortIcon('valor')}</th>
                      <th onClick={() => toggleOrdenacao('percentual')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">%{renderSortIcon('percentual')}</th>
                      <th onClick={() => toggleOrdenacao('acumulado')} className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 cursor-pointer hover:bg-blue-100">% Acum{renderSortIcon('acumulado')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:bg-slate-800">
                    {origensExibidas.map((o, index) => (
                      <tr key={index} className={`hover:bg-gray-50 dark:bg-slate-900 ${o.acumulado <= 80 ? 'bg-green-50/30' : o.acumulado <= 95 ? 'bg-yellow-50/30' : ''}`}>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-mono font-semibold text-gray-400">{o.rank}</td>
                        <td className="whitespace-nowrap px-6 py-3">
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[(o.rank - 1) % COLORS.length] }}></span>
                            <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{o.origem}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 dark:text-slate-400">{NOMES_ORIGEM[o.origem] || '-'}</td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 dark:text-slate-400 text-center">{o.quantidade}</td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-blue-600 text-right">{formatCurrency(o.valor)}</td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700 dark:text-slate-300 text-right">{o.percentual.toFixed(2)}%</td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm font-semibold text-right">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${o.acumulado <= 80 ? 'bg-green-100 text-green-700' :
                            o.acumulado <= 95 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                            }`}>
                            {o.acumulado.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100">
                    <tr className="font-bold">
                      <td className="px-4 py-3 text-sm">Total</td>
                      <td className="px-6 py-3 text-sm text-gray-500 dark:text-slate-400" colSpan={2}>-</td>
                      <td className="px-6 py-3 text-sm text-gray-900 dark:text-slate-100 text-center">{origensComPareto.reduce((a, o) => a + o.quantidade, 0)}</td>
                      <td className="px-6 py-3 text-sm text-blue-700 text-right">{formatCurrency(totalGeral)}</td>
                      <td className="px-6 py-3 text-sm text-gray-900 dark:text-slate-100 text-right">100,00%</td>
                      <td className="px-6 py-3 text-sm text-gray-900 dark:text-slate-100 text-right">100,00%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex items-center gap-4 px-6 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300"></span> A (ate 80%)
                </span>
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="inline-block w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></span> B (80-95%)
                </span>
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="inline-block w-3 h-3 rounded bg-red-100 dark:bg-red-900/40 border border-red-300"></span> C (95-100%)
                </span>
              </div>
            </div>
          </>
        );
      })()}

      {abaAtiva === 'mudancas' && (
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Relatório de Mudanças</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
              Títulos criados ou alterados em um período (via API Sienge /bills/by-change-date)
            </p>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg bg-white dark:bg-slate-800 p-4 shadow">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Data Início</label>
              <input
                type="date"
                value={mudancasDataInicio}
                onChange={(e) => setMudancasDataInicio(e.target.value)}
                className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Data Fim</label>
              <input
                type="date"
                value={mudancasDataFim}
                onChange={(e) => setMudancasDataFim(e.target.value)}
                className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                setMudancasLoading(true);
                try {
                  const dados = await apiService.getTitulosAlterados(mudancasDataInicio, mudancasDataFim);
                  setMudancasResultados(dados);
                } catch (err) {
                  console.error('Erro ao buscar mudanças:', err);
                  setMudancasResultados([]);
                } finally {
                  setMudancasLoading(false);
                }
              }}
              disabled={mudancasLoading}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50"
            >
              {mudancasLoading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {mudancasResultados.length > 0 && (
            <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 p-3">
              <p className="text-sm font-medium text-blue-800">
                {mudancasResultados.length} título(s) encontrado(s) | Total: {formatCurrency(mudancasResultados.reduce((acc, t) => acc + (t.totalInvoiceAmount || 0), 0))}
              </p>
            </div>
          )}

          {mudancasLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
              <span className="ml-3 text-gray-600 dark:text-slate-400">Buscando alterações...</span>
            </div>
          ) : mudancasResultados.length > 0 ? (
            <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-800 shadow">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-blue-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">Título</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">Credor</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">Valor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">Alterado por</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">Data Alteração</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">Cadastrado por</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">Data Cadastro</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">Doc</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">Origem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:bg-slate-800">
                    {mudancasResultados.map((t, idx) => {
                      const isCriado = t.registeredDate && t.changedDate && t.registeredDate.split('T')[0] === t.changedDate.split('T')[0];
                      return (
                        <tr key={`${t.id}-${idx}`} className={`hover:bg-gray-50 dark:bg-slate-900 ${isCriado ? 'bg-green-50' : 'bg-yellow-50'}`}>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${isCriado ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                              {isCriado ? 'Criado' : 'Alterado'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-100">{t.id}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{t.creditorName || `Credor ${t.creditorId}`}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-slate-100">{formatCurrency(t.totalInvoiceAmount || 0)}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{t.changedBy || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{t.changedDate ? new Date(t.changedDate).toLocaleString('pt-BR') : '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{t.registeredBy || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{t.registeredDate ? new Date(t.registeredDate).toLocaleString('pt-BR') : '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{t.documentNumber || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{t.originId || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-white dark:bg-slate-800 p-8 text-center shadow">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-slate-100">Selecione um período e clique em Buscar</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Os títulos criados ou alterados no período serão exibidos aqui.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

