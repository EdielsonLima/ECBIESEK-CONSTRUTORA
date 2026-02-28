import React from 'react';

interface MetricCardProps {
  title: string;
  value: string;
  quantity: number;
  icon: React.ReactNode;
  color: 'green' | 'blue' | 'red';
}

const colorClasses = {
  green: 'bg-white text-gray-800 border-green-100 shadow-sm',
  blue: 'bg-white text-gray-800 border-blue-100 shadow-sm',
  red: 'bg-white text-gray-800 border-red-100 shadow-sm',
};

const iconBgClasses = {
  green: 'bg-gradient-to-br from-green-400 to-green-600 shadow-green-200',
  blue: 'bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-200',
  red: 'bg-gradient-to-br from-red-400 to-red-600 shadow-red-200',
};

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, quantity, icon, color }) => {
  return (
    <div className={`rounded-2xl border p-6 ${colorClasses[color]} transition-all duration-300 hover:-translate-y-1 hover:shadow-lg`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
          <p className="mt-2 text-3xl font-extrabold text-gray-900">{value}</p>
          <p className="mt-1 text-sm font-medium text-gray-400">{quantity} {quantity === 1 ? 'conta' : 'contas'}</p>
        </div>
        <div className={`rounded-xl p-3 shadow-lg ${iconBgClasses[color]} text-white`}>
          {icon}
        </div>
      </div>
    </div>
  );
};
