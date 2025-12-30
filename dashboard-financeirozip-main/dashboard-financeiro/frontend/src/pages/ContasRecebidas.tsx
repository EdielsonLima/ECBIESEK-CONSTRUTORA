import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { ContaReceber, EmpresaOption, TipoDocumentoOption } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { SearchableSelect } from '../components/SearchableSelect';

interface Estatisticas {
  quantidade_titulos: number;
  valor_total: number;
  valor_medio: number;
}

interface DadosPorCliente {
  cliente: string;
  valor: number;
  quantidade: number;
  percentual: number;
  percentual_acumulado: number;
}

type AbaAtiva = 'dados' | 'analises';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];

export const ContasRecebidas: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('dados');
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [dadosPorCliente, setDadosPorCliente] = useState<DadosPorCliente[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<number | null>(null);
  const [filtroAno, setFiltroAno] = useState<number | null>(null);
  const [filtroMes, setFiltroMes] = useState<number[]>([]);
  const [todasContas, setTodasContas] = useState<ContaReceber[]>([]);
  const [mesDropdownAberto, setMesDropdownAberto] = useState(false);
  const [ordenacao, setOrdenacao] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'data_recebimento', direcao: 'desc' });
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumentoOption[]>([]);
  const [filtroTipoDocumento, setFiltroTipoDocumento] = useState<string[]>([]);
  const [tipoDocDropdownAberto, setTipoDocDropdownAberto] = useState(false);
  const [paretoResumo, setParetoResumo] = useState<{ count: number; total: number } | null>(null);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [filtroCliente, setFiltroCliente] = useState<string | null>(null);

  const ordenarContas = (contasParaOrdenar: ContaReceber[]) => {
    return [...contasParaOrdenar].sort((a, b) => {
      let valorA: any;
      let valorB: any;
      
      switch (ordenacao.campo) {
        case 'cliente':
          valorA = (a.cliente || '').toLowerCase();
          valorB = (b.cliente || '').toLowerCase();
          break;
        case 'data_recebimento':
          valorA = new Date(a.data_recebimento || 0).getTime();
          valorB = new Date(b.data_recebimento || 0).getTime();
          break;
        case 'valor_total':
          valorA = a.valor_total || 0;
          valorB = b.valor_total || 0;
          break;
        case 'nome_empresa':
          valorA = (a.nome_empresa || '').toLowerCase();
          valorB = (b.nome_empresa || '').toLowerCase();
          break;
        default:
          return 0;
      }
      
      if (valorA < valorB) return ordenacao.direcao === 'asc' ? -1 : 1;
      if (valorA > valorB) return ordenacao.direcao === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const toggleOrdenacao = (campo: string) => {
    setOrdenacao(prev => ({
      campo,
      direcao: prev.campo === campo && prev.direcao === 'asc' ? 'desc' : 'asc'
    }));
  };

  const renderSortIcon = (campo: string) => (
    <span className="ml-1 inline-block">
      {ordenacao.campo === campo ? (
        ordenacao.direcao === 'asc' ? '▲' : '▼'
      ) : (
        <span className="text-gray-300">▼</span>
      )}
    </span>
  );

  const meses = [
    { valor: 1, nome: 'Janeiro' },
    { valor: 2, nome: 'Fevereiro' },
    { valor: 3, nome: 'Marco' },
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

  const anosDisponiveis = () => {
    const anoAtual = new Date().getFullYear();
    return [anoAtual - 3, anoAtual - 2, anoAtual - 1, anoAtual];
  };

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
    } else if (value >= 1000) {
      return `R$ ${(value / 1000).toFixed(0)}K`;
    }
    return formatCurrency(value);
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  useEffect(() => {
    const carregarFiltros = async () => {
      try {
        const [empresasData, tiposDocData] = await Promise.all([
          apiService.getEmpresas(),
          apiService.getTiposDocumento(),
        ]);
        setEmpresas(empresasData);
        setTiposDocumento(tiposDocData);
      } catch (err) {
        console.error('Erro ao carregar filtros:', err);
      }
    };
    carregarFiltros();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const data = await apiService.getContasReceber('recebido', 1000);
      setTodasContas(data);
    } catch (err) {
      setError('Erro ao carregar contas recebidas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltrosLocais = (
    dados: ContaReceber[],
    empresa: number | null,
    ano: number | null,
    mesesSelecionados: number[],
    tiposDocSelecionados: string[],
    cliente: string | null
  ) => {
    let contasFiltradas = [...dados];
    
    if (empresa) {
      contasFiltradas = contasFiltradas.filter(c => c.id_interno_empresa === empresa);
    }
    if (cliente) {
      contasFiltradas = contasFiltradas.filter(c => c.cliente === cliente);
    }
    if (ano) {
      contasFiltradas = contasFiltradas.filter(c => {
        if (!c.data_recebimento) return false;
        const dataRec = new Date(c.data_recebimento);
        return dataRec.getFullYear() === ano;
      });
    }
    if (mesesSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        if (!c.data_recebimento) return false;
        const dataRec = new Date(c.data_recebimento);
        return mesesSelecionados.includes(dataRec.getMonth() + 1);
      });
    }
    if (tiposDocSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        return c.id_documento && tiposDocSelecionados.includes(c.id_documento);
      });
    }
    
    return contasFiltradas;
  };

  useEffect(() => {
    if (todasContas.length === 0) return;
    
    const clienteMap = new Map<string, string>();
    todasContas.forEach(c => {
      if (c.cliente) {
        const normalized = c.cliente.trim().toUpperCase();
        if (!clienteMap.has(normalized)) {
          clienteMap.set(normalized, c.cliente.trim());
        }
      }
    });
    const clientesUnicos = Array.from(clienteMap.values())
      .sort()
      .map(nome => ({ id: nome, nome }));
    setClientes(clientesUnicos);
    
    const contasFiltradas = aplicarFiltrosLocais(todasContas, filtroEmpresa, filtroAno, filtroMes, filtroTipoDocumento, filtroCliente);
    setContas(contasFiltradas);

    const total = contasFiltradas.reduce((acc, c) => acc + (c.valor_total || 0), 0);
    const stats: Estatisticas = {
      quantidade_titulos: contasFiltradas.length,
      valor_total: total,
      valor_medio: contasFiltradas.length > 0 ? total / contasFiltradas.length : 0,
    };
    setEstatisticas(stats);

    const clienteAnaliseMap = new Map<string, { valor: number; quantidade: number }>();
    contasFiltradas.forEach(c => {
      const cliente = c.cliente || 'Sem Cliente';
      const atual = clienteAnaliseMap.get(cliente) || { valor: 0, quantidade: 0 };
      clienteAnaliseMap.set(cliente, {
        valor: atual.valor + (c.valor_total || 0),
        quantidade: atual.quantidade + 1,
      });
    });
    
    const clienteList = Array.from(clienteAnaliseMap.entries())
      .map(([cliente, data]) => ({ cliente, ...data }))
      .sort((a, b) => b.valor - a.valor);

    let acumulado = 0;
    const clienteArray: DadosPorCliente[] = clienteList.map(c => {
      const percentual = total > 0 ? (c.valor / total) * 100 : 0;
      acumulado += percentual;
      return {
        ...c,
        percentual,
        percentual_acumulado: acumulado,
      };
    });

    const count80 = clienteArray.filter(c => c.percentual_acumulado <= 80).length;
    setParetoResumo({
      count: count80 || 1,
      total: clienteArray.length,
    });

    setDadosPorCliente(clienteArray.slice(0, 20));
  }, [todasContas, filtroEmpresa, filtroAno, filtroMes, filtroTipoDocumento, filtroCliente]);

  useEffect(() => {
    carregarDados();
  }, []);

  const limparFiltros = () => {
    setFiltroEmpresa(null);
    setFiltroAno(null);
    setFiltroMes([]);
    setFiltroTipoDocumento([]);
    setFiltroCliente(null);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-green-600 border-r-transparent"></div>
          <p className="text-gray-600">Carregando dados...</p>
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
    <div className="mb-6 rounded-lg bg-gray-50 p-4 shadow">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SearchableSelect
          options={empresas}
          value={filtroEmpresa ?? undefined}
          onChange={(value) => setFiltroEmpresa(value as number | null)}
          label="Empresa"
          placeholder="Selecione uma empresa..."
          emptyText="Todas"
        />
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Ano</label>
          <select
            value={filtroAno || ''}
            onChange={(e) => setFiltroAno(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none"
          >
            <option value="">Todos</option>
            {anosDisponiveis().map((ano) => (
              <option key={ano} value={ano}>{ano}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <label className="mb-2 block text-sm font-medium text-gray-700">Mes</label>
          <button
            type="button"
            onClick={() => setMesDropdownAberto(!mesDropdownAberto)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:border-green-500 focus:outline-none"
          >
            <span className={filtroMes.length > 0 ? 'text-gray-900' : 'text-gray-500'}>
              {filtroMes.length === 0 ? 'Todos' : filtroMes.length === 12 ? 'Todos' : `${filtroMes.length} selecionado(s)`}
            </span>
            <svg
              className={`absolute right-3 top-9 h-5 w-5 transition-transform ${mesDropdownAberto ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {mesDropdownAberto && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg">
              <div className="border-b border-gray-200 p-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setFiltroMes(meses.map(m => m.valor))}
                  className="text-xs text-green-600 hover:underline"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroMes([])}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Limpar
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto p-2">
                {meses.map((mes) => (
                  <label key={mes.valor} className="flex cursor-pointer items-center gap-2 py-1 hover:bg-gray-50 rounded px-1">
                    <input
                      type="checkbox"
                      checked={filtroMes.includes(mes.valor)}
                      onChange={() => {
                        if (filtroMes.includes(mes.valor)) {
                          setFiltroMes(filtroMes.filter(m => m !== mes.valor));
                        } else {
                          setFiltroMes([...filtroMes, mes.valor]);
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700">{mes.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <SearchableSelect
            label="Cliente"
            options={clientes.map(c => ({ id: c.id, nome: c.nome }))}
            value={filtroCliente ?? undefined}
            onChange={(value) => setFiltroCliente(value as string | null)}
            placeholder="Selecione um cliente..."
          />
        </div>
        <div className="relative">
          <label className="mb-2 block text-sm font-medium text-gray-700">Tipo Documento</label>
          <button
            type="button"
            onClick={() => setTipoDocDropdownAberto(!tipoDocDropdownAberto)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:border-green-500 focus:outline-none"
          >
            <span className={filtroTipoDocumento.length > 0 ? 'text-gray-900' : 'text-gray-500'}>
              {filtroTipoDocumento.length === 0 ? 'Todos' : filtroTipoDocumento.length === tiposDocumento.length ? 'Todos' : `${filtroTipoDocumento.length} selecionado(s)`}
            </span>
            <svg
              className={`absolute right-3 top-9 h-5 w-5 transition-transform ${tipoDocDropdownAberto ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {tipoDocDropdownAberto && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg">
              <div className="border-b border-gray-200 p-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setFiltroTipoDocumento(tiposDocumento.map(t => t.id))}
                  className="text-xs text-green-600 hover:underline"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroTipoDocumento([])}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Limpar
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto p-2">
                {tiposDocumento.map((tipo) => (
                  <label key={tipo.id} className="flex cursor-pointer items-center gap-2 py-1 hover:bg-gray-50 rounded px-1">
                    <input
                      type="checkbox"
                      checked={filtroTipoDocumento.includes(tipo.id)}
                      onChange={() => {
                        if (filtroTipoDocumento.includes(tipo.id)) {
                          setFiltroTipoDocumento(filtroTipoDocumento.filter(t => t !== tipo.id));
                        } else {
                          setFiltroTipoDocumento([...filtroTipoDocumento, tipo.id]);
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700">{tipo.id} - {tipo.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={limparFiltros}
          className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
        >
          Limpar Filtros
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Contas Recebidas</h1>
      </div>

      {renderFiltros()}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm text-gray-500">Total Recebido</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(estatisticas?.valor_total)}</p>
          <p className="text-xs text-gray-400">{estatisticas?.quantidade_titulos} titulos</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm text-gray-500">Valor Medio</p>
          <p className="text-2xl font-bold text-gray-700">{formatCurrency(estatisticas?.valor_medio)}</p>
          <p className="text-xs text-gray-400">por titulo</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm text-gray-500">Concentracao Pareto</p>
          <p className="text-2xl font-bold text-blue-600">
            {paretoResumo ? `${paretoResumo.count} de ${paretoResumo.total}` : '-'}
          </p>
          <p className="text-xs text-gray-400">clientes representam 80% do valor</p>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setAbaAtiva('dados')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              abaAtiva === 'dados'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Dados
          </button>
          <button
            onClick={() => setAbaAtiva('analises')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              abaAtiva === 'analises'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Analises
          </button>
        </nav>
      </div>

      {abaAtiva === 'dados' && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Lista de Contas Recebidas</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    onClick={() => toggleOrdenacao('cliente')} 
                    className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
                  >
                    Cliente {renderSortIcon('cliente')}
                  </th>
                  <th 
                    onClick={() => toggleOrdenacao('data_recebimento')} 
                    className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
                  >
                    Data Recebimento {renderSortIcon('data_recebimento')}
                  </th>
                  <th 
                    onClick={() => toggleOrdenacao('valor_total')} 
                    className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
                  >
                    Valor {renderSortIcon('valor_total')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Titulo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Parcela
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Documento
                  </th>
                  <th 
                    onClick={() => toggleOrdenacao('nome_empresa')} 
                    className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
                  >
                    Empresa {renderSortIcon('nome_empresa')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {ordenarContas(contas).slice(0, 100).map((conta, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {conta.cliente || '-'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {formatDate(conta.data_recebimento)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-green-600">
                      {formatCurrency(conta.valor_total)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {conta.titulo || conta.lancamento || '-'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {conta.numero_parcela || '-'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {conta.id_documento || '-'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {conta.nome_empresa || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {contas.length > 100 && (
              <p className="mt-4 text-center text-sm text-gray-500">
                Mostrando 100 de {contas.length} registros
              </p>
            )}
          </div>
        </div>
      )}

      {abaAtiva === 'analises' && (
        <div className="space-y-6">
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Analise Pareto - Top 20 Clientes</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={dadosPorCliente} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} />
                <YAxis type="category" dataKey="cliente" width={180} tick={{ fontSize: 10 }} />
                <Tooltip 
                  formatter={(value: number, name: string) => {
                    if (name === 'valor') return formatCurrency(value);
                    return `${value.toFixed(1)}%`;
                  }}
                />
                <Bar dataKey="valor" fill="#10B981" name="Valor Recebido">
                  {dadosPorCliente.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                  <LabelList 
                    dataKey="percentual_acumulado" 
                    position="right" 
                    formatter={(value: number) => `${value.toFixed(0)}%`}
                    style={{ fontSize: 10 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {paretoResumo && (
            <div className="rounded-lg bg-green-50 p-6 shadow">
              <h3 className="mb-2 text-lg font-semibold text-green-800">Resumo da Concentracao</h3>
              <p className="text-green-700">
                <strong>{paretoResumo.count}</strong> cliente(s) de um total de <strong>{paretoResumo.total}</strong> representam 
                <strong> 80%</strong> do valor total recebido.
              </p>
              <p className="mt-2 text-sm text-green-600">
                Isso equivale a <strong>{((paretoResumo.count / paretoResumo.total) * 100).toFixed(1)}%</strong> dos clientes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
