import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { MetricCard } from '../components/MetricCard';
import { MonthlyChart } from '../components/MonthlyChart';
import { CategoryChart } from '../components/CategoryChart';
import { ContasTable } from '../components/ContasTable';
import {
  DashboardMetrics,
  GraficoMensal,
  GraficoPorCategoria,
  ContaPagar,
} from '../types';

// Ícones SVG simples
const CheckIcon = () => (
  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ClockIcon = () => (
  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const AlertIcon = () => (
  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

export const Dashboard: React.FC = () => {
  const [metricas, setMetricas] = useState<DashboardMetrics | null>(null);
  const [graficoMensal, setGraficoMensal] = useState<GraficoMensal[]>([]);
  const [graficoCategoria, setGraficoCategoria] = useState<GraficoPorCategoria[]>([]);
  const [contasEmAtraso, setContasEmAtraso] = useState<ContaPagar[]>([]);
  const [proximosVencimentos, setProximosVencimentos] = useState<ContaPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [
          metricasData,
          graficoMensalData,
          graficoCategoriaData,
          contasEmAtrasoData,
          proximosVencimentosData,
        ] = await Promise.all([
          apiService.getMetricas(),
          apiService.getGraficoMensal(),
          apiService.getGraficoCategoria(),
          apiService.getContas('em_atraso', 10),
          apiService.getProximosVencimentos(30),
        ]);

        setMetricas(metricasData);
        setGraficoMensal(graficoMensalData);
        setGraficoCategoria(graficoCategoriaData);
        setContasEmAtraso(contasEmAtrasoData);
        setProximosVencimentos(proximosVencimentosData);
      } catch (err) {
        setError('Erro ao carregar dados. Verifique se o backend está rodando.');
        console.error('Erro ao carregar dados:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-lg bg-red-50 p-8 text-center">
          <p className="text-lg font-semibold text-red-800">{error}</p>
          <p className="mt-2 text-sm text-red-600">
            Certifique-se de que o backend está rodando em http://localhost:8000
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Métricas */}
      {metricas && (
        <div className="mb-8 grid gap-6 md:grid-cols-3">
          <MetricCard
            title="Contas Pagas"
            value={formatCurrency(metricas.total_pago)}
            quantity={metricas.quantidade_pago}
            icon={<CheckIcon />}
            color="green"
          />
          <MetricCard
            title="A Pagar"
            value={formatCurrency(metricas.total_a_pagar)}
            quantity={metricas.quantidade_a_pagar}
            icon={<ClockIcon />}
            color="blue"
          />
          <MetricCard
            title="Em Atraso"
            value={formatCurrency(metricas.total_em_atraso)}
            quantity={metricas.quantidade_em_atraso}
            icon={<AlertIcon />}
            color="red"
          />
        </div>
      )}

      {/* Gráficos */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <MonthlyChart data={graficoMensal} />
        <CategoryChart data={graficoCategoria} />
      </div>

      {/* Tabelas */}
      <div className="grid gap-6">
        {contasEmAtraso.length > 0 && (
          <ContasTable contas={contasEmAtraso} titulo="Contas em Atraso" />
        )}
        {proximosVencimentos.length > 0 && (
          <ContasTable contas={proximosVencimentos} titulo="Próximos Vencimentos (30 dias)" />
        )}
      </div>
    </div>
  );
};
