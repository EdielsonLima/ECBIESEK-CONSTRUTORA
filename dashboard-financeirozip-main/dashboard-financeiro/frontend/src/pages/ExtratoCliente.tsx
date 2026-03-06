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
  const [ordenacao, setOrdenacao] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'data_vencimento', direcao: 'asc' });

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
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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
      case 'Recebido': return 'bg-green-100 text-green-800 border border-green-200';
      case 'Atrasado': return 'bg-red-100 text-red-800 border border-red-200';
      default: return 'bg-blue-100 text-blue-800 border border-blue-200';
    }
  };

  const corTipoCondicao = (tc: string | undefined): string => {
    if (!tc) return 'bg-gray-100 text-gray-600';
    const val = tc.trim().toLowerCase();
    if (val.includes('mensal') || val === 'pm') return 'bg-blue-100 text-blue-700 border border-blue-200';
    if (val.includes('semestral') || val === 'ps') return 'bg-purple-100 text-purple-700 border border-purple-200';
    if (val.includes('contrato') || val === 'co') return 'bg-green-100 text-green-700 border border-green-200';
    if (val.includes('dito') || val === 'cr') return 'bg-teal-100 text-teal-700 border border-teal-200';
    if (val === 'ato' || val === 'at') return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
    if (val.includes('financ') || val === 'fi') return 'bg-orange-100 text-orange-700 border border-orange-200';
    if (val.includes('duo') || val === 're') return 'bg-red-100 text-red-700 border border-red-200';
    if (val.includes('o') || val === 'pb') return 'bg-pink-100 text-pink-700 border border-pink-200';
    if (val.includes('especiai') || val === 'pe') return 'bg-indigo-100 text-indigo-700 border border-indigo-200';
    if (val.includes('intermedi') || val === 'pi') return 'bg-cyan-100 text-cyan-700 border border-cyan-200';
    return 'bg-gray-100 text-gray-600 border border-gray-200';
  };

  const toggleOrdenacao = (campo: string) => {
    setOrdenacao(prev => ({
      campo,
      direcao: prev.campo === campo && prev.direcao === 'asc' ? 'desc' : 'asc',
    }));
  };

  const renderSortIcon = (campo: string) => {
    if (ordenacao.campo !== campo) return <span className="ml-1 text-gray-300">&#8597;</span>;
    return <span className="ml-1 text-green-600">{ordenacao.direcao === 'asc' ? '▲' : '▼'}</span>;
  };

  const ordenarParcelas = (parcelas: Parcela[]): Parcela[] => {
    return [...parcelas].sort((a, b) => {
      const dir = ordenacao.direcao === 'asc' ? 1 : -1;
      switch (ordenacao.campo) {
        case 'titulo': return dir * String(a.titulo).localeCompare(String(b.titulo));
        case 'tipo_condicao': return dir * String(a.tipo_condicao || '').localeCompare(String(b.tipo_condicao || ''));
        case 'data_vencimento': return dir * String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || ''));
        case 'valor_original': return dir * ((a.valor_original || 0) - (b.valor_original || 0));
        case 'acrescimo': return dir * ((a.acrescimo || 0) - (b.acrescimo || 0));
        case 'dias_atraso': return dir * ((a.dias_atraso || 0) - (b.dias_atraso || 0));
        case 'data_baixa': return dir * String(a.data_baixa || '').localeCompare(String(b.data_baixa || ''));
        case 'valor_baixa': return dir * ((a.valor_baixa || 0) - (b.valor_baixa || 0));
        case 'status': return dir * String(a.status).localeCompare(String(b.status));
        default: return 0;
      }
    });
  };

  // Computed values
  const totais = extrato?.totais;
  const parcelas = extrato?.parcelas || [];
  const parcelasRecebidas = parcelas.filter(p => p.status === 'Recebido').length;
  const parcelasAReceber = parcelas.filter(p => p.status === 'A Receber').length;
  const parcelasAtrasadas = parcelas.filter(p => p.status === 'Atrasado').length;
  const totalParcelas = parcelas.length;
  const pctRecebido = totalParcelas > 0 ? (parcelasRecebidas / totalParcelas * 100) : 0;
  const pctAReceber = totalParcelas > 0 ? (parcelasAReceber / totalParcelas * 100) : 0;
  const pctAtrasado = totalParcelas > 0 ? (parcelasAtrasadas / totalParcelas * 100) : 0;
  const pctValorRecebido = totais && totais.total_original > 0 ? (totais.total_recebido / totais.total_original * 100) : 0;

  if (loadingClientes) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-green-600 border-r-transparent"></div>
          <p className="text-gray-600">Carregando clientes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
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

      {/* Empty state */}
      {!clienteSelecionado && (
        <div className="rounded-lg bg-gray-50 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">Selecione um cliente</h3>
          <p className="mt-2 text-gray-500">Escolha um cliente no filtro acima para visualizar seu extrato</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex h-48 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-600 border-r-transparent"></div>
            <p className="text-gray-600">Carregando extrato...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!loading && extrato && extrato.parcelas.length > 0 && (
        <>
          {/* Dados do Cliente - Banner */}
          <div className="rounded-lg bg-gradient-to-r from-slate-700 to-slate-900 p-6 shadow-lg text-white">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">Dados do Cliente</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-slate-400">Cliente</p>
                <p className="font-semibold text-white text-lg">{extrato.header.cliente}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Empresa</p>
                <p className="font-medium text-slate-100">{extrato.header.empresa}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Empreendimento</p>
                <p className="font-medium text-slate-100">{extrato.header.empreendimento}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Documento</p>
                <p className="font-medium text-slate-100">{extrato.header.documento}</p>
              </div>
            </div>
          </div>

          {/* Barra de Progresso Geral */}
          <div className="rounded-lg bg-white p-5 shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Progresso de Recebimento</h3>
              <span className="text-sm font-bold text-green-600">{pctValorRecebido.toFixed(1)}% do valor recebido</span>
            </div>
            <div className="h-4 w-full rounded-full bg-gray-100 overflow-hidden flex">
              {pctRecebido > 0 && (
                <div
                  className="h-4 bg-green-500 transition-all duration-700"
                  style={{ width: `${pctRecebido}%` }}
                  title={`Recebido: ${parcelasRecebidas} parcelas (${pctRecebido.toFixed(1)}%)`}
                />
              )}
              {pctAReceber > 0 && (
                <div
                  className="h-4 bg-blue-400 transition-all duration-700"
                  style={{ width: `${pctAReceber}%` }}
                  title={`A Receber: ${parcelasAReceber} parcelas (${pctAReceber.toFixed(1)}%)`}
                />
              )}
              {pctAtrasado > 0 && (
                <div
                  className="h-4 bg-red-400 transition-all duration-700"
                  style={{ width: `${pctAtrasado}%` }}
                  title={`Atrasado: ${parcelasAtrasadas} parcelas (${pctAtrasado.toFixed(1)}%)`}
                />
              )}
            </div>
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500"></div>
                Recebido: {parcelasRecebidas}/{totalParcelas} ({pctRecebido.toFixed(1)}%)
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-full bg-blue-400"></div>
                A Receber: {parcelasAReceber} ({pctAReceber.toFixed(1)}%)
              </div>
              {parcelasAtrasadas > 0 && (
                <div className="flex items-center gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400"></div>
                  Atrasado: {parcelasAtrasadas} ({pctAtrasado.toFixed(1)}%)
                </div>
              )}
            </div>
          </div>

          {/* Cards de Totais - Gradient */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 p-4 shadow-lg text-white">
              <p className="text-xs font-medium text-slate-300 uppercase tracking-wider">Total Original</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(extrato.totais.total_original)}</p>
              <p className="text-xs text-slate-400 mt-1">{extrato.totais.quantidade_parcelas} parcelas</p>
            </div>
            <div className="rounded-lg bg-gradient-to-br from-green-500 to-emerald-700 p-4 shadow-lg text-white">
              <p className="text-xs font-medium text-green-100 uppercase tracking-wider">Total Recebido</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(extrato.totais.total_recebido)}</p>
              <p className="text-xs text-green-200 mt-1">{parcelasRecebidas} parcelas ({pctValorRecebido.toFixed(1)}%)</p>
            </div>
            <div className="rounded-lg bg-gradient-to-br from-blue-500 to-indigo-700 p-4 shadow-lg text-white">
              <p className="text-xs font-medium text-blue-100 uppercase tracking-wider">A Receber</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(extrato.totais.total_a_receber)}</p>
              <p className="text-xs text-blue-200 mt-1">{parcelasAReceber} parcelas</p>
            </div>
            <div className="rounded-lg bg-gradient-to-br from-red-500 to-rose-700 p-4 shadow-lg text-white">
              <p className="text-xs font-medium text-red-100 uppercase tracking-wider">Em Atraso</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(extrato.totais.total_atrasado)}</p>
              <p className="text-xs text-red-200 mt-1">{parcelasAtrasadas} parcelas</p>
            </div>
            <div className="rounded-lg bg-gradient-to-br from-orange-500 to-amber-700 p-4 shadow-lg text-white">
              <p className="text-xs font-medium text-orange-100 uppercase tracking-wider">Saldo Devedor</p>
              <p className="text-xl font-bold mt-1">
                {formatCurrency(extrato.totais.total_a_receber + extrato.totais.total_atrasado)}
              </p>
              <p className="text-xs text-orange-200 mt-1">{parcelasAReceber + parcelasAtrasadas} parcelas pendentes</p>
            </div>
          </div>

          {/* Historico de Parcelas */}
          <div className="rounded-lg bg-white shadow overflow-hidden">
            <div className="p-6 pb-3">
              <h2 className="text-lg font-semibold text-gray-900">Historico de Parcelas</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-green-50">
                  <tr>
                    <th onClick={() => toggleOrdenacao('titulo')} className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Titulo/Parcela {renderSortIcon('titulo')}
                    </th>
                    <th onClick={() => toggleOrdenacao('tipo_condicao')} className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Tipo Condicao {renderSortIcon('tipo_condicao')}
                    </th>
                    <th onClick={() => toggleOrdenacao('data_vencimento')} className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Vencimento {renderSortIcon('data_vencimento')}
                    </th>
                    <th onClick={() => toggleOrdenacao('valor_original')} className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Valor Original {renderSortIcon('valor_original')}
                    </th>
                    <th onClick={() => toggleOrdenacao('acrescimo')} className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Acrescimo {renderSortIcon('acrescimo')}
                    </th>
                    <th onClick={() => toggleOrdenacao('dias_atraso')} className="cursor-pointer px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Dias Atraso {renderSortIcon('dias_atraso')}
                    </th>
                    <th onClick={() => toggleOrdenacao('data_baixa')} className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Data Baixa {renderSortIcon('data_baixa')}
                    </th>
                    <th onClick={() => toggleOrdenacao('valor_baixa')} className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Valor Baixa {renderSortIcon('valor_baixa')}
                    </th>
                    <th onClick={() => toggleOrdenacao('status')} className="cursor-pointer px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Status {renderSortIcon('status')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {ordenarParcelas(extrato.parcelas).map((parcela, index) => (
                    <tr key={index} className={`hover:bg-gray-50 ${parcela.status === 'Atrasado' ? 'bg-red-50/30' : ''}`}>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-gray-900">
                        {parcela.titulo}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm">
                        {parcela.tipo_condicao ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${corTipoCondicao(parcela.tipo_condicao)}`}>
                            {parcela.tipo_condicao}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                        {formatDate(parcela.data_vencimento)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium text-gray-900">
                        {formatCurrency(parcela.valor_original)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                        {parcela.acrescimo > 0 ? (
                          <span className="text-orange-600 font-medium">{formatCurrency(parcela.acrescimo)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-center text-sm">
                        {parcela.dias_atraso > 0 ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                            parcela.dias_atraso > 90 ? 'bg-red-100 text-red-700' :
                            parcela.dias_atraso > 30 ? 'bg-orange-100 text-orange-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {parcela.dias_atraso}d
                          </span>
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
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusColor(parcela.status)}`}>
                          {parcela.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100">
                  <tr className="font-bold">
                    <td colSpan={3} className="px-3 py-3 text-sm text-gray-900">
                      TOTAIS
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-900">
                      {formatCurrency(extrato.totais.total_original)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-orange-600">
                      {formatCurrency(extrato.totais.total_acrescimo || 0)}
                    </td>
                    <td></td>
                    <td></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-green-600">
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
