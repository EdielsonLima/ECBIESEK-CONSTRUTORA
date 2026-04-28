import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/api';
import { PainelExecutivoData, ExposicaoMensal, EmpreendimentoOption, EstoqueDetalhe, TipoBaixaOption } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { DollarSign, CheckCircle, FileText, Clock, Building2, Wallet, TrendingDown, Calculator, TrendingUp, Package, HandCoins, ShoppingCart } from 'lucide-react';
import { criarPDFBase, adicionarResumoCards, finalizarPDF, gerarNomeArquivo } from '../utils/pdfExport';

interface PainelExecutivoProps {
  onNavigate?: (page: string) => void;
}

const formatCurrency = (value: number): string => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatCurrencyFull = (value: number): string => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg p-4">
      <p className="font-semibold text-gray-700 dark:text-slate-300 mb-2">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatCurrencyFull(entry.value)}
        </p>
      ))}
    </div>
  );
};

export const PainelExecutivo: React.FC<PainelExecutivoProps> = ({ onNavigate }) => {
  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoOption[]>([]);
  const [empreendimentoId, setEmpreendimentoId] = useState<number>(0);
  const [data, setData] = useState<PainelExecutivoData | null>(null);
  const [exposicao, setExposicao] = useState<ExposicaoMensal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [abaAtiva, setAbaAtiva] = useState<'geral' | 'orcamento'>('geral');
  const [modoExposicao, setModoExposicao] = useState<'simples' | 'composta'>('simples');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filtro de Tipo de Baixa (para o card Realizado bater com Contas Pagas)
  const [tiposBaixa, setTiposBaixa] = useState<TipoBaixaOption[]>([]);
  const carregarTiposBaixaPadrao = (): number[] => {
    const saved = localStorage.getItem('painel_exec_tipos_baixa');
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  };
  // Aplicado: o que esta efetivamente sendo usado para buscar dados
  const [tiposBaixaSel, setTiposBaixaSel] = useState<number[]>(carregarTiposBaixaPadrao);
  // Pendente: o que o usuario esta selecionando antes de clicar em Aplicar
  const [tiposBaixaPendente, setTiposBaixaPendente] = useState<number[]>(carregarTiposBaixaPadrao);
  const [tiposBaixaOpen, setTiposBaixaOpen] = useState(false);
  const tiposBaixaRef = useRef<HTMLDivElement>(null);

  // Orcamento tab data
  const [orcamentoData, setOrcamentoData] = useState<{
    cubValor: number;
    cubReferencia: string;
    empreendimentos: Array<{
      id: number; nome: string; fator: number; metragem: number;
      orcamento: number; realizado: number; a_realizar: number;
      percentual_realizado: number; status: string;
    }>;
    totais: { orcamento: number; realizado: number; a_realizar: number };
  } | null>(null);
  const [loadingOrcamento, setLoadingOrcamento] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (tiposBaixaRef.current && !tiposBaixaRef.current.contains(e.target as Node)) {
        setTiposBaixaOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    apiService.getEmpreendimentos().then(setEmpreendimentos).catch((err) => {
      console.error('Erro ao carregar empreendimentos:', err);
    });
    apiService.getTiposBaixa().then(setTiposBaixa).catch(() => {});
  }, []);

  useEffect(() => {
    if (abaAtiva === 'orcamento') {
      setLoadingOrcamento(true);
      apiService.getOrcamentoPorEmpreendimento(tiposBaixaSel.length > 0 ? tiposBaixaSel : undefined)
        .then(setOrcamentoData)
        .catch(err => console.error('Erro orcamento:', err))
        .finally(() => setLoadingOrcamento(false));
    }
  }, [abaAtiva, tiposBaixaSel]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [painelData, exposicaoData] = await Promise.all([
          apiService.getPainelExecutivo(empreendimentoId, tiposBaixaSel.length > 0 ? tiposBaixaSel : undefined),
          apiService.getExposicaoExecutivo(empreendimentoId),
        ]);
        setData(painelData);
        setExposicao(exposicaoData);
      } catch (err) {
        setError('Erro ao carregar dados do painel executivo.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [empreendimentoId, tiposBaixaSel]);

  // Persistir selecao APLICADA de tipos de baixa
  useEffect(() => {
    localStorage.setItem('painel_exec_tipos_baixa', JSON.stringify(tiposBaixaSel));
  }, [tiposBaixaSel]);

  // Quando abre/fecha o dropdown, sincroniza o pendente com o aplicado
  useEffect(() => {
    if (tiposBaixaOpen) {
      setTiposBaixaPendente(tiposBaixaSel);
    }
  }, [tiposBaixaOpen]);

  const toggleTipoBaixa = (id: number) => {
    setTiposBaixaPendente((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const aplicarTiposBaixa = () => {
    setTiposBaixaSel(tiposBaixaPendente);
    setTiposBaixaOpen(false);
  };

  const limparTiposBaixa = () => {
    setTiposBaixaPendente([]);
  };

  const tiposBaixaPendenteIgualAplicado =
    tiposBaixaPendente.length === tiposBaixaSel.length &&
    tiposBaixaPendente.every((v) => tiposBaixaSel.includes(v));

  const empreendimentoNome = empreendimentos.find(e => e.id === empreendimentoId)?.nome ?? 'Consolidado';

  const filteredEmpreendimentos = empreendimentos.filter(e =>
    e.nome.toLowerCase().includes(dropdownSearch.toLowerCase()) ||
    e.codigo.toLowerCase().includes(dropdownSearch.toLowerCase())
  );

  const handleExportPDF = () => {
    if (!data) return;
    const { doc, pageWidth, margin, y: startY, dataGeracao } = criarPDFBase(
      'Painel Executivo',
      `Empreendimento: ${empreendimentoNome}`
    );
    let y = startY;
    y = adicionarResumoCards(doc, [
      { label: 'VGV', valor: data.vgv, cor: [59, 130, 246] },
      { label: 'Total Vendido', valor: data.total_vendido, cor: [16, 185, 129] },
      { label: 'Realizado', valor: data.realizado, cor: [34, 197, 94] },
      { label: 'Orçamento Total', valor: data.orcamento_total, cor: [100, 116, 139] },
      { label: 'Saldo a Realizar', valor: data.saldo_a_realizar, cor: [249, 115, 22] },
      { label: 'Valor Empreendimento', valor: data.valor_empreendimento, cor: [99, 102, 241] },
      { label: 'Saldo Acumulado', valor: data.saldo_acumulado, cor: [168, 85, 247] },
      { label: 'Exposição Simples', valor: data.exposicao_simples, cor: [239, 68, 68] },
      { label: 'Exposição Composta', valor: data.exposicao_composta, cor: [244, 63, 94] },
    ], y, pageWidth, margin);
    finalizarPDF(doc, gerarNomeArquivo('painel_executivo', empreendimentoNome), dataGeracao);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500 dark:text-slate-400">Carregando painel executivo...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const exposicaoUsada = modoExposicao === 'simples' ? data.exposicao_simples : data.exposicao_composta;
  const lucroPotencial = data.valor_empreendimento - exposicaoUsada;
  const percentualLucro = data.valor_empreendimento > 0 ? (lucroPotencial / data.valor_empreendimento) * 100 : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header com filtro */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-slate-400">Visão consolidada do empreendimento</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filtro Tipo de Baixa */}
          <div className="relative" ref={tiposBaixaRef}>
            <button
              onClick={() => setTiposBaixaOpen(!tiposBaixaOpen)}
              className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 shadow-sm transition-colors min-w-[200px]"
            >
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="flex-1 text-left">
                {tiposBaixaSel.length === 0 ? 'Tipo de Baixa: Padrão' : `Tipo de Baixa: ${tiposBaixaSel.length} selecionado(s)`}
              </span>
              <svg className={`h-4 w-4 text-gray-400 transition-transform ${tiposBaixaOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {tiposBaixaOpen && (
              <div className="absolute right-0 mt-1 w-72 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="p-3 border-b border-gray-100 dark:border-slate-700">
                  <p className="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">Filtrar Realizado por Tipo de Baixa</p>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500">Marque os tipos e clique em Aplicar</p>
                </div>
                <div className="max-h-60 overflow-y-auto p-2">
                  {tiposBaixa.map((tb) => (
                    <label key={tb.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tiposBaixaPendente.includes(tb.id)}
                        onChange={() => toggleTipoBaixa(tb.id)}
                        className="rounded text-emerald-600"
                      />
                      <span className="text-xs text-gray-700 dark:text-slate-300">
                        <span className="font-mono text-gray-400">#{tb.id}</span> {tb.nome}
                      </span>
                    </label>
                  ))}
                  {tiposBaixa.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-2">Carregando...</p>
                  )}
                </div>
                <div className="p-2 border-t border-gray-100 dark:border-slate-700 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={limparTiposBaixa}
                    className="flex-1 text-xs text-gray-500 hover:text-red-600 dark:text-slate-400 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-700/50"
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    onClick={aplicarTiposBaixa}
                    disabled={tiposBaixaPendenteIgualAplicado}
                    className="flex-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed py-1.5 rounded transition-colors"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:bg-slate-900 shadow-sm transition-colors min-w-[220px]"
            >
              <Building2 className="h-4 w-4 text-blue-500" />
              <span className="flex-1 text-left">{empreendimentoNome}</span>
              <svg className={`h-4 w-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="p-2">
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={dropdownSearch}
                    onChange={(e) => setDropdownSearch(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredEmpreendimentos.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => { setEmpreendimentoId(emp.id); setDropdownOpen(false); setDropdownSearch(''); }}
                      className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                        emp.id === empreendimentoId
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:bg-slate-900'
                      }`}
                    >
                      <span className="text-xs text-gray-400 w-8">{emp.codigo}</span>
                      <span>{emp.nome}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl px-4 py-2.5 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:bg-red-900/40 shadow-sm transition-colors"
            title="Exportar PDF"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setAbaAtiva('geral')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            abaAtiva === 'geral' ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300'
          }`}
        >
          Geral
        </button>
        <button
          onClick={() => setAbaAtiva('orcamento')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            abaAtiva === 'orcamento' ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300'
          }`}
        >
          Orçamento
        </button>
      </div>

      {abaAtiva === 'geral' && (<>
      {/* Badge dados mock */}
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
        <svg className="h-4 w-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-amber-700">
          <span className="font-semibold">VGV</span> = Total Vendido + Estoque. <span className="font-semibold">Orçamento</span> = CUB/RO x Fator x Metragem. <span className="font-semibold">Estoque, Realizado, Saldo a Receber e Exposição</span> = dados reais.
        </p>
      </div>

      {/* ============ SEÇÃO 1: Vendas ============ */}
      <div>
        <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider mb-3 ml-1 text-slate-700 dark:text-slate-100">
          <span className="h-2 w-2 rounded-full bg-blue-500"></span>
          Vendas
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_1fr] lg:items-stretch">
          {/* 1. Total Vendido */}
          <div className="rounded-2xl border border-emerald-100 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white">
                <ShoppingCart className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Vendido</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{formatCurrency(data.total_vendido)}</p>
            <p className="text-xs text-gray-400 mt-1">{data.qtd_vendido} unidade{data.qtd_vendido === 1 ? '' : 's'} vendida{data.qtd_vendido === 1 ? '' : 's'} (Vendido + Pré-Contrato)</p>
          </div>

          {/* operador + */}
          <div className="flex items-center justify-center text-3xl lg:text-4xl font-bold text-gray-300 dark:text-slate-600 select-none" aria-hidden="true">+</div>

          {/* 2. Estoque */}
          <div className="rounded-2xl border border-cyan-100 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-cyan-400 to-cyan-600 text-white">
                <Package className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Estoque</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{formatCurrency(data.estoque)}</p>
            <p className="text-xs text-gray-400 mt-1">{data.qtd_disponivel} unidades disponíveis de {data.qtd_total_unidades}</p>
            {data.estoque_detalhes && data.estoque_detalhes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {data.estoque_detalhes.map((d) => (
                  <span key={d.flag} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    d.flag === 'D' ? 'bg-green-100 text-green-700' :
                    d.flag === 'V' ? 'bg-blue-100 text-blue-700' :
                    d.flag === 'C' ? 'bg-indigo-100 text-indigo-700' :
                    d.flag === 'R' ? 'bg-yellow-100 text-yellow-700' :
                    d.flag === 'A' ? 'bg-amber-100 text-amber-700' :
                    d.flag === 'O' ? 'bg-purple-100 text-purple-700' :
                    d.flag === 'P' ? 'bg-orange-100 text-orange-700' :
                    d.flag === 'M' ? 'bg-pink-100 text-pink-700' :
                    d.flag === 'L' ? 'bg-cyan-100 text-cyan-700' :
                    d.flag === 'T' ? 'bg-slate-100 text-slate-700' :
                    'bg-gray-100 text-gray-600 dark:text-slate-400'
                  }`}>
                    {d.status}: {d.quantidade}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* operador = */}
          <div className="flex items-center justify-center text-3xl lg:text-4xl font-bold text-gray-300 dark:text-slate-600 select-none" aria-hidden="true">=</div>

          {/* 3. VGV */}
          <div className="rounded-2xl border border-blue-100 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-blue-400 to-blue-600 text-white">
                <DollarSign className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">VGV</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{formatCurrency(data.vgv)}</p>
            <p className="text-xs text-gray-400 mt-1">Total Vendido + Estoque</p>
          </div>

          {/* 4. Saldo a Receber */}
          <div className="rounded-2xl border border-sky-100 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-sky-400 to-sky-600 text-white">
                <HandCoins className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Saldo a Receber</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{formatCurrency(data.saldo_a_receber)}</p>
            <p className="text-xs text-gray-400 mt-1">A receber + inadimplentes, corrigidos por indexador (INCC/IGPM/IPCA)</p>
          </div>
        </div>
      </div>

      {/* ============ SEÇÃO 2: Custos ============ */}
      <div>
        <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider mb-3 ml-1 text-slate-700 dark:text-slate-100">
          <span className="h-2 w-2 rounded-full bg-amber-400"></span>
          Custos
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-100 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-slate-400 to-slate-600 text-white">
                <FileText className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Orçamento Total</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{formatCurrency(data.orcamento_total)}</p>
            <p className="text-xs text-gray-400 mt-1">CUB × metragem</p>
          </div>
          <div className="rounded-2xl border border-green-100 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-green-400 to-green-600 text-white">
                <CheckCircle className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Realizado</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{formatCurrency(data.realizado)}</p>
            <p className="text-xs text-gray-400 mt-1">Total pago</p>
          </div>
          <div className="rounded-2xl border border-orange-100 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-orange-400 to-orange-600 text-white">
                <Clock className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Saldo a Realizar</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{formatCurrency(data.saldo_a_realizar)}</p>
            <p className="text-xs text-gray-400 mt-1">Orçamento − Realizado</p>
          </div>
        </div>
      </div>

      {/* ============ SEÇÃO 3: Valor do Empreendimento ============ */}
      <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800/60 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-900/60 dark:via-slate-900/50 dark:to-slate-900/20 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl p-3 bg-gradient-to-br from-indigo-400 to-indigo-600 dark:from-indigo-500 dark:to-indigo-700 shadow-lg shadow-indigo-200/80 dark:shadow-indigo-900/50 text-white">
              <Building2 className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-200 uppercase tracking-wider">Valor do Empreendimento</p>
              <p className="text-4xl font-extrabold text-gray-900 dark:text-indigo-50 mt-1">{formatCurrency(data.valor_empreendimento)}</p>
              <p className="text-sm text-indigo-500 dark:text-indigo-200/80 mt-1">
                {formatCurrency(data.saldo_a_receber)} (a receber) + {formatCurrency(data.estoque)} (estoque) − {formatCurrency(data.saldo_a_realizar)} (a realizar)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ============ SEÇÃO 4: Exposição de Caixa ============ */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 ml-1">Exposição de Caixa</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-red-100 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-red-400 to-red-600 text-white">
                <TrendingDown className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Exposição Simples</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{formatCurrency(data.exposicao_simples)}</p>
            <p className="text-xs text-gray-400 mt-1">Pico do saldo acumulado (pago − recebido)</p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-rose-400 to-rose-600 text-white">
                <Calculator className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Exposição Composta</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{formatCurrency(data.exposicao_composta)}</p>
            <p className="text-xs text-gray-400 mt-1">Saldo acumulado + custo de oportunidade (1,5% a.m.)</p>
          </div>
        </div>
      </div>

      {/* ============ SEÇÃO 5: Lucro ============ */}
      <div
        className={`rounded-2xl border p-6 shadow-sm ${
          lucroPotencial >= 0
            ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 dark:from-emerald-900/50 dark:via-emerald-900/40 dark:to-teal-900/40 dark:border-emerald-800/70'
            : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200 dark:from-red-900/40 dark:via-red-900/35 dark:to-orange-900/35 dark:border-red-800/70'
        }`}
      >
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`rounded-xl p-3 shadow-lg text-white ${
                lucroPotencial >= 0
                  ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-200 dark:from-emerald-500 dark:to-emerald-700 dark:shadow-emerald-900/40'
                  : 'bg-gradient-to-br from-red-400 to-red-600 shadow-red-200 dark:from-red-500 dark:to-red-700 dark:shadow-red-900/40'
              }`}
            >
              <TrendingUp className="h-7 w-7" />
            </div>
            <div>
              <p
                className={`text-sm font-semibold uppercase tracking-wider ${
                  lucroPotencial >= 0 ? 'text-emerald-700 dark:text-emerald-100' : 'text-red-700 dark:text-red-100'
                }`}
              >
                Lucro Projetado
              </p>
              <p className="text-4xl font-extrabold text-gray-900 dark:text-white mt-1">{formatCurrency(lucroPotencial)}</p>
              <p
                className={`text-sm mt-1 ${
                  lucroPotencial >= 0 ? 'text-emerald-600 dark:text-emerald-100/80' : 'text-red-600 dark:text-red-100/80'
                }`}
              >
                {formatCurrency(data.valor_empreendimento)} (empreendimento) − {formatCurrency(exposicaoUsada)} (exposição {modoExposicao})
              </p>
            </div>
          </div>
          <div className="flex items-center bg-white dark:bg-slate-900/70 rounded-xl border border-emerald-200 dark:border-emerald-800/60 p-1 shadow-sm">
            <button
              onClick={() => setModoExposicao('simples')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                modoExposicao === 'simples'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-gray-600 dark:text-emerald-200 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
              }`}
            >
              Simples
            </button>
            <button
              onClick={() => setModoExposicao('composta')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                modoExposicao === 'composta'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-gray-600 dark:text-emerald-200 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
              }`}
            >
              Composta
            </button>
          </div>
        </div>
      </div>

      {/* Grafico Evolucao da Exposicao */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-slate-200">Evolução da Exposição Acumulada</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{empreendimentoNome} — Pico acumulado de exposição mês a mês (último ponto = valor do card)</p>
          </div>
          <div className="flex items-center bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setModoExposicao('simples')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                modoExposicao === 'simples' ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 shadow-sm' : 'text-gray-500 dark:text-slate-400'
              }`}
            >
              Simples
            </button>
            <button
              onClick={() => setModoExposicao('composta')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                modoExposicao === 'composta' ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 shadow-sm' : 'text-gray-500 dark:text-slate-400'
              }`}
            >
              Composta
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={exposicao} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <defs>
              <linearGradient id="gradExposicao" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} interval={2} />
            <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} tickFormatter={(v: number) => `${(v / 1000000).toFixed(1)}M`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#10b981" strokeWidth={2} strokeDasharray="8 4" label={{ value: 'Equilíbrio', position: 'insideTopRight', fill: '#10b981', fontSize: 12, fontWeight: 600 }} />
            <Area
              type="monotone"
              dataKey={modoExposicao === 'simples' ? 'exposicao_simples' : 'exposicao_composta'}
              name={modoExposicao === 'simples' ? 'Exposição Simples' : 'Exposição Composta'}
              stroke="#ef4444"
              strokeWidth={2.5}
              fill="url(#gradExposicao)"
              dot={false}
              activeDot={{ r: 6, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-400 text-center mt-2">
          Curva acumulada de exposição: cada ponto representa o pico de capital exposto até aquele mês. O valor final corresponde ao card "Exposição" acima.
        </p>
      </div>
      </>)}

      {/* ============ ABA ORÇAMENTO ============ */}
      {abaAtiva === 'orcamento' && (
        <div className="space-y-6">
          {loadingOrcamento ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-500 dark:text-slate-400">Carregando orçamentos...</p>
              </div>
            </div>
          ) : orcamentoData ? (
            <>
              {/* CUB badges */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="bg-gray-800 text-white rounded-lg px-4 py-2">
                  <p className="text-[10px] text-gray-300 uppercase">Valor CUB mês atual</p>
                  <p className="text-lg font-bold">{formatCurrency(orcamentoData.cubValor)}</p>
                </div>
                <div className="bg-gray-700 text-white rounded-lg px-4 py-2">
                  <p className="text-[10px] text-gray-300 uppercase">Referência</p>
                  <p className="text-lg font-bold">{orcamentoData.cubReferencia || '-'}</p>
                </div>
              </div>

              {/* 3 summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border-t-4 border-t-blue-500 bg-white dark:bg-slate-800 p-5 shadow-sm border border-gray-100 dark:border-slate-700/50">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Orçamento</p>
                  <p className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{formatCurrency(orcamentoData.totais.orcamento)}</p>
                </div>
                <div className="rounded-2xl border-t-4 border-t-green-500 bg-white dark:bg-slate-800 p-5 shadow-sm border border-gray-100 dark:border-slate-700/50">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Realizado</p>
                  <p className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{formatCurrency(orcamentoData.totais.realizado)}</p>
                </div>
                <div className="rounded-2xl border-t-4 border-t-orange-500 bg-white dark:bg-slate-800 p-5 shadow-sm border border-gray-100 dark:border-slate-700/50">
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2">A Realizar</p>
                  <p className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{formatCurrency(orcamentoData.totais.a_realizar)}</p>
                  <p className="text-xs text-gray-400 mt-1">Valor não contabiliza obras finalizadas e saldos negativos</p>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Empreendimento</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Fator</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Orçamento</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Realizado</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">À Realizar</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">% Real</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white dark:bg-slate-800">
                      {orcamentoData.empreendimentos.map((emp) => (
                        <tr key={emp.id} className={`hover:bg-gray-50 dark:bg-slate-900 ${emp.status === 'finalizada' ? 'text-gray-400' : ''}`}>
                          <td className={`px-4 py-3 text-sm font-medium ${emp.status === 'finalizada' ? 'text-gray-400' : 'text-gray-900 dark:text-slate-100'}`}>
                            {emp.nome}
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-gray-600 dark:text-slate-400">{emp.fator.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-700 dark:text-slate-300">{formatCurrency(emp.orcamento)}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-green-700">{formatCurrency(emp.realizado)}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-orange-700">{formatCurrency(emp.a_realizar)}</td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className={`font-semibold ${
                              emp.percentual_realizado >= 80 ? 'text-red-600 dark:text-red-400' :
                              emp.percentual_realizado >= 50 ? 'text-amber-600' :
                              'text-green-600'
                            }`}>
                              {emp.percentual_realizado.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              emp.status === 'ativa'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500 dark:text-slate-400'
                            }`}>
                              {emp.status === 'ativa' ? 'Ativa' : 'Finalizada'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-10 text-gray-500 dark:text-slate-400">Nenhum dado disponível</div>
          )}
        </div>
      )}
    </div>
  );
};
