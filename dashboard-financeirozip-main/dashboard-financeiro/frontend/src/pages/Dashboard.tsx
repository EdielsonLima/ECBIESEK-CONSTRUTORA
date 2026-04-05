import React, { useEffect, useState, useCallback } from 'react';
import { apiService } from '../services/api';
import {
  DashboardMetrics,
  GraficoMensal,
  GraficoPorCategoria,
  ContaPagar,
  MetricasReceber,
} from '../types';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, Area, AreaChart,
} from 'recharts';

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatCurrencyShort = (value: number) => {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return formatCurrency(value);
};

const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  const parts = dateString.split('T')[0].split('-');
  if (parts.length !== 3) return '-';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// Animated counter hook
const useCountUp = (target: number, duration = 1200) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let start = 0;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(target * eased));
      if (progress < 1) requestAnimationFrame(animate);
      else setCount(target);
    };
    requestAnimationFrame(animate);
  }, [target, duration]);
  return count;
};

// Sparkline mini component
const Sparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80, h = 30;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [metricas, setMetricas] = useState<DashboardMetrics | null>(null);
  const [metricasReceber, setMetricasReceber] = useState<MetricasReceber | null>(null);
  const [graficoMensal, setGraficoMensal] = useState<GraficoMensal[]>([]);
  const [graficoCategoria, setGraficoCategoria] = useState<GraficoPorCategoria[]>([]);
  const [contasEmAtraso, setContasEmAtraso] = useState<ContaPagar[]>([]);
  const [proximosVencimentos, setProximosVencimentos] = useState<ContaPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [
          metricasData, metricasReceberData, graficoMensalData,
          graficoCategoriaData, contasEmAtrasoData, proximosVencimentosData,
        ] = await Promise.all([
          apiService.getMetricas(),
          apiService.getMetricasReceber(),
          apiService.getGraficoMensal(),
          apiService.getGraficoCategoria(),
          apiService.getContas('em_atraso', 10),
          apiService.getProximosVencimentos(30),
        ]);
        setMetricas(metricasData);
        setMetricasReceber(metricasReceberData);
        setGraficoMensal(graficoMensalData);
        setGraficoCategoria(graficoCategoriaData);
        setContasEmAtraso(contasEmAtrasoData);
        setProximosVencimentos(proximosVencimentosData);
      } catch (err) {
        setError('Erro ao carregar dados. Verifique se o backend esta rodando.');
        console.error('Erro ao carregar dados:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const nav = useCallback((page: string) => {
    if (onNavigate) onNavigate(page);
  }, [onNavigate]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="relative mb-6">
            <div className="h-16 w-16 mx-auto rounded-full border-4 border-gray-200"></div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-16 w-16 rounded-full border-4 border-transparent border-t-green-500 animate-spin"></div>
          </div>
          <p className="text-gray-500 font-medium">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-2xl bg-red-50 border border-red-200 p-8 text-center max-w-md">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  // Compute ticker items
  const tickerItems: string[] = [];
  if (metricas) {
    const saldoPagar = metricas.total_a_pagar - metricas.total_em_atraso;
    tickerItems.push(`Total Pago: ${formatCurrency(metricas.total_pago)} (${metricas.quantidade_pago.toLocaleString('pt-BR')} contas)`);
    tickerItems.push(`A Pagar: ${formatCurrency(metricas.total_a_pagar)} (${metricas.quantidade_a_pagar.toLocaleString('pt-BR')} contas)`);
    if (metricas.total_em_atraso > 0) tickerItems.push(`ATENCAO: ${metricas.quantidade_em_atraso} pagamentos em atraso totalizando ${formatCurrency(metricas.total_em_atraso)}`);
  }
  if (metricasReceber) {
    tickerItems.push(`Total Recebido: ${formatCurrency(metricasReceber.total_recebido)} (${metricasReceber.quantidade_recebido.toLocaleString('pt-BR')} contas)`);
    tickerItems.push(`A Receber: ${formatCurrency(metricasReceber.total_a_receber)} (${metricasReceber.quantidade_a_receber.toLocaleString('pt-BR')} contas)`);
    if (metricasReceber.total_em_atraso > 0) tickerItems.push(`ATENCAO: ${metricasReceber.quantidade_em_atraso} recebimentos em atraso totalizando ${formatCurrency(metricasReceber.total_em_atraso)}`);
  }
  if (metricas && metricasReceber) {
    const saldo = metricasReceber.total_a_receber - metricas.total_a_pagar;
    tickerItems.push(`Saldo (A Receber - A Pagar): ${formatCurrency(saldo)}`);
  }

  // Sparkline data from monthly chart
  const sparkPago = graficoMensal.slice(-12).map(g => g.pago);
  const sparkAPagar = graficoMensal.slice(-12).map(g => g.a_pagar);
  const sparkAtraso = graficoMensal.slice(-12).map(g => g.em_atraso);

  // Format month for chart
  const formatMonth = (mes: string) => {
    const [ano, mesNum] = mes.split('-');
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${meses[parseInt(mesNum) - 1]}/${ano.slice(2)}`;
  };

  const chartData = graficoMensal.map(item => ({
    ...item,
    mesFormatado: formatMonth(item.mes),
  }));

  // Top 8 categories
  const topCategories = [...graficoCategoria].sort((a, b) => b.valor - a.valor).slice(0, 8);
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Ticker / Letreiro */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 py-3 shadow-lg">
        <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-gray-900 to-transparent z-10"></div>
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-gray-900 to-transparent z-10"></div>
        <div className="flex animate-ticker whitespace-nowrap">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="mx-8 text-sm font-medium text-gray-300 flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${item.includes('ATENCAO') ? 'bg-red-500 animate-pulse' : 'bg-green-400'}`}></span>
              <span className={item.includes('ATENCAO') ? 'text-red-400 font-semibold' : ''}>{item}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ============ CONTAS A PAGAR ============ */}
      <div className="animate-slide-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-8 w-1.5 rounded-full bg-gradient-to-b from-blue-500 to-blue-700"></div>
          <h2 className="text-xl font-bold text-gray-800">Contas a Pagar</h2>
        </div>

        {metricas && (
          <div className="grid gap-4 md:grid-cols-3">
            {/* Card Pagas */}
            <div
              onClick={() => nav('contas-pagas')}
              onMouseEnter={() => setHoveredCard('pagas')}
              onMouseLeave={() => setHoveredCard(null)}
              className="group relative cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-green-200 overflow-hidden"
            >
              <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-green-400 to-green-600 transform origin-left transition-transform duration-300 scale-x-0 group-hover:scale-x-100"></div>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Contas Pagas</p>
                  <p className="mt-2 text-2xl font-extrabold text-gray-900 animate-count-up">{formatCurrency(metricas.total_pago)}</p>
                  <p className="mt-1 text-sm text-gray-400">{metricas.quantidade_pago.toLocaleString('pt-BR')} contas</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="rounded-xl bg-gradient-to-br from-green-400 to-green-600 p-2.5 text-white shadow-lg shadow-green-200/50">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <Sparkline data={sparkPago} color="#10b981" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs text-green-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Ver detalhes
                <svg className="h-3 w-3 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* Card A Pagar */}
            <div
              onClick={() => nav('contas-a-pagar')}
              onMouseEnter={() => setHoveredCard('apagar')}
              onMouseLeave={() => setHoveredCard(null)}
              className="group relative cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-blue-200 overflow-hidden"
            >
              <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-blue-400 to-blue-600 transform origin-left transition-transform duration-300 scale-x-0 group-hover:scale-x-100"></div>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">A Pagar</p>
                  <p className="mt-2 text-2xl font-extrabold text-gray-900">{formatCurrency(metricas.total_a_pagar)}</p>
                  <p className="mt-1 text-sm text-gray-400">{metricas.quantidade_a_pagar.toLocaleString('pt-BR')} contas</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 p-2.5 text-white shadow-lg shadow-blue-200/50">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <Sparkline data={sparkAPagar} color="#3b82f6" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Ver detalhes
                <svg className="h-3 w-3 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* Card Atrasados */}
            <div
              onClick={() => nav('contas-atrasadas')}
              onMouseEnter={() => setHoveredCard('atrasados')}
              onMouseLeave={() => setHoveredCard(null)}
              className={`group relative cursor-pointer rounded-2xl border bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 overflow-hidden ${metricas.total_em_atraso > 0 ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-100 hover:border-red-200'}`}
            >
              <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-red-400 to-red-600 transform origin-left transition-transform duration-300 scale-x-0 group-hover:scale-x-100"></div>
              {metricas.total_em_atraso > 0 && (
                <div className="absolute top-3 right-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                </div>
              )}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Pagamentos Atrasados</p>
                  <p className={`mt-2 text-2xl font-extrabold ${metricas.total_em_atraso > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(metricas.total_em_atraso)}</p>
                  <p className="mt-1 text-sm text-gray-400">{metricas.quantidade_em_atraso.toLocaleString('pt-BR')} contas</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="rounded-xl bg-gradient-to-br from-red-400 to-red-600 p-2.5 text-white shadow-lg shadow-red-200/50">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <Sparkline data={sparkAtraso} color="#ef4444" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs text-red-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Ver detalhes
                <svg className="h-3 w-3 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============ CONTAS A RECEBER ============ */}
      <div className="animate-slide-up-delay-1">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-8 w-1.5 rounded-full bg-gradient-to-b from-green-500 to-green-700"></div>
          <h2 className="text-xl font-bold text-gray-800">Contas a Receber</h2>
        </div>

        {metricasReceber && (
          <div className="grid gap-4 md:grid-cols-3">
            {/* Card Recebido */}
            <div
              onClick={() => nav('contas-recebidas')}
              className="group relative cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-green-200 overflow-hidden"
            >
              <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-emerald-400 to-emerald-600 transform origin-left transition-transform duration-300 scale-x-0 group-hover:scale-x-100"></div>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Recebido</p>
                  <p className="mt-2 text-2xl font-extrabold text-gray-900">{formatCurrency(metricasReceber.total_recebido)}</p>
                  <p className="mt-1 text-sm text-gray-400">{metricasReceber.quantidade_recebido.toLocaleString('pt-BR')} contas</p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 p-2.5 text-white shadow-lg shadow-emerald-200/50">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs text-emerald-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Ver detalhes
                <svg className="h-3 w-3 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* Card A Receber */}
            <div
              onClick={() => nav('contas-a-receber')}
              className="group relative cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-blue-200 overflow-hidden"
            >
              <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-cyan-400 to-cyan-600 transform origin-left transition-transform duration-300 scale-x-0 group-hover:scale-x-100"></div>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">A Receber</p>
                  <p className="mt-2 text-2xl font-extrabold text-gray-900">{formatCurrency(metricasReceber.total_a_receber)}</p>
                  <p className="mt-1 text-sm text-gray-400">{metricasReceber.quantidade_a_receber.toLocaleString('pt-BR')} contas</p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 p-2.5 text-white shadow-lg shadow-cyan-200/50">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs text-cyan-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Ver detalhes
                <svg className="h-3 w-3 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* Card Recebimentos Atrasados */}
            <div
              onClick={() => nav('recebimentos-atrasados')}
              className={`group relative cursor-pointer rounded-2xl border bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 overflow-hidden ${metricasReceber.total_em_atraso > 0 ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-100 hover:border-orange-200'}`}
            >
              <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-orange-400 to-red-500 transform origin-left transition-transform duration-300 scale-x-0 group-hover:scale-x-100"></div>
              {metricasReceber.total_em_atraso > 0 && (
                <div className="absolute top-3 right-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                  </span>
                </div>
              )}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Recebimentos Atrasados</p>
                  <p className={`mt-2 text-2xl font-extrabold ${metricasReceber.total_em_atraso > 0 ? 'text-orange-600' : 'text-gray-900'}`}>{formatCurrency(metricasReceber.total_em_atraso)}</p>
                  <p className="mt-1 text-sm text-gray-400">{metricasReceber.quantidade_em_atraso.toLocaleString('pt-BR')} contas</p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-orange-400 to-red-500 p-2.5 text-white shadow-lg shadow-orange-200/50">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs text-orange-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Ver detalhes
                <svg className="h-3 w-3 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============ RESUMO FINANCEIRO (saldo) ============ */}
      {metricas && metricasReceber && (
        <div className="animate-slide-up-delay-2">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 p-5 text-white shadow-lg col-span-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Saldo Geral</p>
              <p className="mt-2 text-2xl font-extrabold">
                {formatCurrency((metricasReceber.total_recebido + metricasReceber.total_a_receber) - (metricas.total_pago + metricas.total_a_pagar))}
              </p>
              <p className="mt-1 text-xs text-gray-400">(Receber - Pagar)</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-5 text-white shadow-lg col-span-1">
              <p className="text-xs font-semibold text-blue-200 uppercase tracking-widest">Total Movimentado</p>
              <p className="mt-2 text-2xl font-extrabold">
                {formatCurrency(metricas.total_pago + metricasReceber.total_recebido)}
              </p>
              <p className="mt-1 text-xs text-blue-200">{(metricas.quantidade_pago + metricasReceber.quantidade_recebido).toLocaleString('pt-BR')} operacoes</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-white shadow-lg col-span-1">
              <p className="text-xs font-semibold text-amber-100 uppercase tracking-widest">Pendente Total</p>
              <p className="mt-2 text-2xl font-extrabold">
                {formatCurrency(metricas.total_a_pagar + metricasReceber.total_a_receber)}
              </p>
              <p className="mt-1 text-xs text-amber-100">{(metricas.quantidade_a_pagar + metricasReceber.quantidade_a_receber).toLocaleString('pt-BR')} contas</p>
            </div>
            <div className={`rounded-2xl p-5 text-white shadow-lg col-span-1 ${(metricas.total_em_atraso + metricasReceber.total_em_atraso) > 0 ? 'bg-gradient-to-br from-red-500 to-red-700' : 'bg-gradient-to-br from-green-500 to-green-700'}`}>
              <p className="text-xs font-semibold uppercase tracking-widest opacity-80">Inadimplencia Total</p>
              <p className="mt-2 text-2xl font-extrabold">
                {formatCurrency(metricas.total_em_atraso + metricasReceber.total_em_atraso)}
              </p>
              <p className="mt-1 text-xs opacity-80">{(metricas.quantidade_em_atraso + metricasReceber.quantidade_em_atraso).toLocaleString('pt-BR')} contas em atraso</p>
            </div>
          </div>
        </div>
      )}



    </div>
  );
};
