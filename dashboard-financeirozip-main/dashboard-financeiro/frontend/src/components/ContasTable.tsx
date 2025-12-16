import React from 'react';
import { ContaPagar } from '../types';

interface ContasTableProps {
  contas: ContaPagar[];
  titulo: string;
}

export const ContasTable: React.FC<ContasTableProps> = ({ contas, titulo }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  const getStatusBadge = (conta: ContaPagar) => {
    if (conta.data_pagamento) {
      return <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">Pago</span>;
    }
    
    const hoje = new Date();
    const vencimento = new Date(conta.data_vencimento);
    
    if (vencimento < hoje) {
      return <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">Em Atraso</span>;
    }
    
    return <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">A Pagar</span>;
  };

  return (
    <div className="rounded-lg border-2 border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-bold text-gray-800">{titulo}</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Descrição
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Fornecedor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Categoria
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Vencimento
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Valor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {contas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                  Nenhuma conta encontrada
                </td>
              </tr>
            ) : (
              contas.map((conta, index) => (
                <tr key={`${conta.credor || conta.fornecedor}-${conta.data_vencimento}-${index}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {conta.lancamento || conta.descricao || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {conta.credor || conta.fornecedor || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {conta.id_plano_financeiro || conta.categoria || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {formatDate(conta.data_vencimento)}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                    {formatCurrency(conta.valor_total || conta.valor || 0)}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {getStatusBadge(conta)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
