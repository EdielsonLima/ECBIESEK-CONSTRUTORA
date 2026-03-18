import React from 'react';

interface ValidationBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const ValidationBadge: React.FC<ValidationBadgeProps> = ({ status, size = 'sm' }) => {
  const s = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5';

  if (status === 'validado') {
    return (
      <span title="Validado" className={`inline-flex items-center justify-center ${s} rounded-full bg-green-400 flex-shrink-0`}>
        <svg className="h-2 w-2 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </span>
    );
  }

  if (status === 'drift') {
    return (
      <span title="Drift detectado" className={`inline-flex items-center justify-center ${s} rounded-full bg-yellow-400 flex-shrink-0`}>
        <span className="text-[6px] font-bold text-yellow-900">!</span>
      </span>
    );
  }

  // nao_validado
  return (
    <span title="Nao validado" className={`inline-block ${s} rounded-full border border-slate-500 flex-shrink-0`} />
  );
};
