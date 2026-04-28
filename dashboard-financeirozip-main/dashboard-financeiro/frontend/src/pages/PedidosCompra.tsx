import React, { useEffect, useMemo, useState } from 'react';
import { apiService } from '../services/api';
import { SearchableMultiSelect } from '../components/SearchableMultiSelect';
import {
  PedidoCompra,
  PedidosCompraFiltros,
  PedidosCompraResponse,
  ItemPedidoCompra,
  FiltrosPedidoCompraQuery,
} from '../types';
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
} from 'lucide-react';

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
  const dt = new Date(d.includes('T') ? d : d + 'T12:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('pt-BR');
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

  // Carrega lista (com debounce na busca)
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      apiService.getPedidosCompra(filtrosQuery)
        .then(r => { setPedidos(r.data); setKpis(r.kpis); })
        .catch(() => { setPedidos([]); setKpis(null); })
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [filtrosQuery]);

  const recarregar = () => {
    setLoading(true);
    apiService.getPedidosCompra(filtrosQuery)
      .then(r => { setPedidos(r.data); setKpis(r.kpis); })
      .catch(() => {})
      .finally(() => setLoading(false));
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

  const expandir = async (idPedido: number) => {
    if (expandido === idPedido) {
      setExpandido(null);
      return;
    }
    setExpandido(idPedido);
    if (!itensCache[idPedido]) {
      setItensLoading(idPedido);
      try {
        const r = await apiService.getItensPedidoCompra(idPedido);
        setItensCache(prev => ({ ...prev, [idPedido]: r.itens }));
      } catch {
        setItensCache(prev => ({ ...prev, [idPedido]: [] }));
      } finally {
        setItensLoading(null);
      }
    }
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

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300">Filtros</h3>
          {haFiltrosAtivos ? (
            <button onClick={limparFiltros} className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1">
              <X className="h-3 w-3" /> Limpar todos
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
      </div>

      {/* Tabela */}
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
                <th className="px-3 py-2 text-left">N° Pedido</th>
                <th className="px-3 py-2 text-left">Data</th>
                <th className="px-3 py-2 text-left">Fornecedor</th>
                <th className="px-3 py-2 text-left">Obra / CC</th>
                <th className="px-3 py-2 text-left">Próx. Entrega</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-center">Autorização</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {pedidos.map(p => (
                <React.Fragment key={p.id_pedido}>
                  <tr className="hover:bg-gray-50 dark:hover:bg-slate-700/40 cursor-pointer" onClick={() => expandir(p.id_pedido)}>
                    <td className="px-3 py-2">
                      {expandido === p.id_pedido
                        ? <ChevronDown className="h-4 w-4 text-gray-500" />
                        : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-800 dark:text-slate-200">
                      {p.numero_pedido || p.id_pedido}
                    </td>
                    <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{fmtData(p.data_pedido)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{p.nome_fornecedor || `# ${p.id_fornecedor || '-'}`}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{p.nome_centro_custo || '-'}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{fmtData(p.proxima_entrega)}</td>
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
                      <td colSpan={9} className="px-6 py-4">
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
                  <td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-slate-400">
                    Nenhum pedido encontrado. Clique em "Sincronizar Sienge" para importar dados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-gray-700 dark:text-slate-300">Itens e Cronograma de Entrega</h4>
          {pedido.notas_internas && (
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">📝 {pedido.notas_internas}</p>
          )}
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
        <div className="space-y-3">
          {itens.map(it => (
            <div key={it.numero_item} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                    <span className="text-xs text-gray-500 mr-2">#{it.numero_item}</span>
                    {it.descricao_recurso || '(sem descrição)'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-mono">{it.codigo_recurso || '-'}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="text-gray-600 dark:text-slate-400">Qtd: <strong>{it.quantidade?.toLocaleString('pt-BR')}</strong></p>
                  <p className="text-gray-600 dark:text-slate-400">Unit: <strong>{fmtMoeda(it.preco_unitario)}</strong></p>
                  <p className="text-gray-800 dark:text-slate-200 font-bold">{fmtMoeda(it.preco_liquido)}</p>
                </div>
              </div>

              {it.entregas && it.entregas.length > 0 && (
                <div className="mt-2 border-t border-gray-100 dark:border-slate-700 pt-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold mb-1">
                    Cronograma de Entrega
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {it.entregas.map(e => (
                      <div key={`${e.numero_item}-${e.numero_cronograma}`} className="text-xs bg-slate-50 dark:bg-slate-900 rounded p-2 border border-gray-100 dark:border-slate-700">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-slate-400">📅 {fmtData(e.data_prevista)}</span>
                          <span className="font-semibold text-gray-800 dark:text-slate-200">{e.quantidade_prevista?.toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="flex justify-between mt-0.5 text-[10px]">
                          <span className="text-green-600">✓ {e.quantidade_entregue?.toLocaleString('pt-BR') || 0}</span>
                          <span className="text-orange-600">⏳ {e.quantidade_aberta?.toLocaleString('pt-BR') || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
