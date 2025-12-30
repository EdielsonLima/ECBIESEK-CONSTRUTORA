import React, { useState, useEffect } from 'react';
import { SearchableSelect } from '../components/SearchableSelect';
import { apiService } from '../services/api';

interface Parcela {
  titulo: string;
  parcela: number;
  tipo_condicao: string;
  data_vencimento: string | null;
  valor_original: number;
  acrescimo: number;
  data_baixa: string | null;
  valor_baixa: number;
  dias_atraso: number;
  status: string;
}

interface ExtratoData {
  header: {
    cliente: string;
    empresa: string;
    empreendimento: string;
    documento: string;
  };
  parcelas: Parcela[];
  totais: {
    total_original: number;
    total_recebido: number;
    total_a_receber: number;
    total_atrasado: number;
    total_acrescimo: number;
    quantidade_parcelas: number;
  };
}

export const ExtratoCliente: React.FC = () => {
  const [clientes, setClientes] = useState<Array<{ id: string; nome: string }>>([]);
  const [titulos, setTitulos] = useState<Array<{ id: string; nome: string }>>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<string | null>(null);
  const [tituloSelecionado, setTituloSelecionado] = useState<string | null>(null);
  const [extrato, setExtrato] = useState<ExtratoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingClientes, setLoadingClientes] = useState(true);

  useEffect(() => {
    carregarClientes();
  }, []);

  useEffect(() => {
    if (clienteSelecionado) {
      carregarTitulos(clienteSelecionado);
      setTituloSelecionado(null);
    } else {
      setTitulos([]);
      setExtrato(null);
    }
  }, [clienteSelecionado]);

  useEffect(() => {
    if (clienteSelecionado) {
      carregarExtrato();
    }
  }, [clienteSelecionado, tituloSelecionado]);

  const carregarClientes = async () => {
    try {
      setLoadingClientes(true);
      const data = await apiService.getClientesLista();
      setClientes(data.map(c => ({ id: c.id, nome: c.nome })));
    } catch (err) {
      console.error('Erro ao carregar clientes:', err);
    } finally {
      setLoadingClientes(false);
    }
  };

  const carregarTitulos = async (cliente: string) => {
    try {
      const data = await apiService.getTitulosCliente(cliente);
      setTitulos(data.map(t => ({ id: t.id, nome: t.nome })));
    } catch (err) {
      console.error('Erro ao carregar títulos:', err);
    }
  };

  const carregarExtrato = async () => {
    if (!clienteSelecionado) return;
    
    try {
      setLoading(true);
      const data = await apiService.getExtratoCliente(clienteSelecionado, tituloSelecionado || undefined);
      setExtrato(data);
    } catch (err) {
      console.error('Erro ao carregar extrato:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const parts = dateString.split('T')[0].split('-');
    if (parts.length !== 3) return '-';
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Recebido':
        return 'bg-green-100 text-green-800';
      case 'Atrasado':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  if (loadingClientes) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="text-gray-600">Carregando clientes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Filtros</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <SearchableSelect
              label="Cliente"
              options={clientes}
              value={clienteSelecionado ?? undefined}
              onChange={(value) => setClienteSelecionado(value as string | null)}
              placeholder="Selecione um cliente..."
            />
          </div>
          {clienteSelecionado && titulos.length > 0 && (
            <div>
              <SearchableSelect
                label="Titulo"
                options={titulos}
                value={tituloSelecionado ?? undefined}
                onChange={(value) => setTituloSelecionado(value as string | null)}
                placeholder="Todos os titulos"
                emptyText="Todos os titulos"
              />
            </div>
          )}
        </div>
      </div>

      {!clienteSelecionado && (
        <div className="rounded-lg bg-gray-50 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">Selecione um cliente</h3>
          <p className="mt-2 text-gray-500">Escolha um cliente no filtro acima para visualizar seu extrato</p>
        </div>
      )}

      {loading && (
        <div className="flex h-48 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="text-gray-600">Carregando extrato...</p>
          </div>
        </div>
      )}

      {!loading && extrato && extrato.parcelas.length > 0 && (
        <>
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Dados do Cliente</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-gray-500">Cliente</p>
                <p className="font-medium text-gray-900">{extrato.header.cliente}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Empresa</p>
                <p className="font-medium text-gray-900">{extrato.header.empresa}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Empreendimento</p>
                <p className="font-medium text-gray-900">{extrato.header.empreendimento}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Documento</p>
                <p className="font-medium text-gray-900">{extrato.header.documento}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg bg-white p-4 shadow">
              <p className="text-sm text-gray-500">Total Original</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(extrato.totais.total_original)}</p>
              <p className="text-xs text-gray-400">{extrato.totais.quantidade_parcelas} parcelas</p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <p className="text-sm text-gray-500">Total Recebido</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(extrato.totais.total_recebido)}</p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <p className="text-sm text-gray-500">A Receber</p>
              <p className="text-xl font-bold text-blue-600">{formatCurrency(extrato.totais.total_a_receber)}</p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <p className="text-sm text-gray-500">Em Atraso</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(extrato.totais.total_atrasado)}</p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <p className="text-sm text-gray-500">Saldo Devedor</p>
              <p className="text-xl font-bold text-orange-600">
                {formatCurrency(extrato.totais.total_a_receber + extrato.totais.total_atrasado)}
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Historico de Parcelas</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Titulo/Parcela
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Tipo Condicao
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Vencimento
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Valor Original
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Acrescimo
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                      Dias Atraso
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Data Baixa
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Valor Baixa
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {extrato.parcelas.map((parcela, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-900">
                        {parcela.titulo}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                        {parcela.tipo_condicao || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                        {formatDate(parcela.data_vencimento)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium text-gray-900">
                        {formatCurrency(parcela.valor_original)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                        {parcela.acrescimo > 0 ? (
                          <span className="text-orange-600">{formatCurrency(parcela.acrescimo)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-center text-sm">
                        {parcela.dias_atraso > 0 ? (
                          <span className="text-red-600 font-medium">{parcela.dias_atraso}d</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                        {formatDate(parcela.data_baixa)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium">
                        {parcela.valor_baixa > 0 ? (
                          <span className="text-green-600">{formatCurrency(parcela.valor_baixa)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusColor(parcela.status)}`}>
                          {parcela.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100">
                  <tr>
                    <td colSpan={3} className="px-3 py-3 text-sm font-bold text-gray-900">
                      TOTAIS
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold text-gray-900">
                      {formatCurrency(extrato.totais.total_original)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold text-orange-600">
                      {formatCurrency(extrato.totais.total_acrescimo || 0)}
                    </td>
                    <td></td>
                    <td></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-bold text-green-600">
                      {formatCurrency(extrato.totais.total_recebido)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && extrato && extrato.parcelas.length === 0 && clienteSelecionado && (
        <div className="rounded-lg bg-yellow-50 p-6 text-center">
          <p className="text-yellow-700">Nenhuma parcela encontrada para este cliente.</p>
        </div>
      )}
    </div>
  );
};
