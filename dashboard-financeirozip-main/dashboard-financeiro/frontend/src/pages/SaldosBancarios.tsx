import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  LabelList,
  Cell,
} from 'recharts';
import { apiService } from '../services/api';
import { ContaCorrenteOption, EmpresaOption, SaldoBancarioResumo } from '../types';

const STORAGE_KEY = 'saldos_bancarios_padrao';

const currency = (v: any) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
};

const currencyShort = (v: any) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`;
  return `R$ ${n.toFixed(0)}`;
};

const formatDate = (d: string) => {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return parts[2];
};

export const SaldosBancarios: React.FC = () => {
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [contas, setContas] = useState<ContaCorrenteOption[]>([]);
  const [resumo, setResumo] = useState<SaldoBancarioResumo | null>(null);
  const [contasSel, setContasSel] = useState<Set<string>>(new Set());
  const [empresasSel, setEmpresasSel] = useState<Set<number>>(new Set());
  const [empresasExpandidas, setEmpresasExpandidas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarPainelContas, setMostrarPainelContas] = useState(false);
  const [buscaContas, setBuscaContas] = useState('');
  const [salvandoPadrao, setSalvandoPadrao] = useState(false);
  const [dataRef, setDataRef] = useState<string>('');

  // Carregar empresas e contas + padrão salvo
  useEffect(() => {
    apiService.getEmpresas().then(setEmpresas).catch(() => {});
    apiService.getContasCorrente().then((cs) => {
      setContas(cs);
      const padrao = localStorage.getItem(STORAGE_KEY);
      if (padrao) {
        try {
          const data = JSON.parse(padrao);
          if (Array.isArray(data.contas)) setContasSel(new Set(data.contas));
          if (Array.isArray(data.empresas)) setEmpresasSel(new Set(data.empresas));
        } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  // Carregar saldos
  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setErro(null);
      try {
        const empArr = Array.from(empresasSel);
        const conArr = Array.from(contasSel);
        const r = await apiService.getSaldosResumo(empArr, conArr, dataRef || undefined);
        setResumo(r);
        // Sincroniza a data de referencia com a retornada pelo backend (ultima disponivel)
        if (!dataRef && r.data_referencia) setDataRef(r.data_referencia);
      } catch {
        setErro('Não foi possível carregar os saldos agora.');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [empresasSel, contasSel, dataRef]);

  const salvarPadrao = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      contas: Array.from(contasSel),
      empresas: Array.from(empresasSel),
    }));
    setSalvandoPadrao(true);
    setTimeout(() => setSalvandoPadrao(false), 1800);
  };

  const resetarPadrao = () => {
    localStorage.removeItem(STORAGE_KEY);
    setContasSel(new Set());
    setEmpresasSel(new Set());
  };

  const toggleConta = (id: string) => {
    setContasSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEmpresa = (nome: string) => {
    setEmpresasExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome);
      else next.add(nome);
      return next;
    });
  };

  // Agrupar contas por empresa
  const contasPorEmpresa = useMemo(() => {
    const map = new Map<string, typeof resumo extends null ? never : NonNullable<typeof resumo>['contas']>();
    if (!resumo?.contas) return map;
    resumo.contas.forEach((c) => {
      const key = c.empresa_nome || 'Sem Empresa';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return map;
  }, [resumo]);

  const totalContasSelecionadas = contasSel.size || contas.length;

  // Mapa empresa_id -> nome_empresa
  const empresasMap = useMemo(() => {
    const m = new Map<number, string>();
    empresas.forEach((e) => m.set(e.id, e.nome));
    return m;
  }, [empresas]);

  // Contas agrupadas por empresa (com busca aplicada)
  const contasAgrupadas = useMemo(() => {
    const termo = buscaContas.trim().toLowerCase();
    const grupos = new Map<string, ContaCorrenteOption[]>();
    contas.forEach((c) => {
      const nomeEmp = empresasMap.get(c.empresa_id) || 'Sem Empresa';
      if (termo) {
        const casa = c.nome.toLowerCase().includes(termo) || nomeEmp.toLowerCase().includes(termo);
        if (!casa) return;
      }
      if (!grupos.has(nomeEmp)) grupos.set(nomeEmp, []);
      grupos.get(nomeEmp)!.push(c);
    });
    return Array.from(grupos.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [contas, empresasMap, buscaContas]);

  const toggleEmpresaGrupo = (contasDaEmpresa: ContaCorrenteOption[]) => {
    const ids = contasDaEmpresa.map((c) => String(c.id));
    const todosSel = ids.every((id) => contasSel.has(id));
    setContasSel((prev) => {
      const next = new Set(prev);
      if (todosSel) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };
  // Dados do gráfico de empresas
  const empresasOrdenadas = useMemo(() => {
    if (!resumo?.empresas) return [];
    return [...resumo.empresas]
      .sort((a, b) => Math.abs(b.saldo || 0) - Math.abs(a.saldo || 0));
  }, [resumo]);

  const maxSaldoEmpresa = Math.max(...empresasOrdenadas.map((e) => Math.abs(e.saldo || 0)), 1);

  // Variação do saldo (primeiro vs último ponto da série)
  const variacao = useMemo(() => {
    if (!resumo?.serie || resumo.serie.length < 2) return null;
    const primeiro = resumo.serie[0]?.saldo || 0;
    const ultimo = resumo.serie[resumo.serie.length - 1]?.saldo || 0;
    const diff = ultimo - primeiro;
    const pct = primeiro !== 0 ? (diff / primeiro) * 100 : 0;
    return { primeiro, ultimo, diff, pct };
  }, [resumo]);

  if (loading && !resumo) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-violet-600 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-slate-400">Carregando saldos bancários...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header com filtros */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* Dropdown de Contas */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMostrarPainelContas(!mostrarPainelContas)}
              className="inline-flex items-center gap-2 rounded-full border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/30 px-4 py-2 text-sm font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Contas
              <span className="inline-flex items-center justify-center rounded-full bg-violet-600 text-white text-xs font-bold h-5 min-w-[20px] px-1.5">{totalContasSelecionadas}</span>
              <svg className={`h-3.5 w-3.5 transition-transform ${mostrarPainelContas ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {mostrarPainelContas && (
              <>
                {/* Overlay invisível para fechar ao clicar fora */}
                <div className="fixed inset-0 z-40" onClick={() => setMostrarPainelContas(false)} />
                {/* Dropdown */}
                <div className="absolute left-0 top-full mt-2 z-50 w-[420px] rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                  {/* Header do dropdown */}
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">Selecionar contas</h3>
                      <span className="text-[11px] text-gray-500 dark:text-slate-400">{contasSel.size} de {contas.length}</span>
                    </div>
                    {/* Campo de busca */}
                    <div className="relative">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
                      </svg>
                      <input
                        type="text"
                        value={buscaContas}
                        onChange={(e) => setBuscaContas(e.target.value)}
                        placeholder="Buscar por conta ou empresa..."
                        className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                        autoFocus
                      />
                      {buscaContas && (
                        <button
                          type="button"
                          onClick={() => setBuscaContas('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Lista agrupada por empresa */}
                  <div className="max-h-80 overflow-y-auto">
                    {contasAgrupadas.length === 0 && (
                      <p className="text-xs text-gray-500 dark:text-slate-400 text-center py-8">
                        {buscaContas ? 'Nenhuma conta encontrada' : 'Nenhuma conta disponível'}
                      </p>
                    )}
                    {contasAgrupadas.map(([nomeEmpresa, contasDaEmpresa]) => {
                      const idsEmp = contasDaEmpresa.map((c) => String(c.id));
                      const selNoGrupo = idsEmp.filter((id) => contasSel.has(id)).length;
                      const todosSel = selNoGrupo === idsEmp.length && idsEmp.length > 0;
                      const algunsSel = selNoGrupo > 0 && !todosSel;
                      return (
                        <div key={nomeEmpresa} className="border-b border-gray-100 dark:border-slate-700/50 last:border-b-0">
                          {/* Cabeçalho da empresa (toggle todos do grupo) */}
                          <button
                            type="button"
                            onClick={() => toggleEmpresaGrupo(contasDaEmpresa)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-slate-900/40 hover:bg-gray-100 dark:hover:bg-slate-900/60 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={todosSel}
                                ref={(el) => { if (el) el.indeterminate = algunsSel; }}
                                readOnly
                                className="rounded text-violet-600 pointer-events-none"
                              />
                              <span className="text-xs font-bold text-gray-700 dark:text-slate-200 truncate max-w-[280px]" title={nomeEmpresa}>
                                {nomeEmpresa}
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400">
                              {selNoGrupo}/{idsEmp.length}
                            </span>
                          </button>
                          {/* Contas da empresa */}
                          <div className="divide-y divide-gray-50 dark:divide-slate-700/30">
                            {contasDaEmpresa.map((c) => (
                              <label
                                key={c.id}
                                className="flex items-center gap-2 px-5 py-1.5 hover:bg-violet-50/50 dark:hover:bg-violet-900/10 cursor-pointer transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={contasSel.has(String(c.id))}
                                  onChange={() => toggleConta(String(c.id))}
                                  className="rounded text-violet-600"
                                />
                                <span className="text-[11px] text-gray-600 dark:text-slate-300 truncate">{c.nome}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer com ações */}
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 flex items-center justify-between gap-2">
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setContasSel(new Set())}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        Limpar
                      </button>
                      <button
                        type="button"
                        onClick={() => setContasSel(new Set(contas.map((c) => String(c.id))))}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        Selecionar todas
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={salvarPadrao}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
                        salvandoPadrao ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-violet-600 hover:bg-violet-700'
                      }`}
                    >
                      {salvandoPadrao ? (
                        <>
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                          Salvo!
                        </>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                          Salvar Padrão
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Seletor de data */}
          <div className="flex items-center gap-2 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-1.5 shadow-sm">
            <svg className="h-4 w-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">Data:</span>
            <input
              type="date"
              value={dataRef}
              onChange={(e) => setDataRef(e.target.value)}
              className="bg-transparent text-sm font-semibold text-gray-800 dark:text-slate-200 outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={resetarPadrao}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Resetar padrão
          </button>
        </div>
      </div>

      {/* Grid de cards: Total, Bancario, Permuta, Mutuo */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card Saldo Bancario */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40 border border-emerald-200 dark:border-emerald-800 p-5 shadow-sm">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-green-500"></div>
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-700 dark:text-emerald-400">Saldo Bancário</p>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{currency(resumo?.cards?.bancario ?? 0)}</p>
          <p className="text-[10px] text-gray-500 dark:text-slate-500 mt-1">Contas em bancos e caixa</p>
        </div>

        {/* Card Permuta */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-200 dark:border-amber-800 p-5 shadow-sm">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500"></div>
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <p className="text-[11px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400">Saldo Permuta</p>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{currency(resumo?.cards?.permuta ?? 0)}</p>
          <p className="text-[10px] text-gray-500 dark:text-slate-500 mt-1">Permutas ativas</p>
        </div>

        {/* Card Mutuo */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/40 dark:to-sky-950/40 border border-blue-200 dark:border-blue-800 p-5 shadow-sm">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-sky-500"></div>
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-[11px] uppercase tracking-wider font-bold text-blue-700 dark:text-blue-400">Saldo Mútuo</p>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{currency(resumo?.cards?.mutuo ?? 0)}</p>
          <p className="text-[10px] text-gray-500 dark:text-slate-500 mt-1">Empréstimos entre empresas</p>
        </div>

        {/* Card Saldo Total Geral */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/40 dark:to-indigo-950/40 border border-violet-200 dark:border-violet-800 p-5 shadow-sm">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-indigo-500"></div>
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-4 w-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[11px] uppercase tracking-wider font-bold text-violet-700 dark:text-violet-400">Saldo Total Geral</p>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{currency(resumo?.saldo_total ?? 0)}</p>
          <p className="text-[10px] text-gray-500 dark:text-slate-500 mt-1">
            Em {resumo?.data_referencia ? new Date(resumo.data_referencia + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        <p className="text-xs text-gray-500 dark:text-slate-400">
          {(resumo?.contas ?? []).length} contas em {(resumo?.empresas ?? []).length} empresas
        </p>
        {erro && <p className="text-xs text-red-500">{erro}</p>}
      </div>

      {/* Tabela Posicao de Saldos (estilo relatorio oficial) */}
      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">Posição de Saldos</h3>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Clique na empresa para ver as contas — data: {resumo?.data_referencia ? new Date(resumo.data_referencia + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</p>
          </div>
        </div>
        <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm min-w-[780px]">
            <thead className="bg-slate-800 dark:bg-slate-900 sticky top-0 z-10">
              <tr>
                <th className="text-left text-[11px] font-bold text-white uppercase px-4 py-2.5">Conta / Nome</th>
                <th className="text-right text-[11px] font-bold text-white uppercase px-3 py-2.5">Saldo Anterior</th>
                <th className="text-right text-[11px] font-bold text-white uppercase px-3 py-2.5">Entradas</th>
                <th className="text-right text-[11px] font-bold text-white uppercase px-3 py-2.5">Saídas</th>
                <th className="text-right text-[11px] font-bold text-white uppercase px-4 py-2.5">Saldo Atual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {Array.from(contasPorEmpresa.entries()).map(([empNome, contasEmp], i) => {
                const totalAnterior = contasEmp.reduce((s, c) => s + (c.saldo_anterior || 0), 0);
                const totalEntrada = contasEmp.reduce((s, c) => s + (c.entrada || 0), 0);
                const totalSaida = contasEmp.reduce((s, c) => s + (c.saida || 0), 0);
                const totalAtual = contasEmp.reduce((s, c) => s + (c.saldo_atual ?? c.saldo ?? 0), 0);
                const expandida = empresasExpandidas.has(empNome);
                return (
                  <React.Fragment key={i}>
                    <tr
                      className="cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors bg-violet-50/60 dark:bg-violet-950/10"
                      onClick={() => toggleEmpresa(empNome)}
                    >
                      <td className="px-4 py-2.5 font-bold text-gray-900 dark:text-slate-200">
                        <span className={`inline-block mr-2 text-gray-400 text-[10px] transition-transform ${expandida ? 'rotate-90' : ''}`}>▶</span>
                        {empNome}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-700 dark:text-slate-300 font-mono">{currency(totalAnterior)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400 font-mono">{currency(totalEntrada)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-red-600 dark:text-red-400 font-mono">{currency(totalSaida)}</td>
                      <td className={`px-4 py-2.5 text-right font-bold font-mono ${totalAtual >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{currency(totalAtual)}</td>
                    </tr>
                    {expandida && contasEmp.map((c, j) => {
                      const sa = c.saldo_anterior || 0;
                      const en = c.entrada || 0;
                      const sai = c.saida || 0;
                      const at = c.saldo_atual ?? c.saldo ?? 0;
                      const tipo = c.tipo;
                      const tipoBadge = tipo === 'permuta' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : tipo === 'mutuo' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        : tipo === 'reapropriacao' ? 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
                      return (
                        <tr key={`${i}-${j}`} className="bg-gray-50/60 dark:bg-slate-900/40">
                          <td className="px-4 py-1.5 pl-10 text-xs text-gray-600 dark:text-slate-400">
                            <span className="font-mono text-[10px] text-gray-400 mr-1.5">{c.conta_corrente}</span>
                            {c.banco}
                            {tipo && tipo !== 'bancaria' && (
                              <span className={`ml-2 inline-block text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${tipoBadge}`}>{tipo}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-mono text-gray-500 dark:text-slate-400">{currency(sa)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-mono text-emerald-600/80 dark:text-emerald-400/80">{en ? currency(en) : '—'}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-mono text-red-600/80 dark:text-red-400/80">{sai ? currency(sai) : '—'}</td>
                          <td className={`px-4 py-1.5 text-right text-xs font-mono font-semibold ${at >= 0 ? 'text-gray-700 dark:text-slate-200' : 'text-red-600 dark:text-red-400'}`}>{currency(at)}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {contasPorEmpresa.size === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-sm text-gray-400 py-8">Nenhuma conta encontrada</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-violet-50 dark:bg-violet-950/30 sticky bottom-0">
              <tr>
                <td className="px-4 py-3 font-bold text-gray-900 dark:text-slate-100">Total Geral</td>
                <td className="px-3 py-3 text-right font-bold text-gray-700 dark:text-slate-300 font-mono">
                  {currency((resumo?.contas ?? []).reduce((s, c) => s + (c.saldo_anterior || 0), 0))}
                </td>
                <td className="px-3 py-3 text-right font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                  {currency((resumo?.contas ?? []).reduce((s, c) => s + (c.entrada || 0), 0))}
                </td>
                <td className="px-3 py-3 text-right font-bold text-red-700 dark:text-red-400 font-mono">
                  {currency((resumo?.contas ?? []).reduce((s, c) => s + (c.saida || 0), 0))}
                </td>
                <td className="px-4 py-3 text-right font-extrabold text-violet-700 dark:text-violet-300 font-mono">
                  {currency(resumo?.saldo_total ?? 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Saldo por Empresa - Grafico horizontal */}
      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
        <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mb-4">Saldo por Empresa</h3>
        {empresasOrdenadas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            {empresasOrdenadas.map((emp, i) => {
              const pct = Math.abs((emp.saldo || 0) / (maxSaldoEmpresa || 1)) * 100;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700 dark:text-slate-300 truncate max-w-[60%]" title={emp.empresa_nome}>
                      {emp.empresa_nome}
                    </span>
                    <span className={`text-xs font-bold font-mono ${emp.saldo >= 0 ? 'text-violet-600 dark:text-violet-400' : 'text-red-600 dark:text-red-400'}`}>
                      {currencyShort(emp.saldo)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${emp.saldo >= 0 ? 'bg-gradient-to-r from-violet-400 to-indigo-500' : 'bg-gradient-to-r from-red-400 to-orange-500'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum dado</p>
        )}
      </div>

      {/* Evolução do Saldo */}
      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">Evolução do Saldo</h3>
            <p className="text-xs text-gray-400 dark:text-slate-500">Saldo dia a dia das contas selecionadas (últimos 30 dias)</p>
          </div>
          {variacao && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-slate-500">Variação no Período</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  {currencyShort(variacao.primeiro)} → {currencyShort(variacao.ultimo)}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                  variacao.diff >= 0
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                }`}>
                  {variacao.diff >= 0 ? '↗' : '↘'} {variacao.pct.toFixed(1)}% ({currency(variacao.diff)})
                </span>
              </div>
            </div>
          )}
        </div>
        {(resumo?.serie?.length ?? 0) > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={resumo!.serie} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-slate-700" />
              <XAxis dataKey="data" tickFormatter={formatDate} tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tickFormatter={currencyShort} tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip
                cursor={{ stroke: '#8b5cf6', strokeWidth: 1, strokeDasharray: '3 3' }}
                content={({ active, payload }: any) => {
                  if (!active || !payload || !payload[0]) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-lg">
                      <p className="text-xs font-bold text-gray-900 dark:text-slate-100 mb-1">
                        {new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </p>
                      <p className="text-sm font-bold text-violet-600 dark:text-violet-400">{currency(item.saldo)}</p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="saldo"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#8b5cf6' }}
                activeDot={{ r: 6, fill: '#8b5cf6' }}
                fill="url(#colorSaldo)"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400 text-center py-12">Sem dados de evolução</p>
        )}
      </div>

      {/* Top contas individualmente - gráfico de barras */}
      {(resumo?.contas?.length ?? 0) > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mb-4">Top Contas por Saldo</h3>
          <ResponsiveContainer width="100%" height={Math.min(400, (resumo!.contas.length) * 40 + 80)}>
            <BarChart data={resumo!.contas.slice(0, 10)} layout="vertical" margin={{ left: 100, right: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-slate-700" horizontal={false} />
              <XAxis type="number" tickFormatter={currencyShort} tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis
                type="category"
                dataKey="banco"
                width={150}
                tick={{ fontSize: 11, fill: '#6b7280' }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(139, 92, 246, 0.05)' }}
                content={({ active, payload }: any) => {
                  if (!active || !payload || !payload[0]) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-lg">
                      <p className="text-xs font-bold text-gray-900 dark:text-slate-100">{item.empresa_nome}</p>
                      <p className="text-[10px] text-gray-500 dark:text-slate-400">{item.banco} · {item.conta_corrente}</p>
                      <p className="text-sm font-bold text-violet-600 dark:text-violet-400 mt-1">{currency(item.saldo)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="saldo" radius={[0, 6, 6, 0]} barSize={24}>
                {resumo!.contas.slice(0, 10).map((_, i) => (
                  <Cell key={i} fill={`hsl(${260 + i * 5}, 70%, ${55 + i * 2}%)`} />
                ))}
                <LabelList dataKey="saldo" position="right" formatter={(v: any) => currencyShort(v)} style={{ fontSize: 11, fontWeight: 700, fill: '#6b7280' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
