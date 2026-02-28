import React, { useEffect, useState, useCallback } from 'react';
import { apiService } from '../services/api';
import { ContaReceber, EmpresaOption, TipoDocumentoOption, CentroCustoOption } from '../types';
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

interface TipoBaixaItem {
  id: number;
  nome: string;
  flag: string;
  descricao: string;
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
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [filtroCentroCusto, setFiltroCentroCusto] = useState<number | null>(null);

  // Tipo de Baixa
  const [tiposBaixa, setTiposBaixa] = useState<TipoBaixaItem[]>([]);
  const [filtroTipoBaixa, setFiltroTipoBaixa] = useState<number[]>([]);
  const [tipoBaixaDropdownAberto, setTipoBaixaDropdownAberto] = useState(false);

  // Total real do servidor (sem LIMIT)
  const [totalServidor, setTotalServidor] = useState<{ total: number; quantidade: number } | null>(null);
  const [loadingTotal, setLoadingTotal] = useState(false);

  // UI
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

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
          valorA = (a.data_recebimento || '').split('T')[0];
          valorB = (b.data_recebimento || '').split('T')[0];
          break;
        case 'valor_total':
          valorA = a.valor_total || 0;
          valorB = b.valor_total || 0;
          break;
        case 'nome_empresa':
          valorA = (a.nome_empresa || '').toLowerCase();
          valorB = (b.nome_empresa || '').toLowerCase();
          break;
        case 'nome_centrocusto':
          valorA = (a.nome_centrocusto || '').toLowerCase();
          valorB = (b.nome_centrocusto || '').toLowerCase();
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
    const parts = dateString.split('T')[0].split('-');
    if (parts.length !== 3) return '-';
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  };

  useEffect(() => {
    const carregarFiltros = async () => {
      try {
        const [empresasData, tiposDocData, centrosData, tiposBaixaData] = await Promise.all([
          apiService.getEmpresasRecebidas(),
          apiService.getTiposDocumento(),
          apiService.getCentrosCustoRecebidas(),
          apiService.getTiposBaixaCompleto(),
        ]);
        setEmpresas(empresasData);
        setTiposDocumento(tiposDocData);
        setCentrosCusto(centrosData);
        setTiposBaixa(tiposBaixaData);
      } catch (err) {
        console.error('Erro ao carregar filtros:', err);
      }
    };
    carregarFiltros();
  }, []);

  const carregarDados = async (centroCusto?: number | null) => {
    try {
      setLoading(true);
      const data = await apiService.getContasRecebidasFiltradas({
        centro_custo: centroCusto ?? undefined,
        tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
        limite: 2000,
      });
      setTodasContas(data);
    } catch (err) {
      setError('Erro ao carregar contas recebidas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Busca totais reais do servidor (sem LIMIT) com todos os filtros ativos
  const carregarTotais = useCallback(async () => {
    setLoadingTotal(true);
    try {
      const result = await apiService.getContasRecebidasTotais({
        empresa: filtroEmpresa ?? undefined,
        centro_custo: filtroCentroCusto ?? undefined,
        cliente: filtroCliente ?? undefined,
        id_documento: filtroTipoDocumento.length > 0 ? filtroTipoDocumento.join(',') : undefined,
        ano: filtroAno ? String(filtroAno) : undefined,
        mes: filtroMes.length > 0 ? filtroMes.join(',') : undefined,
        tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
      });
      setTotalServidor(result);
    } catch {
      setTotalServidor(null);
    } finally {
      setLoadingTotal(false);
    }
  }, [filtroEmpresa, filtroCentroCusto, filtroCliente, filtroTipoDocumento, filtroAno, filtroMes, filtroTipoBaixa]);

  useEffect(() => {
    carregarTotais();
  }, [carregarTotais]);

  const aplicarFiltrosLocais = (
    dados: ContaReceber[],
    empresa: number | null,
    ano: number | null,
    mesesSelecionados: number[],
    tiposDocSelecionados: string[],
    cliente: string | null,
    centroCusto: number | null,
    tiposBaixaSelecionados: number[],
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
        const anoRec = parseInt(c.data_recebimento.split('T')[0].split('-')[0]);
        return anoRec === ano;
      });
    }
    if (mesesSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        if (!c.data_recebimento) return false;
        const mesRec = parseInt(c.data_recebimento.split('T')[0].split('-')[1]);
        return mesesSelecionados.includes(mesRec);
      });
    }
    if (tiposDocSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        return c.id_documento && tiposDocSelecionados.includes(c.id_documento);
      });
    }
    if (tiposBaixaSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c =>
        c.id_tipo_baixa !== undefined && tiposBaixaSelecionados.includes(c.id_tipo_baixa)
      );
    }

    return contasFiltradas;
  };

  useEffect(() => {
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

    const contasFiltradas = aplicarFiltrosLocais(
      todasContas, filtroEmpresa, filtroAno, filtroMes, filtroTipoDocumento,
      filtroCliente, filtroCentroCusto, filtroTipoBaixa
    );
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
  }, [todasContas, filtroEmpresa, filtroAno, filtroMes, filtroTipoDocumento, filtroCliente, filtroCentroCusto, filtroTipoBaixa]);

  useEffect(() => {
    if (filtroCentroCusto !== null && centrosCusto.length > 0) {
      const centroAtual = centrosCusto.find(cc => cc.id === filtroCentroCusto);
      if (centroAtual && centroAtual.id_empresa !== filtroEmpresa) {
        setFiltroCentroCusto(null);
      }
    }
  }, [filtroEmpresa]);

  useEffect(() => {
    carregarDados(filtroCentroCusto);
  }, [filtroCentroCusto, filtroTipoBaixa]);

  const limparFiltros = () => {
    setFiltroEmpresa(null);
    setFiltroAno(null);
    setFiltroMes([]);
    setFiltroTipoDocumento([]);
    setFiltroCliente(null);
    setFiltroCentroCusto(null);
    setFiltroTipoBaixa([]);
  };

  const exportarCSV = () => {
    const headers = ['Cliente', 'Data Recebimento', 'Valor', 'Titulo', 'Parcela', 'Documento', 'Empresa', 'Centro de Custo'];
    const rows = ordenarContas(contas).map(c => [
      c.cliente || '',
      formatDate(c.data_recebimento),
      (c.valor_total || 0).toFixed(2).replace('.', ','),
      c.titulo || (c as any).lancamento || '',
      c.numero_parcela || '',
      c.id_documento || '',
      c.nome_empresa || '',
      c.nome_centrocusto || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contas_recebidas.csv';
    a.click();
    URL.revokeObjectURL(url);
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
        <SearchableSelect
          options={filtroEmpresa ? centrosCusto.filter(cc => cc.id_empresa === filtroEmpresa) : centrosCusto}
          value={filtroCentroCusto ?? undefined}
          onChange={(value) => setFiltroCentroCusto(value as number | null)}
          label="Centro de Custo"
          placeholder={filtroEmpresa ? "Selecione um centro de custo..." : "Selecione uma empresa primeiro..."}
          emptyText="Todos"
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
                <button type="button" onClick={() => setFiltroMes(meses.map(m => m.valor))} className="text-xs text-green-600 hover:underline">Todos</button>
                <button type="button" onClick={() => setFiltroMes([])} className="text-xs text-gray-500 hover:underline">Limpar</button>
              </div>
              <div className="max-h-48 overflow-y-auto p-2">
                {meses.map((mes) => (
                  <label key={mes.valor} className="flex cursor-pointer items-center gap-2 py-1 hover:bg-gray-50 rounded px-1">
                    <input
                      type="checkbox"
                      checked={filtroMes.includes(mes.valor)}
                      onChange={() => setFiltroMes(prev => prev.includes(mes.valor) ? prev.filter(m => m !== mes.valor) : [...prev, mes.valor])}
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
              {filtroTipoDocumento.length === 0 ? 'Todos' : `${filtroTipoDocumento.length} selecionado(s)`}
            </span>
            <svg
              className={`absolute right-3 top-9 h-5 w-5 transition-transform ${tipoDocDropdownAberto ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {tipoDocDropdownAberto && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg">
              <div className="border-b border-gray-200 p-2 flex gap-2">
                <button type="button" onClick={() => setFiltroTipoDocumento(tiposDocumento.map(t => t.id))} className="text-xs text-green-600 hover:underline">Todos</button>
                <button type="button" onClick={() => setFiltroTipoDocumento([])} className="text-xs text-gray-500 hover:underline">Limpar</button>
              </div>
              <div className="max-h-48 overflow-y-auto p-2">
                {tiposDocumento.map((tipo) => (
                  <label key={tipo.id} className="flex cursor-pointer items-center gap-2 py-1 hover:bg-gray-50 rounded px-1">
                    <input
                      type="checkbox"
                      checked={filtroTipoDocumento.includes(tipo.id)}
                      onChange={() => setFiltroTipoDocumento(prev => prev.includes(tipo.id) ? prev.filter(t => t !== tipo.id) : [...prev, tipo.id])}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700">{tipo.id} - {tipo.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Filtro Tipo de Baixa */}
        <div className="relative">
          <label className="mb-2 block text-sm font-medium text-gray-700">Tipo de Baixa</label>
          <button
            type="button"
            onClick={() => setTipoBaixaDropdownAberto(!tipoBaixaDropdownAberto)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:border-green-500 focus:outline-none"
          >
            <span className={filtroTipoBaixa.length > 0 ? 'text-gray-900' : 'text-gray-500'}>
              {filtroTipoBaixa.length === 0 ? 'Todos' : `${filtroTipoBaixa.length} selecionado(s)`}
            </span>
            <svg
              className={`absolute right-3 top-9 h-5 w-5 transition-transform ${tipoBaixaDropdownAberto ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {tipoBaixaDropdownAberto && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg">
              <div className="border-b border-gray-200 p-2 flex gap-2">
                <button type="button" onClick={() => setFiltroTipoBaixa([])} className="text-xs text-green-600 hover:underline">Todos</button>
                <button type="button" onClick={() => setFiltroTipoBaixa(tiposBaixa.map(t => t.id))} className="text-xs text-gray-500 hover:underline">Selecionar todos</button>
              </div>
              <div className="max-h-48 overflow-y-auto p-2">
                {tiposBaixa.map((tipo) => {
                  const flagColors: Record<string, string> = { P: 'bg-red-100 text-red-700', R: 'bg-green-100 text-green-700', A: 'bg-yellow-100 text-yellow-700', S: 'bg-blue-100 text-blue-700' };
                  return (
                    <label key={tipo.id} className="flex cursor-pointer items-center gap-2 py-1.5 hover:bg-gray-50 rounded px-1">
                      <input
                        type="checkbox"
                        checked={filtroTipoBaixa.includes(tipo.id)}
                        onChange={() => setFiltroTipoBaixa(prev => prev.includes(tipo.id) ? prev.filter(t => t !== tipo.id) : [...prev, tipo.id])}
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${flagColors[tipo.flag] || 'bg-gray-100 text-gray-700'}`}>{tipo.flag}</span>
                      <span className="text-sm text-gray-700 truncate">{tipo.nome}</span>
                    </label>
                  );
                })}
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

  // Usa o total do servidor (preciso) para os cards de estatísticas
  const totalReal = totalServidor?.total ?? estatisticas?.valor_total ?? 0;
  const quantidadeReal = totalServidor?.quantidade ?? estatisticas?.quantidade_titulos ?? 0;
  const valorMedioReal = quantidadeReal > 0 ? totalReal / quantidadeReal : 0;

  // Filtros ativos para badge no botão
  const filtrosAtivos: string[] = [];
  if (filtroEmpresa) {
    const emp = empresas.find(e => e.id === filtroEmpresa);
    if (emp) filtrosAtivos.push(`Empresa: ${emp.nome}`);
  }
  if (filtroCentroCusto) {
    const cc = centrosCusto.find(c => c.id === filtroCentroCusto);
    if (cc) filtrosAtivos.push(`Centro Custo: ${cc.nome}`);
  }
  if (filtroCliente) filtrosAtivos.push(`Cliente: ${filtroCliente}`);
  if (filtroTipoDocumento.length > 0) filtrosAtivos.push(`Docs: ${filtroTipoDocumento.length} selecionado(s)`);
  if (filtroTipoBaixa.length > 0) filtrosAtivos.push(`Tipos Baixa: ${filtroTipoBaixa.length} selecionado(s)`);
  if (filtroAno) filtrosAtivos.push(`Ano: ${filtroAno}`);
  if (filtroMes.length > 0) {
    const mesesNomes = filtroMes.map(m => meses.find(mes => mes.valor === m)?.nome).filter(Boolean);
    filtrosAtivos.push(`Meses: ${mesesNomes.join(', ')}`);
  }

  return (
    <div>
      {/* Cards coloridos no topo */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-gradient-to-br from-green-500 to-green-600 p-5 text-white shadow-lg">
          <div className="mb-1 text-xs font-medium opacity-90">Total Recebido</div>
          <div className="text-2xl font-bold">
            {loadingTotal ? <span className="text-base opacity-75">calculando...</span> : formatCurrency(totalReal)}
          </div>
          <div className="mt-1 text-xs opacity-75">
            {!loadingTotal && `${quantidadeReal.toLocaleString('pt-BR')} titulos`}
            {!loadingTotal && todasContas.length >= 2000 && (
              <span className="ml-1 opacity-90">(lista limitada a 2000)</span>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-white shadow-lg">
          <div className="mb-1 text-xs font-medium opacity-90">Quantidade</div>
          <div className="text-2xl font-bold">
            {loadingTotal ? <span className="text-base opacity-75">calculando...</span> : quantidadeReal.toLocaleString('pt-BR')}
          </div>
          <div className="mt-1 text-xs opacity-75">titulos recebidos</div>
        </div>

        <div className="rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 p-5 text-white shadow-lg">
          <div className="mb-1 text-xs font-medium opacity-90">Valor Medio</div>
          <div className="text-2xl font-bold">
            {loadingTotal ? <span className="text-base opacity-75">calculando...</span> : formatCurrency(valorMedioReal)}
          </div>
          <div className="mt-1 text-xs opacity-75">por titulo</div>
        </div>

        <div className="rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 p-5 text-white shadow-lg">
          <div className="mb-1 text-xs font-medium opacity-90">Concentracao Pareto</div>
          <div className="text-2xl font-bold">
            {paretoResumo ? `${paretoResumo.count} / ${paretoResumo.total}` : '-'}
          </div>
          <div className="mt-1 text-xs opacity-75">clientes representam 80% do valor</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
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
          </nav>
        </div>
      </div>

      {abaAtiva === 'dados' && (
        <div>
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Contas Recebidas</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {contas.length} conta(s) exibida(s)
                  {todasContas.length >= 2000 && (
                    <span className="ml-2 text-amber-600">(lista limitada a 2000)</span>
                  )}
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

            {!mostrarFiltros && filtrosAtivos.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {filtrosAtivos.map((filtro, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800"
                  >
                    {filtro}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Limpar todos
                </button>
              </div>
            )}

            {mostrarFiltros && renderFiltros()}
          </div>

          <div className="overflow-hidden rounded-lg bg-white shadow">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-green-50">
                  <tr>
                    <th onClick={() => toggleOrdenacao('cliente')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Cliente {renderSortIcon('cliente')}
                    </th>
                    <th onClick={() => toggleOrdenacao('data_recebimento')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Data Recebimento {renderSortIcon('data_recebimento')}
                    </th>
                    <th onClick={() => toggleOrdenacao('valor_total')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Valor {renderSortIcon('valor_total')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Titulo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Parcela</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Documento</th>
                    <th onClick={() => toggleOrdenacao('nome_empresa')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Empresa {renderSortIcon('nome_empresa')}
                    </th>
                    <th onClick={() => toggleOrdenacao('nome_centrocusto')} className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Centro de Custo {renderSortIcon('nome_centrocusto')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {ordenarContas(contas).slice(0, 500).map((conta, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{conta.cliente || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{formatDate(conta.data_recebimento)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-green-600">{formatCurrency(conta.valor_total)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{conta.titulo || (conta as any).lancamento || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{conta.numero_parcela || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{conta.id_documento || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{conta.nome_empresa || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {conta.nome_centrocusto ? (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100">
                            {conta.nome_centrocusto}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {contas.length > 500 && (
                <p className="mt-4 text-center text-sm text-gray-500 py-4">
                  Mostrando 500 de {contas.length} registros na lista
                </p>
              )}
            </div>
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
