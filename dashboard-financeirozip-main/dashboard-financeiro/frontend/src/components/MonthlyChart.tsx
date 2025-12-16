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

interface MonthlyChartProps {
  data: GraficoMensal[];
}

export const MonthlyChart: React.FC<MonthlyChartProps> = ({ data }) => {
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

  return (
    <div className="rounded-lg border-2 border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-bold text-gray-800">Evolução Mensal</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="mesFormatado" />
          <YAxis tickFormatter={(value) => formatCurrency(value)} />
          <Tooltip formatter={(value: number) => formatCurrency(value)} />
          <Legend />
          <Line
            type="monotone"
            dataKey="pago"
            stroke="#10b981"
            strokeWidth={2}
            name="Pago"
            dot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="a_pagar"
            stroke="#3b82f6"
            strokeWidth={2}
            name="A Pagar"
            dot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="em_atraso"
            stroke="#ef4444"
            strokeWidth={2}
            name="Em Atraso"
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
