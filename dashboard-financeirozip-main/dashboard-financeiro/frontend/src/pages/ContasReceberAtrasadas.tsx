import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { ContaReceber, EmpresaOption, CentroCustoOption, TipoDocumentoOption } from '../types';
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
}

interface DadosPorFaixaAtraso {
  faixa: string;
  valor: number;
  quantidade: number;
  ordem: number;
}

type AbaAtiva = 'dados' | 'analises';

const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1'];

export const ContasReceberAtrasadas: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('dados');
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [dadosPorCliente, setDadosPorCliente] = useState<DadosPorCliente[]>([]);
  const [dadosPorFaixaAtraso, setDadosPorFaixaAtraso] = useState<DadosPorFaixaAtraso[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<number | null>(null);
  const [filtroCentroCusto, setFiltroCentroCusto] = useState<number | null>(null);
  const [todasContas, setTodasContas] = useState<ContaReceber[]>([]);
  const [ordenacao, setOrdenacao] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'dias_atraso', direcao: 'desc' });
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumentoOption[]>([]);
  const [filtroTipoDocumento, setFiltroTipoDocumento] = useState<string[]>([]);
  const [tipoDocDropdownAberto, setTipoDocDropdownAberto] = useState(false);
  const [contasCriticas, setContasCriticas] = useState<{ quantidade: number; valor: number }>({ quantidade: 0, valor: 0 });
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [filtroCliente, setFiltroCliente] = useState<string | null>(null);

  const calcularDiasAtraso = (dataVencimento: string | undefined) => {
    if (!dataVencimento) return 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const vencimento = new Date(dataVencimento);
    vencimento.setHours(0, 0, 0, 0);
    const diffTime = hoje.getTime() - vencimento.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const ordenarContas = (contasParaOrdenar: ContaReceber[]) => {
    return [...contasParaOrdenar].sort((a, b) => {
      let valorA: any;
      let valorB: any;
      
      switch (ordenacao.campo) {
        case 'cliente':
          valorA = (a.cliente || '').toLowerCase();
          valorB = (b.cliente || '').toLowerCase();
          break;
        case 'data_vencimento':
          valorA = new Date(a.data_vencimento || 0).getTime();
          valorB = new Date(b.data_vencimento || 0).getTime();
          break;
        case 'dias_atraso':
          valorA = calcularDiasAtraso(a.data_vencimento);
          valorB = calcularDiasAtraso(b.data_vencimento);
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
        const [empresasData, ccData, tiposDocData] = await Promise.all([
          apiService.getEmpresas(),
          apiService.getCentrosCusto(),
          apiService.getTiposDocumento(),
        ]);
        setEmpresas(empresasData);
        setCentrosCusto(ccData);
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
      const data = await apiService.getContasReceber('em_atraso', 500);
      setTodasContas(data);
    } catch (err) {
      setError('Erro ao carregar contas atrasadas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltrosLocais = (
    dados: ContaReceber[],
    empresa: number | null,
    cc: number | null,
    tiposDocSelecionados: string[],
    cliente: string | null
  ) => {
    let contasFiltradas = [...dados];
    
    if (empresa) {
      contasFiltradas = contasFiltradas.filter(c => c.id_interno_empresa === empresa);
    }
    if (cc) {
      contasFiltradas = contasFiltradas.filter(c => c.id_interno_centro_custo === cc);
    }
    if (tiposDocSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        return c.id_documento && tiposDocSelecionados.includes(c.id_documento);
      });
    }
    if (cliente) {
      contasFiltradas = contasFiltradas.filter(c => c.cliente === cliente);
    }
    
    return contasFiltradas;
  };

  useEffect(() => {
    if (todasContas.length === 0) return;
    
    const clientesUnicos = Array.from(new Set(todasContas.map(c => c.cliente).filter(Boolean)))
      .sort((a, b) => (a || '').localeCompare(b || ''))
      .map(c => ({ id: c || '', nome: '' }));
    setClientes(clientesUnicos);
    
    const contasFiltradas = aplicarFiltrosLocais(todasContas, filtroEmpresa, filtroCentroCusto, filtroTipoDocumento, filtroCliente);
    setContas(contasFiltradas);

    const total = contasFiltradas.reduce((acc, c) => acc + (c.valor_total || 0), 0);
    const stats: Estatisticas = {
      quantidade_titulos: contasFiltradas.length,
      valor_total: total,
      valor_medio: contasFiltradas.length > 0 ? total / contasFiltradas.length : 0,
    };
    setEstatisticas(stats);

    const criticas = contasFiltradas.filter(c => calcularDiasAtraso(c.data_vencimento) > 30);
    setContasCriticas({
      quantidade: criticas.length,
      valor: criticas.reduce((acc, c) => acc + (c.valor_total || 0), 0),
    });

    const clienteMap = new Map<string, { valor: number; quantidade: number }>();
    contasFiltradas.forEach(c => {
      const cliente = c.cliente || 'Sem Cliente';
      const atual = clienteMap.get(cliente) || { valor: 0, quantidade: 0 };
      clienteMap.set(cliente, {
        valor: atual.valor + (c.valor_total || 0),
        quantidade: atual.quantidade + 1,
      });
    });
    const clienteArray = Array.from(clienteMap.entries())
      .map(([cliente, data]) => ({ cliente, ...data }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 15);
    setDadosPorCliente(clienteArray);

    const faixas = [
      { faixa: '1-7 dias', min: 1, max: 7, ordem: 1 },
      { faixa: '8-15 dias', min: 8, max: 15, ordem: 2 },
      { faixa: '16-30 dias', min: 16, max: 30, ordem: 3 },
      { faixa: '31-60 dias', min: 31, max: 60, ordem: 4 },
      { faixa: '61-90 dias', min: 61, max: 90, ordem: 5 },
      { faixa: '+90 dias', min: 91, max: Infinity, ordem: 6 },
    ];
    
    const faixaMap = new Map<string, { valor: number; quantidade: number; ordem: number }>();
    faixas.forEach(f => faixaMap.set(f.faixa, { valor: 0, quantidade: 0, ordem: f.ordem }));
    
    contasFiltradas.forEach(c => {
      const dias = calcularDiasAtraso(c.data_vencimento);
      const faixa = faixas.find(f => dias >= f.min && dias <= f.max);
      if (faixa) {
        const atual = faixaMap.get(faixa.faixa)!;
        faixaMap.set(faixa.faixa, {
          valor: atual.valor + (c.valor_total || 0),
          quantidade: atual.quantidade + 1,
          ordem: atual.ordem,
        });
      }
    });
    
    const faixaArray = Array.from(faixaMap.entries())
      .map(([faixa, data]) => ({ faixa, ...data }))
      .filter(d => d.quantidade > 0)
      .sort((a, b) => a.ordem - b.ordem);
    setDadosPorFaixaAtraso(faixaArray);
  }, [todasContas, filtroEmpresa, filtroCentroCusto, filtroTipoDocumento, filtroCliente]);

  useEffect(() => {
    carregarDados();
  }, []);

  const limparFiltros = () => {
    setFiltroEmpresa(null);
    setFiltroCentroCusto(null);
    setFiltroTipoDocumento([]);
    setFiltroCliente(null);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-red-600 border-r-transparent"></div>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <SearchableSelect
          options={empresas}
          value={filtroEmpresa ?? undefined}
          onChange={(value) => setFiltroEmpresa(value as number | null)}
          label="Empresa"
          placeholder="Selecione uma empresa..."
          emptyText="Todas"
        />
        <SearchableSelect
          options={centrosCusto}
          value={filtroCentroCusto ?? undefined}
          onChange={(value) => setFiltroCentroCusto(value as number | null)}
          label="Centro de Custo"
          placeholder="Selecione um centro de custo..."
          emptyText="Todos"
        />
        <SearchableSelect
          options={clientes}
          value={filtroCliente ?? undefined}
          onChange={(value) => setFiltroCliente(value as string | null)}
          label="Cliente"
          placeholder="Digite o nome do cliente..."
          emptyText="Todos"
        />
        <div className="relative">
          <label className="mb-2 block text-sm font-medium text-gray-700">Tipo Documento</label>
          <button
            type="button"
            onClick={() => setTipoDocDropdownAberto(!tipoDocDropdownAberto)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:border-red-500 focus:outline-none"
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
                  className="text-xs text-red-600 hover:underline"
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
                      className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm text-gray-700">{tipo.id} - {tipo.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={limparFiltros}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Limpar Filtros
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Recebimentos em Atraso</h1>
      </div>

      {renderFiltros()}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm text-gray-500">Total em Atraso</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(estatisticas?.valor_total)}</p>
          <p className="text-xs text-gray-400">{estatisticas?.quantidade_titulos} titulos</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm text-gray-500">Valor Medio</p>
          <p className="text-2xl font-bold text-gray-700">{formatCurrency(estatisticas?.valor_medio)}</p>
          <p className="text-xs text-gray-400">por titulo</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Criticos (+30 dias)</p>
          <p className="text-2xl font-bold text-red-700">{formatCurrency(contasCriticas.valor)}</p>
          <p className="text-xs text-gray-400">{contasCriticas.quantidade} titulos</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm text-gray-500">% Critico</p>
          <p className="text-2xl font-bold text-orange-600">
            {estatisticas && estatisticas.valor_total > 0 
              ? ((contasCriticas.valor / estatisticas.valor_total) * 100).toFixed(1) 
              : 0}%
          </p>
          <p className="text-xs text-gray-400">do total em atraso</p>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setAbaAtiva('dados')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              abaAtiva === 'dados'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Dados
          </button>
          <button
            onClick={() => setAbaAtiva('analises')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              abaAtiva === 'analises'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Analises
          </button>
        </nav>
      </div>

      {abaAtiva === 'dados' && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Lista de Contas em Atraso</h2>
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
                    onClick={() => toggleOrdenacao('data_vencimento')} 
                    className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
                  >
                    Vencimento {renderSortIcon('data_vencimento')}
                  </th>
                  <th 
                    onClick={() => toggleOrdenacao('dias_atraso')} 
                    className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
                  >
                    Dias Atraso {renderSortIcon('dias_atraso')}
                  </th>
                  <th 
                    onClick={() => toggleOrdenacao('valor_total')} 
                    className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
                  >
                    Valor {renderSortIcon('valor_total')}
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
                {ordenarContas(contas).slice(0, 100).map((conta, index) => {
                  const diasAtraso = calcularDiasAtraso(conta.data_vencimento);
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                        {conta.cliente || '-'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {formatDate(conta.data_vencimento)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          diasAtraso > 30 ? 'bg-red-100 text-red-800' :
                          diasAtraso > 15 ? 'bg-orange-100 text-orange-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {diasAtraso}d
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-red-600">
                        {formatCurrency(conta.valor_total)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {conta.numero_documento || conta.id_documento || '-'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {conta.nome_empresa || '-'}
                      </td>
                    </tr>
                  );
                })}
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
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Atraso por Faixa de Dias</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosPorFaixaAtraso} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} />
                  <YAxis type="category" dataKey="faixa" width={80} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="valor" fill="#EF4444">
                    {dadosPorFaixaAtraso.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                    <LabelList dataKey="quantidade" position="right" formatter={(value: number) => `${value}`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Top 15 Clientes em Atraso</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosPorCliente} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} />
                  <YAxis type="category" dataKey="cliente" width={150} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="valor" fill="#EF4444">
                    {dadosPorCliente.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {contasCriticas.quantidade > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-6 shadow">
              <h3 className="mb-2 text-lg font-semibold text-red-800">Atencao: Contas Criticas</h3>
              <p className="text-red-700">
                Existem <strong>{contasCriticas.quantidade}</strong> titulo(s) com mais de 30 dias de atraso, 
                totalizando <strong>{formatCurrency(contasCriticas.valor)}</strong>.
              </p>
              <p className="mt-2 text-sm text-red-600">
                Recomenda-se acao imediata de cobranca para estes clientes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
