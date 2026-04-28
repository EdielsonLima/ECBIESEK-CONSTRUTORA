import React, { useEffect, useMemo, useState } from 'react';
import { apiService } from '../services/api';
import { SearchableMultiSelect } from '../components/SearchableMultiSelect';
import {
  PedidoCompra,
  PedidosCompraFiltros,
  PedidosCompraResponse,
  ItemPedidoCompra,
  FiltrosPedidoCompraQuery,
  PainelPedidosCompra,
} from '../types';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  Clock,
  Package,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  Search,
  X,
  ShieldCheck,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  SlidersHorizontal,
  AlertTriangle,
  Clock3,
  CheckCircle,
  HelpCircle,
  LayoutList,
  PieChart as PieIcon,
  Building2,
  Truck,
  Users,
  Calendar,
} from 'lucide-react';

type SortKey =
  | 'numero_pedido'
  | 'data_pedido'
  | 'nome_fornecedor'
  | 'nome_centro_custo'
  | 'proxima_entrega'
  | 'prazo_entrega'
  | 'urgencia'
  | 'valor_total'
  | 'status'
  | 'autorizacao';
type SortOrder = 'asc' | 'desc';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  PARTIALLY_DELIVERED: 'Parc. Entregue',
  FULLY_DELIVERED: 'Entregue',
  CANCELED: 'Cancelado',
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-orange-100 text-orange-700 border-orange-200',
  PARTIALLY_DELIVERED: 'bg-blue-100 text-blue-700 border-blue-200',
  FULLY_DELIVERED: 'bg-green-100 text-green-700 border-green-200',
  CANCELED: 'bg-gray-200 text-gray-600 border-gray-300',
};

function fmtMoeda(v: number | null | undefined): string {
  if (v == null) return 'R$ 0,00';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(d: string | null | undefined): string {
  if (!d) return '-';
  const dt = parseDataLocal(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('pt-BR');
}

function parseDataLocal(d: string): Date {
  return new Date(d.includes('T') ? d : d + 'T12:00:00');
}

function calcularPrazoEntrega(dataPedido: string | null | undefined, proximaEntrega: string | null | undefined): number | null {
  if (!dataPedido || !proximaEntrega) return null;
  const inicio = parseDataLocal(dataPedido);
  const fim = parseDataLocal(proximaEntrega);
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return null;
  inicio.setHours(0, 0, 0, 0);
  fim.setHours(0, 0, 0, 0);
  return Math.round((fim.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000));
}

interface UrgenciaInfo {
  dias: number;
  texto: string;
  classe: string;
}

function calcularUrgencia(dataIso: string | null | undefined): UrgenciaInfo | null {
  if (!dataIso) return null;
  const dt = parseDataLocal(dataIso);
  if (isNaN(dt.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dt);
  alvo.setHours(0, 0, 0, 0);
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));

  if (dias < 0) {
    const abs = Math.abs(dias);
    return {
      dias,
      texto: `Atrasado ${abs} dia${abs === 1 ? '' : 's'}`,
      classe: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700',
    };
  }
  if (dias === 0) {
    return { dias, texto: 'Hoje', classe: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300' };
  }
  if (dias === 1) {
    return { dias, texto: 'Amanhã', classe: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300' };
  }
  if (dias <= 7) {
    return { dias, texto: `em ${dias} dias`, classe: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300' };
  }
  if (dias <= 30) {
    return { dias, texto: `em ${dias} dias`, classe: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300' };
  }
  return { dias, texto: `em ${dias} dias`, classe: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400' };
}

export const PedidosCompra: React.FC = () => {
  const [pedidos, setPedidos] = useState<PedidoCompra[]>([]);
  const [kpis, setKpis] = useState<PedidosCompraResponse['kpis'] | null>(null);
  const [filtrosDisponiveis, setFiltrosDisponiveis] = useState<PedidosCompraFiltros | null>(null);
  const [loading, setLoading] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensagemSync, setMensagemSync] = useState<string | null>(null);

  // Filtros
  const [filtroEmpresa, setFiltroEmpresa] = useState<(number | string)[]>([]);
  const [filtroCC, setFiltroCC] = useState<(number | string)[]>([]);
  const [filtroFornecedor, setFiltroFornecedor] = useState<(number | string)[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<(number | string)[]>([]);
  const [filtroAno, setFiltroAno] = useState<number | ''>('');
  const [filtroAutorizacao, setFiltroAutorizacao] = useState<'todos' | 'autorizados' | 'aguardando' | 'negados'>('todos');
  const [busca, setBusca] = useState('');

  // Expansão
  const [expandido, setExpandido] = useState<number | null>(null);
  const [itensCache, setItensCache] = useState<Record<number, ItemPedidoCompra[]>>({});
  const [itensLoading, setItensLoading] = useState<number | null>(null);
  const [autorizando, setAutorizando] = useState<number | null>(null);

  // Modal de confirmação de autorização
  const [pedidoParaAutorizar, setPedidoParaAutorizar] = useState<PedidoCompra | null>(null);
  const [textoConfirmacao, setTextoConfirmacao] = useState('');

  // Mostrar/ocultar filtros + ordenação
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('data_pedido');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Abas
  const [abaAtiva, setAbaAtiva] = useState<'lista' | 'painel'>('lista');
  const [painel, setPainel] = useState<PainelPedidosCompra | null>(null);
  const [painelLoading, setPainelLoading] = useState(false);
  const [painelStatusModo, setPainelStatusModo] = useState<'valor' | 'qtd'>('valor');

  const filtrosQuery: FiltrosPedidoCompraQuery = useMemo(() => ({
    empresa: filtroEmpresa.map(Number),
    centro_custo: filtroCC.map(Number),
    fornecedor: filtroFornecedor.map(Number),
    status: filtroStatus.map(String),
    ano: filtroAno || undefined,
    autorizacao: filtroAutorizacao,
    busca: busca.trim() || undefined,
    limite: 500,
  }), [filtroEmpresa, filtroCC, filtroFornecedor, filtroStatus, filtroAno, filtroAutorizacao, busca]);

  // Carrega filtros uma vez
  useEffect(() => {
    apiService.getFiltrosPedidosCompra().then(setFiltrosDisponiveis).catch(() => {});
  }, []);

  const carregarLista = () => {
    setLoading(true);
    return apiService.getPedidosCompra(filtrosQuery)
      .then(r => { setPedidos(r.data); setKpis(r.kpis); })
      .catch(() => { setPedidos([]); setKpis(null); })
      .finally(() => setLoading(false));
  };

  const carregarPainel = () => {
    setPainelLoading(true);
    return apiService.getPainelPedidosCompra(filtrosQuery)
      .then(setPainel)
      .catch(() => setPainel(null))
      .finally(() => setPainelLoading(false));
  };

  // Carrega lista (com debounce na busca)
  useEffect(() => {
    const t = setTimeout(() => {
      carregarLista();
    }, 350);
    return () => clearTimeout(t);
  }, [filtrosQuery]);

  // Carrega painel quando a aba esta ativa
  useEffect(() => {
    if (abaAtiva !== 'painel') return;
    const t = setTimeout(() => {
      carregarPainel();
    }, 350);
    return () => clearTimeout(t);
  }, [abaAtiva, filtrosQuery]);

  const recarregar = () => {
    carregarLista();
    if (abaAtiva === 'painel') {
      carregarPainel();
    }
    apiService.getFiltrosPedidosCompra().then(setFiltrosDisponiveis).catch(() => {});
  };

  const sincronizar = async () => {
    setSincronizando(true);
    setMensagemSync('Iniciando sincronização...');
    try {
      const r = await apiService.sincronizarPedidosCompra({ periodo_dias: 90 });
      console.log('[PedidosCompra] Resposta sync:', r);
      const totalSienge = r.total ?? 0;
      const novos = r.novos ?? 0;
      const atualizados = r.atualizados ?? 0;
      if (totalSienge === 0) {
        setMensagemSync(`Sincronização rodou mas o Sienge retornou 0 pedidos no período. (Período: ${r.periodo?.inicio} → ${r.periodo?.fim})`);
      } else {
        const cron = (r as any).cronogramas_carregados ?? 0;
        const abertos = (r as any).abertos_pre_carregados ?? 0;
        setMensagemSync(`OK - ${totalSienge} pedidos (${novos} novos + ${atualizados} atualizados). Cronograma carregado para ${abertos} pedido(s) abertos (${cron} entregas). Duração: ${r.duracao_segundos}s.`);
      }
      recarregar();
    } catch (e: any) {
      const detalhe = e?.response?.data?.detail || e?.response?.data || e?.message || 'desconhecido';
      console.error('[PedidosCompra] Erro sync:', e);
      setMensagemSync(`Erro ao sincronizar: ${typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe)}`);
    } finally {
      setSincronizando(false);
    }
  };

  const recalcularProximaEntrega = (idPedido: number, itens: ItemPedidoCompra[]) => {
    let minDate: string | null = null;
    let qtdPendentes = 0;
    for (const it of itens) {
      for (const e of (it.entregas || [])) {
        if ((e.quantidade_aberta || 0) > 0 && e.data_prevista) {
          qtdPendentes++;
          if (!minDate || e.data_prevista < minDate) {
            minDate = e.data_prevista;
          }
        }
      }
    }
    setPedidos(prev => prev.map(p => p.id_pedido === idPedido
      ? { ...p, proxima_entrega: minDate, _qtd_entregas_pendentes: qtdPendentes } as any
      : p));
  };

  const carregarItens = async (idPedido: number) => {
    setItensLoading(idPedido);
    try {
      const r = await apiService.getItensPedidoCompra(idPedido);
      setItensCache(prev => ({ ...prev, [idPedido]: r.itens }));
      recalcularProximaEntrega(idPedido, r.itens);
    } catch {
      setItensCache(prev => ({ ...prev, [idPedido]: [] }));
    } finally {
      setItensLoading(null);
    }
  };

  const expandir = async (idPedido: number) => {
    if (expandido === idPedido) {
      setExpandido(null);
      return;
    }
    setExpandido(idPedido);
    if (!itensCache[idPedido]) {
      await carregarItens(idPedido);
    }
  };

  const atualizarPedido = async (idPedido: number, e: React.MouseEvent) => {
    e.stopPropagation();
    // Limpa cache para forçar re-fetch do Sienge
    setItensCache(prev => {
      const novo = { ...prev };
      delete novo[idPedido];
      return novo;
    });
    await carregarItens(idPedido);
  };

  const solicitarAutorizacao = (pedido: PedidoCompra) => {
    setPedidoParaAutorizar(pedido);
    setTextoConfirmacao('');
  };

  const cancelarAutorizacao = () => {
    setPedidoParaAutorizar(null);
    setTextoConfirmacao('');
  };

  const confirmarAutorizacao = async () => {
    if (!pedidoParaAutorizar) return;
    const idPedido = pedidoParaAutorizar.id_pedido;
    setAutorizando(idPedido);
    try {
      await apiService.autorizarPedidoCompra(idPedido);
      setPedidos(prev => prev.map(p => p.id_pedido === idPedido ? { ...p, autorizado: true } : p));
      cancelarAutorizacao();
    } catch (e: any) {
      alert(`Falha ao autorizar: ${e?.message || e}`);
    } finally {
      setAutorizando(null);
    }
  };

  const limparFiltros = () => {
    setFiltroEmpresa([]); setFiltroCC([]); setFiltroFornecedor([]);
    setFiltroStatus([]); setFiltroAno(''); setFiltroAutorizacao('todos'); setBusca('');
  };

  const haFiltrosAtivos = filtroEmpresa.length || filtroCC.length || filtroFornecedor.length
    || filtroStatus.length || filtroAno || filtroAutorizacao !== 'todos' || busca.trim();

  const filtrosAtivos = useMemo(() => {
    const arr: string[] = [];
    if (busca.trim()) arr.push(`Busca: "${busca}"`);
    filtroCC.forEach(id => {
      const cc = filtrosDisponiveis?.centros_custo.find(c => c.id === Number(id));
      if (cc) arr.push(`CC: ${cc.nome}`);
    });
    filtroFornecedor.forEach(id => {
      const f = filtrosDisponiveis?.fornecedores.find(c => c.id === Number(id));
      if (f) arr.push(`Forn.: ${f.nome}`);
    });
    filtroStatus.forEach(s => {
      arr.push(`Status: ${STATUS_LABEL[String(s)] || s}`);
    });
    if (filtroAno) arr.push(`Ano: ${filtroAno}`);
    if (filtroAutorizacao !== 'todos') {
      const lbl: Record<string, string> = { autorizados: 'Autorizados', aguardando: 'Aguardando', negados: 'Negados' };
      arr.push(`Aut.: ${lbl[filtroAutorizacao] || filtroAutorizacao}`);
    }
    return arr;
  }, [busca, filtroCC, filtroFornecedor, filtroStatus, filtroAno, filtroAutorizacao, filtrosDisponiveis]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const pedidosOrdenados = useMemo(() => {
    const arr = [...pedidos];
    const dir = sortOrder === 'asc' ? 1 : -1;
    const valor = (p: PedidoCompra): any => {
      switch (sortKey) {
        case 'numero_pedido': return p.numero_pedido || String(p.id_pedido);
        case 'data_pedido': return p.data_pedido || '';
        case 'nome_fornecedor': return (p.nome_fornecedor || '').toLowerCase();
        case 'nome_centro_custo': return (p.nome_centro_custo || '').toLowerCase();
        case 'proxima_entrega': return p.proxima_entrega || '9999-99-99';
        case 'prazo_entrega': return calcularPrazoEntrega(p.data_pedido, p.proxima_entrega) ?? 99999;
        case 'urgencia': {
          if (!p.proxima_entrega) return 99999;
          const u = calcularUrgencia(p.proxima_entrega);
          return u ? u.dias : 99999;
        }
        case 'valor_total': return Number(p.valor_total || 0);
        case 'status': return p.status || '';
        case 'autorizacao': {
          if (p.autorizado) return 2;
          if (p.reprovado) return 0;
          return 1;
        }
        default: return '';
      }
    };
    arr.sort((a, b) => {
      const va = valor(a), vb = valor(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return arr;
  }, [pedidos, sortKey, sortOrder]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-md">
            <ShoppingCart className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Pedidos de Compra</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">Controle de pedidos pendentes, parciais e entregues</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              if (!confirm('Recriar tabelas? Vai apagar dados sincronizados (deve ser usado se houver erro de schema).')) return;
              try {
                const r = await apiService.rebuildPedidosCompraSchema();
                setMensagemSync(`Schema recriado: ${r.mensagem}`);
              } catch (e: any) {
                const det = e?.response?.data?.detail || e?.message || 'erro';
                setMensagemSync(`Falha rebuild: ${det}`);
              }
            }}
            className="flex items-center gap-1 rounded-lg bg-amber-100 hover:bg-amber-200 px-3 py-2 text-amber-800 text-xs font-semibold border border-amber-200"
            title="Recriar tabelas do zero (caso de erro de schema)"
          >
            Rebuild Schema
          </button>
          <button
            type="button"
            onClick={sincronizar}
            disabled={sincronizando}
            className="flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-2 text-white text-sm font-semibold shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-4 w-4 ${sincronizando ? 'animate-spin' : ''}`} />
            {sincronizando ? 'Sincronizando...' : 'Sincronizar Sienge'}
          </button>
        </div>
      </div>

      {mensagemSync && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
          {mensagemSync}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          titulo="Pendentes"
          valor={kpis?.pendente.valor || 0}
          qtd={kpis?.pendente.qtd || 0}
          icone={<Clock className="h-6 w-6" />}
          cor="orange"
        />
        <KpiCard
          titulo="Parcialmente Entregues"
          valor={kpis?.parcialmente_entregue.valor || 0}
          qtd={kpis?.parcialmente_entregue.qtd || 0}
          icone={<Package className="h-6 w-6" />}
          cor="blue"
        />
        <KpiCard
          titulo="Totalmente Entregues"
          valor={kpis?.totalmente_entregue.valor || 0}
          qtd={kpis?.totalmente_entregue.qtd || 0}
          icone={<CheckCircle2 className="h-6 w-6" />}
          cor="green"
        />
      </div>

      {/* Filtros (colapsavel) */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300">Filtros</h3>
          <div className="flex items-center gap-2">
            {haFiltrosAtivos && (
              <button onClick={limparFiltros} className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1">
                <X className="h-3 w-3" /> Limpar todos
              </button>
            )}
            <button
              type="button"
              onClick={() => setMostrarFiltros(!mostrarFiltros)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-2 text-white text-sm font-semibold"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
              {filtrosAtivos.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-600">
                  {filtrosAtivos.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Chips de filtros ativos quando colapsado */}
        {!mostrarFiltros && filtrosAtivos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {filtrosAtivos.map((f, i) => (
              <span key={i} className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 px-3 py-1 text-xs font-medium text-blue-800 dark:text-blue-200">
                {f}
              </span>
            ))}
          </div>
        )}

        {/* Painel de filtros aberto */}
        {mostrarFiltros && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar pedido, fornecedor..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200"
              />
            </div>

            <SearchableMultiSelect
              label="Centro de Custo"
              options={(filtrosDisponiveis?.centros_custo || []).map(c => ({
                id: c.id,
                nome: c.codigo ? `${c.codigo} - ${c.nome}` : c.nome,
              }))}
              value={filtroCC}
              onChange={setFiltroCC}
              placeholder="Todos"
            />

            <SearchableMultiSelect
              label="Fornecedor"
              options={(filtrosDisponiveis?.fornecedores || []).map(f => ({ id: f.id, nome: f.nome }))}
              value={filtroFornecedor}
              onChange={setFiltroFornecedor}
              placeholder="Todos"
            />

            <SearchableMultiSelect
              label="Status"
              options={(filtrosDisponiveis?.status || []).map(s => ({ id: s, nome: STATUS_LABEL[s] || s }))}
              value={filtroStatus}
              onChange={setFiltroStatus}
              placeholder="Todos"
            />

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Ano</label>
              <select
                value={filtroAno}
                onChange={e => setFiltroAno(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200"
              >
                <option value="">Todos</option>
                {(filtrosDisponiveis?.anos || []).map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Autorização</label>
              <select
                value={filtroAutorizacao}
                onChange={e => setFiltroAutorizacao(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200"
              >
                <option value="todos">Todos</option>
                <option value="autorizados">Autorizados</option>
                <option value="aguardando">Aguardando</option>
                <option value="negados">Negados</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-slate-700">
        <nav className="-mb-px flex gap-6">
          <button
            type="button"
            onClick={() => setAbaAtiva('lista')}
            className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              abaAtiva === 'lista'
                ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
            }`}
          >
            <LayoutList className="h-4 w-4" />
            Lista de Pedidos
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva('painel')}
            className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              abaAtiva === 'painel'
                ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
            }`}
          >
            <PieIcon className="h-4 w-4" />
            Painel Visual
          </button>
        </nav>
      </div>

      {abaAtiva === 'painel' && (
        <PainelVisualSection
          painel={painel}
          loading={painelLoading}
          modoStatus={painelStatusModo}
          setModoStatus={setPainelStatusModo}
        />
      )}

      {/* Tabela */}
      {abaAtiva === 'lista' && (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800 dark:text-slate-200">Lista de Pedidos</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {loading ? 'Carregando...' : `${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-900 text-xs uppercase tracking-wider text-gray-600 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <SortHeader label="N° Pedido" k="numero_pedido" sortKey={sortKey} sortOrder={sortOrder} onSort={toggleSort} />
                <SortHeader label="Data" k="data_pedido" sortKey={sortKey} sortOrder={sortOrder} onSort={toggleSort} />
                <SortHeader label="Fornecedor" k="nome_fornecedor" sortKey={sortKey} sortOrder={sortOrder} onSort={toggleSort} />
                <SortHeader label="Obra / CC" k="nome_centro_custo" sortKey={sortKey} sortOrder={sortOrder} onSort={toggleSort} />
                <SortHeader label="Próx. Entrega" k="proxima_entrega" sortKey={sortKey} sortOrder={sortOrder} onSort={toggleSort} />
                <SortHeader label="Prazo Entrega" k="prazo_entrega" sortKey={sortKey} sortOrder={sortOrder} onSort={toggleSort} align="center" />
                <SortHeader label="Urgência" k="urgencia" sortKey={sortKey} sortOrder={sortOrder} onSort={toggleSort} />
                <SortHeader label="Valor" k="valor_total" sortKey={sortKey} sortOrder={sortOrder} onSort={toggleSort} align="right" />
                <SortHeader label="Status" k="status" sortKey={sortKey} sortOrder={sortOrder} onSort={toggleSort} align="center" />
                <SortHeader label="Autorização" k="autorizacao" sortKey={sortKey} sortOrder={sortOrder} onSort={toggleSort} align="center" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {pedidosOrdenados.map(p => (
                <React.Fragment key={p.id_pedido}>
                  <tr className="hover:bg-gray-50 dark:hover:bg-slate-700/40 cursor-pointer" onClick={() => expandir(p.id_pedido)}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {expandido === p.id_pedido
                          ? <ChevronDown className="h-4 w-4 text-gray-500" />
                          : <ChevronRight className="h-4 w-4 text-gray-400" />}
                        {(!p.proxima_entrega && p.status !== 'FULLY_DELIVERED' && p.status !== 'CANCELED') && (
                          <button
                            type="button"
                            onClick={(e) => atualizarPedido(p.id_pedido, e)}
                            className="text-blue-500 hover:text-blue-700 p-0.5 rounded"
                            title="Buscar cronograma do Sienge para este pedido"
                          >
                            <RefreshCw className={`h-3 w-3 ${itensLoading === p.id_pedido ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-800 dark:text-slate-200">
                      {p.numero_pedido || p.id_pedido}
                    </td>
                    <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{fmtData(p.data_pedido)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{p.nome_fornecedor || `# ${p.id_fornecedor || '-'}`}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{p.nome_centro_custo || '-'}</td>
                    <td className="px-3 py-2">
                      <ProximaEntregaCelula data={p.proxima_entrega} qtdPendentes={(p as any)._qtd_entregas_pendentes} status={p.status} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <PrazoEntregaCelula dataPedido={p.data_pedido} proximaEntrega={p.proxima_entrega} />
                    </td>
                    <td className="px-3 py-2">
                      <UrgenciaCelula data={p.proxima_entrega} status={p.status} />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-slate-200">{fmtMoeda(p.valor_total)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_BADGE[p.status || ''] || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[p.status || ''] || p.status || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {p.autorizado ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-green-100 text-green-700 border-green-200">
                          <ShieldCheck className="h-3 w-3" /> Autorizado
                        </span>
                      ) : p.reprovado ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border bg-red-100 text-red-700 border-red-200">
                          Negado
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-200">
                          Aguardando
                        </span>
                      )}
                    </td>
                  </tr>
                  {expandido === p.id_pedido && (
                    <tr className="bg-slate-50 dark:bg-slate-900/50">
                      <td colSpan={11} className="px-6 py-4">
                        <DetalhePedido
                          pedido={p}
                          itens={itensCache[p.id_pedido]}
                          loading={itensLoading === p.id_pedido}
                          onAutorizar={() => solicitarAutorizacao(p)}
                          autorizando={autorizando === p.id_pedido}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {!loading && pedidos.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-slate-400">
                    Nenhum pedido encontrado. Clique em "Sincronizar Sienge" para importar dados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Modal de confirmação de autorização */}
      {pedidoParaAutorizar && (
        <ModalAutorizar
          pedido={pedidoParaAutorizar}
          textoConfirmacao={textoConfirmacao}
          onChangeTexto={setTextoConfirmacao}
          autorizando={autorizando === pedidoParaAutorizar.id_pedido}
          onCancelar={cancelarAutorizacao}
          onConfirmar={confirmarAutorizacao}
        />
      )}
    </div>
  );
};

// ----------- Modal de Confirmacao de Autorizacao -----------

const ModalAutorizar: React.FC<{
  pedido: PedidoCompra;
  textoConfirmacao: string;
  onChangeTexto: (s: string) => void;
  autorizando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}> = ({ pedido, textoConfirmacao, onChangeTexto, autorizando, onCancelar, onConfirmar }) => {
  const habilitado = textoConfirmacao.trim().toUpperCase() === 'AUTORIZAR' && !autorizando;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onCancelar}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6" />
            <div>
              <h3 className="text-lg font-bold">Confirmar Autorização</h3>
              <p className="text-xs text-amber-100">Esta ação será replicada no Sienge</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Pedido:</span>
              <span className="font-bold font-mono text-gray-800 dark:text-slate-200">
                {pedido.numero_pedido || pedido.id_pedido}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Fornecedor:</span>
              <span className="font-semibold text-right text-gray-800 dark:text-slate-200">
                {pedido.nome_fornecedor || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Obra / CC:</span>
              <span className="font-semibold text-right text-gray-800 dark:text-slate-200">
                {pedido.nome_centro_custo || '-'}
              </span>
            </div>
            <div className="flex justify-between border-t border-gray-200 dark:border-slate-700 pt-2 mt-2">
              <span className="text-gray-500 dark:text-slate-400">Valor Total:</span>
              <span className="font-extrabold text-base text-emerald-600 dark:text-emerald-400">
                {fmtMoeda(pedido.valor_total)}
              </span>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200">
            <strong>Atenção:</strong> ao autorizar, o pedido será aprovado diretamente no Sienge e o fornecedor poderá iniciar a entrega. Esta ação não pode ser desfeita pelo dashboard.
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
              Para confirmar, digite <span className="font-mono bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded">AUTORIZAR</span>
            </label>
            <input
              type="text"
              value={textoConfirmacao}
              onChange={e => onChangeTexto(e.target.value)}
              placeholder="Digite AUTORIZAR"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-2 border-t border-gray-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onCancelar}
            disabled={autorizando}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={!habilitado}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-md transition-all ${
              habilitado
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
            }`}
          >
            {autorizando ? 'Autorizando...' : 'Confirmar Autorização'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------- Cabecalho com sort -----------

const SortHeader: React.FC<{
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortOrder: SortOrder;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right' | 'center';
}> = ({ label, k, sortKey, sortOrder, onSort, align = 'left' }) => {
  const ativo = sortKey === k;
  const alignClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  return (
    <th
      className={`px-3 py-2 text-${align} cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors`}
      onClick={() => onSort(k)}
    >
      <div className={`flex items-center gap-1 ${alignClass}`}>
        <span>{label}</span>
        {ativo
          ? (sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </div>
    </th>
  );
};

// ----------- Celula Proxima Entrega (so a data) -----------

const ProximaEntregaCelula: React.FC<{
  data: string | null | undefined;
  qtdPendentes?: number;
  status: string | null | undefined;
}> = ({ data, qtdPendentes, status }) => {
  if (status === 'FULLY_DELIVERED') {
    return <span className="text-xs text-green-600 dark:text-green-400 font-semibold">✓ Concluído</span>;
  }
  if (status === 'CANCELED') {
    return <span className="text-xs text-gray-400">Cancelado</span>;
  }
  if (!data) {
    return <span className="text-xs text-gray-400" title="Cronograma ainda não carregado — expanda o pedido para puxar do Sienge">-</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 leading-tight">
      <span className="text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">{fmtData(data)}</span>
      {qtdPendentes && qtdPendentes > 1 ? (
        <span className="text-[10px] text-gray-500 dark:text-slate-400">+{qtdPendentes - 1} entrega{qtdPendentes - 1 === 1 ? '' : 's'} pend.</span>
      ) : null}
    </div>
  );
};

const PrazoEntregaCelula: React.FC<{
  dataPedido: string | null | undefined;
  proximaEntrega: string | null | undefined;
}> = ({ dataPedido, proximaEntrega }) => {
  const dias = calcularPrazoEntrega(dataPedido, proximaEntrega);
  if (dias == null) {
    return <span className="text-sm text-gray-400 dark:text-slate-500">-</span>;
  }

  const classe = dias < 0
    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
    : dias === 0
      ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
      : dias <= 7
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
        : dias <= 30
          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
          : 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-300';

  return (
    <span
      className={`inline-flex min-w-[62px] justify-center rounded-full border px-2 py-0.5 text-xs font-semibold ${classe}`}
      title="Dias corridos entre a data do pedido e a próxima entrega prevista"
    >
      {dias} dia{dias === 1 ? '' : 's'}
    </span>
  );
};

// ----------- Celula de Urgencia (badge separado, ordenavel) -----------

const UrgenciaCelula: React.FC<{
  data: string | null | undefined;
  status: string | null | undefined;
}> = ({ data, status }) => {
  if (status === 'FULLY_DELIVERED' || status === 'CANCELED') {
    return <span className="text-xs text-gray-300">-</span>;
  }
  if (!data) return <span className="text-xs text-gray-300">-</span>;
  const urg = calcularUrgencia(data);
  if (!urg) return <span className="text-xs text-gray-300">-</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${urg.classe}`}>
      {urg.texto}
    </span>
  );
};

// ============================================================
// ----------- PAINEL VISUAL: secao completa -----------
// ============================================================

const STATUS_CORES: Record<string, string> = {
  PENDING: '#F59E0B',
  PARTIALLY_DELIVERED: '#3B82F6',
  FULLY_DELIVERED: '#10B981',
  CANCELED: '#9CA3AF',
};

const PainelVisualSection: React.FC<{
  painel: PainelPedidosCompra | null;
  loading: boolean;
  modoStatus: 'valor' | 'qtd';
  setModoStatus: (m: 'valor' | 'qtd') => void;
}> = ({ painel, loading, modoStatus, setModoStatus }) => {
  if (loading && !painel) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-12 text-center text-sm text-gray-500 dark:text-slate-400">
        Carregando painel...
      </div>
    );
  }
  if (!painel) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-12 text-center text-sm text-gray-500 dark:text-slate-400">
        Sem dados para exibir. Sincronize os pedidos com o Sienge primeiro.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Semaforos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SemaforoCard
          titulo="Em Atraso"
          valor={painel.semaforos.atrasados.valor}
          qtd={painel.semaforos.atrasados.qtd}
          icone={<AlertTriangle className="h-6 w-6" />}
          cor="red"
        />
        <SemaforoCard
          titulo="Vencendo (7 dias)"
          valor={painel.semaforos.vencendo_7d.valor}
          qtd={painel.semaforos.vencendo_7d.qtd}
          icone={<Clock3 className="h-6 w-6" />}
          cor="amber"
        />
        <SemaforoCard
          titulo="No Prazo"
          valor={painel.semaforos.no_prazo.valor}
          qtd={painel.semaforos.no_prazo.qtd}
          icone={<CheckCircle className="h-6 w-6" />}
          cor="green"
        />
        <SemaforoCard
          titulo="Sem cronograma"
          valor={painel.semaforos.sem_data.valor}
          qtd={painel.semaforos.sem_data.qtd}
          icone={<HelpCircle className="h-6 w-6" />}
          cor="gray"
        />
      </div>

      {/* Aguardando autorizacao */}
      {painel.aguardando_autorizacao.qtd > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Aguardando Autorização</p>
                <p className="mt-1 text-2xl font-extrabold text-gray-900 dark:text-slate-100">
                  {fmtMoeda(painel.aguardando_autorizacao.valor)}
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  {painel.aguardando_autorizacao.qtd} pedido{painel.aguardando_autorizacao.qtd === 1 ? '' : 's'} esperando aprovação
                </p>
              </div>
            </div>
          </div>
          {painel.aguardando_autorizacao.top_pedidos.length > 0 && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              {painel.aguardando_autorizacao.top_pedidos.slice(0, 10).map(p => (
                <div key={p.id_pedido} className="flex items-center justify-between gap-3 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-700">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-gray-800 dark:text-slate-200">{p.numero_pedido || `#${p.id_pedido}`}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-600 dark:text-slate-400 truncate">{p.fornecedor || '-'}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">{p.centro_custo || '-'}</p>
                  </div>
                  <span className="text-sm font-bold text-amber-700 dark:text-amber-400 flex-shrink-0">{fmtMoeda(p.valor_total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Acao Urgente — pedidos atrasados */}
      {painel.semaforos.atrasados.top.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-red-200 dark:border-red-800 overflow-hidden">
          <div className="px-4 py-3 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-bold text-red-700 dark:text-red-400">Ação Urgente — Top 10 Pedidos Atrasados</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-900 text-xs uppercase tracking-wider text-gray-600 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">N°</th>
                  <th className="px-3 py-2 text-left">Fornecedor</th>
                  <th className="px-3 py-2 text-left">Obra</th>
                  <th className="px-3 py-2 text-left">Próx. Entrega</th>
                  <th className="px-3 py-2 text-center">Atraso</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {painel.semaforos.atrasados.top.map(p => (
                  <tr key={p.id_pedido} className="hover:bg-red-50/30 dark:hover:bg-red-900/20">
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-800 dark:text-slate-200">{p.numero_pedido || p.id_pedido}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{p.fornecedor || '-'}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{p.centro_custo || '-'}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{fmtData(p.proxima_entrega)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300">
                        {p.dias_atraso} dia{p.dias_atraso === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-slate-200">{fmtMoeda(p.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Graficos linha 1: Donut Status + Top Fornecedores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-gray-600 dark:text-slate-400" />
              <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300">Distribuição por Status</h3>
            </div>
            <div className="inline-flex bg-gray-100 dark:bg-slate-900 rounded-lg p-1 text-xs">
              <button
                type="button"
                onClick={() => setModoStatus('valor')}
                className={`px-2 py-1 rounded ${modoStatus === 'valor' ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 shadow-sm font-semibold' : 'text-gray-500'}`}
              >
                Por valor
              </button>
              <button
                type="button"
                onClick={() => setModoStatus('qtd')}
                className={`px-2 py-1 rounded ${modoStatus === 'qtd' ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 shadow-sm font-semibold' : 'text-gray-500'}`}
              >
                Por quantidade
              </button>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={painel.por_status.map(s => ({
                    name: STATUS_LABEL[s.status] || s.status,
                    statusKey: s.status,
                    value: modoStatus === 'valor' ? s.valor : s.qtd,
                  }))}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  label={(entry: any) => entry.name}
                >
                  {painel.por_status.map((s, i) => (
                    <Cell key={i} fill={STATUS_CORES[s.status] || '#9CA3AF'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any) => modoStatus === 'valor' ? fmtMoeda(Number(v)) : `${v} pedidos`}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-gray-600 dark:text-slate-400" />
            <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300">Top Fornecedores em Aberto</h3>
          </div>
          <div className="h-72">
            {painel.top_fornecedores.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={painel.top_fornecedores.slice().reverse().map(f => ({
                    nome: f.nome.length > 20 ? f.nome.slice(0, 20) + '...' : f.nome,
                    nomeCompleto: f.nome,
                    valor: f.valor_pendente,
                    qtd: f.qtd_pedidos,
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} fontSize={10} />
                  <YAxis type="category" dataKey="nome" width={140} fontSize={10} />
                  <Tooltip
                    formatter={(v: any, _n: string, p: any) => [
                      fmtMoeda(Number(v)) + ` (${p.payload.qtd} pedido${p.payload.qtd === 1 ? '' : 's'})`,
                      p.payload.nomeCompleto,
                    ]}
                    labelFormatter={() => ''}
                  />
                  <Bar dataKey="valor" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">Nenhum dado</div>
            )}
          </div>
        </div>
      </div>

      {/* Graficos linha 2: Entregas 30d + Por Centro de Custo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="h-4 w-4 text-gray-600 dark:text-slate-400" />
            <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300">Entregas Previstas — Próximos 30 dias</h3>
          </div>
          <div className="h-72">
            {painel.entregas_30d.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={painel.entregas_30d.map(e => {
                    const urg = e.data ? calcularUrgencia(e.data) : null;
                    let cor = '#10B981';
                    if (urg) {
                      if (urg.dias < 0) cor = '#EF4444';
                      else if (urg.dias <= 7) cor = '#F59E0B';
                    }
                    return {
                      data: e.data ? new Date(e.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '-',
                      valor: e.valor,
                      qtd: e.qtd,
                      cor,
                    };
                  })}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="data" fontSize={10} angle={-45} textAnchor="end" height={50} />
                  <YAxis tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} fontSize={10} />
                  <Tooltip
                    formatter={(v: any, _n: string, p: any) => [
                      fmtMoeda(Number(v)) + ` · ${p.payload.qtd} pedido${p.payload.qtd === 1 ? '' : 's'}`,
                      'Entrega prevista',
                    ]}
                  />
                  <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                    {painel.entregas_30d.map((e, i) => {
                      const urg = e.data ? calcularUrgencia(e.data) : null;
                      let cor = '#10B981';
                      if (urg) {
                        if (urg.dias < 0) cor = '#EF4444';
                        else if (urg.dias <= 7) cor = '#F59E0B';
                      }
                      return <Cell key={i} fill={cor} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">Sem entregas previstas no período</div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-gray-600 dark:text-slate-400" />
            <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300">Top Obras / Centros de Custo (em aberto)</h3>
          </div>
          <div className="h-72">
            {painel.por_centro_custo.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={painel.por_centro_custo.slice().reverse().map(c => ({
                    nome: c.nome.length > 25 ? c.nome.slice(0, 25) + '...' : c.nome,
                    nomeCompleto: c.nome,
                    valor: c.valor,
                    qtd: c.qtd,
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} fontSize={10} />
                  <YAxis type="category" dataKey="nome" width={160} fontSize={10} />
                  <Tooltip
                    formatter={(v: any, _n: string, p: any) => [
                      fmtMoeda(Number(v)) + ` · ${p.payload.qtd} pedido${p.payload.qtd === 1 ? '' : 's'}`,
                      p.payload.nomeCompleto,
                    ]}
                    labelFormatter={() => ''}
                  />
                  <Bar dataKey="valor" fill="#0EA5E9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">Nenhum dado</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const SemaforoCard: React.FC<{
  titulo: string;
  valor: number;
  qtd: number;
  icone: React.ReactNode;
  cor: 'red' | 'amber' | 'green' | 'gray';
}> = ({ titulo, valor, qtd, icone, cor }) => {
  const cls = {
    red: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-700', icon: 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-200', text: 'text-red-700 dark:text-red-300' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-700', icon: 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-200', text: 'text-amber-700 dark:text-amber-300' },
    green: { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-700', icon: 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-200', text: 'text-green-700 dark:text-green-300' },
    gray: { bg: 'bg-gray-50 dark:bg-slate-900', border: 'border-gray-200 dark:border-slate-700', icon: 'bg-gradient-to-br from-gray-400 to-gray-600 shadow-gray-200', text: 'text-gray-600 dark:text-slate-400' },
  }[cor];
  return (
    <div className={`rounded-2xl border p-5 ${cls.bg} ${cls.border} hover:-translate-y-0.5 transition-transform shadow-sm`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-xs font-bold uppercase tracking-wider ${cls.text}`}>{titulo}</p>
          <p className="mt-2 text-2xl font-extrabold text-gray-900 dark:text-slate-100">{fmtMoeda(valor)}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{qtd} pedido{qtd === 1 ? '' : 's'}</p>
        </div>
        <div className={`rounded-xl p-3 shadow-lg text-white ${cls.icon}`}>{icone}</div>
      </div>
    </div>
  );
};

// ----------- KPI Card local -----------

const KpiCard: React.FC<{
  titulo: string;
  valor: number;
  qtd: number;
  icone: React.ReactNode;
  cor: 'orange' | 'blue' | 'green';
}> = ({ titulo, valor, qtd, icone, cor }) => {
  const bg = {
    orange: 'from-orange-400 to-orange-600 shadow-orange-200',
    blue: 'from-blue-400 to-blue-600 shadow-blue-200',
    green: 'from-green-400 to-green-600 shadow-green-200',
  }[cor];
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">{titulo}</p>
          <p className="mt-2 text-2xl font-extrabold text-gray-900 dark:text-slate-100">{fmtMoeda(valor)}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{qtd} pedido{qtd === 1 ? '' : 's'}</p>
        </div>
        <div className={`rounded-xl p-3 shadow-lg bg-gradient-to-br ${bg} text-white`}>{icone}</div>
      </div>
    </div>
  );
};

// ----------- Detalhe do pedido (itens + cronograma) -----------

const DetalhePedido: React.FC<{
  pedido: PedidoCompra;
  itens: ItemPedidoCompra[] | undefined;
  loading: boolean;
  onAutorizar: () => void;
  autorizando: boolean;
}> = ({ pedido, itens, loading, onAutorizar, autorizando }) => {
  const podeAutorizar = !pedido.autorizado && !pedido.reprovado && pedido.status === 'PENDING';

  const fmtDataCurta = (d: string | null | undefined): string => {
    if (!d) return '-';
    const dt = parseDataLocal(d);
    if (isNaN(dt.getTime())) return d;
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yy = String(dt.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-pink-500" />
          <h4 className="text-sm font-bold text-gray-700 dark:text-slate-300">
            Itens do Pedido &amp; Saldos de Recebimento
          </h4>
        </div>
        {podeAutorizar && (
          <button
            type="button"
            onClick={onAutorizar}
            disabled={autorizando}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-white text-xs font-semibold disabled:opacity-60"
          >
            <ShieldCheck className="h-4 w-4" />
            {autorizando ? 'Autorizando...' : 'Autorizar Pedido'}
          </button>
        )}
      </div>

      {pedido.notas_internas && (
        <p className="text-xs text-gray-500 dark:text-slate-400">📝 {pedido.notas_internas}</p>
      )}

      {loading && (
        <div className="text-center text-sm text-gray-500 py-4">
          Carregando itens do Sienge...
        </div>
      )}

      {!loading && itens && itens.length === 0 && (
        <div className="text-center text-sm text-gray-500 py-4">
          Nenhum item encontrado para este pedido.
        </div>
      )}

      {!loading && itens && itens.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-900/40 border-b border-gray-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400">
                    Material / Serviço
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">
                    Qtd Total
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">
                    Qtd Entregue
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">
                    Saldo Aberto
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">
                    Previsões (Múltiplas Datas)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {itens.map(it => {
                  const qtdTotal = it.quantidade || 0;
                  const totalEntregue = (it.entregas || []).reduce((s, e) => s + (e.quantidade_entregue || 0), 0);
                  const totalAberto = (it.entregas || []).reduce((s, e) => s + (e.quantidade_aberta || 0), 0);
                  const saldoAberto = totalAberto > 0 ? totalAberto : Math.max(0, qtdTotal - totalEntregue);
                  const concluido = saldoAberto === 0;
                  const totalmenteEntregue = qtdTotal > 0 && totalEntregue >= qtdTotal;

                  return (
                    <tr key={it.numero_item} className="hover:bg-gray-50/50 dark:hover:bg-slate-900/30">
                      <td className="px-4 py-2.5 text-gray-800 dark:text-slate-200">
                        <div className="font-medium">{it.descricao_recurso || '(sem descrição)'}</div>
                        {it.codigo_recurso && (
                          <div className="text-[11px] text-gray-400 dark:text-slate-500 font-mono mt-0.5">
                            {it.codigo_recurso}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap">
                        {qtdTotal.toLocaleString('pt-BR')}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium whitespace-nowrap ${
                        totalmenteEntregue ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-slate-300'
                      }`}>
                        {totalEntregue.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {concluido ? (
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-300">
                            Concluído
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-300 min-w-[28px]">
                            {saldoAberto.toLocaleString('pt-BR')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {it.entregas && it.entregas.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {it.entregas.map(e => {
                              const ab = e.quantidade_aberta || 0;
                              const prev = e.quantidade_prevista || 0;
                              const qtdShow = ab > 0 ? ab : prev;

                              let badgeClass = 'border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-600 dark:bg-slate-700/40 dark:text-slate-300';
                              if (ab > 0 && e.data_prevista) {
                                const dataPrev = new Date(e.data_prevista + 'T00:00:00');
                                const hoje = new Date();
                                hoje.setHours(0, 0, 0, 0);
                                const diffDias = Math.round((dataPrev.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
                                if (diffDias < 0) {
                                  badgeClass = 'border-red-200 bg-red-50 text-red-700 dark:border-red-700/40 dark:bg-red-900/30 dark:text-red-300';
                                } else if (diffDias === 0) {
                                  badgeClass = 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-700/40 dark:bg-orange-900/30 dark:text-orange-300';
                                } else if (diffDias <= 7) {
                                  badgeClass = 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-300';
                                }
                              }

                              return (
                                <span
                                  key={`${e.numero_item}-${e.numero_cronograma}`}
                                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${badgeClass}`}
                                >
                                  <Calendar className="h-3 w-3" />
                                  <span className="font-semibold">{fmtDataCurta(e.data_prevista)}</span>
                                  <span className="text-[11px] opacity-80">({qtdShow.toLocaleString('pt-BR')} un)</span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs italic text-gray-400 dark:text-slate-500">Sem cronograma</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
