import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { ContaPagar, EmpresaOption, CentroCustoOption, TipoDocumentoOption, OrigemDadoOption, TipoBaixaOption } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts';

interface Estatisticas {
  quantidade_titulos: number;
  valor_liquido: number;
  valor_baixa: number;
  valor_acrescimo: number;
  valor_desconto: number;
}

interface DadosPorMes {
  mes: string;
  mes_nome: string;
  valor: number;
  quantidade: number;
}

interface DadosPorEmpresa {
  empresa: string;
  valor: number;
  quantidade: number;
}

interface TopCredor {
  credor: string;
  valor: number;
  quantidade: number;
}

interface ComparacaoAnual {
  mes_nome: string;
  ano_atual: number;
  ano_anterior: number;
  variacao: number;
}

interface ComparacaoMensal {
  periodo: string;
  valor: number;
  variacao: number;
}

type AbaAtiva = 'dados' | 'analises' | 'configuracoes';

export const ContasPagas: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('dados');
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [dadosPorMes, setDadosPorMes] = useState<DadosPorMes[]>([]);
  const [dadosPorEmpresa, setDadosPorEmpresa] = useState<DadosPorEmpresa[]>([]);
  const [topCredores, setTopCredores] = useState<TopCredor[]>([]);
  const [comparacaoAnual, setComparacaoAnual] = useState<ComparacaoAnual[]>([]);
  const [comparacaoMensal, setComparacaoMensal] = useState<ComparacaoMensal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [credores, setCredores] = useState<string[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumentoOption[]>([]);
  const [origensDado, setOrigensDado] = useState<OrigemDadoOption[]>([]);
  const [tiposBaixa, setTiposBaixa] = useState<TipoBaixaOption[]>([]);

  const [empresasPadrao, setEmpresasPadrao] = useState<number[]>([]);
  const [centrosCustoPadrao, setCentrosCustoPadrao] = useState<number[]>([]);
  const [empresasExpandidas, setEmpresasExpandidas] = useState<number[]>([]);

  const [filtroEmpresa, setFiltroEmpresa] = useState<number | undefined>();
  const [filtroCentroCusto, setFiltroCentroCusto] = useState<number | undefined>();
  const [filtroCredor, setFiltroCredor] = useState<string>('');
  const [filtroIdDocumento, setFiltroIdDocumento] = useState<string[]>([]);
  const [filtroOrigemDado, setFiltroOrigemDado] = useState<string[]>([]);
  const [filtroTipoBaixa, setFiltroTipoBaixa] = useState<number[]>([]);
  const [filtroAno, setFiltroAno] = useState<number[]>([]);
  const [filtroMes, setFiltroMes] = useState<number[]>([]);
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('');
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');

  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [mostrarDropdownDocumentos, setMostrarDropdownDocumentos] = useState(false);
  const [mostrarDropdownOrigens, setMostrarDropdownOrigens] = useState(false);
  const [mostrarDropdownTipoBaixa, setMostrarDropdownTipoBaixa] = useState(false);
  const [mostrarDropdownAnos, setMostrarDropdownAnos] = useState(false);
  const [mostrarDropdownMeses, setMostrarDropdownMeses] = useState(false);

  const formatCurrency = (value: number | undefined) => {
    if (!value) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatCurrencyShort = (value: number) => {
    if (value >= 1000000) {
      return `R$ ${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `R$ ${(value / 1000).toFixed(0)}K`;
    }
    return `R$ ${value.toFixed(0)}`;
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  const meses = [
    { valor: 1, nome: 'Janeiro' },
    { valor: 2, nome: 'Fevereiro' },
    { valor: 3, nome: 'Março' },
    { valor: 4, nome: 'Abril' },
    { valor: 5, nome: 'Maio' },
    { valor: 6, nome: 'Junho' },
    { valor: 7, nome: 'Julho' },
    { valor: 8, nome: 'Agosto' },
    { valor: 9, nome: 'Setembro' },
    { valor: 10, nome: 'Outubro' },
    { valor: 11, nome: 'Novembro' },
    { valor: 12, nome: 'Dezembro' },
  ];

  const anos = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1', '#14B8A6', '#A855F7', '#22C55E', '#0EA5E9', '#D946EF'];

  useEffect(() => {
    const carregarFiltros = async () => {
      try {
        const [empData, ccData, credData, tiposDocData, origensData, tiposBaixaData] = await Promise.all([
          apiService.getEmpresas(),
          apiService.getCentrosCusto(),
          apiService.getCredores(),
          apiService.getTiposDocumento(),
          apiService.getOrigensDado(),
          apiService.getTiposBaixa(),
        ]);
        setEmpresas(empData);
        setCentrosCusto(ccData);
        setCredores(credData);
        setTiposDocumento(tiposDocData);
        setOrigensDado(origensData);
        setTiposBaixa(tiposBaixaData);
      } catch (err) {
        console.error('Erro ao carregar filtros:', err);
      }
    };

    carregarFiltros();
  }, []);

  useEffect(() => {
    const configSalva = localStorage.getItem('contas_pagas_config');
    if (configSalva) {
      try {
        const config = JSON.parse(configSalva);
        setEmpresasPadrao(config.empresasPadrao || []);
        setCentrosCustoPadrao(config.centrosCustoPadrao || []);
      } catch (err) {
        console.error('Erro ao carregar configurações:', err);
      }
    }
  }, []);

  const buscarContas = async () => {
    try {
      setLoading(true);
      setError(null);

      const filtros = {
        empresa: filtroEmpresa,
        centro_custo: filtroCentroCusto,
        credor: filtroCredor || undefined,
        id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
        origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
        tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
        ano: filtroAno.length > 0 ? filtroAno.join(',') : undefined,
        mes: filtroMes.length > 0 ? filtroMes.join(',') : undefined,
        data_inicio: filtroDataInicio || undefined,
        data_fim: filtroDataFim || undefined,
        limite: 500,
      };

      const [contasData, estatData, mesData, empresaData, credoresData, compAnualData, compMensalData] = await Promise.all([
        apiService.getContasPagasFiltradas(filtros),
        apiService.getEstatisticasContasPagas(filtros),
        apiService.getEstatisticasPorMes({
          empresa: filtroEmpresa,
          centro_custo: filtroCentroCusto,
          credor: filtroCredor || undefined,
          id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
          origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
          tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
          ano: filtroAno.length > 0 ? filtroAno.join(',') : undefined,
        }),
        apiService.getEstatisticasPorEmpresa({
          centro_custo: filtroCentroCusto,
          credor: filtroCredor || undefined,
          id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
          origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
          tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
          ano: filtroAno.length > 0 ? filtroAno.join(',') : undefined,
          mes: filtroMes.length > 0 ? filtroMes.join(',') : undefined,
          data_inicio: filtroDataInicio || undefined,
          data_fim: filtroDataFim || undefined,
        }),
        apiService.getTopCredores({
          empresa: filtroEmpresa,
          centro_custo: filtroCentroCusto,
          id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
          origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
          tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
          ano: filtroAno.length > 0 ? filtroAno.join(',') : undefined,
          mes: filtroMes.length > 0 ? filtroMes.join(',') : undefined,
          data_inicio: filtroDataInicio || undefined,
          data_fim: filtroDataFim || undefined,
          limite: 1000,
        }),
        apiService.getComparacaoAnual({
          empresa: filtroEmpresa,
          centro_custo: filtroCentroCusto,
          credor: filtroCredor || undefined,
          id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
          origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
          tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
        }),
        apiService.getComparacaoMensal({
          empresa: filtroEmpresa,
          centro_custo: filtroCentroCusto,
          credor: filtroCredor || undefined,
          id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
          origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
          tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
        }),
      ]);

      setContas(contasData);
      setEstatisticas(estatData);
      setDadosPorMes(mesData);
      setDadosPorEmpresa(empresaData);
      setTopCredores(credoresData);
      setComparacaoAnual(compAnualData);
      setComparacaoMensal(compMensalData);
    } catch (err) {
      setError('Erro ao carregar contas pagas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    buscarContas();
  }, [filtroEmpresa, filtroCentroCusto, filtroCredor, filtroIdDocumento, filtroOrigemDado, filtroTipoBaixa, filtroAno, filtroMes]);

  const limparFiltros = () => {
    setFiltroEmpresa(undefined);
    setFiltroCentroCusto(undefined);
    setFiltroCredor('');
    setFiltroIdDocumento([]);
    setFiltroOrigemDado([]);
    setFiltroTipoBaixa([]);
    setFiltroAno([]);
    setFiltroMes([]);
    setFiltroDataInicio('');
    setFiltroDataFim('');
  };

  const exportarCSV = () => {
    if (contas.length === 0) return;

    const headers = ['Credor', 'Data Pagamento', 'Valor Pago', 'Documento', 'Empresa', 'Centro Custo'];
    const rows = contas.map(conta => [
      conta.credor || '',
      conta.data_pagamento ? formatDate(conta.data_pagamento) : '',
      conta.valor_total?.toString() || '0',
      conta.numero_documento || '',
      conta.nome_empresa || '',
      conta.nome_centrocusto || '',
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `contas_pagas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading && contas.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-green-600 border-r-transparent"></div>
          <p className="text-gray-600">Carregando contas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  const renderFiltros = () => (
    <div className="mt-6 rounded-lg bg-white p-6 shadow">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">Filtros Avancados</h3>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SearchableSelect
          options={empresas}
          value={filtroEmpresa}
          onChange={(value) => setFiltroEmpresa(value as number | undefined)}
          label="Empresa"
          placeholder="Selecione uma empresa..."
          emptyText="Todas"
        />

        <SearchableSelect
          options={centrosCusto}
          value={filtroCentroCusto}
          onChange={(value) => setFiltroCentroCusto(value as number | undefined)}
          label="Centro de Custo"
          placeholder="Selecione um centro de custo..."
          emptyText="Todos"
        />

        <SearchableSelect
          options={credores.map(credor => ({ id: credor, nome: credor }))}
          value={filtroCredor}
          onChange={(value) => setFiltroCredor(value as string || '')}
          label="Credor/Fornecedor"
          placeholder="Selecione um credor..."
          emptyText="Todos"
        />

        <div className="relative">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Tipo Documento
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMostrarDropdownDocumentos(!mostrarDropdownDocumentos)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:border-blue-500 focus:outline-none"
            >
              {filtroIdDocumento.length === 0 ? (
                <span className="text-gray-500">Selecione os documentos...</span>
              ) : (
                <span>
                  {filtroIdDocumento.length} documento(s) selecionado(s)
                </span>
              )}
              <svg
                className={`absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 transition-transform ${
                  mostrarDropdownDocumentos ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {mostrarDropdownDocumentos && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg">
                <div className="flex gap-2 border-b border-gray-200 bg-gray-50 p-2">
                  <button
                    type="button"
                    onClick={() => setFiltroIdDocumento(tiposDocumento.map(t => t.id))}
                    className="flex-1 rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                  >
                    Selecionar Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroIdDocumento([])}
                    className="flex-1 rounded bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-700"
                  >
                    Limpar Selecao
                  </button>
                </div>
                <div className="max-h-60 overflow-auto">
                  {tiposDocumento.map((tipo) => (
                    <label
                      key={tipo.id}
                      className="flex cursor-pointer items-center px-3 py-2 hover:bg-gray-100"
                    >
                      <input
                        type="checkbox"
                        checked={filtroIdDocumento.includes(tipo.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFiltroIdDocumento([...filtroIdDocumento, tipo.id]);
                          } else {
                            setFiltroIdDocumento(filtroIdDocumento.filter(id => id !== tipo.id));
                          }
                        }}
                        className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">
                        {tipo.id} - {tipo.nome}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="relative">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Origem do Dado
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMostrarDropdownOrigens(!mostrarDropdownOrigens)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:border-blue-500 focus:outline-none"
            >
              {filtroOrigemDado.length === 0 ? (
                <span className="text-gray-500">Selecione as origens...</span>
              ) : (
                <span>
                  {filtroOrigemDado.length} origem(ns) selecionada(s)
                </span>
              )}
              <svg
                className={`absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 transition-transform ${
                  mostrarDropdownOrigens ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {mostrarDropdownOrigens && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg">
                <div className="flex gap-2 border-b border-gray-200 bg-gray-50 p-2">
                  <button
                    type="button"
                    onClick={() => setFiltroOrigemDado(origensDado.map(o => o.id))}
                    className="flex-1 rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                  >
                    Selecionar Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroOrigemDado([])}
                    className="flex-1 rounded bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-700"
                  >
                    Limpar Selecao
                  </button>
                </div>
                <div className="max-h-60 overflow-auto">
                  {origensDado.map((origem) => (
                    <label
                      key={origem.id}
                      className="flex cursor-pointer items-center px-3 py-2 hover:bg-gray-100"
                    >
                      <input
                        type="checkbox"
                        checked={filtroOrigemDado.includes(origem.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFiltroOrigemDado([...filtroOrigemDado, origem.id]);
                          } else {
                            setFiltroOrigemDado(filtroOrigemDado.filter(id => id !== origem.id));
                          }
                        }}
                        className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">
                        {origem.nome}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="relative">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Tipo de Baixa
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMostrarDropdownTipoBaixa(!mostrarDropdownTipoBaixa)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:border-blue-500 focus:outline-none"
            >
              {filtroTipoBaixa.length === 0 ? (
                <span className="text-gray-500">Selecione os tipos...</span>
              ) : (
                <span>
                  {filtroTipoBaixa.length} tipo(s) selecionado(s)
                </span>
              )}
              <svg
                className={`absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 transition-transform ${
                  mostrarDropdownTipoBaixa ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {mostrarDropdownTipoBaixa && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg">
                <div className="flex gap-2 border-b border-gray-200 bg-gray-50 p-2">
                  <button
                    type="button"
                    onClick={() => setFiltroTipoBaixa(tiposBaixa.map(t => t.id))}
                    className="flex-1 rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                  >
                    Selecionar Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroTipoBaixa([])}
                    className="flex-1 rounded bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-700"
                  >
                    Limpar Selecao
                  </button>
                </div>
                <div className="max-h-60 overflow-auto">
                  {tiposBaixa.map((tipo) => (
                    <label
                      key={tipo.id}
                      className="flex cursor-pointer items-center px-3 py-2 hover:bg-gray-100"
                    >
                      <input
                        type="checkbox"
                        checked={filtroTipoBaixa.includes(tipo.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFiltroTipoBaixa([...filtroTipoBaixa, tipo.id]);
                          } else {
                            setFiltroTipoBaixa(filtroTipoBaixa.filter(id => id !== tipo.id));
                          }
                        }}
                        className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">
                        Tipo {tipo.id} - {tipo.nome}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="relative">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Ano
          </label>
          <button
            type="button"
            onClick={() => setMostrarDropdownAnos(!mostrarDropdownAnos)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:border-blue-500 focus:outline-none"
          >
            {filtroAno.length > 0 ? `${filtroAno.length} ano(s) selecionado(s)` : 'Todos os anos'}
          </button>
          {mostrarDropdownAnos && (
            <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-300 bg-white shadow-lg">
              {anos.map((ano) => (
                <label
                  key={ano}
                  className="flex cursor-pointer items-center px-3 py-2 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={filtroAno.includes(ano)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFiltroAno([...filtroAno, ano]);
                      } else {
                        setFiltroAno(filtroAno.filter((a) => a !== ano));
                      }
                    }}
                    className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{ano}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Mês
          </label>
          <button
            type="button"
            onClick={() => setMostrarDropdownMeses(!mostrarDropdownMeses)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:border-blue-500 focus:outline-none"
          >
            {filtroMes.length > 0 ? `${filtroMes.length} mês(es) selecionado(s)` : 'Todos os meses'}
          </button>
          {mostrarDropdownMeses && (
            <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-300 bg-white shadow-lg">
              {meses.map((mes) => (
                <label
                  key={mes.valor}
                  className="flex cursor-pointer items-center px-3 py-2 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={filtroMes.includes(mes.valor)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFiltroMes([...filtroMes, mes.valor]);
                      } else {
                        setFiltroMes(filtroMes.filter((m) => m !== mes.valor));
                      }
                    }}
                    className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{mes.nome}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="data-inicio" className="mb-2 block text-sm font-medium text-gray-700">
            Data Inicio
          </label>
          <input
            id="data-inicio"
            type="date"
            value={filtroDataInicio}
            onChange={(e) => setFiltroDataInicio(e.target.value)}
            min="2000-01-01"
            max="2099-12-31"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="data-fim" className="mb-2 block text-sm font-medium text-gray-700">
            Data Fim
          </label>
          <input
            id="data-fim"
            type="date"
            value={filtroDataFim}
            onChange={(e) => setFiltroDataFim(e.target.value)}
            min="2000-01-01"
            max="2099-12-31"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={buscarContas}
          disabled={loading}
          className="flex items-center rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              Buscando...
            </>
          ) : (
            <>
              <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Buscar
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            limparFiltros();
            setTimeout(buscarContas, 100);
          }}
          className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
        >
          Limpar Filtros
        </button>
      </div>
    </div>
  );

  const renderAbaDados = () => {
    const filtrosAtivos = [];
    if (filtroEmpresa) {
      const empresa = empresas.find(e => e.id === filtroEmpresa);
      if (empresa) filtrosAtivos.push(`Empresa: ${empresa.nome}`);
    }
    if (filtroCentroCusto) {
      const cc = centrosCusto.find(c => c.id === filtroCentroCusto);
      if (cc) filtrosAtivos.push(`Centro Custo: ${cc.nome}`);
    }
    if (filtroCredor) filtrosAtivos.push(`Credor: ${filtroCredor}`);
    if (filtroIdDocumento.length > 0) filtrosAtivos.push(`Docs: ${filtroIdDocumento.length} selecionado(s)`);
    if (filtroOrigemDado.length > 0) filtrosAtivos.push(`Origens: ${filtroOrigemDado.length} selecionada(s)`);
    if (filtroTipoBaixa.length > 0) filtrosAtivos.push(`Tipos Baixa: ${filtroTipoBaixa.length} selecionado(s)`);
    if (filtroAno.length > 0) filtrosAtivos.push(`Anos: ${filtroAno.join(', ')}`);
    if (filtroMes.length > 0) {
      const mesesNomes = filtroMes.map(m => meses.find(mes => mes.valor === m)?.nome).filter(Boolean);
      filtrosAtivos.push(`Meses: ${mesesNomes.join(', ')}`);
    }
    if (filtroDataInicio) filtrosAtivos.push(`Data Inicio: ${filtroDataInicio}`);
    if (filtroDataFim) filtrosAtivos.push(`Data Fim: ${filtroDataFim}`);

    return (
      <>
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Contas Pagas</h2>
              <p className="mt-1 text-sm text-gray-600">
                {contas.length} conta(s) exibida(s)
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportarCSV}
                disabled={contas.length === 0}
                className="flex items-center rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
              >
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Exportar CSV
              </button>
              <button
                type="button"
                onClick={() => setMostrarFiltros(!mostrarFiltros)}
                className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
                {filtrosAtivos.length > 0 && (
                  <span className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-600">
                    {filtrosAtivos.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {filtrosAtivos.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {filtrosAtivos.map((filtro, index) => (
                <span
                  key={index}
                  className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800"
                >
                  {filtro}
                </span>
              ))}
            </div>
          )}

          {mostrarFiltros && renderFiltros()}
        </div>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-green-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Credor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Data Pagamento
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Valor Pago
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Documento
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Empresa
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Centro Custo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {contas.map((conta, index) => (
                <tr key={`${conta.credor}-${conta.data_pagamento}-${index}`} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {conta.credor || '-'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatDate(conta.data_pagamento)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-green-600">
                    {formatCurrency(conta.valor_total)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {conta.numero_documento || '-'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {conta.nome_empresa || '-'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {conta.nome_centrocusto || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
    );
  };

  const salvarConfiguracoes = () => {
    const config = {
      empresasPadrao,
      centrosCustoPadrao,
    };
    localStorage.setItem('contas_pagas_config', JSON.stringify(config));
    alert('Configurações salvas com sucesso! Os filtros padrão serão aplicados automaticamente.');
  };

  const aplicarFiltrosPadrao = () => {
    if (empresasPadrao.length > 0 && !filtroEmpresa) {
      const primeiraEmpresa = empresasPadrao[0];
      setFiltroEmpresa(primeiraEmpresa);
    }
    if (centrosCustoPadrao.length > 0 && !filtroCentroCusto) {
      const primeiroCentro = centrosCustoPadrao[0];
      setFiltroCentroCusto(primeiroCentro);
    }
  };

  const toggleEmpresaExpandida = (empresaId: number) => {
    if (empresasExpandidas.includes(empresaId)) {
      setEmpresasExpandidas(empresasExpandidas.filter(id => id !== empresaId));
    } else {
      setEmpresasExpandidas([...empresasExpandidas, empresaId]);
    }
  };

  const getCentrosCustoPorEmpresa = (empresaId: number) => {
    return centrosCusto.filter(cc => {
      // @ts-ignore - id_empresa é adicionado dinamicamente do backend
      return cc.id_empresa === empresaId;
    });
  };

  const toggleEmpresaSelecionada = (empresaId: number) => {
    const centrosDaEmpresa = getCentrosCustoPorEmpresa(empresaId);
    const idsCentros = centrosDaEmpresa.map(c => c.id);

    // Se a empresa não tem centros de custo, apenas alterna a seleção da empresa
    if (centrosDaEmpresa.length === 0) {
      if (empresasPadrao.includes(empresaId)) {
        setEmpresasPadrao(empresasPadrao.filter(id => id !== empresaId));
      } else {
        setEmpresasPadrao([...empresasPadrao, empresaId]);
      }
      return;
    }

    // Se tem centros de custo, mantém a lógica anterior
    const todosOsCentrosSelecionados = idsCentros.every(id => centrosCustoPadrao.includes(id));

    if (todosOsCentrosSelecionados) {
      // Desmarcar empresa e todos seus centros
      setEmpresasPadrao(empresasPadrao.filter(id => id !== empresaId));
      setCentrosCustoPadrao(centrosCustoPadrao.filter(id => !idsCentros.includes(id)));
    } else {
      // Marcar empresa e todos seus centros
      if (!empresasPadrao.includes(empresaId)) {
        setEmpresasPadrao([...empresasPadrao, empresaId]);
      }
      const novoCentros = [...new Set([...centrosCustoPadrao, ...idsCentros])];
      setCentrosCustoPadrao(novoCentros);
    }
  };

  const toggleCentroCusto = (empresaId: number, centroId: number) => {
    if (centrosCustoPadrao.includes(centroId)) {
      setCentrosCustoPadrao(centrosCustoPadrao.filter(id => id !== centroId));
      // Se desmarcar um centro, desmarcar a empresa também
      setEmpresasPadrao(empresasPadrao.filter(id => id !== empresaId));
    } else {
      setCentrosCustoPadrao([...centrosCustoPadrao, centroId]);
      // Verificar se todos os centros da empresa estão selecionados
      const centrosDaEmpresa = getCentrosCustoPorEmpresa(empresaId);
      const todosOsCentrosSelecionados = centrosDaEmpresa.every(c =>
        c.id === centroId || centrosCustoPadrao.includes(c.id)
      );
      if (todosOsCentrosSelecionados && !empresasPadrao.includes(empresaId)) {
        setEmpresasPadrao([...empresasPadrao, empresaId]);
      }
    }
  };

  const renderAbaConfiguracoes = () => (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Configurações de Filtros Padrão</h2>
        <p className="mb-6 text-sm text-gray-600">
          Selecione as empresas e seus respectivos centros de custo que devem ser usados por padrão nos cálculos e consultas.
          As configurações serão salvas no seu navegador.
        </p>

        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Empresas e Centros de Custo
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmpresasPadrao(empresas.map(e => e.id));
                    setCentrosCustoPadrao(centrosCusto.map(c => c.id));
                  }}
                  className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                >
                  Selecionar Tudo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmpresasPadrao([]);
                    setCentrosCustoPadrao([]);
                  }}
                  className="rounded bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-700"
                >
                  Limpar Tudo
                </button>
                <button
                  type="button"
                  onClick={() => setEmpresasExpandidas(empresas.map(e => e.id))}
                  className="rounded bg-purple-600 px-3 py-1 text-sm text-white hover:bg-purple-700"
                >
                  Expandir Todas
                </button>
                <button
                  type="button"
                  onClick={() => setEmpresasExpandidas([])}
                  className="rounded bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-700"
                >
                  Recolher Todas
                </button>
              </div>
            </div>

            <div className="max-h-[600px] space-y-1 overflow-auto rounded-lg border border-gray-200 p-3">
              {empresas.map((empresa) => {
                const centrosDaEmpresa = getCentrosCustoPorEmpresa(empresa.id);
                const isExpandida = empresasExpandidas.includes(empresa.id);

                // Para empresas sem centros de custo, verifica se a empresa está selecionada
                // Para empresas com centros de custo, verifica se todos os centros estão selecionados
                const todosOsCentrosSelecionados = centrosDaEmpresa.length === 0
                  ? empresasPadrao.includes(empresa.id)
                  : centrosDaEmpresa.every(c => centrosCustoPadrao.includes(c.id));

                const algunsCentrosSelecionados = centrosDaEmpresa.length > 0 &&
                  centrosDaEmpresa.some(c => centrosCustoPadrao.includes(c.id));

                return (
                  <div key={empresa.id} className="rounded border border-gray-200 bg-white">
                    <div className="flex items-center gap-2 bg-gray-50 p-3 hover:bg-gray-100">
                      <button
                        type="button"
                        onClick={() => toggleEmpresaExpandida(empresa.id)}
                        className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-200"
                        title={isExpandida ? 'Recolher empresa' : 'Expandir empresa'}
                        aria-label={isExpandida ? 'Recolher empresa' : 'Expandir empresa'}
                      >
                        <svg
                          className={`h-4 w-4 transition-transform ${isExpandida ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      <label className="flex flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={todosOsCentrosSelecionados}
                          onChange={() => toggleEmpresaSelecionada(empresa.id)}
                          className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          style={algunsCentrosSelecionados && !todosOsCentrosSelecionados ? {
                            opacity: 0.6,
                            accentColor: '#FFA500'
                          } : {}}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                              {empresa.id}
                            </span>
                            <span className="text-sm font-semibold text-gray-900">
                              {empresa.nome}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {centrosDaEmpresa.length} centro(s) de custo • {' '}
                            {centrosDaEmpresa.filter(c => centrosCustoPadrao.includes(c.id)).length} selecionado(s)
                          </div>
                        </div>
                      </label>
                    </div>

                    {isExpandida && centrosDaEmpresa.length > 0 && (
                      <div className="border-t border-gray-200 bg-white p-2">
                        <div className="space-y-1">
                          {centrosDaEmpresa.map((centro) => (
                            <label
                              key={centro.id}
                              className="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-gray-50"
                            >
                              <div className="w-6"></div>
                              <input
                                type="checkbox"
                                checked={centrosCustoPadrao.includes(centro.id)}
                                onChange={() => toggleCentroCusto(empresa.id, centro.id)}
                                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                                    {centro.id}
                                  </span>
                                  <span className="text-xs text-gray-700">
                                    {centro.nome}
                                  </span>
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {isExpandida && centrosDaEmpresa.length === 0 && (
                      <div className="border-t border-gray-200 bg-gray-50 p-3 text-center">
                        <span className="text-xs text-gray-500">Nenhum centro de custo encontrado</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 p-3">
              <div className="text-sm text-gray-700">
                <span className="font-semibold">{empresasPadrao.length}</span> empresa(s) • {' '}
                <span className="font-semibold">{centrosCustoPadrao.length}</span> centro(s) de custo selecionado(s)
              </div>
            </div>
          </div>

          <div className="flex gap-3 border-t border-gray-200 pt-6">
            <button
              type="button"
              onClick={salvarConfiguracoes}
              className="flex items-center rounded-lg bg-green-600 px-6 py-3 text-white hover:bg-green-700"
            >
              <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Salvar Configurações
            </button>
            <button
              type="button"
              onClick={aplicarFiltrosPadrao}
              className="flex items-center rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
            >
              <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Aplicar aos Filtros Atuais
            </button>
          </div>

          <div className="rounded-lg bg-blue-50 p-4">
            <h4 className="mb-2 flex items-center text-sm font-semibold text-blue-900">
              <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Como funciona?
            </h4>
            <ul className="space-y-1 text-xs text-blue-800">
              <li>• Clique na seta ao lado da empresa para expandir e ver seus centros de custo</li>
              <li>• Marque a empresa para selecionar todos os seus centros de custo de uma vez</li>
              <li>• Marque centros de custo individualmente conforme necessário</li>
              <li>• As configurações são salvas localmente no seu navegador</li>
              <li>• Use "Aplicar aos Filtros Atuais" para aplicar rapidamente a configuração</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAbaAnalises = () => {
    const anoAtual = new Date().getFullYear();
    const anoAnterior = anoAtual - 1;

    const filtrosAtivos = [];
    if (filtroEmpresa) {
      const empresa = empresas.find(e => e.id === filtroEmpresa);
      if (empresa) filtrosAtivos.push(`Empresa: ${empresa.nome}`);
    }
    if (filtroCentroCusto) {
      const cc = centrosCusto.find(c => c.id === filtroCentroCusto);
      if (cc) filtrosAtivos.push(`Centro Custo: ${cc.nome}`);
    }
    if (filtroCredor) filtrosAtivos.push(`Credor: ${filtroCredor}`);
    if (filtroIdDocumento.length > 0) filtrosAtivos.push(`Docs: ${filtroIdDocumento.length} selecionado(s)`);
    if (filtroOrigemDado.length > 0) filtrosAtivos.push(`Origens: ${filtroOrigemDado.length} selecionada(s)`);
    if (filtroTipoBaixa.length > 0) filtrosAtivos.push(`Tipos Baixa: ${filtroTipoBaixa.length} selecionado(s)`);
    if (filtroAno.length > 0) filtrosAtivos.push(`Anos: ${filtroAno.join(', ')}`);
    if (filtroMes.length > 0) {
      const mesesNomes = filtroMes.map(m => meses.find(mes => mes.valor === m)?.nome).filter(Boolean);
      filtrosAtivos.push(`Meses: ${mesesNomes.join(', ')}`);
    }
    if (filtroDataInicio) filtrosAtivos.push(`Data Inicio: ${filtroDataInicio}`);
    if (filtroDataFim) filtrosAtivos.push(`Data Fim: ${filtroDataFim}`);

    return (
      <div className="space-y-8">
        <div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setMostrarFiltros(!mostrarFiltros)}
              className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
              {filtrosAtivos.length > 0 && (
                <span className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-600">
                  {filtrosAtivos.length}
                </span>
              )}
            </button>
            {filtrosAtivos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {filtrosAtivos.map((filtro, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800"
                  >
                    {filtro}
                  </span>
                ))}
              </div>
            )}
          </div>
          {mostrarFiltros && renderFiltros()}
        </div>

        {comparacaoAnual.length > 0 && (() => {
          const dadosComVariacao = comparacaoAnual.map(item => {
            const variacao = item.ano_anterior > 0 
              ? ((item.ano_atual - item.ano_anterior) / item.ano_anterior) * 100 
              : (item.ano_atual > 0 ? 100 : 0);
            return { ...item, variacao };
          });

          return (
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-2 text-xl font-semibold text-gray-900">Comparativo Anual: {anoAtual} vs {anoAnterior}</h3>
              <p className="mb-4 text-sm text-gray-500">
                Evolucao mensal dos pagamentos comparando os dois ultimos anos
                <span className="ml-4 text-xs text-gray-400">(% variacao acima das barras)</span>
              </p>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosComVariacao} margin={{ top: 35, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes_nome" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) => {
                        if (active && payload && payload.length) {
                          const dados = dadosComVariacao.find(d => d.mes_nome === label);
                          const variacao = dados?.variacao || 0;
                          const anoAtualValue = dados?.ano_atual || 0;
                          const anoAnteriorValue = dados?.ano_anterior || 0;
                          const diferencaAbsoluta = anoAtualValue - anoAnteriorValue;

                          return (
                            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                              <p className="mb-2 font-semibold text-gray-900">Mes: {label}</p>
                              {payload.map((entry, idx) => (
                                <p key={idx} className="text-sm" style={{ color: entry.color }}>
                                  {entry.name}: {formatCurrency(entry.value || 0)}
                                </p>
                              ))}
                              <p className={`mt-1 text-sm ${diferencaAbsoluta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                Diferenca: {formatCurrency(Math.abs(diferencaAbsoluta))} {diferencaAbsoluta >= 0 ? '↑' : '↓'}
                              </p>
                              <p className={`mt-1 text-sm font-bold ${variacao >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                Variacao: {variacao >= 0 ? '+' : ''}{variacao.toFixed(1)}%
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="ano_anterior" name={`${anoAnterior}`} fill="#94A3B8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ano_atual" name={`${anoAtual}`} fill="#3B82F6" radius={[4, 4, 0, 0]} label={({ x, y, width, index }: { x: number; y: number; width: number; index: number }) => {
                      const variacao = dadosComVariacao[index]?.variacao || 0;
                      return (
                        <text
                          x={x + width / 2}
                          y={y - 8}
                          fill={variacao >= 0 ? '#10B981' : '#EF4444'}
                          textAnchor="middle"
                          fontSize={9}
                          fontWeight="bold"
                        >
                          {variacao >= 0 ? '+' : ''}{variacao.toFixed(0)}%
                        </text>
                      );
                    }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })()}

        {comparacaoMensal.length > 0 && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-2 text-xl font-semibold text-gray-900">Evolucao Mensal com Variacao</h3>
            <p className="mb-4 text-sm text-gray-500">Ultimos 12 meses com variacao percentual em relacao ao mes anterior</p>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparacaoMensal} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) => {
                      if (active && payload && payload.length) {
                        const valorEntry = payload.find(p => p.name === 'Valor');
                        const variacaoEntry = payload.find(p => p.name === 'Variacao %');
                        const variacao = variacaoEntry?.value || 0;
                        const valorAtual = valorEntry?.value || 0;
                        const currentIndex = comparacaoMensal.findIndex(d => d.periodo === label);
                        const valorAnterior = currentIndex > 0 ? comparacaoMensal[currentIndex - 1].valor : null;

                        return (
                          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                            <p className="mb-2 font-semibold text-gray-900">Periodo: {label}</p>
                            <p className="text-sm text-blue-600">
                              Valor Atual: {formatCurrency(valorAtual)}
                            </p>
                            {valorAnterior !== null && (
                              <p className="text-sm text-gray-600">
                                Mes Anterior: {formatCurrency(valorAnterior)}
                              </p>
                            )}
                            <p className={`mt-2 text-sm font-bold ${variacao >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              Variacao: {variacao >= 0 ? '+' : ''}{variacao.toFixed(1)}%
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="valor" name="Valor" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6' }} />
                  <Line yAxisId="right" type="monotone" dataKey="variacao" name="Variacao %" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {dadosPorMes.length > 0 && (() => {
          const valores = dadosPorMes.map(d => d.valor);
          const maxValor = Math.max(...valores);
          const minValor = Math.min(...valores.filter(v => v > 0));
          const indexMax = valores.indexOf(maxValor);
          const indexMin = valores.indexOf(minValor);

          // Adicionar ano ao label se houver filtros de ano
          const dadosComVariacao = dadosPorMes.map((item, index) => {
            let labelDisplay = item.mes_nome;

            // Se o campo 'mes' tem formato 'YYYY-MM', extrair o ano
            if (item.mes && item.mes.includes('-')) {
              const [ano] = item.mes.split('-');
              labelDisplay = `${item.mes_nome}/${ano}`;
            }
            // Se há filtros de ano aplicados e é apenas um ano, adicionar ao label
            else if (filtroAno.length === 1) {
              labelDisplay = `${item.mes_nome}/${filtroAno[0]}`;
            }
            // Se há múltiplos anos no filtro, tentar inferir do dado
            else if (filtroAno.length > 1 && item.mes) {
              const mesNumero = parseInt(item.mes);
              if (!isNaN(mesNumero)) {
                // Se mes é um número, pode indicar apenas o mês, usar ano atual
                labelDisplay = item.mes_nome;
              }
            }

            if (index === 0) {
              return { ...item, variacao: 0, labelDisplay };
            }
            const anterior = dadosPorMes[index - 1].valor;
            const variacao = anterior > 0 ? ((item.valor - anterior) / anterior) * 100 : 0;
            return { ...item, variacao, labelDisplay };
          });

          const getBarColor = (index: number) => {
            if (index === indexMax) return '#10B981';
            if (index === indexMin) return '#EF4444';
            return '#3B82F6';
          };

          return (
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-2 text-xl font-semibold text-gray-900">Pagamentos por Mes</h3>
              <p className="mb-4 text-sm text-gray-500">
                Distribuicao de valores pagos ao longo do periodo selecionado
                <span className="ml-4 inline-flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded bg-green-500"></span>
                    <span className="text-xs">Maior</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded bg-red-500"></span>
                    <span className="text-xs">Menor</span>
                  </span>
                </span>
              </p>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosComVariacao} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="labelDisplay" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string }) => {
                        if (active && payload && payload.length) {
                          const currentIndex = dadosComVariacao.findIndex(d => d.labelDisplay === label);
                          const dados = dadosComVariacao[currentIndex];
                          const variacao = dados?.variacao || 0;
                          const valorAtual = payload[0]?.value || 0;
                          const valorAnterior = currentIndex > 0 ? dadosComVariacao[currentIndex - 1].valor : null;

                          return (
                            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                              <p className="mb-2 font-semibold text-gray-900">Periodo: {label}</p>
                              <p className="text-sm text-blue-600">
                                Valor Atual: {formatCurrency(valorAtual)}
                              </p>
                              {valorAnterior !== null && (
                                <>
                                  <p className="text-sm text-gray-600">
                                    Mes Anterior: {formatCurrency(valorAnterior)}
                                  </p>
                                  <p className={`mt-2 text-sm font-bold ${variacao >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    Variacao: {variacao >= 0 ? '+' : ''}{variacao.toFixed(1)}%
                                  </p>
                                </>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="valor" fill="#3B82F6" radius={[4, 4, 0, 0]} label={({ x, y, width, index }: { x: number; y: number; width: number; index: number }) => {
                      const variacao = dadosComVariacao[index]?.variacao || 0;
                      if (index === 0) return <text></text>;
                      return (
                        <text
                          x={x + width / 2}
                          y={y - 8}
                          fill={variacao >= 0 ? '#10B981' : '#EF4444'}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight="bold"
                        >
                          {variacao >= 0 ? '+' : ''}{variacao.toFixed(1)}%
                        </text>
                      );
                    }}>
                      {dadosComVariacao.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={getBarColor(index)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })()}

        {dadosPorEmpresa.length > 0 && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-2 text-xl font-semibold text-gray-900">Pagamentos por Empresa</h3>
            <p className="mb-4 text-sm text-gray-500">Ranking das empresas por volume de pagamentos</p>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosPorEmpresa} layout="vertical" margin={{ top: 5, right: 120, left: 200, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="empresa"
                    tick={{ fontSize: 10 }}
                    width={190}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Valor']}
                    labelFormatter={(label) => label}
                  />
                  <Bar dataKey="valor" fill="#10B981" radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (value: number) => formatCurrency(value), fontSize: 11 }}>
                    {dadosPorEmpresa.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {topCredores.length > 0 && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-2 text-xl font-semibold text-gray-900">Top 10 Credores por Valor</h3>
            <p className="mb-4 text-sm text-gray-500">Maiores fornecedores em volume financeiro</p>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-3 text-left text-sm font-medium text-gray-500">#</th>
                    <th className="py-3 text-left text-sm font-medium text-gray-500">Credor</th>
                    <th className="py-3 text-right text-sm font-medium text-gray-500">Valor Total</th>
                    <th className="py-3 text-right text-sm font-medium text-gray-500">Qtd. Titulos</th>
                    <th className="py-3 text-left text-sm font-medium text-gray-500">% do Total</th>
                  </tr>
                </thead>
                <tbody>
                  {topCredores.map((credor, index) => {
                    const percentual = estatisticas && estatisticas.valor_liquido > 0
                      ? (credor.valor / estatisticas.valor_liquido) * 100
                      : 0;
                    return (
                      <tr key={credor.credor} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 text-sm text-gray-600">{index + 1}</td>
                        <td className="py-4 text-sm font-medium text-gray-900">{credor.credor}</td>
                        <td className="py-4 text-right text-sm font-semibold text-green-600">{formatCurrency(credor.valor)}</td>
                        <td className="py-4 text-right text-sm text-gray-600">{credor.quantidade.toLocaleString('pt-BR')}</td>
                        <td className="py-4">
                          <div className="flex items-center">
                            <div className="mr-2 h-3 w-32 overflow-hidden rounded-full bg-gray-200">
                              <div 
                                className="h-full rounded-full bg-blue-500" 
                                style={{ width: `${Math.min(percentual, 100)}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-500">{percentual.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {estatisticas && (
        <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Valor Liquido Total</div>
            <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_liquido)}</div>
            <div className="mt-1 text-xs opacity-75">{estatisticas.quantidade_titulos.toLocaleString('pt-BR')} titulos</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-green-500 to-green-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Valor Baixa</div>
            <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_baixa)}</div>
            <div className="mt-1 text-xs opacity-75">Total pago</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Acrescimos</div>
            <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_acrescimo)}</div>
            <div className="mt-1 text-xs opacity-75">Juros/multas</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Descontos</div>
            <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_desconto)}</div>
            <div className="mt-1 text-xs opacity-75">Economizado</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Ticket Medio</div>
            <div className="text-2xl font-bold">
              {estatisticas.quantidade_titulos > 0 
                ? formatCurrency(estatisticas.valor_liquido / estatisticas.quantidade_titulos)
                : 'R$ 0,00'}
            </div>
            <div className="mt-1 text-xs opacity-75">Por titulo</div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              type="button"
              onClick={() => setAbaAtiva('dados')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
                abaAtiva === 'dados'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Dados
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('analises')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
                abaAtiva === 'analises'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Analises
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('configuracoes')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
                abaAtiva === 'configuracoes'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configurações
            </button>
          </nav>
        </div>
      </div>

      {abaAtiva === 'dados' && renderAbaDados()}
      {abaAtiva === 'analises' && renderAbaAnalises()}
      {abaAtiva === 'configuracoes' && renderAbaConfiguracoes()}
    </div>
  );
};
