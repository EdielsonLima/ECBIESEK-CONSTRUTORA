import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { ContaPagar, EmpresaOption, CentroCustoOption } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface Estatisticas {
  quantidade_titulos: number;
  valor_total: number;
  valor_medio: number;
}

interface DadosPorCredor {
  credor: string;
  valor: number;
  quantidade: number;
}

interface DadosPorEmpresa {
  empresa: string;
  valor: number;
  quantidade: number;
}

interface DadosPorVencimento {
  faixa: string;
  valor: number;
  quantidade: number;
  ordem: number;
}

type AbaAtiva = 'dados' | 'analises';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];

export const ContasAPagar: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('dados');
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [dadosPorCredor, setDadosPorCredor] = useState<DadosPorCredor[]>([]);
  const [dadosPorEmpresa, setDadosPorEmpresa] = useState<DadosPorEmpresa[]>([]);
  const [dadosPorVencimento, setDadosPorVencimento] = useState<DadosPorVencimento[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<number | null>(null);
  const [filtroCentroCusto, setFiltroCentroCusto] = useState<number | null>(null);
  const [filtroPrazo, setFiltroPrazo] = useState<string>('todos');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [todasContas, setTodasContas] = useState<ContaPagar[]>([]);

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

  const calcularDiasAteVencimento = (dataVencimento: string | undefined) => {
    if (!dataVencimento) return 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const vencimento = new Date(dataVencimento);
    vencimento.setHours(0, 0, 0, 0);
    const diffTime = vencimento.getTime() - hoje.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
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

  const carregarDados = async () => {
    try {
      setLoading(true);
      const data = await apiService.getContas('a_pagar', 500);
      
      const contasNaoVencidas = data.filter(c => {
        const dias = calcularDiasAteVencimento(c.data_vencimento as any);
        return dias >= 0;
      });
      
      setTodasContas(contasNaoVencidas);
    } catch (err) {
      setError('Erro ao carregar contas a pagar');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltrosLocais = (
    dados: ContaPagar[],
    empresa: number | null,
    cc: number | null,
    prazo: string
  ) => {
    let contasFiltradas = [...dados];
    
    if (empresa) {
      contasFiltradas = contasFiltradas.filter(c => c.id_interno_empresa === empresa);
    }
    if (cc) {
      contasFiltradas = contasFiltradas.filter(c => c.id_interno_centro_custo === cc);
    }
    if (prazo !== 'todos') {
      contasFiltradas = contasFiltradas.filter(c => {
        const dias = calcularDiasAteVencimento(c.data_vencimento as any);
        switch (prazo) {
          case 'hoje': return dias === 0;
          case '7dias': return dias >= 1 && dias <= 7;
          case '15dias': return dias >= 1 && dias <= 15;
          case '30dias': return dias >= 1 && dias <= 30;
          default: return true;
        }
      });
    }
    
    return contasFiltradas;
  };

  useEffect(() => {
    if (todasContas.length === 0) return;
    
    const contasFiltradas = aplicarFiltrosLocais(todasContas, filtroEmpresa, filtroCentroCusto, filtroPrazo);
    setContas(contasFiltradas);

    const stats: Estatisticas = {
      quantidade_titulos: contasFiltradas.length,
      valor_total: contasFiltradas.reduce((acc, c) => acc + (c.valor_total || 0), 0),
      valor_medio: contasFiltradas.length > 0 
        ? contasFiltradas.reduce((acc, c) => acc + (c.valor_total || 0), 0) / contasFiltradas.length 
        : 0,
    };
    setEstatisticas(stats);

    const credorMap = new Map<string, { valor: number; quantidade: number }>();
    contasFiltradas.forEach(c => {
      const credor = c.credor || 'Sem Credor';
      const atual = credorMap.get(credor) || { valor: 0, quantidade: 0 };
      credorMap.set(credor, {
        valor: atual.valor + (c.valor_total || 0),
        quantidade: atual.quantidade + 1,
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
      { faixa: 'Hoje', min: 0, max: 0, ordem: 1 },
      { faixa: '1-7 dias', min: 1, max: 7, ordem: 2 },
      { faixa: '8-15 dias', min: 8, max: 15, ordem: 3 },
      { faixa: '16-30 dias', min: 16, max: 30, ordem: 4 },
      { faixa: '31-60 dias', min: 31, max: 60, ordem: 5 },
      { faixa: '+60 dias', min: 61, max: Infinity, ordem: 6 },
    ];
    
    const vencimentoMap = new Map<string, { valor: number; quantidade: number; ordem: number }>();
    faixas.forEach(f => vencimentoMap.set(f.faixa, { valor: 0, quantidade: 0, ordem: f.ordem }));
    
    contasFiltradas.forEach(c => {
      const dias = calcularDiasAteVencimento(c.data_vencimento as any);
      const faixa = faixas.find(f => dias >= f.min && dias <= f.max);
      if (faixa) {
        const atual = vencimentoMap.get(faixa.faixa)!;
        vencimentoMap.set(faixa.faixa, {
          valor: atual.valor + (c.valor_total || 0),
          quantidade: atual.quantidade + 1,
          ordem: atual.ordem,
        });
      }
    });
    
    const vencimentoArray = Array.from(vencimentoMap.entries())
      .map(([faixa, data]) => ({ faixa, ...data }))
      .filter(d => d.quantidade > 0)
      .sort((a, b) => a.ordem - b.ordem);
    setDadosPorVencimento(vencimentoArray);
  }, [todasContas, filtroEmpresa, filtroCentroCusto, filtroPrazo]);

  useEffect(() => {
    carregarDados();
  }, []);

  const aplicarFiltros = () => {
    // Filtros já são aplicados automaticamente pelo useEffect
  };

  const limparFiltros = () => {
    setFiltroEmpresa(null);
    setFiltroCentroCusto(null);
    setFiltroPrazo('todos');
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          >
            <option value="">Todos</option>
            {centrosCusto.map((cc) => (
              <option key={cc.id} value={cc.id}>{cc.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Prazo de Vencimento</label>
          <select
            value={filtroPrazo}
            onChange={(e) => setFiltroPrazo(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          >
            <option value="todos">Todos</option>
            <option value="hoje">Vence Hoje</option>
            <option value="7dias">Proximos 7 dias</option>
            <option value="15dias">Proximos 15 dias</option>
            <option value="30dias">Proximos 30 dias</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={aplicarFiltros}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
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

  const getEmpresaNome = (id: number | null) => {
    if (!id) return null;
    const emp = empresas.find(e => e.id === id);
    return emp ? emp.nome : null;
  };

  const getCentroCustoNome = (id: number | null) => {
    if (!id) return null;
    const cc = centrosCusto.find(c => c.id === id);
    return cc ? cc.nome : null;
  };

  const getPrazoNome = (prazo: string) => {
    switch (prazo) {
      case 'hoje': return 'Vence Hoje';
      case '7dias': return 'Proximos 7 dias';
      case '15dias': return 'Proximos 15 dias';
      case '30dias': return 'Proximos 30 dias';
      default: return null;
    }
  };

  const renderFiltrosTags = () => {
    const tags: { label: string; value: string; onRemove: () => void }[] = [];
    
    const empresaNome = getEmpresaNome(filtroEmpresa);
    if (empresaNome) {
      tags.push({ label: 'Empresa', value: empresaNome, onRemove: () => setFiltroEmpresa(null) });
    }
    
    const ccNome = getCentroCustoNome(filtroCentroCusto);
    if (ccNome) {
      tags.push({ label: 'Centro de Custo', value: ccNome, onRemove: () => setFiltroCentroCusto(null) });
    }
    
    const prazoNome = getPrazoNome(filtroPrazo);
    if (prazoNome) {
      tags.push({ label: 'Prazo', value: prazoNome, onRemove: () => setFiltroPrazo('todos') });
    }

    if (tags.length === 0) return null;

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800"
          >
            <span className="text-blue-600">{tag.label}:</span>
            <span className="ml-1">{tag.value}</span>
            <button
              type="button"
              onClick={tag.onRemove}
              className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-600 hover:bg-blue-200 hover:text-blue-800"
            >
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </span>
        ))}
        {tags.length > 0 && (
          <button
            type="button"
            onClick={limparFiltros}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Limpar todos
          </button>
        )}
      </div>
    );
  };

  const renderAbaDados = () => (
    <>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Contas a Pagar</h2>
            <p className="mt-1 text-sm text-gray-600">
              {contas.length} conta(s) pendentes
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
          </button>
        </div>
        {mostrarFiltros && renderFiltros()}
        {!mostrarFiltros && renderFiltrosTags()}
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-blue-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Credor</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Vencimento</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Dias</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Valor</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Documento</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Empresa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {contas.slice(0, 100).map((conta, index) => {
                const dias = calcularDiasAteVencimento(conta.data_vencimento as any);
                const corDias = dias < 0 ? 'text-red-600' : dias <= 7 ? 'text-orange-600' : 'text-green-600';
                return (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{conta.credor || '-'}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{formatDate(conta.data_vencimento as any)}</td>
                    <td className={`whitespace-nowrap px-6 py-4 text-sm font-semibold ${corDias}`}>
                      {dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias}d`}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-blue-600">{formatCurrency(conta.valor_total)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{conta.numero_documento || '-'}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{conta.nome_empresa || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const renderAbaAnalises = () => (
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
          </button>
        </div>
        {mostrarFiltros && renderFiltros()}
      </div>

      {dadosPorVencimento.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-2 text-xl font-semibold text-gray-900">Distribuicao por Prazo de Vencimento</h3>
          <p className="mb-4 text-sm text-gray-500">Valores a pagar agrupados por faixa de vencimento</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosPorVencimento} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
                          <p className="text-sm text-blue-600">Valor: {formatCurrency(data.valor)}</p>
                          <p className="text-sm text-gray-600">Quantidade: {data.quantidade} titulo(s)</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="valor" fill="#3B82F6" radius={[4, 4, 0, 0]}>
                  {dadosPorVencimento.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.faixa === 'Hoje' ? '#F59E0B' : COLORS[index % COLORS.length]} 
                    />
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
          <h3 className="mb-2 text-xl font-semibold text-gray-900">Top 15 Credores - Valores a Pagar</h3>
          <p className="mb-4 text-sm text-gray-500">Maiores valores pendentes por credor</p>
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
                          <p className="text-sm text-blue-600">Valor: {formatCurrency(data.valor)}</p>
                          <p className="text-sm text-purple-600">Percentual: {percentual}%</p>
                          <p className="text-sm text-gray-600">Titulos: {data.quantidade}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="valor" fill="#3B82F6" radius={[0, 4, 4, 0]}>
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
          <h3 className="mb-2 text-xl font-semibold text-gray-900">Valores a Pagar por Empresa</h3>
          <p className="mb-4 text-sm text-gray-500">Distribuicao de valores pendentes por empresa</p>
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
                          <p className="text-sm text-blue-600">Valor: {formatCurrency(data.valor)}</p>
                          <p className="text-sm text-purple-600">Percentual: {percentual}%</p>
                          <p className="text-sm text-gray-600">Titulos: {data.quantidade}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="valor" fill="#3B82F6" radius={[0, 4, 4, 0]}>
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
    </div>
  );

  return (
    <div>
      {estatisticas && (
        <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Total a Pagar</div>
            <div className="text-xl font-bold">{formatCurrency(estatisticas.valor_total)}</div>
            <div className="mt-1 text-xs opacity-75">{estatisticas.quantidade_titulos.toLocaleString('pt-BR')} titulos</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Vencendo Hoje</div>
            <div className="text-xl font-bold">
              {formatCurrency(contas.filter(c => calcularDiasAteVencimento(c.data_vencimento as any) === 0).reduce((acc, c) => acc + (c.valor_total || 0), 0))}
            </div>
            <div className="mt-1 text-xs opacity-75">
              {contas.filter(c => calcularDiasAteVencimento(c.data_vencimento as any) === 0).length} titulo(s)
            </div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Proximos 7 dias</div>
            <div className="text-xl font-bold">
              {formatCurrency(contas.filter(c => {
                const dias = calcularDiasAteVencimento(c.data_vencimento as any);
                return dias >= 1 && dias <= 7;
              }).reduce((acc, c) => acc + (c.valor_total || 0), 0))}
            </div>
            <div className="mt-1 text-xs opacity-75">
              {contas.filter(c => {
                const dias = calcularDiasAteVencimento(c.data_vencimento as any);
                return dias >= 1 && dias <= 7;
              }).length} titulo(s)
            </div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Proximos 15 dias</div>
            <div className="text-xl font-bold">
              {formatCurrency(contas.filter(c => {
                const dias = calcularDiasAteVencimento(c.data_vencimento as any);
                return dias >= 1 && dias <= 15;
              }).reduce((acc, c) => acc + (c.valor_total || 0), 0))}
            </div>
            <div className="mt-1 text-xs opacity-75">
              {contas.filter(c => {
                const dias = calcularDiasAteVencimento(c.data_vencimento as any);
                return dias >= 1 && dias <= 15;
              }).length} titulo(s)
            </div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Proximos 30 dias</div>
            <div className="text-xl font-bold">
              {formatCurrency(contas.filter(c => {
                const dias = calcularDiasAteVencimento(c.data_vencimento as any);
                return dias >= 1 && dias <= 30;
              }).reduce((acc, c) => acc + (c.valor_total || 0), 0))}
            </div>
            <div className="mt-1 text-xs opacity-75">
              {contas.filter(c => {
                const dias = calcularDiasAteVencimento(c.data_vencimento as any);
                return dias >= 1 && dias <= 30;
              }).length} titulo(s)
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
                  ? 'border-blue-500 text-blue-600'
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
                  ? 'border-blue-500 text-blue-600'
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
