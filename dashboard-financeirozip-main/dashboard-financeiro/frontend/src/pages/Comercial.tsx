import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { CentroCustoOption } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatCurrencyShort = (value: number) => {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return formatCurrency(value);
};
const formatDate = (d: string) => { if (!d) return '-'; const p = d.split('T')[0].split('-'); return `${p[2]}/${p[1]}/${p[0]}`; };

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];

type AbaAtiva = 'vendas' | 'por-cliente' | 'por-empreendimento';

interface EmpreendimentoData {
  nome: string; codigo_cc: number;
  qtd_vendido: number; qtd_disponivel: number; qtd_reserva: number; qtd_permuta: number; qtd_outros: number; qtd_total: number;
  valor_vendido: number; valor_disponivel: number; valor_total: number;
  percentual_vendido: number;
}

interface DashboardData {
  total_contratos: number; valor_vendido: number; ticket_medio: number; estoque_percentual: number;
  qtd_vendido: number; qtd_disponivel: number; qtd_reserva: number; qtd_permuta: number; qtd_outros: number; qtd_total: number;
  por_empreendimento: EmpreendimentoData[];
  vendas_por_ano: Array<{ ano: number; quantidade: number; valor: number }>;
  vendas_por_mes: Array<{ mes: number; mes_nome: string; quantidade: number; valor: number }>;
}

interface ClienteData {
  cliente: string; total_contratos: number; valor_total: number; primeiro_contrato: string; ultimo_contrato: string;
}

export const Comercial: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('vendas');
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [clientes, setClientes] = useState<ClienteData[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [filtroCentroCusto, setFiltroCentroCusto] = useState<number | null>(null);
  const [tiposImovel, setTiposImovel] = useState<Array<{ id: number; nome: string }>>([]);
  const [filtroTipoImovel, setFiltroTipoImovel] = useState<number | null>(null);
  const [anoGrafico, setAnoGrafico] = useState<number | null>(null);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [ordenacao, setOrdenacao] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'valor_total', direcao: 'desc' });
  const [clienteExpandido, setClienteExpandido] = useState<string | null>(null);
  const [contratosCliente, setContratosCliente] = useState<Record<string, any[]>>({});

  useEffect(() => {
    apiService.getCentrosCusto().then(setCentrosCusto).catch(() => {});
    apiService.getTiposImovel().then(setTiposImovel).catch(() => {});
  }, []);

  useEffect(() => {
    const carregar = async () => {
      setLoading(true);
      try {
        const filtro: any = {};
        if (filtroCentroCusto) filtro.centro_custo = filtroCentroCusto;
        if (filtroTipoImovel) filtro.tipo_imovel = filtroTipoImovel;
        const filtroDash = { ...filtro };
        if (anoGrafico) filtroDash.ano = anoGrafico;
        const filtroObj = Object.keys(filtro).length > 0 ? filtro : undefined;
        const filtroDashObj = Object.keys(filtroDash).length > 0 ? filtroDash : undefined;
        const [dash, cli] = await Promise.all([
          apiService.getComercialDashboard(filtroDashObj),
          apiService.getComercialPorCliente(filtroObj),
        ]);
        setDashboard(dash);
        setClientes(cli);
      } catch (err) {
        console.error('Erro ao carregar comercial:', err);
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, [filtroCentroCusto, filtroTipoImovel, anoGrafico]);

  const expandirCliente = async (cliente: string) => {
    if (clienteExpandido === cliente) { setClienteExpandido(null); return; }
    setClienteExpandido(cliente);
    if (!contratosCliente[cliente]) {
      try {
        const data = await apiService.getComercialContratos({ cliente, centro_custo: filtroCentroCusto || undefined, limite: 100 } as any);
        setContratosCliente(prev => ({ ...prev, [cliente]: data }));
      } catch { /* ignore */ }
    }
  };

  const toggleSort = (campo: string) => {
    setOrdenacao(prev => ({ campo, direcao: prev.campo === campo && prev.direcao === 'desc' ? 'asc' : 'desc' }));
  };
  const sortIcon = (campo: string) => ordenacao.campo === campo ? (ordenacao.direcao === 'asc' ? ' ▲' : ' ▼') : <span className="text-gray-300 ml-0.5">↕</span>;

  if (loading && !dashboard) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-emerald-600 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-slate-400">Carregando dados comerciais...</p>
        </div>
      </div>
    );
  }

  const d: DashboardData = dashboard || { total_contratos: 0, valor_vendido: 0, ticket_medio: 0, estoque_percentual: 0, qtd_vendido: 0, qtd_disponivel: 0, qtd_reserva: 0, qtd_permuta: 0, qtd_outros: 0, qtd_total: 0, por_empreendimento: [], vendas_por_ano: [], vendas_por_mes: [] };

  // Clientes filtrados e ordenados
  const clientesFiltrados = clientes
    .filter(c => !buscaCliente || c.cliente?.toLowerCase().includes(buscaCliente.toLowerCase()))
    .sort((a: any, b: any) => {
      const va = a[ordenacao.campo] ?? '';
      const vb = b[ordenacao.campo] ?? '';
      if (va < vb) return ordenacao.direcao === 'asc' ? -1 : 1;
      if (va > vb) return ordenacao.direcao === 'asc' ? 1 : -1;
      return 0;
    });

  const totalClientesValor = clientesFiltrados.reduce((s, c) => s + (c.valor_total || 0), 0);

  const abas: { id: AbaAtiva; label: string; icon: string }[] = [
    { id: 'vendas', label: 'Vendas', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { id: 'por-cliente', label: 'Por Cliente', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 'por-empreendimento', label: 'Por Empreendimento', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  ];

  return (
    <div>
      {/* Filtro */}
      <div className="mb-5 flex items-end gap-4">
        <div className="flex-1 min-w-[600px] max-w-[700px]">
          <SearchableSelect
            options={centrosCusto.map(cc => ({ ...cc, nome: cc.codigo ? `${cc.codigo} - ${cc.nome}` : cc.nome }))}
            value={filtroCentroCusto ?? undefined}
            onChange={(v) => setFiltroCentroCusto(v as number | null)}
            label="Centro de Custo"
            placeholder="Todos os empreendimentos..."
            emptyText="Todos"
          />
        </div>
        <div className="w-72">
          <SearchableSelect
            options={tiposImovel.map(t => ({ id: t.id, nome: t.nome }))}
            value={filtroTipoImovel ?? undefined}
            onChange={(v) => setFiltroTipoImovel(v as number | null)}
            label="Tipo de Imovel"
            placeholder="Todos os tipos..."
            emptyText="Todos"
          />
        </div>
        {(filtroCentroCusto || filtroTipoImovel) && (
          <button type="button" onClick={() => { setFiltroCentroCusto(null); setFiltroTipoImovel(null); }} className="mb-0.5 text-xs text-gray-500 dark:text-slate-400 hover:text-red-600 dark:text-red-400 underline">Limpar filtros</button>
        )}
      </div>

      {/* Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-blue-50 dark:bg-slate-800 p-5 shadow-sm border border-blue-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Total Contratos</p>
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
              <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-blue-900 dark:text-blue-100 mt-2">{d.total_contratos.toLocaleString('pt-BR')}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 dark:bg-slate-800 p-5 shadow-sm border border-emerald-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Valor Vendido</p>
            <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" /></svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 mt-2">{formatCurrency(d.valor_vendido)}</p>
        </div>
        <div className="rounded-xl bg-indigo-50 dark:bg-slate-800 p-5 shadow-sm border border-indigo-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase">Ticket Medio</p>
            <div className="h-10 w-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <svg className="h-5 w-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-indigo-900 dark:text-indigo-100 mt-2">{formatCurrency(d.ticket_medio)}</p>
        </div>
        <div className="rounded-xl bg-amber-50 dark:bg-slate-800 p-5 shadow-sm border border-amber-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-600 uppercase">Estoque</p>
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" /></svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-amber-900 mt-2">{d.estoque_percentual}% <span className="text-base font-normal text-amber-600">vendido</span></p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className="text-emerald-700">{d.qtd_vendido} vend.</span>
            <span className="text-gray-300">·</span>
            <span className="text-blue-700">{d.qtd_disponivel} disp.</span>
            {(d.qtd_reserva ?? 0) > 0 && <><span className="text-gray-300">·</span><span className="text-amber-700">{d.qtd_reserva} res.</span></>}
            {(d.qtd_permuta ?? 0) > 0 && <><span className="text-gray-300">·</span><span className="text-purple-700">{d.qtd_permuta} perm.</span></>}
            <span className="text-gray-300">·</span>
            <span className="text-amber-900">{d.qtd_total} total</span>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="mb-6 flex gap-1 border-b border-gray-200 dark:border-slate-700">
        {abas.map(aba => (
          <button
            key={aba.id}
            type="button"
            onClick={() => setAbaAtiva(aba.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              abaAtiva === aba.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300'
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={aba.icon} /></svg>
            {aba.label}
          </button>
        ))}
      </div>

      {/* Tab Vendas */}
      {abaAtiva === 'vendas' && (
        <div>
          <div className="grid gap-6 lg:grid-cols-2 mb-6">
            {/* Por Empreendimento */}
            <div className="rounded-xl bg-white dark:bg-slate-800 dark:bg-slate-800 p-5 shadow-sm border border-gray-100 dark:border-slate-700/50 dark:border-slate-700">
              <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 dark:text-slate-100 mb-1">Por Empreendimento</h3>
              <p className="text-xs text-gray-400 dark:text-slate-400 mb-4">Vendas e estoque por empreendimento</p>
              <div className="space-y-5">
                {d.por_empreendimento.map((emp, i) => (
                  <div key={i} className="rounded-lg border border-gray-100 dark:border-slate-700/50 p-3 bg-gray-50/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{emp.nome}</span>
                      <span className="text-base font-bold text-emerald-600">{emp.percentual_vendido}%</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-2 font-medium">{formatCurrency(emp.valor_vendido)} vendido</p>
                    <div className="h-3 rounded-full bg-gray-200 overflow-hidden mb-3">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all" style={{ width: `${emp.percentual_vendido}%` }}></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                        Vendido: {emp.qtd_vendido}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2.5 py-1 text-xs font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                        Disponivel: {emp.qtd_disponivel}
                      </span>
                      {emp.qtd_reserva > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 text-xs font-semibold">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                          Reserva: {emp.qtd_reserva}
                        </span>
                      )}
                      {emp.qtd_permuta > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 px-2.5 py-1 text-xs font-semibold">
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                          Permuta: {emp.qtd_permuta}
                        </span>
                      )}
                      {emp.qtd_outros > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 text-gray-700 dark:text-slate-300 px-2.5 py-1 text-xs font-semibold">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-50 dark:bg-slate-9000"></span>
                          Outros: {emp.qtd_outros}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-2.5 py-1 text-xs font-bold border border-slate-200">
                        Total: {emp.qtd_total} un.
                      </span>
                    </div>
                  </div>
                ))}
                {d.por_empreendimento.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Nenhum dado</p>}
              </div>
            </div>

            {/* Vendas por Ano / Mes */}
            <div className="rounded-xl bg-white dark:bg-slate-800 p-5 shadow-sm border border-gray-100 dark:border-slate-700/50">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">
                  {anoGrafico ? `Vendas por Mes - ${anoGrafico}` : 'Vendas por Ano'}
                </h3>
                <div className="flex items-center gap-2">
                  {anoGrafico && (
                    <button type="button" onClick={() => setAnoGrafico(null)} className="text-xs text-gray-500 hover:text-emerald-600 underline">
                      Voltar
                    </button>
                  )}
                  <select
                    value={anoGrafico || ''}
                    onChange={e => setAnoGrafico(e.target.value ? parseInt(e.target.value) : null)}
                    className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">Todos os anos</option>
                    {d.vendas_por_ano.map(va => (
                      <option key={va.ano} value={va.ano}>{va.ano}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-400 mb-4">
                {anoGrafico ? `Vendas mensais de ${anoGrafico}` : 'Clique no seletor para ver vendas por mes'}
              </p>
              {(() => {
                const dados = anoGrafico ? d.vendas_por_mes : d.vendas_por_ano;
                const xKey = anoGrafico ? 'mes_nome' : 'ano';
                if (dados.length === 0) {
                  return <p className="text-sm text-gray-400 text-center py-12">Nenhuma venda em {anoGrafico || 'periodo'}</p>;
                }
                return (
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={dados as any[]} margin={{ top: 35, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 600 }} />
                      <YAxis tickFormatter={formatCurrencyShort} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <Tooltip
                        cursor={{ fill: 'rgba(16, 185, 129, 0.05)' }}
                        content={({ active, payload, label }: any) => {
                          if (!active || !payload || !payload[0]) return null;
                          const item = payload[0].payload;
                          return (
                            <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-lg">
                              <p className="text-sm font-bold text-gray-900 dark:text-slate-100 mb-1">{anoGrafico ? `${label}/${anoGrafico}` : label}</p>
                              <p className="text-xs text-emerald-600 font-semibold">Quantidade: <span className="font-bold">{item.quantidade} {item.quantidade === 1 ? 'venda' : 'vendas'}</span></p>
                              <p className="text-xs text-gray-700 dark:text-slate-300 font-semibold">Valor: <span className="font-bold">{formatCurrency(item.valor)}</span></p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="valor" radius={[6, 6, 0, 0]} barSize={anoGrafico ? 30 : 50}>
                        {(dados as any[]).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                        <LabelList
                          position="top"
                          content={(props: any) => {
                            const { x, y, width, index } = props;
                            const item = (dados as any[])[index];
                            if (!item) return null;
                            return (
                              <g>
                                <text x={x + width / 2} y={y - 22} textAnchor="middle" fontSize={11} fontWeight={700} fill="#10B981">
                                  {item.quantidade} {item.quantidade === 1 ? 'venda' : 'vendas'}
                                </text>
                                <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="#374151">
                                  {formatCurrencyShort(item.valor)}
                                </text>
                              </g>
                            );
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Tab Por Cliente */}
      {abaAtiva === 'por-cliente' && (
        <div>
          <div className="mb-4">
            <input type="text" value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)} placeholder="Buscar cliente..." className="w-full max-w-md rounded-lg border border-gray-300 dark:border-slate-600 dark:border-slate-700 bg-white dark:bg-slate-800 dark:bg-slate-800 text-gray-900 dark:text-slate-100 dark:text-slate-100 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          <div className="overflow-hidden rounded-xl bg-white dark:bg-slate-800 dark:bg-slate-800 shadow-sm border border-gray-100 dark:border-slate-700/50 dark:border-slate-700">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-emerald-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-bold text-white w-10">#</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-white cursor-pointer" onClick={() => toggleSort('cliente')}>Cliente{sortIcon('cliente')}</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-white cursor-pointer" onClick={() => toggleSort('total_contratos')}>Contratos{sortIcon('total_contratos')}</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-white cursor-pointer" onClick={() => toggleSort('valor_total')}>Valor Total{sortIcon('valor_total')}</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-white">% Total</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-white">% Acum.</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-white cursor-pointer" onClick={() => toggleSort('primeiro_contrato')}>Primeiro{sortIcon('primeiro_contrato')}</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-white cursor-pointer" onClick={() => toggleSort('ultimo_contrato')}>Ultimo{sortIcon('ultimo_contrato')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(() => {
                    let acumulado = 0;
                    return clientesFiltrados.map((c, i) => {
                      const pct = totalClientesValor > 0 ? (c.valor_total / totalClientesValor) * 100 : 0;
                      acumulado += pct;
                      const corAcum = acumulado <= 80 ? 'text-emerald-600' : acumulado <= 95 ? 'text-yellow-600' : 'text-red-600 dark:text-red-400';
                      const isExpandido = clienteExpandido === c.cliente;
                      const contratos = contratosCliente[c.cliente] || [];
                      return (
                        <React.Fragment key={i}>
                          <tr className={`cursor-pointer transition-colors ${isExpandido ? 'bg-emerald-100 border-l-4 border-l-emerald-600' : i % 2 === 0 ? 'bg-white dark:bg-slate-800 hover:bg-emerald-50' : 'bg-gray-50 dark:bg-slate-900 hover:bg-emerald-50'}`} onClick={() => expandirCliente(c.cliente)}>
                            <td className="px-4 py-2.5 text-center text-xs text-gray-400">{i + 1}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-slate-100 max-w-xs truncate">
                              <span className={`text-gray-400 text-[10px] mr-1 transition-transform inline-block ${isExpandido ? 'rotate-90' : ''}`}>&#9654;</span>
                              {c.cliente || '-'}
                            </td>
                            <td className="px-4 py-2.5 text-center font-semibold text-gray-700 dark:text-slate-300">{c.total_contratos}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-emerald-700 font-mono">{formatCurrency(c.valor_total)}</td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(pct, 100)}%` }}></div>
                                </div>
                                <span className="text-xs text-gray-600 dark:text-slate-400 w-12 text-right">{pct.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td className={`px-4 py-2.5 text-right text-xs font-semibold ${corAcum}`}>{acumulado.toFixed(1)}%</td>
                            <td className="px-4 py-2.5 text-center text-xs text-gray-500 dark:text-slate-400">{formatDate(c.primeiro_contrato)}</td>
                            <td className="px-4 py-2.5 text-center text-xs text-gray-500 dark:text-slate-400">{formatDate(c.ultimo_contrato)}</td>
                          </tr>
                          {isExpandido && (
                            <tr>
                              <td colSpan={8} className="p-0">
                                <div className="bg-emerald-50 px-8 py-3 border-y border-emerald-200">
                                  {contratos.length === 0 ? (
                                    <p className="text-xs text-gray-400 py-2">Carregando contratos...</p>
                                  ) : (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-emerald-700 border-b border-emerald-200">
                                          <th className="py-1.5 text-left font-semibold">Titulo</th>
                                          <th className="py-1.5 text-right font-semibold">Valor</th>
                                          <th className="py-1.5 text-center font-semibold">Vencimento</th>
                                          <th className="py-1.5 text-left font-semibold">Centro de Custo</th>
                                          <th className="py-1.5 text-center font-semibold">Parcelas</th>
                                          <th className="py-1.5 text-right font-semibold">Recebido</th>
                                          <th className="py-1.5 text-center font-semibold">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {contratos.map((ct: any, j: number) => (
                                          <tr key={j} className="border-b border-emerald-100 hover:bg-emerald-100/50">
                                            <td className="py-1.5 font-mono font-bold text-gray-800 dark:text-slate-200">{ct.titulo}</td>
                                            <td className="py-1.5 text-right font-mono text-gray-700 dark:text-slate-300">{formatCurrency(ct.valor_total || 0)}</td>
                                            <td className="py-1.5 text-center text-gray-600 dark:text-slate-400">{formatDate(ct.data_vencimento)}</td>
                                            <td className="py-1.5 text-gray-600 dark:text-slate-400">
                                              {ct.codigo_centrocusto ? <span className="inline-flex items-center justify-center rounded bg-blue-100 text-blue-700 font-bold font-mono text-[11px] px-1 min-w-[20px]">{ct.codigo_centrocusto}</span> : null}
                                              {ct.codigo_centrocusto ? ' ' : ''}{ct.nome_centrocusto || '-'}
                                            </td>
                                            <td className="py-1.5 text-center text-gray-600 dark:text-slate-400">{ct.parcelas_recebidas}/{ct.total_parcelas}</td>
                                            <td className="py-1.5 text-right font-mono text-gray-700 dark:text-slate-300">{formatCurrency(ct.valor_recebido || 0)}</td>
                                            <td className="py-1.5 text-center">
                                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ct.status === 'quitado' ? 'bg-green-100 text-green-700' : ct.status === 'atraso' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' : 'bg-blue-100 text-blue-700'}`}>
                                                {ct.status === 'quitado' ? 'Quitado' : ct.status === 'atraso' ? 'Atraso' : 'Em Dia'}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    });
                  })()}
                </tbody>
                <tfoot className="bg-emerald-50 sticky bottom-0">
                  <tr className="font-bold">
                    <td className="px-4 py-3 text-sm border-t-2 border-emerald-200" colSpan={3}>TOTAL ({clientesFiltrados.length} clientes)</td>
                    <td className="px-4 py-3 text-right text-sm text-emerald-800 border-t-2 border-emerald-200 font-mono">{formatCurrency(totalClientesValor)}</td>
                    <td className="px-4 py-3 border-t-2 border-emerald-200" colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Por Empreendimento */}
      {abaAtiva === 'por-empreendimento' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {d.por_empreendimento.map((emp, i) => (
            <div key={i} className="rounded-xl bg-white dark:bg-slate-800 p-5 shadow-sm border border-gray-100 dark:border-slate-700/50 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="inline-flex items-center justify-center rounded bg-emerald-100 text-emerald-700 font-bold font-mono text-xs px-1.5 py-0.5 mr-1">{emp.codigo_cc}</span>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-slate-100 mt-1">{emp.nome}</h4>
                </div>
                <span className="text-lg font-bold text-emerald-600">{emp.percentual_vendido}%</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">{formatCurrency(emp.valor_vendido)} vendido de {formatCurrency(emp.valor_total)}</p>
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden mb-3">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all" style={{ width: `${emp.percentual_vendido}%` }}></div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center mb-2">
                <div className="rounded-lg bg-emerald-50 p-2">
                  <p className="text-xl font-bold text-emerald-700">{emp.qtd_vendido}</p>
                  <p className="text-[10px] text-emerald-600 uppercase font-semibold">Vendido</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2">
                  <p className="text-xl font-bold text-blue-700">{emp.qtd_disponivel}</p>
                  <p className="text-[10px] text-blue-600 uppercase font-semibold">Disponivel</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {emp.qtd_reserva > 0 && (
                  <div className="rounded-lg bg-amber-50 p-2">
                    <p className="text-base font-bold text-amber-700">{emp.qtd_reserva}</p>
                    <p className="text-[9px] text-amber-600 uppercase font-semibold">Reserva</p>
                  </div>
                )}
                {emp.qtd_permuta > 0 && (
                  <div className="rounded-lg bg-purple-50 p-2">
                    <p className="text-base font-bold text-purple-700">{emp.qtd_permuta}</p>
                    <p className="text-[9px] text-purple-600 uppercase font-semibold">Permuta</p>
                  </div>
                )}
                <div className={`rounded-lg bg-slate-100 p-2 ${(emp.qtd_reserva > 0 && emp.qtd_permuta > 0) ? '' : 'col-span-3'}`}>
                  <p className="text-base font-bold text-slate-800">{emp.qtd_total}</p>
                  <p className="text-[9px] text-slate-600 uppercase font-semibold">Total</p>
                </div>
              </div>
            </div>
          ))}
          {d.por_empreendimento.length === 0 && (
            <div className="col-span-full rounded-xl bg-white dark:bg-slate-800 p-12 text-center shadow-sm">
              <p className="text-gray-400">Nenhum empreendimento encontrado</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
