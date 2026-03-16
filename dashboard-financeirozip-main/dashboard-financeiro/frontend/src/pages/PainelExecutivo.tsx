import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/api';
import { PainelExecutivoData, ExposicaoMensal, EmpreendimentoOption } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DollarSign, CheckCircle, FileText, Clock, Building2, Wallet, TrendingDown, Calculator } from 'lucide-react';
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

  const cards = [
    { title: 'VGV', value: formatCurrency(data.vgv), subtitle: 'Estoque + Vendas', icon: <DollarSign className="h-6 w-6" />, borderColor: 'border-blue-100', iconBg: 'bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-200' },
    { title: 'Realizado', value: formatCurrency(data.realizado), subtitle: 'Total Pago', icon: <CheckCircle className="h-6 w-6" />, borderColor: 'border-green-100', iconBg: 'bg-gradient-to-br from-green-400 to-green-600 shadow-green-200' },
    { title: 'Orçamento Total', value: formatCurrency(data.orcamento_total), subtitle: 'Custo Previsto', icon: <FileText className="h-6 w-6" />, borderColor: 'border-slate-100', iconBg: 'bg-gradient-to-br from-slate-400 to-slate-600 shadow-slate-200' },
    { title: 'Saldo a Realizar', value: formatCurrency(data.saldo_a_realizar), subtitle: 'Orçamento - Realizado', icon: <Clock className="h-6 w-6" />, borderColor: 'border-orange-100', iconBg: 'bg-gradient-to-br from-orange-400 to-orange-600 shadow-orange-200' },
    { title: 'Valor do Empreendimento', value: formatCurrency(data.valor_empreendimento), subtitle: 'VGV - Saldo a Realizar', icon: <Building2 className="h-6 w-6" />, borderColor: 'border-indigo-100', iconBg: 'bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-indigo-200' },
    { title: 'Saldo Acumulado', value: formatCurrency(data.saldo_acumulado), subtitle: 'Capital Aportado', icon: <Wallet className="h-6 w-6" />, borderColor: 'border-purple-100', iconBg: 'bg-gradient-to-br from-purple-400 to-purple-600 shadow-purple-200' },
    { title: 'Exposição Simples', value: formatCurrency(data.exposicao_simples), subtitle: 'Capital Investido', icon: <TrendingDown className="h-6 w-6" />, borderColor: 'border-red-100', iconBg: 'bg-gradient-to-br from-red-400 to-red-600 shadow-red-200' },
    { title: 'Exposição Composta', value: formatCurrency(data.exposicao_composta), subtitle: 'Com Custo Oportunidade', icon: <Calculator className="h-6 w-6" />, borderColor: 'border-rose-100', iconBg: 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-200' },
  ];

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
          <span className="font-semibold">Dados ilustrativos</span> — VGV, Orçamento e Saldo a Realizar usam dados mock. Aguardando endpoints do backend.
        </p>
      </div>

      {/* Cards - 8 indicadores em grid 4x2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, idx) => (
          <div
            key={idx}
            className={`rounded-2xl border ${card.borderColor} bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg`}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider truncate">{card.title}</p>
                <p className="mt-2 text-3xl font-extrabold text-gray-900">{card.value}</p>
                <p className="mt-1 text-sm font-medium text-gray-400">{card.subtitle}</p>
              </div>
              <div className={`rounded-xl p-3 shadow-lg ${card.iconBg} text-white flex-shrink-0 ml-3`}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Grafico Exposicao de Caixa Acumulado */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Exposição de Caixa</h3>
            <p className="text-sm text-gray-500 mt-0.5">Fluxo acumulado mês a mês — {empreendimentoNome}</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={exposicao} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} interval={2} />
            <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} tickFormatter={(v: number) => `${(v / 1000000).toFixed(1)}M`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="top" height={36} formatter={(value: string) => <span className="text-sm text-gray-600">{value}</span>} />
            <Line type="monotone" dataKey="recebido" name="Recebido" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="pago" name="Pago" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="saldo_acumulado" name="Saldo Acumulado" stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
