import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { ContaPagar, EmpresaOption, CentroCustoOption } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface Estatisticas {
  quantidade_titulos: number;
  valor_total: number;
  valor_medio: number;
  dias_atraso_medio: number;
}

interface DadosPorCredor {
  credor: string;
  valor: number;
  quantidade: number;
  dias_atraso_max: number;
}

interface DadosPorEmpresa {
  empresa: string;
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

const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899'];

export const ContasAtrasadas: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('dados');
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [dadosPorCredor, setDadosPorCredor] = useState<DadosPorCredor[]>([]);
  const [dadosPorEmpresa, setDadosPorEmpresa] = useState<DadosPorEmpresa[]>([]);
  const [dadosPorFaixaAtraso, setDadosPorFaixaAtraso] = useState<DadosPorFaixaAtraso[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<number | null>(null);
  const [filtroCentroCusto, setFiltroCentroCusto] = useState<number | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

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

  const calcularDiasAtraso = (dataVencimento: string | undefined) => {
    if (!dataVencimento) return 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const vencimento = new Date(dataVencimento);
    vencimento.setHours(0, 0, 0, 0);
    const diffTime = hoje.getTime() - vencimento.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  useEffect(() => {
    const carregarFiltros = async () => {
      try {
        const [empresasData, ccData] = await Promise.all([
          apiService.getEmpresas(),
          apiService.getCentrosCusto(),
        ]);
        setEmpresas(empresasData);
        setCentrosCusto(ccData);
      } catch (err) {
        console.error('Erro ao carregar filtros:', err);
      }
    };
    carregarFiltros();
  }, []);

  const buscarDados = async () => {
    try {
      setLoading(true);
      const data = await apiService.getContas('em_atraso', 500);
      
      let contasFiltradas = data;
      if (filtroEmpresa) {
        contasFiltradas = contasFiltradas.filter(c => c.id_interno_empresa === filtroEmpresa);
      }
      if (filtroCentroCusto) {
        contasFiltradas = contasFiltradas.filter(c => c.id_interno_centro_custo === filtroCentroCusto);
      }
      
      setContas(contasFiltradas);

      const totalDiasAtraso = contasFiltradas.reduce((acc, c) => acc + calcularDiasAtraso(c.data_vencimento as any), 0);
      const stats: Estatisticas = {
        quantidade_titulos: contasFiltradas.length,
        valor_total: contasFiltradas.reduce((acc, c) => acc + (c.valor_total || 0), 0),
        valor_medio: contasFiltradas.length > 0 
          ? contasFiltradas.reduce((acc, c) => acc + (c.valor_total || 0), 0) / contasFiltradas.length 
          : 0,
        dias_atraso_medio: contasFiltradas.length > 0 ? Math.round(totalDiasAtraso / contasFiltradas.length) : 0,
      };
      setEstatisticas(stats);

      const credorMap = new Map<string, { valor: number; quantidade: number; dias_atraso_max: number }>();
      contasFiltradas.forEach(c => {
        const credor = c.credor || 'Sem Credor';
        const diasAtraso = calcularDiasAtraso(c.data_vencimento as any);
        const atual = credorMap.get(credor) || { valor: 0, quantidade: 0, dias_atraso_max: 0 };
        credorMap.set(credor, {
          valor: atual.valor + (c.valor_total || 0),
          quantidade: atual.quantidade + 1,
          dias_atraso_max: Math.max(atual.dias_atraso_max, diasAtraso),
        });
      });
      const credorArray = Array.from(credorMap.entries())
        .map(([credor, data]) => ({ credor, ...data }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 15);
      setDadosPorCredor(credorArray);

      const empresaMap = new Map<string, { valor: number; quantidade: number }>();
      contasFiltradas.forEach(c => {
        const empresa = c.nome_empresa || 'Sem Empresa';
        const atual = empresaMap.get(empresa) || { valor: 0, quantidade: 0 };
        empresaMap.set(empresa, {
          valor: atual.valor + (c.valor_total || 0),
          quantidade: atual.quantidade + 1,
        });
      });
      const empresaArray = Array.from(empresaMap.entries())
        .map(([empresa, data]) => ({ empresa, ...data }))
        .sort((a, b) => b.valor - a.valor);
      setDadosPorEmpresa(empresaArray);

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
        const dias = calcularDiasAtraso(c.data_vencimento as any);
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

    } catch (err) {
      setError('Erro ao carregar contas atrasadas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    buscarDados();
  }, []);

  const aplicarFiltros = () => {
    buscarDados();
  };

  const limparFiltros = () => {
    setFiltroEmpresa(null);
    setFiltroCentroCusto(null);
    setTimeout(buscarDados, 100);
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Empresa</label>
          <select
            value={filtroEmpresa || ''}
            onChange={(e) => setFiltroEmpresa(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none"
          >
            <option value="">Todas</option>
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Centro de Custo</label>
          <select
            value={filtroCentroCusto || ''}
            onChange={(e) => setFiltroCentroCusto(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none"
          >
            <option value="">Todos</option>
            {centrosCusto.map((cc) => (
              <option key={cc.id} value={cc.id}>{cc.nome}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={aplicarFiltros}
          className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
        >
          Aplicar Filtros
        </button>
        <button
          type="button"
          onClick={limparFiltros}
          className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
        >
          Limpar
        </button>
      </div>
    </div>
  );

  const renderAbaDados = () => (
    <>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Contas Atrasadas</h2>
            <p className="mt-1 text-sm text-gray-600">
              {contas.length} conta(s) em atraso
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className="flex items-center rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
          </button>
        </div>
        {mostrarFiltros && renderFiltros()}
      </div>

      {contas.length === 0 ? (
        <div className="rounded-lg bg-green-50 p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="mt-4 text-lg font-semibold text-green-800">Nenhuma conta em atraso!</p>
          <p className="mt-1 text-sm text-green-600">Parabens! Todos os pagamentos estao em dia.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-red-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Credor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Vencimento</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Dias Atraso</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Valor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Documento</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Empresa</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {contas.slice(0, 100).map((conta, index) => {
                  const diasAtraso = calcularDiasAtraso(conta.data_vencimento as any);
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{conta.credor || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{formatDate(conta.data_vencimento as any)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        <span className={`font-semibold ${diasAtraso > 30 ? 'text-red-700' : diasAtraso > 15 ? 'text-red-600' : 'text-orange-600'}`}>
                          {diasAtraso} dias
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-red-600">{formatCurrency(conta.valor_total)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{conta.numero_documento || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{conta.nome_empresa || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          diasAtraso > 30 ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                        }`}>
                          {diasAtraso > 30 ? 'Critico' : 'Em Atraso'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );

  const renderAbaAnalises = () => (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className="flex items-center rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
          </button>
        </div>
        {mostrarFiltros && renderFiltros()}
      </div>

      {dadosPorFaixaAtraso.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-2 text-xl font-semibold text-gray-900">Distribuicao por Faixa de Atraso</h3>
          <p className="mb-4 text-sm text-gray-500">Valores atrasados agrupados por tempo de atraso</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosPorFaixaAtraso} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="faixa" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                          <p className="mb-2 font-semibold text-gray-900">{label}</p>
                          <p className="text-sm text-red-600">Valor: {formatCurrency(data.valor)}</p>
                          <p className="text-sm text-gray-600">Quantidade: {data.quantidade} titulo(s)</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="valor" fill="#EF4444" radius={[4, 4, 0, 0]}>
                  {dadosPorFaixaAtraso.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                  <LabelList dataKey="valor" position="top" formatter={(value: number) => formatCurrencyShort(value)} style={{ fontSize: 10, fill: '#374151' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {dadosPorCredor.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-2 text-xl font-semibold text-gray-900">Top 15 Credores - Valores em Atraso</h3>
          <p className="mb-4 text-sm text-gray-500">Maiores valores atrasados por credor</p>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosPorCredor} layout="vertical" margin={{ top: 5, right: 80, left: 180, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="credor" tick={{ fontSize: 10 }} width={170} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const totalCredores = dadosPorCredor.reduce((acc, c) => acc + c.valor, 0);
                      const percentual = totalCredores > 0 ? ((data.valor / totalCredores) * 100).toFixed(1) : '0';
                      return (
                        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                          <p className="mb-2 font-semibold text-gray-900">{label}</p>
                          <p className="text-sm text-red-600">Valor: {formatCurrency(data.valor)}</p>
                          <p className="text-sm text-purple-600">Percentual: {percentual}%</p>
                          <p className="text-sm text-gray-600">Titulos: {data.quantidade}</p>
                          <p className="text-sm text-orange-600">Max atraso: {data.dias_atraso_max} dias</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="valor" fill="#EF4444" radius={[0, 4, 4, 0]}>
                  {dadosPorCredor.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                  <LabelList dataKey="valor" position="right" formatter={(value: number) => formatCurrencyShort(value)} style={{ fontSize: 9, fill: '#374151' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {dadosPorEmpresa.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-2 text-xl font-semibold text-gray-900">Valores em Atraso por Empresa</h3>
          <p className="mb-4 text-sm text-gray-500">Distribuicao de valores atrasados por empresa</p>
          <div style={{ height: Math.max(300, dadosPorEmpresa.length * 35) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosPorEmpresa} layout="vertical" margin={{ top: 5, right: 100, left: 200, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="empresa" tick={{ fontSize: 9 }} width={190} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const totalEmpresas = dadosPorEmpresa.reduce((acc, e) => acc + e.valor, 0);
                      const percentual = totalEmpresas > 0 ? ((data.valor / totalEmpresas) * 100).toFixed(1) : '0';
                      return (
                        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                          <p className="mb-2 font-semibold text-gray-900">{label}</p>
                          <p className="text-sm text-red-600">Valor: {formatCurrency(data.valor)}</p>
                          <p className="text-sm text-purple-600">Percentual: {percentual}%</p>
                          <p className="text-sm text-gray-600">Titulos: {data.quantidade}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="valor" fill="#EF4444" radius={[0, 4, 4, 0]}>
                  {dadosPorEmpresa.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                  <LabelList dataKey="valor" position="right" formatter={(value: number) => formatCurrencyShort(value)} style={{ fontSize: 9, fill: '#374151' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {contas.length > 0 && (
        <div className="rounded-lg bg-red-900 p-6 shadow">
          <h3 className="mb-2 text-xl font-semibold text-white">Resumo Critico</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-red-800 p-4">
              <p className="text-sm text-red-200">Maior Valor Atrasado</p>
              <p className="text-2xl font-bold text-white">
                {formatCurrency(Math.max(...contas.map(c => c.valor_total || 0)))}
              </p>
              <p className="text-xs text-red-300">
                {contas.find(c => c.valor_total === Math.max(...contas.map(x => x.valor_total || 0)))?.credor?.substring(0, 30)}
              </p>
            </div>
            <div className="rounded-lg bg-red-800 p-4">
              <p className="text-sm text-red-200">Maior Atraso (dias)</p>
              <p className="text-2xl font-bold text-white">
                {Math.max(...contas.map(c => calcularDiasAtraso(c.data_vencimento as any)))} dias
              </p>
              <p className="text-xs text-red-300">
                {contas.find(c => calcularDiasAtraso(c.data_vencimento as any) === Math.max(...contas.map(x => calcularDiasAtraso(x.data_vencimento as any))))?.credor?.substring(0, 30)}
              </p>
            </div>
            <div className="rounded-lg bg-red-800 p-4">
              <p className="text-sm text-red-200">Criticos (+30 dias)</p>
              <p className="text-2xl font-bold text-white">
                {contas.filter(c => calcularDiasAtraso(c.data_vencimento as any) > 30).length} titulos
              </p>
              <p className="text-xs text-red-300">
                {formatCurrency(contas.filter(c => calcularDiasAtraso(c.data_vencimento as any) > 30).reduce((acc, c) => acc + (c.valor_total || 0), 0))}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {estatisticas && contas.length > 0 && (
        <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-gradient-to-br from-red-500 to-red-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Total em Atraso</div>
            <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_total)}</div>
            <div className="mt-1 text-xs opacity-75">{estatisticas.quantidade_titulos.toLocaleString('pt-BR')} titulos</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Media de Atraso</div>
            <div className="text-2xl font-bold">{estatisticas.dias_atraso_medio} dias</div>
            <div className="mt-1 text-xs opacity-75">Por titulo</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-yellow-500 to-yellow-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Ticket Medio</div>
            <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_medio)}</div>
            <div className="mt-1 text-xs opacity-75">Por titulo</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Criticos (+30d)</div>
            <div className="text-2xl font-bold">
              {contas.filter(c => calcularDiasAtraso(c.data_vencimento as any) > 30).length}
            </div>
            <div className="mt-1 text-xs opacity-75">
              {formatCurrency(contas.filter(c => calcularDiasAtraso(c.data_vencimento as any) > 30).reduce((acc, c) => acc + (c.valor_total || 0), 0))}
            </div>
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
                  ? 'border-red-500 text-red-600'
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
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Analises
            </button>
          </nav>
        </div>
      </div>

      {abaAtiva === 'dados' && renderAbaDados()}
      {abaAtiva === 'analises' && renderAbaAnalises()}
    </div>
  );
};
