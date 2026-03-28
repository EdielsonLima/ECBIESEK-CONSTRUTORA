import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { ContaPagar, EmpresaOption, CentroCustoOption, TipoDocumentoOption } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { SearchableMultiSelect } from '../components/SearchableMultiSelect';
import { criarPDFBase, adicionarFiltrosAtivos, adicionarResumoCards, adicionarTabela, finalizarPDF, gerarNomeArquivo, formatCurrencyPDF } from '../utils/pdfExport';

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

type AbaAtiva = 'dados' | 'credor' | 'empresa' | 'centro-custo' | 'origem' | 'analises';

const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899'];

export const ContasAtrasadas: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('dados');
  const [buscaCredor, setBuscaCredor] = useState('');
  const [buscaEmpresa, setBuscaEmpresa] = useState('');
  const [buscaCentroCusto, setBuscaCentroCusto] = useState('');
  const [filtroFaixa, setFiltroFaixa] = useState<'todos' | '1-7' | '8-15' | '16-30' | '31-60' | '61-90' | '+90'>('todos');
  const [filtroFaixaEmpresa, setFiltroFaixaEmpresa] = useState<'todos' | '1-7' | '8-15' | '16-30' | '31-60' | '61-90' | '+90'>('todos');
  const [filtroFaixaCC, setFiltroFaixaCC] = useState<'todos' | '1-7' | '8-15' | '16-30' | '31-60' | '61-90' | '+90'>('todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [dadosPorCredor, setDadosPorCredor] = useState<DadosPorCredor[]>([]);
  const [dadosPorEmpresa, setDadosPorEmpresa] = useState<DadosPorEmpresa[]>([]);
  const [dadosPorFaixaAtraso, setDadosPorFaixaAtraso] = useState<DadosPorFaixaAtraso[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<(number | string)[]>([]);
  const [filtroCentroCusto, setFiltroCentroCusto] = useState<(number | string)[]>([]);
  const [filtroAno, setFiltroAno] = useState<(number | string)[]>([]);
  const [filtroMes, setFiltroMes] = useState<(number | string)[]>([]);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [todasContas, setTodasContas] = useState<ContaPagar[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumentoOption[]>([]);
  const [filtroTipoDocumento, setFiltroTipoDocumento] = useState<(number | string)[]>([]);
  const [tiposPagamento, setTiposPagamento] = useState<Array<{ id: number; nome: string }>>([]);
  const [filtroTipoPagamento, setFiltroTipoPagamento] = useState<(number | string)[]>([]);
  const [filtroAutorizacao, setFiltroAutorizacao] = useState<(number | string)[]>([]);
  const [autorizacoesBulk, setAutorizacoesBulk] = useState<Record<string, string>>({});

  // Expandable rows and sorting states
  const [expandido, setExpandido] = useState<string | null>(null);
  const [ordenacaoAgrupada, setOrdenacaoAgrupada] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'valor_total', direcao: 'desc' });
  const [ordenacaoDetalhe, setOrdenacaoDetalhe] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'data_vencimento', direcao: 'asc' });
  const [ordenacaoDados, setOrdenacaoDados] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'data_vencimento', direcao: 'asc' });
  const [buscaOrigem, setBuscaOrigem] = useState('');
  const [filtroFaixaOrigem, setFiltroFaixaOrigem] = useState<'todos' | '1-7' | '8-15' | '16-30' | '31-60' | '61-90' | '+90'>('todos');
  const [buscaDados, setBuscaDados] = useState('');
  const [filtroFaixaDados, setFiltroFaixaDados] = useState<'todos' | '1-7' | '8-15' | '16-30' | '31-60' | '61-90' | '+90'>('todos');

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
    return [anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1];
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
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const calcularTitulosUnicos = (listaContas: ContaPagar[]): number => {
    const unicos = new Set<string>();
    listaContas.forEach(c => {
      if (c.lancamento && String(c.lancamento).includes('/')) {
        unicos.add(String(c.lancamento).split('/')[0]);
      } else if (c.numero_documento) {
        unicos.add(String(c.numero_documento));
      } else {
        unicos.add(`fallback-${c.id}`);
      }
    });
    return unicos.size;
  };

  const calcularDiasAtraso = (dataVencimento: string | undefined) => {
    if (!dataVencimento) return 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const [ano, mes, dia] = dataVencimento.split('T')[0].split('-').map(Number);
    const vencimento = new Date(ano, mes - 1, dia);
    vencimento.setHours(0, 0, 0, 0);
    const diffTime = hoje.getTime() - vencimento.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  useEffect(() => {
    const carregarFiltros = async () => {
      try {
        const [empresasData, ccData, tiposDocData, tiposPagData] = await Promise.all([
          apiService.getEmpresas(),
          apiService.getCentrosCusto(),
          apiService.getTiposDocumento(),
          apiService.getTiposPagamento(),
        ]);
        setEmpresas(empresasData);
        setCentrosCusto(ccData);
        setTiposDocumento(tiposDocData);
        setTiposPagamento(tiposPagData);
      } catch (err) {
        console.error('Erro ao carregar filtros:', err);
      }
    };
    // Carregar filtros padrão salvos
    const filtrosSalvos = localStorage.getItem('contas_atrasadas_filtros_padrao');
    if (filtrosSalvos) {
      try {
        const f = JSON.parse(filtrosSalvos);
        if (f.filtroEmpresa?.length) setFiltroEmpresa(f.filtroEmpresa);
        if (f.filtroCentroCusto?.length) setFiltroCentroCusto(f.filtroCentroCusto);
        if (f.filtroAno?.length) setFiltroAno(f.filtroAno);
        if (f.filtroMes?.length) setFiltroMes(f.filtroMes);
        if (f.filtroTipoDocumento?.length) setFiltroTipoDocumento(f.filtroTipoDocumento);
        if (f.filtroTipoPagamento?.length) setFiltroTipoPagamento(f.filtroTipoPagamento);
        if (f.filtroAutorizacao?.length) setFiltroAutorizacao(f.filtroAutorizacao);
      } catch (err) {
        console.error('Erro ao carregar filtros padrão:', err);
      }
    }

    carregarFiltros();
  }, []);

  useEffect(() => {
    apiService.getAutorizacoesBulk()
      .then(data => setAutorizacoesBulk(data))
      .catch(err => console.error('Erro ao carregar autorizações:', err));
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const data = await apiService.getContas('em_atraso', 10000);
      setTodasContas(data);
    } catch (err) {
      setError('Erro ao carregar contas atrasadas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltrosLocais = (
    dados: ContaPagar[],
    empresasSel: (number | string)[],
    ccSel: (number | string)[],
    anosSel: (number | string)[],
    mesesSelecionados: (number | string)[],
    tiposDocSelecionados: (number | string)[],
    tiposPagSelecionados: (number | string)[] = [],
    autorizacaoSelecionada: (number | string)[] = [],
    autorizacoesBulkMap: Record<string, string> = {}
  ) => {
    let contasFiltradas = [...dados];

    if (empresasSel.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => c.id_interno_empresa && empresasSel.includes(c.id_interno_empresa));
    }
    if (ccSel.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => c.id_interno_centro_custo && ccSel.includes(c.id_interno_centro_custo));
    }
    if (anosSel.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        if (!c.data_vencimento) return false;
        const anoVenc = parseInt(c.data_vencimento.split('T')[0].split('-')[0]);
        return anosSel.includes(anoVenc);
      });
    }
    if (mesesSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        if (!c.data_vencimento) return false;
        const mesVenc = parseInt(c.data_vencimento.split('T')[0].split('-')[1]);
        return mesesSelecionados.includes(mesVenc);
      });
    }
    if (tiposDocSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        return c.id_documento && tiposDocSelecionados.includes(c.id_documento);
      });
    }
    if (tiposPagSelecionados.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        return (c as any).id_tipo_pagamento && tiposPagSelecionados.includes((c as any).id_tipo_pagamento);
      });
    }
    if (autorizacaoSelecionada.length > 0) {
      contasFiltradas = contasFiltradas.filter(c => {
        const authApi = c.lancamento ? autorizacoesBulkMap[c.lancamento] : undefined;
        const auth = (authApi || (c as any).flautorizacao) === 'S' ? 'S' : 'N';
        return autorizacaoSelecionada.includes(auth);
      });
    }

    return contasFiltradas;
  };

  useEffect(() => {
    if (todasContas.length === 0) return;

    const contasFiltradas = aplicarFiltrosLocais(todasContas, filtroEmpresa, filtroCentroCusto, filtroAno, filtroMes, filtroTipoDocumento, filtroTipoPagamento, filtroAutorizacao, autorizacoesBulk);
    setContas(contasFiltradas);

    const totalDiasAtraso = contasFiltradas.reduce((acc, c) => acc + calcularDiasAtraso(c.data_vencimento as any), 0);
    const stats: Estatisticas = {
      quantidade_titulos: calcularTitulosUnicos(contasFiltradas),
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
  }, [todasContas, filtroEmpresa, filtroCentroCusto, filtroAno, filtroMes, filtroTipoDocumento, filtroTipoPagamento, filtroAutorizacao, autorizacoesBulk]);

  useEffect(() => {
    carregarDados();
  }, []);

  const limparFiltros = () => {
    setFiltroEmpresa([]);
    setFiltroCentroCusto([]);
    setFiltroAno([]);
    setFiltroMes([]);
    setFiltroTipoDocumento([]);
    setFiltroTipoPagamento([]);
    setFiltroAutorizacao([]);
  };

  const FILTROS_PADRAO_KEY = 'contas_atrasadas_filtros_padrao';

  const salvarFiltrosPadrao = () => {
    const filtros = {
      filtroEmpresa,
      filtroCentroCusto,
      filtroAno,
      filtroMes,
      filtroTipoDocumento,
      filtroTipoPagamento,
      filtroAutorizacao,
    };
    localStorage.setItem(FILTROS_PADRAO_KEY, JSON.stringify(filtros));
    alert('Filtros salvos como padrão! Serão aplicados automaticamente ao abrir a página.');
  };

  const removerFiltrosPadrao = () => {
    localStorage.removeItem(FILTROS_PADRAO_KEY);
    alert('Filtros padrão removidos.');
  };

  const temFiltrosPadrao = () => {
    return localStorage.getItem(FILTROS_PADRAO_KEY) !== null;
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

  const anosOptions = anosDisponiveis().map(a => ({ id: a, nome: String(a) }));
  const mesesOptions = meses.map(m => ({ id: m.valor, nome: m.nome }));

  const renderFiltros = () => (
    <div className="mb-6 rounded-lg bg-gray-50 p-4 shadow">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <SearchableMultiSelect
          options={empresas}
          value={filtroEmpresa}
          onChange={setFiltroEmpresa}
          label="Empresa"
          placeholder="Selecione empresas..."
          emptyText="Todas"
        />
        <SearchableMultiSelect
          options={centrosCusto}
          value={filtroCentroCusto}
          onChange={setFiltroCentroCusto}
          label="Centro de Custo"
          placeholder="Selecione centros de custo..."
          emptyText="Todos"
        />
        <SearchableMultiSelect
          options={anosOptions}
          value={filtroAno}
          onChange={setFiltroAno}
          label="Ano"
          placeholder="Selecione anos..."
          emptyText="Todos"
        />
        <SearchableMultiSelect
          options={mesesOptions}
          value={filtroMes}
          onChange={setFiltroMes}
          label="Mes"
          placeholder="Selecione meses..."
          emptyText="Todos"
        />
        <SearchableMultiSelect
          options={tiposDocumento}
          value={filtroTipoDocumento}
          onChange={setFiltroTipoDocumento}
          label="Tipo Documento"
          placeholder="Selecione tipos..."
          emptyText="Todos"
        />
        <SearchableMultiSelect
          options={tiposPagamento}
          value={filtroTipoPagamento}
          onChange={setFiltroTipoPagamento}
          label="Tipo Pagamento"
          placeholder="Selecione tipos..."
          emptyText="Todos"
        />
        <SearchableMultiSelect
          options={[{ id: 'S', nome: 'Autorizado' }, { id: 'N', nome: 'Não Autorizado' }]}
          value={filtroAutorizacao}
          onChange={setFiltroAutorizacao}
          label="Autorização"
          placeholder="Selecione..."
          emptyText="Todos"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={limparFiltros}
          className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
        >
          Limpar Filtros
        </button>
        <button
          type="button"
          onClick={salvarFiltrosPadrao}
          className="flex items-center rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
        >
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Salvar Padrão
        </button>
        {temFiltrosPadrao() && (
          <button
            type="button"
            onClick={removerFiltrosPadrao}
            className="flex items-center rounded-lg border border-red-300 px-4 py-2 text-red-600 hover:bg-red-50"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Remover Padrão
          </button>
        )}
      </div>
    </div>
  );

  const renderFiltrosTags = () => {
    const tags: { label: string; value: string; onRemove: () => void }[] = [];

    if (filtroEmpresa.length > 0) {
      const nomes = filtroEmpresa.map(id => empresas.find(e => e.id === id)?.nome || String(id)).join(', ');
      tags.push({ label: 'Empresa', value: filtroEmpresa.length > 2 ? `${filtroEmpresa.length} selecionada(s)` : nomes, onRemove: () => setFiltroEmpresa([]) });
    }

    if (filtroCentroCusto.length > 0) {
      const nomes = filtroCentroCusto.map(id => centrosCusto.find(c => c.id === id)?.nome || String(id)).join(', ');
      tags.push({ label: 'Centro de Custo', value: filtroCentroCusto.length > 2 ? `${filtroCentroCusto.length} selecionado(s)` : nomes, onRemove: () => setFiltroCentroCusto([]) });
    }

    if (filtroAno.length > 0) {
      tags.push({ label: 'Ano', value: filtroAno.join(', '), onRemove: () => setFiltroAno([]) });
    }

    if (filtroMes.length > 0 && filtroMes.length < 12) {
      const mesesNomes = filtroMes.map(m => meses.find(mes => mes.valor === m)?.nome || '').join(', ');
      tags.push({ label: 'Meses', value: mesesNomes, onRemove: () => setFiltroMes([]) });
    }

    if (filtroTipoDocumento.length > 0 && filtroTipoDocumento.length < tiposDocumento.length) {
      const tiposNomes = filtroTipoDocumento.map(t => {
        const tipo = tiposDocumento.find(tipo => tipo.id === t);
        return tipo ? `${tipo.id}` : '';
      }).filter(Boolean).join(', ');
      tags.push({ label: 'Tipo Documento', value: tiposNomes, onRemove: () => setFiltroTipoDocumento([]) });
    }

    if (filtroTipoPagamento.length > 0) {
      const nomes = filtroTipoPagamento.map(id => tiposPagamento.find(t => t.id === id)?.nome || String(id)).join(', ');
      tags.push({ label: 'Tipo Pagamento', value: filtroTipoPagamento.length > 2 ? `${filtroTipoPagamento.length} selecionado(s)` : nomes, onRemove: () => setFiltroTipoPagamento([]) });
    }

    if (filtroAutorizacao.length > 0) {
      const nomes = filtroAutorizacao.map(v => v === 'S' ? 'Autorizado' : 'Não Autorizado').join(', ');
      tags.push({ label: 'Autorização', value: nomes, onRemove: () => setFiltroAutorizacao([]) });
    }

    if (tags.length === 0) return null;

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800"
          >
            <span className="text-red-600">{tag.label}:</span>
            <span className="ml-1">{tag.value}</span>
            <button
              type="button"
              onClick={tag.onRemove}
              className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full text-red-600 hover:bg-red-200 hover:text-red-800"
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

  const agruparPorChave = (chave: 'credor' | 'nome_empresa' | 'nome_centrocusto' | 'id_origem') => {
    const mapa = new Map<string, { valor_1_7: number; valor_8_15: number; valor_16_30: number; valor_31_60: number; valor_61_90: number; valor_90_mais: number; valor_total: number; quantidade: number; dias_max: number }>();
    contas.forEach(c => {
      let nome: string;
      switch (chave) {
        case 'credor': nome = c.credor || 'Sem Identificacao'; break;
        case 'nome_empresa': nome = c.nome_empresa || 'Sem Identificacao'; break;
        case 'nome_centrocusto': nome = c.nome_centrocusto || 'Sem Identificacao'; break;
        case 'id_origem': nome = c.id_origem || 'Sem Origem'; break;
      }
      const dias = calcularDiasAtraso(c.data_vencimento as any);
      const valor = c.valor_total || 0;
      const atual = mapa.get(nome) || { valor_1_7: 0, valor_8_15: 0, valor_16_30: 0, valor_31_60: 0, valor_61_90: 0, valor_90_mais: 0, valor_total: 0, quantidade: 0, dias_max: 0 };
      atual.valor_total += valor;
      atual.quantidade += 1;
      atual.dias_max = Math.max(atual.dias_max, dias);
      if (dias >= 1 && dias <= 7) atual.valor_1_7 += valor;
      else if (dias >= 8 && dias <= 15) atual.valor_8_15 += valor;
      else if (dias >= 16 && dias <= 30) atual.valor_16_30 += valor;
      else if (dias >= 31 && dias <= 60) atual.valor_31_60 += valor;
      else if (dias >= 61 && dias <= 90) atual.valor_61_90 += valor;
      else if (dias > 90) atual.valor_90_mais += valor;
      mapa.set(nome, atual);
    });
    return Array.from(mapa.entries())
      .map(([nome, data]) => ({ nome, ...data }))
      .sort((a, b) => b.valor_total - a.valor_total);
  };

  const filtrarPorFaixa = (dados: ReturnType<typeof agruparPorChave>, faixa: string) => {
    if (faixa === 'todos') return dados;
    return dados.filter(d => {
      if (faixa === '1-7') return d.valor_1_7 > 0;
      if (faixa === '8-15') return d.valor_8_15 > 0;
      if (faixa === '16-30') return d.valor_16_30 > 0;
      if (faixa === '31-60') return d.valor_31_60 > 0;
      if (faixa === '61-90') return d.valor_61_90 > 0;
      if (faixa === '+90') return d.valor_90_mais > 0;
      return true;
    });
  };

  const exportarPDFAgrupado = (dados: ReturnType<typeof agruparPorChave>, colNome: string) => {
    if (dados.length === 0) return;
    const abaLabel = abaAtiva === 'credor' ? 'Por Credor' : abaAtiva === 'empresa' ? 'Por Empresa' : abaAtiva === 'centro-custo' ? 'Por Centro de Custo' : abaAtiva === 'origem' ? 'Por Origem' : 'Analises';
    const { doc, pageWidth, margin, dataGeracao } = criarPDFBase('Contas em Atraso', `Aba: ${abaLabel}`);
    let y = 34;

    // Filtros
    const filtros = [];
    if (filtroEmpresa.length > 0) filtros.push({ label: 'Empresa', valor: `${filtroEmpresa.length} selecionada(s)` });
    if (filtroCentroCusto.length > 0) filtros.push({ label: 'Centro Custo', valor: `${filtroCentroCusto.length} selecionado(s)` });
    if (filtroAno.length > 0) filtros.push({ label: 'Ano', valor: filtroAno.join(', ') });
    y = adicionarFiltrosAtivos(doc, filtros, y, pageWidth, margin);

    // Cards
    const totalVal = dados.reduce((s, d) => s + d.valor_total, 0);
    y = adicionarResumoCards(doc, [
      { label: 'Total em Atraso', valor: totalVal, cor: [239, 68, 68] },
      { label: 'Quantidade', valor: String(dados.reduce((s, d) => s + d.quantidade, 0)), cor: [249, 115, 22] },
      { label: `${colNome}s`, valor: String(dados.length), cor: [139, 92, 246] },
    ], y, pageWidth, margin);

    adicionarTabela(doc, {
      head: [[`#`, colNome, '1-7d', '8-15d', '16-30d', '31-60d', '61-90d', '+90d', 'Total', 'Qtd']],
      body: dados.map((d, i) => [
        String(i + 1), d.nome,
        `R$ ${formatCurrencyPDF(d.valor_1_7)}`, `R$ ${formatCurrencyPDF(d.valor_8_15)}`,
        `R$ ${formatCurrencyPDF(d.valor_16_30)}`, `R$ ${formatCurrencyPDF(d.valor_31_60)}`,
        `R$ ${formatCurrencyPDF(d.valor_61_90)}`, `R$ ${formatCurrencyPDF(d.valor_90_mais)}`,
        `R$ ${formatCurrencyPDF(d.valor_total)}`, String(d.quantidade),
      ]),
      foot: [['', 'TOTAL',
        `R$ ${formatCurrencyPDF(dados.reduce((s, d) => s + d.valor_1_7, 0))}`,
        `R$ ${formatCurrencyPDF(dados.reduce((s, d) => s + d.valor_8_15, 0))}`,
        `R$ ${formatCurrencyPDF(dados.reduce((s, d) => s + d.valor_16_30, 0))}`,
        `R$ ${formatCurrencyPDF(dados.reduce((s, d) => s + d.valor_31_60, 0))}`,
        `R$ ${formatCurrencyPDF(dados.reduce((s, d) => s + d.valor_61_90, 0))}`,
        `R$ ${formatCurrencyPDF(dados.reduce((s, d) => s + d.valor_90_mais, 0))}`,
        `R$ ${formatCurrencyPDF(totalVal)}`,
        String(dados.reduce((s, d) => s + d.quantidade, 0)),
      ]],
      columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'center' } },
    }, y, margin);

    finalizarPDF(doc, gerarNomeArquivo('contas_atrasadas', abaLabel), dataGeracao);
  };

  const exportarCSVAgrupado = (dados: ReturnType<typeof agruparPorChave>, nomeArquivo: string, colNome: string) => {
    if (dados.length === 0) return;
    const header = `#;${colNome};1-7d;8-15d;16-30d;31-60d;61-90d;+90d;Total;Qtd;Max Atraso`;
    const rows = dados.map((d, i) =>
      `${i + 1};${d.nome};${d.valor_1_7.toFixed(2).replace('.', ',')};${d.valor_8_15.toFixed(2).replace('.', ',')};${d.valor_16_30.toFixed(2).replace('.', ',')};${d.valor_31_60.toFixed(2).replace('.', ',')};${d.valor_61_90.toFixed(2).replace('.', ',')};${d.valor_90_mais.toFixed(2).replace('.', ',')};${d.valor_total.toFixed(2).replace('.', ',')};${d.quantidade};${d.dias_max}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nomeArquivo}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortIcon = (campo: string) => (
    <span className="ml-1 inline-block">{ordenacaoAgrupada.campo === campo ? (ordenacaoAgrupada.direcao === 'asc' ? '\u25B2' : '\u25BC') : <span className="text-red-300">{'\u25BC'}</span>}</span>
  );

  const sortIconDetalhe = (campo: string) => (
    <span className="ml-1 inline-block">{ordenacaoDetalhe.campo === campo ? (ordenacaoDetalhe.direcao === 'asc' ? '\u25B2' : '\u25BC') : <span className="text-gray-300">{'\u25BC'}</span>}</span>
  );

  const sortIconDados = (campo: string) => (
    <span className="ml-1 inline-block">{ordenacaoDados.campo === campo ? (ordenacaoDados.direcao === 'asc' ? '\u25B2' : '\u25BC') : <span className="text-gray-300">{'\u25BC'}</span>}</span>
  );

  const toggleSortAgrupada = (campo: string) => {
    setOrdenacaoAgrupada(prev => ({
      campo,
      direcao: prev.campo === campo && prev.direcao === 'desc' ? 'asc' : 'desc',
    }));
  };

  const toggleSortDetalhe = (campo: string) => {
    setOrdenacaoDetalhe(prev => ({
      campo,
      direcao: prev.campo === campo && prev.direcao === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleSortDados = (campo: string) => {
    setOrdenacaoDados(prev => ({
      campo,
      direcao: prev.campo === campo && prev.direcao === 'asc' ? 'desc' : 'asc',
    }));
  };

  const ordenarDadosAgrupados = (dados: ReturnType<typeof agruparPorChave>) => {
    const { campo, direcao } = ordenacaoAgrupada;
    const sorted = [...dados].sort((a, b) => {
      let va: any, vb: any;
      switch (campo) {
        case 'nome': va = a.nome.toLowerCase(); vb = b.nome.toLowerCase(); break;
        case 'valor_total': va = a.valor_total; vb = b.valor_total; break;
        case 'quantidade': va = a.quantidade; vb = b.quantidade; break;
        case 'dias_max': va = a.dias_max; vb = b.dias_max; break;
        default: va = a.valor_total; vb = b.valor_total;
      }
      if (va < vb) return direcao === 'asc' ? -1 : 1;
      if (va > vb) return direcao === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  };

  const obterContasDetalhe = (nome: string, chaveAgrupamento: 'credor' | 'nome_empresa' | 'nome_centrocusto' | 'id_origem') => {
    let contasDetalhe: ContaPagar[];
    switch (chaveAgrupamento) {
      case 'credor':
        contasDetalhe = contas.filter(c => (c.credor || 'Sem Identificacao') === nome);
        break;
      case 'nome_empresa':
        contasDetalhe = contas.filter(c => (c.nome_empresa || 'Sem Identificacao') === nome);
        break;
      case 'nome_centrocusto':
        contasDetalhe = contas.filter(c => (c.nome_centrocusto || 'Sem Identificacao') === nome);
        break;
      case 'id_origem':
        contasDetalhe = contas.filter(c => (c.id_origem || 'Sem Origem') === nome);
        break;
    }

    const { campo, direcao } = ordenacaoDetalhe;
    return [...contasDetalhe].sort((a, b) => {
      let va: any, vb: any;
      switch (campo) {
        case 'data_vencimento': va = a.data_vencimento || ''; vb = b.data_vencimento || ''; break;
        case 'lancamento': va = a.lancamento || ''; vb = b.lancamento || ''; break;
        case 'nome_centrocusto': va = (a.nome_centrocusto || '').toLowerCase(); vb = (b.nome_centrocusto || '').toLowerCase(); break;
        case 'credor': va = (a.credor || '').toLowerCase(); vb = (b.credor || '').toLowerCase(); break;
        case 'nome_plano_financeiro': va = (a.nome_plano_financeiro || '').toLowerCase(); vb = (b.nome_plano_financeiro || '').toLowerCase(); break;
        case 'valor_total': va = a.valor_total || 0; vb = b.valor_total || 0; break;
        case 'dias_atraso': va = calcularDiasAtraso(a.data_vencimento as any); vb = calcularDiasAtraso(b.data_vencimento as any); break;
        default: va = a.data_vencimento || ''; vb = b.data_vencimento || '';
      }
      if (va < vb) return direcao === 'asc' ? -1 : 1;
      if (va > vb) return direcao === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const renderTabelaAgrupada = (
    dados: ReturnType<typeof agruparPorChave>,
    titulo: string,
    subtitulo: string,
    busca: string,
    setBusca: (v: string) => void,
    faixa: string,
    setFaixa: (v: any) => void,
    colNome: string,
    nomeArquivo: string,
    chaveAgrupamento: 'credor' | 'nome_empresa' | 'nome_centrocusto' | 'id_origem'
  ) => {
    const dadosFiltrados = ordenarDadosAgrupados(filtrarPorFaixa(
      busca ? dados.filter(d => d.nome.toLowerCase().includes(busca.toLowerCase())) : dados,
      faixa
    ));

    const totais = dadosFiltrados.reduce((acc, d) => ({
      valor_1_7: acc.valor_1_7 + d.valor_1_7,
      valor_8_15: acc.valor_8_15 + d.valor_8_15,
      valor_16_30: acc.valor_16_30 + d.valor_16_30,
      valor_31_60: acc.valor_31_60 + d.valor_31_60,
      valor_61_90: acc.valor_61_90 + d.valor_61_90,
      valor_90_mais: acc.valor_90_mais + d.valor_90_mais,
      valor_total: acc.valor_total + d.valor_total,
      quantidade: acc.quantidade + d.quantidade,
    }), { valor_1_7: 0, valor_8_15: 0, valor_16_30: 0, valor_31_60: 0, valor_61_90: 0, valor_90_mais: 0, valor_total: 0, quantidade: 0 });

    // Determine which column to show in detail based on grouping
    const detalheColNome = chaveAgrupamento === 'credor' ? 'Centro de Custo' : 'Credor';
    const detalheCampo = chaveAgrupamento === 'credor' ? 'nome_centrocusto' : 'credor';

    return (
      <>
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{titulo}</h2>
              <p className="mt-1 text-sm text-gray-600">
                {dados.length} {subtitulo}
                {(busca || faixa !== 'todos') && ` · ${dadosFiltrados.length} exibido(s)`}
              </p>
            </div>
            <div className="flex gap-2">
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
              <button
                type="button"
                onClick={() => exportarPDFAgrupado(dadosFiltrados, colNome)}
                disabled={dadosFiltrados.length === 0}
                className="flex items-center rounded-lg bg-red-700 px-4 py-2 text-white hover:bg-red-800 disabled:opacity-50"
              >
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Exportar PDF
              </button>
              <button
                type="button"
                onClick={() => exportarCSVAgrupado(dadosFiltrados, nomeArquivo, colNome)}
                disabled={dadosFiltrados.length === 0}
                className="flex items-center rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
              >
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Exportar CSV
              </button>
            </div>
          </div>
          {mostrarFiltros && renderFiltros()}
          {!mostrarFiltros && renderFiltrosTags()}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Buscar ${colNome.toLowerCase()}...`}
            className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-red-500 focus:outline-none"
          />
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {([
              { key: 'todos' as const, label: 'Todos' },
              { key: '1-7' as const, label: '1-7d' },
              { key: '8-15' as const, label: '8-15d' },
              { key: '16-30' as const, label: '16-30d' },
              { key: '31-60' as const, label: '31-60d' },
              { key: '61-90' as const, label: '61-90d' },
              { key: '+90' as const, label: '+90d' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFaixa(key)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  faixa === key
                    ? 'bg-red-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                } ${key !== 'todos' ? 'border-l border-gray-300' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
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
            <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-red-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-3 text-center text-xs font-bold text-white border border-red-600 w-8"></th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 w-12">#</th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-white border border-red-600 cursor-pointer select-none" onClick={() => toggleSortAgrupada('nome')}>
                      {colNome}{sortIcon('nome')}
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 bg-red-800">1-7d</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 bg-red-800">8-15d</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 bg-red-800">16-30d</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 bg-orange-700">31-60d</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 bg-orange-700">61-90d</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 bg-orange-700">+90d</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 cursor-pointer select-none" onClick={() => toggleSortAgrupada('valor_total')}>
                      Total{sortIcon('valor_total')}
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 w-16 cursor-pointer select-none" onClick={() => toggleSortAgrupada('quantidade')}>
                      Qtd{sortIcon('quantidade')}
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 w-20 cursor-pointer select-none" onClick={() => toggleSortAgrupada('dias_max')}>
                      Max{sortIcon('dias_max')}
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 w-16">%</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 w-20">% Acum.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(() => {
                    let acumulado = 0;
                    return dadosFiltrados.map((d, index) => {
                      const pctTotal = totais.valor_total > 0 ? (d.valor_total / totais.valor_total) * 100 : 0;
                      // For Pareto, we sort by valor_total desc for accumulation
                      const dadosOrdenadosPareto = [...dadosFiltrados].sort((a, b) => b.valor_total - a.valor_total);
                      const idxPareto = dadosOrdenadosPareto.findIndex(x => x.nome === d.nome);
                      let acumPareto = 0;
                      for (let i = 0; i <= idxPareto; i++) {
                        acumPareto += totais.valor_total > 0 ? (dadosOrdenadosPareto[i].valor_total / totais.valor_total) * 100 : 0;
                      }
                      acumulado = acumPareto;

                      const isExpanded = expandido === `${chaveAgrupamento}-${d.nome}`;
                      const contasDetalhe = isExpanded ? obterContasDetalhe(d.nome, chaveAgrupamento) : [];

                      return (
                        <React.Fragment key={d.nome}>
                          <tr
                            className={`cursor-pointer ${isExpanded ? 'bg-red-100 border-l-4 border-l-red-600' : index % 2 === 0 ? 'bg-white hover:bg-red-50' : 'bg-gray-50 hover:bg-red-50'}`}
                            onClick={() => setExpandido(isExpanded ? null : `${chaveAgrupamento}-${d.nome}`)}
                          >
                            <td className="px-2 py-2 text-center text-xs text-gray-500">
                              <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>{'\u25B6'}</span>
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-500 border-r border-gray-100">{index + 1}</td>
                            <td className="px-3 py-2 text-sm font-medium text-gray-900 border-r border-gray-100 max-w-xs truncate" title={d.nome}>{d.nome}</td>
                            <td className="px-3 py-2 text-right text-xs text-gray-700 border-r border-gray-100 font-mono">{d.valor_1_7 ? formatCurrency(d.valor_1_7) : '-'}</td>
                            <td className="px-3 py-2 text-right text-xs text-gray-700 border-r border-gray-100 font-mono">{d.valor_8_15 ? formatCurrency(d.valor_8_15) : '-'}</td>
                            <td className="px-3 py-2 text-right text-xs text-gray-700 border-r border-gray-100 font-mono">{d.valor_16_30 ? formatCurrency(d.valor_16_30) : '-'}</td>
                            <td className="px-3 py-2 text-right text-xs text-orange-700 border-r border-gray-100 font-mono">{d.valor_31_60 ? formatCurrency(d.valor_31_60) : '-'}</td>
                            <td className="px-3 py-2 text-right text-xs text-orange-700 border-r border-gray-100 font-mono">{d.valor_61_90 ? formatCurrency(d.valor_61_90) : '-'}</td>
                            <td className="px-3 py-2 text-right text-xs text-red-700 border-r border-gray-100 font-mono font-semibold">{d.valor_90_mais ? formatCurrency(d.valor_90_mais) : '-'}</td>
                            <td className="px-3 py-2 text-right text-sm font-semibold text-red-700 font-mono">{formatCurrency(d.valor_total)}</td>
                            <td className="px-3 py-2 text-center text-xs text-gray-600 font-mono">{d.quantidade}</td>
                            <td className="px-3 py-2 text-center text-xs font-mono">
                              <span className={`font-semibold ${d.dias_max > 90 ? 'text-red-700' : d.dias_max > 30 ? 'text-orange-600' : 'text-yellow-600'}`}>
                                {d.dias_max}d
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-600 font-mono">{pctTotal.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-center text-xs font-mono">
                              <div className="flex items-center gap-1">
                                <div className="h-2 flex-1 rounded-full bg-gray-200">
                                  <div className="h-2 rounded-full bg-red-500" style={{ width: `${Math.min(acumulado, 100)}%` }}></div>
                                </div>
                                <span className="text-gray-600 w-12 text-right">{acumulado.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={14} className="p-0">
                                <div className="bg-gradient-to-r from-red-50 via-red-50 to-orange-50 border-l-4 border-l-red-600 p-4">
                                  <p className="mb-2 text-xs font-semibold text-red-800">Detalhes: {d.nome} ({contasDetalhe.length} titulos)</p>
                                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto rounded border border-red-200">
                                    <table className="min-w-full text-xs">
                                      <thead className="bg-red-700 text-white sticky top-0">
                                        <tr>
                                          <th className="px-2 py-1.5 text-left cursor-pointer select-none" onClick={(e) => { e.stopPropagation(); toggleSortDetalhe('data_vencimento'); }}>Vencimento{sortIconDetalhe('data_vencimento')}</th>
                                          <th className="px-2 py-1.5 text-left cursor-pointer select-none" onClick={(e) => { e.stopPropagation(); toggleSortDetalhe('lancamento'); }}>Titulo{sortIconDetalhe('lancamento')}</th>
                                          <th className="px-2 py-1.5 text-center cursor-pointer select-none" onClick={(e) => { e.stopPropagation(); toggleSortDetalhe('dias_atraso'); }}>Dias Atraso{sortIconDetalhe('dias_atraso')}</th>
                                          <th className="px-2 py-1.5 text-left cursor-pointer select-none" onClick={(e) => { e.stopPropagation(); toggleSortDetalhe(detalheCampo); }}>{detalheColNome}{sortIconDetalhe(detalheCampo)}</th>
                                          <th className="px-2 py-1.5 text-left cursor-pointer select-none" onClick={(e) => { e.stopPropagation(); toggleSortDetalhe('nome_plano_financeiro'); }}>Plano Financeiro{sortIconDetalhe('nome_plano_financeiro')}</th>
                                          <th className="px-2 py-1.5 text-right cursor-pointer select-none" onClick={(e) => { e.stopPropagation(); toggleSortDetalhe('valor_total'); }}>Valor{sortIconDetalhe('valor_total')}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {contasDetalhe.map((c, ci) => {
                                          const diasAtraso = calcularDiasAtraso(c.data_vencimento as any);
                                          return (
                                            <tr key={ci} className={ci % 2 === 0 ? 'bg-white' : 'bg-red-50'}>
                                              <td className="px-2 py-1 text-gray-700">{formatDate(c.data_vencimento)}</td>
                                              <td className="px-2 py-1 text-gray-700">{c.lancamento ? String(c.lancamento).split('/')[0] : '-'}</td>
                                              <td className="px-2 py-1 text-center">
                                                <span className={`font-semibold ${diasAtraso > 90 ? 'text-red-700' : diasAtraso > 30 ? 'text-orange-600' : diasAtraso > 7 ? 'text-yellow-600' : 'text-green-600'}`}>
                                                  {diasAtraso}d
                                                </span>
                                              </td>
                                              <td className="px-2 py-1 text-gray-700 max-w-[200px] truncate" title={chaveAgrupamento === 'credor' ? (c.nome_centrocusto || '-') : (c.credor || '-')}>
                                                {chaveAgrupamento === 'credor' ? (c.nome_centrocusto || '-') : (c.credor || '-')}
                                              </td>
                                              <td className="px-2 py-1 text-gray-700 max-w-[200px] truncate" title={c.nome_plano_financeiro || '-'}>{c.nome_plano_financeiro || '-'}</td>
                                              <td className="px-2 py-1 text-right font-mono font-semibold text-red-700">{formatCurrency(c.valor_total)}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                      <tfoot className="bg-red-100 font-bold">
                                        <tr>
                                          <td colSpan={5} className="px-2 py-1.5 text-gray-800">Total</td>
                                          <td className="px-2 py-1.5 text-right font-mono text-red-800">{formatCurrency(contasDetalhe.reduce((s, c) => s + (c.valor_total || 0), 0))}</td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    });
                  })()}
                </tbody>
                <tfoot className="bg-red-100 sticky bottom-0">
                  <tr className="font-bold">
                    <td className="px-3 py-3 border-t-2 border-red-300"></td>
                    <td className="px-3 py-3 text-sm text-gray-900 border-t-2 border-red-300" colSpan={2}>TOTAL GERAL</td>
                    <td className="px-3 py-3 text-right text-xs text-gray-900 border-t-2 border-red-300 font-mono">{formatCurrency(totais.valor_1_7)}</td>
                    <td className="px-3 py-3 text-right text-xs text-gray-900 border-t-2 border-red-300 font-mono">{formatCurrency(totais.valor_8_15)}</td>
                    <td className="px-3 py-3 text-right text-xs text-gray-900 border-t-2 border-red-300 font-mono">{formatCurrency(totais.valor_16_30)}</td>
                    <td className="px-3 py-3 text-right text-xs text-gray-900 border-t-2 border-red-300 font-mono">{formatCurrency(totais.valor_31_60)}</td>
                    <td className="px-3 py-3 text-right text-xs text-gray-900 border-t-2 border-red-300 font-mono">{formatCurrency(totais.valor_61_90)}</td>
                    <td className="px-3 py-3 text-right text-xs text-gray-900 border-t-2 border-red-300 font-mono">{formatCurrency(totais.valor_90_mais)}</td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-red-800 border-t-2 border-red-300 font-mono">{formatCurrency(totais.valor_total)}</td>
                    <td className="px-3 py-3 text-center text-xs text-gray-900 border-t-2 border-red-300 font-mono">{totais.quantidade}</td>
                    <td className="px-3 py-3 border-t-2 border-red-300"></td>
                    <td className="px-3 py-3 border-t-2 border-red-300"></td>
                    <td className="px-3 py-3 border-t-2 border-red-300"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </>
    );
  };

  const exportarPDFDados = (dados: ContaPagar[]) => {
    if (dados.length === 0) return;
    const { doc, pageWidth, margin, dataGeracao } = criarPDFBase('Contas em Atraso', 'Aba: Dados Detalhados');
    let y = 34;

    const filtros = [];
    if (filtroEmpresa.length > 0) filtros.push({ label: 'Empresa', valor: `${filtroEmpresa.length} selecionada(s)` });
    if (filtroCentroCusto.length > 0) filtros.push({ label: 'Centro Custo', valor: `${filtroCentroCusto.length} selecionado(s)` });
    if (filtroAno.length > 0) filtros.push({ label: 'Ano', valor: filtroAno.join(', ') });
    y = adicionarFiltrosAtivos(doc, filtros, y, pageWidth, margin);

    const totalVal = dados.reduce((s, c) => s + (c.valor_total || 0), 0);
    y = adicionarResumoCards(doc, [
      { label: 'Total em Atraso', valor: totalVal, cor: [239, 68, 68] },
      { label: 'Títulos', valor: String(dados.length), cor: [249, 115, 22] },
    ], y, pageWidth, margin);

    adicionarTabela(doc, {
      head: [['#', 'Credor', 'Venc.', 'Titulo', 'Dias', 'Centro de Custo', 'Plano Financeiro', 'Aut.', 'Valor']],
      body: dados.map((c, i) => {
        const authApi = c.lancamento ? autorizacoesBulk[c.lancamento] : undefined;
        const auth = (authApi || (c as any).flautorizacao) === 'S' ? 'Sim' : 'Não';
        return [
          String(i + 1),
          c.credor || '-',
          formatDate(c.data_vencimento),
          c.lancamento ? String(c.lancamento).split('/')[0] : '-',
          String(calcularDiasAtraso(c.data_vencimento as any)) + 'd',
          c.nome_centrocusto || '-',
          c.nome_plano_financeiro || '-',
          auth,
          `R$ ${formatCurrencyPDF(c.valor_total || 0)}`,
        ];
      }),
      foot: [['', 'TOTAL', '', '', '', '', '', '', `R$ ${formatCurrencyPDF(totalVal)}`]],
      columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 4: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'right' } },
    }, y, margin);

    finalizarPDF(doc, gerarNomeArquivo('contas_atrasadas', 'Dados'), dataGeracao);
  };

  const exportarCSVDados = (dados: ContaPagar[]) => {
    if (dados.length === 0) return;
    const header = '#;Credor;Vencimento;Titulo;Dias Atraso;Centro de Custo;Plano Financeiro;Tipo Pagamento;Autorizacao;Valor';
    const rows = dados.map((c, i) => {
      const authApi = c.lancamento ? autorizacoesBulk[c.lancamento] : undefined;
      const auth = (authApi || (c as any).flautorizacao) === 'S' ? 'Sim' : 'Nao';
      return `${i + 1};${c.credor || '-'};${formatDate(c.data_vencimento)};${c.lancamento ? String(c.lancamento).split('/')[0] : '-'};${calcularDiasAtraso(c.data_vencimento as any)};${c.nome_centrocusto || '-'};${c.nome_plano_financeiro || '-'};${(c as any).nome_tipo_pagamento || '-'};${auth};${(c.valor_total || 0).toFixed(2).replace('.', ',')}`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contas_atrasadas_dados_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderAbaDados = () => {
    const contasFiltradas = (() => {
      let resultado = [...contas];
      if (buscaDados) {
        const termo = buscaDados.toLowerCase();
        resultado = resultado.filter(c =>
          (c.credor || '').toLowerCase().includes(termo) ||
          (c.nome_centrocusto || '').toLowerCase().includes(termo) ||
          (c.lancamento || '').toLowerCase().includes(termo) ||
          (c.nome_plano_financeiro || '').toLowerCase().includes(termo)
        );
      }
      if (filtroFaixaDados !== 'todos') {
        resultado = resultado.filter(c => {
          const dias = calcularDiasAtraso(c.data_vencimento as any);
          switch (filtroFaixaDados) {
            case '1-7': return dias >= 1 && dias <= 7;
            case '8-15': return dias >= 8 && dias <= 15;
            case '16-30': return dias >= 16 && dias <= 30;
            case '31-60': return dias >= 31 && dias <= 60;
            case '61-90': return dias >= 61 && dias <= 90;
            case '+90': return dias > 90;
            default: return true;
          }
        });
      }
      return resultado;
    })();

    // Sort
    const { campo, direcao } = ordenacaoDados;
    const dadosOrdenados = [...contasFiltradas].sort((a, b) => {
      let va: any, vb: any;
      switch (campo) {
        case 'credor': va = (a.credor || '').toLowerCase(); vb = (b.credor || '').toLowerCase(); break;
        case 'data_vencimento': va = a.data_vencimento || ''; vb = b.data_vencimento || ''; break;
        case 'lancamento': va = a.lancamento || ''; vb = b.lancamento || ''; break;
        case 'dias_atraso': va = calcularDiasAtraso(a.data_vencimento as any); vb = calcularDiasAtraso(b.data_vencimento as any); break;
        case 'nome_centrocusto': va = (a.nome_centrocusto || '').toLowerCase(); vb = (b.nome_centrocusto || '').toLowerCase(); break;
        case 'nome_plano_financeiro': va = (a.nome_plano_financeiro || '').toLowerCase(); vb = (b.nome_plano_financeiro || '').toLowerCase(); break;
        case 'nome_tipo_pagamento': va = ((a as any).nome_tipo_pagamento || '').toLowerCase(); vb = ((b as any).nome_tipo_pagamento || '').toLowerCase(); break;
        case 'flautorizacao': {
          const authA = (a.lancamento ? autorizacoesBulk[a.lancamento] : undefined) || (a as any).flautorizacao || 'N';
          const authB = (b.lancamento ? autorizacoesBulk[b.lancamento] : undefined) || (b as any).flautorizacao || 'N';
          va = authA; vb = authB; break;
        }
        case 'valor_total': va = a.valor_total || 0; vb = b.valor_total || 0; break;
        default: va = a.data_vencimento || ''; vb = b.data_vencimento || '';
      }
      if (va < vb) return direcao === 'asc' ? -1 : 1;
      if (va > vb) return direcao === 'asc' ? 1 : -1;
      return 0;
    });

    const totalValor = dadosOrdenados.reduce((s, c) => s + (c.valor_total || 0), 0);

    return (
      <>
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Dados Detalhados</h2>
              <p className="mt-1 text-sm text-gray-600">
                {contas.length} contas atrasadas
                {(buscaDados || filtroFaixaDados !== 'todos') && ` · ${dadosOrdenados.length} exibido(s)`}
              </p>
            </div>
            <div className="flex gap-2">
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
              <button
                type="button"
                onClick={() => exportarPDFDados(dadosOrdenados)}
                disabled={dadosOrdenados.length === 0}
                className="flex items-center rounded-lg bg-red-700 px-4 py-2 text-white hover:bg-red-800 disabled:opacity-50"
              >
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Exportar PDF
              </button>
              <button
                type="button"
                onClick={() => exportarCSVDados(dadosOrdenados)}
                disabled={dadosOrdenados.length === 0}
                className="flex items-center rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
              >
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Exportar CSV
              </button>
            </div>
          </div>
          {mostrarFiltros && renderFiltros()}
          {!mostrarFiltros && renderFiltrosTags()}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <input
            type="text"
            value={buscaDados}
            onChange={(e) => setBuscaDados(e.target.value)}
            placeholder="Buscar credor, centro de custo, titulo..."
            className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-red-500 focus:outline-none"
          />
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {([
              { key: 'todos' as const, label: 'Todos' },
              { key: '1-7' as const, label: '1-7d' },
              { key: '8-15' as const, label: '8-15d' },
              { key: '16-30' as const, label: '16-30d' },
              { key: '31-60' as const, label: '31-60d' },
              { key: '61-90' as const, label: '61-90d' },
              { key: '+90' as const, label: '+90d' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFiltroFaixaDados(key)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  filtroFaixaDados === key
                    ? 'bg-red-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                } ${key !== 'todos' ? 'border-l border-gray-300' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {dadosOrdenados.length === 0 ? (
          <div className="rounded-lg bg-green-50 p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-4 text-lg font-semibold text-green-800">Nenhuma conta encontrada!</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow">
            <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-red-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 w-12">#</th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-white border border-red-600 cursor-pointer select-none" onClick={() => toggleSortDados('credor')}>Credor{sortIconDados('credor')}</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 cursor-pointer select-none" onClick={() => toggleSortDados('data_vencimento')}>Vencimento{sortIconDados('data_vencimento')}</th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-white border border-red-600 cursor-pointer select-none" onClick={() => toggleSortDados('lancamento')}>Titulo{sortIconDados('lancamento')}</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 cursor-pointer select-none" onClick={() => toggleSortDados('dias_atraso')}>Dias Atraso{sortIconDados('dias_atraso')}</th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-white border border-red-600 cursor-pointer select-none" onClick={() => toggleSortDados('nome_centrocusto')}>Centro de Custo{sortIconDados('nome_centrocusto')}</th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-white border border-red-600 cursor-pointer select-none" onClick={() => toggleSortDados('nome_plano_financeiro')}>Plano Financeiro{sortIconDados('nome_plano_financeiro')}</th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-white border border-red-600 cursor-pointer select-none" onClick={() => toggleSortDados('nome_tipo_pagamento')}>Tipo Pag.{sortIconDados('nome_tipo_pagamento')}</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-white border border-red-600 cursor-pointer select-none" onClick={() => toggleSortDados('flautorizacao')}>Aut.{sortIconDados('flautorizacao')}</th>
                    <th className="px-3 py-3 text-right text-xs font-bold text-white border border-red-600 cursor-pointer select-none" onClick={() => toggleSortDados('valor_total')}>Valor{sortIconDados('valor_total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {dadosOrdenados.map((c, index) => {
                    const diasAtraso = calcularDiasAtraso(c.data_vencimento as any);
                    return (
                      <tr key={index} className={`hover:bg-red-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="px-3 py-2 text-center text-xs text-gray-500">{index + 1}</td>
                        <td className="px-3 py-2 text-sm font-medium text-gray-900 max-w-xs truncate" title={c.credor || '-'}>{c.credor || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs text-gray-700 font-mono">{formatDate(c.data_vencimento)}</td>
                        <td className="px-3 py-2 text-xs text-gray-700">{c.lancamento ? String(c.lancamento).split('/')[0] : '-'}</td>
                        <td className="px-3 py-2 text-center text-xs font-mono">
                          <span className={`font-semibold px-2 py-0.5 rounded ${diasAtraso > 90 ? 'bg-red-100 text-red-700' : diasAtraso > 30 ? 'bg-orange-100 text-orange-700' : diasAtraso > 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                            {diasAtraso}d
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700 max-w-[200px] truncate" title={c.nome_centrocusto || '-'}>{c.nome_centrocusto || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-700 max-w-[200px] truncate" title={c.nome_plano_financeiro || '-'}>{c.nome_plano_financeiro || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-700 max-w-[150px] truncate" title={(c as any).nome_tipo_pagamento || '-'}>{(c as any).nome_tipo_pagamento || '-'}</td>
                        <td className="px-3 py-2 text-center">
                          {(() => {
                            const authApi = c.lancamento ? autorizacoesBulk[c.lancamento] : undefined;
                            const auth = authApi || (c as any).flautorizacao;
                            return auth === 'S'
                              ? <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Sim</span>
                              : <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Não</span>;
                          })()}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-red-700 font-mono">{formatCurrency(c.valor_total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-red-100 sticky bottom-0">
                  <tr className="font-bold">
                    <td className="px-3 py-3 text-sm text-gray-900 border-t-2 border-red-300" colSpan={9}>TOTAL ({dadosOrdenados.length} titulos)</td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-red-800 border-t-2 border-red-300 font-mono">{formatCurrency(totalValor)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderAbaCredor = () => {
    const dados = agruparPorChave('credor');
    return renderTabelaAgrupada(dados, 'Atrasadas por Credor', 'credor(es)', buscaCredor, setBuscaCredor, filtroFaixa, setFiltroFaixa, 'Credor', 'atrasadas_por_credor', 'credor');
  };

  const renderAbaEmpresa = () => {
    const dados = agruparPorChave('nome_empresa');
    return renderTabelaAgrupada(dados, 'Atrasadas por Empresa', 'empresa(s)', buscaEmpresa, setBuscaEmpresa, filtroFaixaEmpresa, setFiltroFaixaEmpresa, 'Empresa', 'atrasadas_por_empresa', 'nome_empresa');
  };

  const renderAbaCentroCusto = () => {
    const dados = agruparPorChave('nome_centrocusto');
    return renderTabelaAgrupada(dados, 'Atrasadas por Centro de Custo', 'centro(s) de custo', buscaCentroCusto, setBuscaCentroCusto, filtroFaixaCC, setFiltroFaixaCC, 'Centro de Custo', 'atrasadas_por_centro_custo', 'nome_centrocusto');
  };

  const renderAbaOrigem = () => {
    const dados = agruparPorChave('id_origem');
    return renderTabelaAgrupada(dados, 'Atrasadas por Origem', 'origem(ns)', buscaOrigem, setBuscaOrigem, filtroFaixaOrigem, setFiltroFaixaOrigem, 'Origem', 'atrasadas_por_origem', 'id_origem');
  };

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

  const handleTabChange = (tab: AbaAtiva) => {
    setExpandido(null);
    setAbaAtiva(tab);
  };

  return (
    <div>
      {estatisticas && contas.length > 0 && (() => {
        const credoresTotal = new Set(contas.map(c => c.credor)).size;
        const contasCriticas = contas.filter(c => calcularDiasAtraso(c.data_vencimento as any) > 30);
        const credoresCriticos = new Set(contasCriticas.map(c => c.credor)).size;
        return (
          <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-gradient-to-br from-red-500 to-red-600 p-5 text-white shadow-lg">
              <div className="mb-1 text-xs font-medium opacity-90">Total em Atraso</div>
              <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_total)}</div>
              <div className="mt-1 text-xs opacity-75">{estatisticas.quantidade_titulos.toLocaleString('pt-BR')} titulos | {credoresTotal} credores</div>
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
                {contasCriticas.length}
              </div>
              <div className="mt-1 text-xs opacity-75">
                {formatCurrency(contasCriticas.reduce((acc, c) => acc + (c.valor_total || 0), 0))} | {credoresCriticos} credores
              </div>
            </div>
          </div>
        );
      })()}

      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              type="button"
              onClick={() => handleTabChange('dados')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'dados'
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
              onClick={() => handleTabChange('credor')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'credor'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Por Credor
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('empresa')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'empresa'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Por Empresa
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('centro-custo')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'centro-custo'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Por Centro de Custo
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('origem')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'origem'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Por Origem
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('analises')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${abaAtiva === 'analises'
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
      {abaAtiva === 'credor' && renderAbaCredor()}
      {abaAtiva === 'empresa' && renderAbaEmpresa()}
      {abaAtiva === 'centro-custo' && renderAbaCentroCusto()}
      {abaAtiva === 'origem' && renderAbaOrigem()}
      {abaAtiva === 'analises' && renderAbaAnalises()}
    </div>
  );
};
