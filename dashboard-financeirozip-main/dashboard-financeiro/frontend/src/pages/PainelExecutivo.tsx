import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/api';
import { PainelExecutivoData, ExposicaoMensal, EmpreendimentoOption } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { DollarSign, CheckCircle, FileText, Clock, Building2, Wallet, TrendingDown, Calculator, TrendingUp, Package, HandCoins } from 'lucide-react';
import { criarPDFBase, adicionarResumoCards, finalizarPDF, gerarNomeArquivo } from '../utils/pdfExport';

interface PainelExecutivoProps {
  onNavigate?: (page: string) => void;
}

const formatCurrency = (value: number): string => {
  if (Math.abs(value) >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1).replace('.', ',')}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}K`;
  }
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
};

const formatCurrencyFull = (value: number): string => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
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

  const [modoExposicao, setModoExposicao] = useState<'simples' | 'composta'>('simples');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    apiService.getEmpreendimentos().then(setEmpreendimentos).catch((err) => {
      console.error('Erro ao carregar empreendimentos:', err);
    });
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [painelData, exposicaoData] = await Promise.all([
          apiService.getPainelExecutivo(empreendimentoId),
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
  }, [empreendimentoId]);

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
          <p className="mt-4 text-gray-500">Carregando painel executivo...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-red-600 font-medium">{error}</p>
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
          <p className="text-sm text-gray-500">Visão consolidada do empreendimento</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors min-w-[220px]"
            >
              <Building2 className="h-4 w-4 text-blue-500" />
              <span className="flex-1 text-left">{empreendimentoNome}</span>
              <svg className={`h-4 w-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="p-2">
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={dropdownSearch}
                    onChange={(e) => setDropdownSearch(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                          : 'text-gray-700 hover:bg-gray-50'
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
            className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 shadow-sm transition-colors"
            title="Exportar PDF"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* Badge dados mock */}
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
        <svg className="h-4 w-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-amber-700">
          <span className="font-semibold">VGV</span> usa dados mock. <span className="font-semibold">Orçamento</span> = CUB/RO R$ 2.334,56 x fator 1,2 x metragem. <span className="font-semibold">Realizado e Exposição</span> = dados reais da API.
        </p>
      </div>

      {/* ============ SEÇÃO 1: Vendas ============ */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 ml-1">Vendas</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-blue-400 to-blue-600 text-white">
                <DollarSign className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">VGV</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(data.vgv)}</p>
            <p className="text-xs text-gray-400 mt-1">Valor Geral de Vendas</p>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-sky-400 to-sky-600 text-white">
                <HandCoins className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Saldo a Receber</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(data.saldo_a_receber)}</p>
            <p className="text-xs text-gray-400 mt-1">Parcelas pendentes</p>
          </div>
          <div className="rounded-2xl border border-cyan-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-cyan-400 to-cyan-600 text-white">
                <Package className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Estoque</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(data.estoque)}</p>
            <p className="text-xs text-gray-400 mt-1">Unidades não vendidas</p>
          </div>
        </div>
      </div>

      {/* ============ SEÇÃO 2: Custos ============ */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 ml-1">Custos</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-slate-400 to-slate-600 text-white">
                <FileText className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Orçamento Total</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(data.orcamento_total)}</p>
            <p className="text-xs text-gray-400 mt-1">CUB × metragem</p>
          </div>
          <div className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-green-400 to-green-600 text-white">
                <CheckCircle className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Realizado</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(data.realizado)}</p>
            <p className="text-xs text-gray-400 mt-1">Total pago</p>
          </div>
          <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-orange-400 to-orange-600 text-white">
                <Clock className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Saldo a Realizar</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(data.saldo_a_realizar)}</p>
            <p className="text-xs text-gray-400 mt-1">Orçamento − Realizado</p>
          </div>
        </div>
      </div>

      {/* ============ SEÇÃO 3: Valor do Empreendimento ============ */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl p-3 bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-lg shadow-indigo-200 text-white">
              <Building2 className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wider">Valor do Empreendimento</p>
              <p className="text-4xl font-extrabold text-gray-900 mt-1">{formatCurrency(data.valor_empreendimento)}</p>
              <p className="text-sm text-indigo-500 mt-1">
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
          <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-red-400 to-red-600 text-white">
                <TrendingDown className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Exposição Simples</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(data.exposicao_simples)}</p>
            <p className="text-xs text-gray-400 mt-1">Pico do saldo acumulado (pago − recebido)</p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gradient-to-br from-rose-400 to-rose-600 text-white">
                <Calculator className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Exposição Composta</p>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(data.exposicao_composta)}</p>
            <p className="text-xs text-gray-400 mt-1">Saldo acumulado + custo de oportunidade (1,5% a.m.)</p>
          </div>
        </div>
      </div>

      {/* ============ SEÇÃO 5: Lucro ============ */}
      <div className={`rounded-2xl border p-6 shadow-sm ${lucroPotencial >= 0 ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200' : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200'}`}>
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`rounded-xl p-3 shadow-lg text-white ${lucroPotencial >= 0 ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-200' : 'bg-gradient-to-br from-red-400 to-red-600 shadow-red-200'}`}>
              <TrendingUp className="h-7 w-7" />
            </div>
            <div>
              <p className={`text-sm font-semibold uppercase tracking-wider ${lucroPotencial >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>Lucro Projetado</p>
              <p className="text-4xl font-extrabold text-gray-900 mt-1">{formatCurrency(lucroPotencial)}</p>
              <p className={`text-sm mt-1 ${lucroPotencial >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(data.valor_empreendimento)} (empreendimento) − {formatCurrency(exposicaoUsada)} (exposição {modoExposicao})
              </p>
            </div>
          </div>
          <div className="flex items-center bg-white rounded-xl border border-emerald-200 p-1 shadow-sm">
            <button
              onClick={() => setModoExposicao('simples')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                modoExposicao === 'simples'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              Simples
            </button>
            <button
              onClick={() => setModoExposicao('composta')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                modoExposicao === 'composta'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              Composta
            </button>
          </div>
        </div>
      </div>

      {/* Grafico Evolucao da Exposicao */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Evolução da Exposição</h3>
            <p className="text-sm text-gray-500 mt-0.5">{empreendimentoNome} — Acima de zero = empresa exposta</p>
          </div>
          <div className="flex items-center bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setModoExposicao('simples')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                modoExposicao === 'simples' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
              }`}
            >
              Simples
            </button>
            <button
              onClick={() => setModoExposicao('composta')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                modoExposicao === 'composta' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
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
          Linha verde = ponto de equilíbrio (zero). Quanto mais alto, maior a exposição de capital da empresa.
        </p>
      </div>
    </div>
  );
};
