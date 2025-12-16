import React from 'react';

interface MetricCardProps {
  title: string;
  value: string;
  quantity: number;
  icon: React.ReactNode;
  color: 'green' | 'blue' | 'red';
}

const colorClasses = {
  green: 'bg-green-100 text-green-800 border-green-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  red: 'bg-red-100 text-red-800 border-red-200',
};

const iconBgClasses = {
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
};

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, quantity, icon, color }) => {
  return (
    <div className={`rounded-lg border-2 p-6 ${colorClasses[color]} transition-all hover:shadow-lg`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="mt-2 text-3xl font-bold">{value}</p>
          <p className="mt-1 text-sm opacity-70">{quantity} {quantity === 1 ? 'conta' : 'contas'}</p>
        </div>
        <div className={`rounded-full p-3 ${iconBgClasses[color]} text-white`}>
          {icon}
        </div>
      </div>
    </div>
  );
};
