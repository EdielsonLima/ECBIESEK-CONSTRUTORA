import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { GraficoMensal } from '../types';

import { useTheme } from '../contexts/ThemeContext';

interface MonthlyChartProps {
  data: GraficoMensal[];
}

export const MonthlyChart: React.FC<MonthlyChartProps> = ({ data }) => {
  const { theme } = useTheme();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatMonth = (mes: string) => {
    const [ano, mesNum] = mes.split('-');
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${meses[parseInt(mesNum) - 1]}/${ano}`;
  };

  const formattedData = data.map(item => ({
    ...item,
    mesFormatado: formatMonth(item.mes),
  }));

  const textColor = theme === 'dark' ? '#94a3b8' : '#6b7280';
  const gridColor = theme === 'dark' ? '#334155' : '#e5e7eb';
  const tooltipBg = theme === 'dark' ? '#1e293b' : '#ffffff';
  const tooltipBorder = theme === 'dark' ? '#334155' : '#e5e7eb';
  const tooltipText = theme === 'dark' ? '#f1f5f9' : '#1f2937';

  // Cores adaptativas: Redução de saturação/brilho do vermelho no modo escuro p/ não cansar a vista
  const colorAtraso = theme === 'dark' ? '#f87171' : '#ef4444'; 
  const colorPago = theme === 'dark' ? '#34d399' : '#10b981';
  const colorA_Pagar = theme === 'dark' ? '#60a5fa' : '#3b82f6';

  return (
    <div className="rounded-lg border-2 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
      <h2 className="mb-4 text-xl font-bold text-gray-800 dark:text-slate-200">Evolução Mensal</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="mesFormatado" stroke={textColor} tick={{ fill: textColor }} />
          <YAxis tickFormatter={(value) => formatCurrency(value)} stroke={textColor} tick={{ fill: textColor }} />
          <Tooltip 
            formatter={(value: number) => formatCurrency(value)} 
            contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, color: tooltipText }}
            itemStyle={{ color: tooltipText }}
          />
          <Legend wrapperStyle={{ color: textColor }} />
          <Line
            type="monotone"
            dataKey="pago"
            stroke={colorPago}
            strokeWidth={2}
            name="Pago"
            dot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="a_pagar"
            stroke={colorA_Pagar}
            strokeWidth={2}
            name="A Pagar"
            dot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="em_atraso"
            stroke={colorAtraso}
            strokeWidth={2}
            name="Em Atraso"
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
