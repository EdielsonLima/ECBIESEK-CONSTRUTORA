import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { ContaPagar, EmpresaOption, CentroCustoOption, TipoDocumentoOption, OrigemDadoOption, TipoBaixaOption, ContaCorrenteOption, OrigemTituloOption } from '../types';
import { SearchableMultiSelect } from '../components/SearchableMultiSelect';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts';
import { criarPDFBase, adicionarFiltrosAtivos, adicionarResumoCards, adicionarTabela, finalizarPDF, gerarNomeArquivo, formatCurrencyPDF, formatDatePDF } from '../utils/pdfExport';

interface Estatisticas {
  quantidade_titulos: number;
  valor_liquido: number;
  valor_baixa: number;
  valor_acrescimo: number;
  valor_desconto: number;
  valor_7d?: number;
  valor_15d?: number;
  valor_30d?: number;
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

interface RankingCredor {
  credor: string;
  valor_pago: number;
  valor_acrescimo: number;
  valor_desconto: number;
  quantidade: number;
  rank: number;
  percentual: number;
  percentual_acumulado: number;
}

interface RankingCredoresData {
  credores: RankingCredor[];
  total_geral: number;
  total_credores: number;
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

interface DadosPorOrigem {
  origem: string;
  valor: number;
  quantidade: number;
}

interface OrigemMeta {
  id: number;
  descricao: string;
  origens: string[];
  meta_percentual: number;
}

interface OrigemMetaStatus {
  id: number;
  descricao: string;
  origens: string[];
  meta_percentual: number;
  percentual_atingido: number;
  valor_origens: number;
  valor_total: number;
  meta_atingida: boolean;
}

interface FornecedorAgrupado {
  credor: string;
  titulos_7d: number;
  valor_7d: number;
  titulos_15d: number;
  valor_15d: number;
  titulos_30d: number;
  valor_30d: number;
  titulos_total: number;
  valor_total: number;
}

interface DadosPorFornecedor {
  ref_date: string | null;
  fornecedores: FornecedorAgrupado[];
  total_fornecedores: number;
}

interface CentroCustoAgrupado {
  codigo_cc: number;
  nome_centrocusto: string;
  valor_7d: number;
  valor_15d: number;
  valor_30d: number;
  valor_total: number;
}

interface DadosPorCentroCusto {
  ref_date: string | null;
  centros_custo: CentroCustoAgrupado[];
  total_centros: number;
}

interface OrigemAgrupada {
  origem: string;
  valor_7d: number;
  valor_15d: number;
  valor_30d: number;
  valor_total: number;
}

interface DadosPorOrigemTab {
  ref_date: string | null;
  origens: OrigemAgrupada[];
  total_origens: number;
}

type AbaAtiva = 'dados' | 'fornecedor' | 'centro-custo' | 'origem' | 'analises' | 'configuracoes';

export const ContasPagas: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('fornecedor');
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [dadosFornecedores, setDadosFornecedores] = useState<DadosPorFornecedor | null>(null);
  const [dadosCentroCusto, setDadosCentroCusto] = useState<DadosPorCentroCusto | null>(null);
  const [buscaFornecedor, setBuscaFornecedor] = useState('');
  const [buscaCentroCusto, setBuscaCentroCusto] = useState('');
  const [filtroPeriodo, setFiltroPeriodo] = useState<'todos' | '7d' | '15d' | '30d'>('todos');
  const [filtroPeriodoCC, setFiltroPeriodoCC] = useState<'todos' | '7d' | '15d' | '30d'>('todos');
  const [dadosOrigemTab, setDadosOrigemTab] = useState<DadosPorOrigemTab | null>(null);
  const [buscaOrigem, setBuscaOrigem] = useState('');
  const [filtroPeriodoOrigem, setFiltroPeriodoOrigem] = useState<'todos' | '7d' | '15d' | '30d'>('todos');
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [dadosPorMes, setDadosPorMes] = useState<DadosPorMes[]>([]);
  const [dadosPorEmpresa, setDadosPorEmpresa] = useState<DadosPorEmpresa[]>([]);
  const [dadosPorOrigem, setDadosPorOrigem] = useState<DadosPorOrigem[]>([]);
  const [rankingCredores, setRankingCredores] = useState<RankingCredoresData | null>(null);
  const [comparacaoAnual, setComparacaoAnual] = useState<ComparacaoAnual[]>([]);
  const [comparacaoMensal, setComparacaoMensal] = useState<ComparacaoMensal[]>([]);
  const [origemMetas, setOrigemMetas] = useState<OrigemMeta[]>([]);
  const [origemMetasStatus, setOrigemMetasStatus] = useState<OrigemMetaStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados para criar/editar meta
  const [mostrarFormMeta, setMostrarFormMeta] = useState(false);
  const [editandoMeta, setEditandoMeta] = useState<OrigemMeta | null>(null);
  const [novaMetaDescricao, setNovaMetaDescricao] = useState('');
  const [novaMetaOrigens, setNovaMetaOrigens] = useState('');
  const [novaMetaPercentual, setNovaMetaPercentual] = useState('');

  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [credores, setCredores] = useState<string[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumentoOption[]>([]);
  const [origensDado, setOrigensDado] = useState<OrigemDadoOption[]>([]);
  const [tiposBaixa, setTiposBaixa] = useState<TipoBaixaOption[]>([]);
  const [contasCorrentes, setContasCorrentes] = useState<ContaCorrenteOption[]>([]);
  const [origensTitulo, setOrigensTitulo] = useState<OrigemTituloOption[]>([]);

  const [empresasPadrao, setEmpresasPadrao] = useState<number[]>([]);
  const [centrosCustoPadrao, setCentrosCustoPadrao] = useState<number[]>([]);
  const [empresasExpandidas, setEmpresasExpandidas] = useState<number[]>([]);

  const [filtroEmpresa, setFiltroEmpresa] = useState<number[]>([]);
  const [filtroCentroCusto, setFiltroCentroCusto] = useState<number[]>([]);
  const [filtroCredor, setFiltroCredor] = useState<string[]>([]);
  const [filtroIdDocumento, setFiltroIdDocumento] = useState<string[]>([]);
  const [filtroOrigemDado, setFiltroOrigemDado] = useState<string[]>([]);
  const [filtroTipoBaixa, setFiltroTipoBaixa] = useState<number[]>([]);
  const [filtroTipoPagamento, setFiltroTipoPagamento] = useState<number[]>([]);
  const [tiposPagamento, setTiposPagamento] = useState<Array<{ id: number; nome: string }>>([]);
  const [filtroPlanoFinanceiro, setFiltroPlanoFinanceiro] = useState<string[]>([]);
  const [planosFinanceiros, setPlanosFinanceiros] = useState<Array<{ id: string; nome: string }>>([]);
  const [filtroContaCorrente, setFiltroContaCorrente] = useState<string[]>([]);
  const [filtroOrigemTitulo, setFiltroOrigemTitulo] = useState<string[]>([]);
  const [filtroAno, setFiltroAno] = useState<number[]>([]);
  const [filtroMes, setFiltroMes] = useState<number[]>([]);
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('');
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');

  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [mostrarDropdownAnos, setMostrarDropdownAnos] = useState(false);
  const [mostrarDropdownMeses, setMostrarDropdownMeses] = useState(false);
  const [ordenacao, setOrdenacao] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'data_pagamento', direcao: 'desc' });
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const itensPorPagina = 100;

  const ordenarContas = (contasParaOrdenar: ContaPagar[]) => {
    return [...contasParaOrdenar].sort((a, b) => {
      let valorA: any;
      let valorB: any;
      
      switch (ordenacao.campo) {
        case 'credor':
          valorA = (a.credor || '').toLowerCase();
          valorB = (b.credor || '').toLowerCase();
          break;
        case 'data_pagamento':
          valorA = (a.data_pagamento || '').split('T')[0];
          valorB = (b.data_pagamento || '').split('T')[0];
          break;
        case 'valor_total':
          valorA = a.valor_total || 0;
          valorB = b.valor_total || 0;
          break;
        case 'lancamento':
          valorA = (a.lancamento || '').toLowerCase();
          valorB = (b.lancamento || '').toLowerCase();
          break;
        case 'nome_centrocusto':
          valorA = (a.nome_centrocusto || '').toLowerCase();
          valorB = (b.nome_centrocusto || '').toLowerCase();
          break;
        case 'data_vencimento':
          valorA = (a.data_vencimento || '').split('T')[0];
          valorB = (b.data_vencimento || '').split('T')[0];
          break;
        case 'nome_plano_financeiro':
          valorA = ((a as any).nome_plano_financeiro || '').toLowerCase();
          valorB = ((b as any).nome_plano_financeiro || '').toLowerCase();
          break;
        case 'dias_atraso':
          valorA = (a as any).dias_atraso || 0;
          valorB = (b as any).dias_atraso || 0;
          break;
        case 'valor_acrescimo':
          valorA = (a as any).valor_acrescimo || 0;
          valorB = (b as any).valor_acrescimo || 0;
          break;
        case 'valor_desconto':
          valorA = (a as any).valor_desconto || 0;
          valorB = (b as any).valor_desconto || 0;
          break;
        case 'valor_juros':
          valorA = (a as any).valor_juros || 0;
          valorB = (b as any).valor_juros || 0;
          break;
        case 'valor_baixa':
          valorA = (a as any).valor_baixa || 0;
          valorB = (b as any).valor_baixa || 0;
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
    }
    if (value >= 1000) {
      return `R$ ${(value / 1000).toFixed(0)}K`;
    }
    return `R$ ${value.toFixed(0)}`;
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    const parts = dateString.split('T')[0].split('-');
    if (parts.length !== 3) return '-';
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
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
        const [empData, ccData, credData, tiposDocData, origensData, tiposBaixaData, contasCorrentesData, origensTituloData, tiposPagData, planosFinData] = await Promise.all([
          apiService.getEmpresas(),
          apiService.getCentrosCusto(),
          apiService.getCredores(),
          apiService.getTiposDocumento(),
          apiService.getOrigensDado(),
          apiService.getTiposBaixa(),
          apiService.getContasCorrente(),
          apiService.getOrigensTitulo(),
          apiService.getTiposPagamento().catch(() => []),
          apiService.getPlanosFinanceiros().catch(() => []),
        ]);
        setEmpresas(empData);
        setCentrosCusto(ccData);
        setCredores(credData);
        setTiposDocumento(tiposDocData);
        setOrigensDado(origensData);
        setTiposBaixa(tiposBaixaData);
        setContasCorrentes(contasCorrentesData);
        setOrigensTitulo(origensTituloData);
        setTiposPagamento(tiposPagData);
        setPlanosFinanceiros(planosFinData);
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
        empresa: filtroEmpresa.length > 0 ? filtroEmpresa.join(',') : undefined,
        centro_custo: filtroCentroCusto.length > 0 ? filtroCentroCusto.join(',') : undefined,
        credor: filtroCredor.length > 0 ? filtroCredor.join(',') : undefined,
        id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
        origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
        tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
        tipo_pagamento: filtroTipoPagamento.length > 0 ? filtroTipoPagamento.join(',') : undefined,
        conta_corrente: filtroContaCorrente.length > 0 ? filtroContaCorrente.join(',') : undefined,
        origem_titulo: filtroOrigemTitulo.length > 0 ? filtroOrigemTitulo.join(',') : undefined,
        plano_financeiro: filtroPlanoFinanceiro.length > 0 ? filtroPlanoFinanceiro.join(',') : undefined,
        ano: filtroAno.length > 0 ? filtroAno.join(',') : undefined,
        mes: filtroMes.length > 0 ? filtroMes.join(',') : undefined,
        data_inicio: filtroDataInicio || undefined,
        data_fim: filtroDataFim || undefined,
        limite: itensPorPagina,
        offset: 0,
      };

      const [contasResp, estatData, fornecedoresData, centroCustoData, origemTabData, mesData, empresaData, origemData, compAnualData, compMensalData, rankingData] = await Promise.all([
        apiService.getContasPagasFiltradas(filtros),
        apiService.getEstatisticasContasPagas(filtros),
        apiService.getContasPagasPorFornecedor(filtros),
        apiService.getContasPagasPorCentroCusto(filtros),
        apiService.getContasPagasPorOrigem(filtros),
        apiService.getEstatisticasPorMes({
          empresa: filtroEmpresa.length > 0 ? filtroEmpresa.join(',') : undefined,
          centro_custo: filtroCentroCusto.length > 0 ? filtroCentroCusto.join(',') : undefined,
          credor: filtroCredor.length > 0 ? filtroCredor.join(',') : undefined,
          id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
          origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
          tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
          ano: filtroAno.length > 0 ? filtroAno.join(',') : undefined,
        }),
        apiService.getEstatisticasPorEmpresa({
          centro_custo: filtroCentroCusto.length > 0 ? filtroCentroCusto.join(',') : undefined,
          credor: filtroCredor.length > 0 ? filtroCredor.join(',') : undefined,
          id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
          origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
          tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
          ano: filtroAno.length > 0 ? filtroAno.join(',') : undefined,
          mes: filtroMes.length > 0 ? filtroMes.join(',') : undefined,
          data_inicio: filtroDataInicio || undefined,
          data_fim: filtroDataFim || undefined,
        }),
        apiService.getEstatisticasPorOrigem({
          empresa: filtroEmpresa.length > 0 ? filtroEmpresa.join(',') : undefined,
          centro_custo: filtroCentroCusto.length > 0 ? filtroCentroCusto.join(',') : undefined,
          credor: filtroCredor.length > 0 ? filtroCredor.join(',') : undefined,
          id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
          origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
          tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
          ano: filtroAno.length > 0 ? filtroAno.join(',') : undefined,
          mes: filtroMes.length > 0 ? filtroMes.join(',') : undefined,
          data_inicio: filtroDataInicio || undefined,
          data_fim: filtroDataFim || undefined,
        }),
        apiService.getComparacaoAnual({
          empresa: filtroEmpresa.length > 0 ? filtroEmpresa.join(',') : undefined,
          centro_custo: filtroCentroCusto.length > 0 ? filtroCentroCusto.join(',') : undefined,
          credor: filtroCredor.length > 0 ? filtroCredor.join(',') : undefined,
          id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
          origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
          tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
        }),
        apiService.getComparacaoMensal({
          empresa: filtroEmpresa.length > 0 ? filtroEmpresa.join(',') : undefined,
          centro_custo: filtroCentroCusto.length > 0 ? filtroCentroCusto.join(',') : undefined,
          credor: filtroCredor.length > 0 ? filtroCredor.join(',') : undefined,
          id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
          origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
          tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
        }),
        apiService.getRankingCredores({
          empresa: filtroEmpresa.length > 0 ? filtroEmpresa.join(',') : undefined,
          centro_custo: filtroCentroCusto.length > 0 ? filtroCentroCusto.join(',') : undefined,
          id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
          origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
          tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
          ano: filtroAno.length > 0 ? filtroAno.join(',') : undefined,
          mes: filtroMes.length > 0 ? filtroMes.join(',') : undefined,
          data_inicio: filtroDataInicio || undefined,
          data_fim: filtroDataFim || undefined,
        }),
      ]);

      setContas(contasResp.data);
      setTotalRegistros(contasResp.total);
      setPaginaAtual(1);
      setEstatisticas(estatData);
      setDadosFornecedores(fornecedoresData);
      setDadosCentroCusto(centroCustoData);
      setDadosOrigemTab(origemTabData);
      setDadosPorMes(mesData);
      setDadosPorEmpresa(empresaData);
      setDadosPorOrigem(origemData);
      setComparacaoAnual(compAnualData);
      setComparacaoMensal(compMensalData);
      setRankingCredores(rankingData);

      // Carregar status das metas
      const statusMetas = await apiService.getOrigemMetasStatus({
        empresa: filtroEmpresa.length > 0 ? filtroEmpresa.join(',') : undefined,
        centro_custo: filtroCentroCusto.length > 0 ? filtroCentroCusto.join(',') : undefined,
        ano: filtroAno.length > 0 ? filtroAno.join(',') : undefined,
        mes: filtroMes.length > 0 ? filtroMes.join(',') : undefined,
        data_inicio: filtroDataInicio || undefined,
        data_fim: filtroDataFim || undefined,
      });
      setOrigemMetasStatus(statusMetas);
    } catch (err) {
      setError('Erro ao carregar contas pagas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const carregarPagina = async (pagina: number) => {
    try {
      const filtros = {
        empresa: filtroEmpresa.length > 0 ? filtroEmpresa.join(',') : undefined,
        centro_custo: filtroCentroCusto.length > 0 ? filtroCentroCusto.join(',') : undefined,
        credor: filtroCredor.length > 0 ? filtroCredor.join(',') : undefined,
        id_documento: filtroIdDocumento.length > 0 ? filtroIdDocumento.join(',') : undefined,
        origem_dado: filtroOrigemDado.length > 0 ? filtroOrigemDado.join(',') : undefined,
        tipo_baixa: filtroTipoBaixa.length > 0 ? filtroTipoBaixa.join(',') : undefined,
        tipo_pagamento: filtroTipoPagamento.length > 0 ? filtroTipoPagamento.join(',') : undefined,
        conta_corrente: filtroContaCorrente.length > 0 ? filtroContaCorrente.join(',') : undefined,
        origem_titulo: filtroOrigemTitulo.length > 0 ? filtroOrigemTitulo.join(',') : undefined,
        plano_financeiro: filtroPlanoFinanceiro.length > 0 ? filtroPlanoFinanceiro.join(',') : undefined,
        ano: filtroAno.length > 0 ? filtroAno.join(',') : undefined,
        mes: filtroMes.length > 0 ? filtroMes.join(',') : undefined,
        data_inicio: filtroDataInicio || undefined,
        data_fim: filtroDataFim || undefined,
        limite: itensPorPagina,
        offset: (pagina - 1) * itensPorPagina,
      };
      const resp = await apiService.getContasPagasFiltradas(filtros);
      setContas(resp.data);
      setTotalRegistros(resp.total);
      setPaginaAtual(pagina);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Erro ao carregar pagina:', err);
    }
  };

  const carregarMetas = async () => {
    try {
      const metas = await apiService.getOrigemMetas();
      setOrigemMetas(metas);
    } catch (err) {
      console.error('Erro ao carregar metas:', err);
    }
  };

  useEffect(() => {
    carregarMetas();
  }, []);

  useEffect(() => {
    buscarContas();
  }, [filtroEmpresa, filtroCentroCusto, filtroCredor, filtroIdDocumento, filtroOrigemDado, filtroTipoBaixa, filtroTipoPagamento, filtroPlanoFinanceiro, filtroAno, filtroMes]);

  const salvarMeta = async () => {
    try {
      const origens = novaMetaOrigens.split(',').map(o => o.trim().toUpperCase()).filter(o => o);
      const percentual = parseFloat(novaMetaPercentual);
      
      if (!novaMetaDescricao || origens.length === 0 || isNaN(percentual)) {
        alert('Preencha todos os campos corretamente');
        return;
      }

      if (editandoMeta) {
        await apiService.updateOrigemMeta(editandoMeta.id, {
          descricao: novaMetaDescricao,
          origens: origens,
          meta_percentual: percentual,
        });
      } else {
        await apiService.createOrigemMeta({
          descricao: novaMetaDescricao,
          origens: origens,
          meta_percentual: percentual,
        });
      }
      
      setMostrarFormMeta(false);
      setEditandoMeta(null);
      setNovaMetaDescricao('');
      setNovaMetaOrigens('');
      setNovaMetaPercentual('');
      await carregarMetas();
      await buscarContas();
    } catch (err) {
      console.error('Erro ao salvar meta:', err);
      alert('Erro ao salvar meta');
    }
  };

  const excluirMeta = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta meta?')) return;
    try {
      await apiService.deleteOrigemMeta(id);
      await carregarMetas();
      await buscarContas();
    } catch (err) {
      console.error('Erro ao excluir meta:', err);
      alert('Erro ao excluir meta');
    }
  };

  const editarMeta = (meta: OrigemMeta) => {
    setEditandoMeta(meta);
    setNovaMetaDescricao(meta.descricao);
    setNovaMetaOrigens(meta.origens.join(', '));
    setNovaMetaPercentual(meta.meta_percentual.toString());
    setMostrarFormMeta(true);
  };

  const limparFiltros = () => {
    setFiltroEmpresa([]);
    setFiltroCentroCusto([]);
    setFiltroCredor([]);
    setFiltroIdDocumento([]);
    setFiltroOrigemDado([]);
    setFiltroTipoBaixa([]);
    setFiltroTipoPagamento([]);
    setFiltroPlanoFinanceiro([]);
    setFiltroContaCorrente([]);
    setFiltroOrigemTitulo([]);
    setFiltroAno([]);
    setFiltroMes([]);
    setFiltroDataInicio('');
    setFiltroDataFim('');
  };

  const exportarCSV = () => {
    if (!dadosFornecedores || dadosFornecedores.fornecedores.length === 0) return;

    const headers = ['#', 'Fornecedor', '7d Qtd Títulos', '7d Valor', '15d Qtd Títulos', '15d Valor', '30d Qtd Títulos', '30d Valor', 'Total Valor'];
    const rows = dadosFornecedores.fornecedores.map((f, idx) => [
      (idx + 1).toString(),
      f.credor,
      f.titulos_7d.toString(),
      f.valor_7d.toFixed(2).replace('.', ','),
      f.titulos_15d.toString(),
      f.valor_15d.toFixed(2).replace('.', ','),
      f.titulos_30d.toString(),
      f.valor_30d.toFixed(2).replace('.', ','),
      f.valor_total.toFixed(2).replace('.', ','),
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `contas_pagas_fornecedor_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportarCSVDados = () => {
    if (contas.length === 0) return;
    const contasOrdenadas = ordenarContas(contas);
    const headers = ['Credor', 'Vencimento', 'Titulo', 'Pagamento', 'Atraso', 'Centro de Custo', 'Plano Financeiro', 'Valor Original', 'Juros', 'Acrescimos', 'Descontos', 'Valor Pago'];
    const rows = contasOrdenadas.map(c => {
      const d = (c as any).dias_atraso;
      const atraso = d == null ? '-' : d > 0 ? `${d}d` : d === 0 ? 'No prazo' : `${Math.abs(d)}d antecip.`;
      return [
        c.credor || '-',
        formatDate(c.data_vencimento),
        c.lancamento ? c.lancamento.split('/')[0] : '-',
        formatDate(c.data_pagamento),
        atraso,
        c.nome_centrocusto || '-',
        (c as any).nome_plano_financeiro || '-',
        ((c as any).valor_baixa || 0).toFixed(2).replace('.', ','),
        ((c as any).valor_juros || 0).toFixed(2).replace('.', ','),
        ((c as any).valor_acrescimo || 0).toFixed(2).replace('.', ','),
        ((c as any).valor_desconto || 0).toFixed(2).replace('.', ','),
        (c.valor_total || 0).toFixed(2).replace('.', ','),
      ];
    });
    const csvContent = [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `contas_pagas_dados_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportarPDF = () => {
    const abaLabels: Record<AbaAtiva, string> = {
      'dados': 'Dados',
      'fornecedor': 'Por Fornecedor',
      'centro-custo': 'Por Centro de Custo',
      'origem': 'Por Origem',
      'analises': 'Análises',
      'configuracoes': 'Configurações',
    };
    const abaLabel = abaLabels[abaAtiva];
    const { doc, pageWidth, margin, y: startY, dataGeracao } = criarPDFBase('Contas Pagas', `Aba: ${abaLabel}`);

    // Filtros ativos
    const filtros: { label: string; valor: string }[] = [];
    if (filtroEmpresa.length > 0) {
      const empresa = empresas.find(e => e.id === filtroEmpresa[0]);
      if (empresa) filtros.push({ label: 'Empresa', valor: filtroEmpresa.length === 1 ? empresa.nome : `${filtroEmpresa.length} empresa(s)` });
    }
    if (filtroCentroCusto.length > 0) {
      const cc = centrosCusto.find(c => c.id === filtroCentroCusto[0]);
      if (cc) filtros.push({ label: 'Centro Custo', valor: filtroCentroCusto.length === 1 ? cc.nome : `${filtroCentroCusto.length} centro(s)` });
    }
    if (filtroCredor.length > 0) filtros.push({ label: 'Credor', valor: filtroCredor.length === 1 ? filtroCredor[0] : `${filtroCredor.length} credor(es)` });
    if (filtroIdDocumento.length > 0) filtros.push({ label: 'Docs', valor: `${filtroIdDocumento.length} selecionado(s)` });
    if (filtroOrigemDado.length > 0) filtros.push({ label: 'Origens', valor: `${filtroOrigemDado.length} selecionada(s)` });
    if (filtroTipoBaixa.length > 0) filtros.push({ label: 'Tipos Baixa', valor: `${filtroTipoBaixa.length} selecionado(s)` });
    if (filtroAno.length > 0) filtros.push({ label: 'Anos', valor: filtroAno.join(', ') });
    if (filtroMes.length > 0) {
      const mesesNomes = filtroMes.map(m => meses.find(mes => mes.valor === m)?.nome).filter(Boolean);
      filtros.push({ label: 'Meses', valor: mesesNomes.join(', ') });
    }
    if (filtroDataInicio) filtros.push({ label: 'Data Início', valor: filtroDataInicio });
    if (filtroDataFim) filtros.push({ label: 'Data Fim', valor: filtroDataFim });

    let y = adicionarFiltrosAtivos(doc, filtros, startY, pageWidth, margin);

    // Cards de resumo
    if (estatisticas) {
      const cards = [
        { label: 'Líquido Total', valor: estatisticas.valor_liquido, cor: [34, 197, 94] as [number, number, number] },
        { label: 'Últimos 7 dias', valor: estatisticas.valor_7d ?? 0, cor: [14, 165, 233] as [number, number, number] },
        { label: 'Últimos 15 dias', valor: estatisticas.valor_15d ?? 0, cor: [59, 130, 246] as [number, number, number] },
        { label: 'Últimos 30 dias', valor: estatisticas.valor_30d ?? 0, cor: [99, 102, 241] as [number, number, number] },
        { label: 'Acréscimos', valor: estatisticas.valor_acrescimo, cor: [249, 115, 22] as [number, number, number] },
        { label: 'Descontos', valor: estatisticas.valor_desconto, cor: [168, 85, 247] as [number, number, number] },
      ];
      y = adicionarResumoCards(doc, cards, y, pageWidth, margin);
    }

    if (abaAtiva === 'fornecedor') {
      const fornecedores = dadosFornecedores?.fornecedores || [];
      const fornecedoresPorPeriodo = filtroPeriodo === 'todos'
        ? fornecedores
        : fornecedores.filter(f => {
            if (filtroPeriodo === '7d') return f.valor_7d > 0;
            if (filtroPeriodo === '15d') return f.valor_15d > 0;
            return f.valor_30d > 0;
          });
      const dados = buscaFornecedor
        ? fornecedoresPorPeriodo.filter(f => f.credor.toLowerCase().includes(buscaFornecedor.toLowerCase()))
        : fornecedoresPorPeriodo;

      const totalGeral = dados.reduce((s, f) => s + f.valor_total, 0);
      let acumulado = 0;
      const body = dados.map((f, i) => {
        const pct = totalGeral > 0 ? (f.valor_total / totalGeral) * 100 : 0;
        acumulado += pct;
        return [
          (i + 1).toString(),
          f.credor,
          f.titulos_total.toString(),
          formatCurrencyPDF(f.valor_total),
          pct.toFixed(2) + '%',
          acumulado.toFixed(2) + '%',
        ];
      });

      y = adicionarTabela(doc, {
        head: [['#', 'Fornecedor', 'Qtd', 'Valor Total', '%', '% Acumulado']],
        body,
        foot: [['', 'TOTAL', dados.reduce((s, f) => s + f.titulos_total, 0).toString(), formatCurrencyPDF(totalGeral), '100%', '']],
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          2: { halign: 'center', cellWidth: 15 },
          3: { halign: 'right', cellWidth: 35 },
          4: { halign: 'right', cellWidth: 20 },
          5: { halign: 'right', cellWidth: 25 },
        },
      }, y, margin);
    } else if (abaAtiva === 'centro-custo') {
      const centros = dadosCentroCusto?.centros_custo || [];
      const centrosPorPeriodo = filtroPeriodoCC === 'todos'
        ? centros
        : centros.filter(cc => {
            if (filtroPeriodoCC === '7d') return cc.valor_7d > 0;
            if (filtroPeriodoCC === '15d') return cc.valor_15d > 0;
            return cc.valor_30d > 0;
          });
      const dados = buscaCentroCusto
        ? centrosPorPeriodo.filter(cc => cc.nome_centrocusto.toLowerCase().includes(buscaCentroCusto.toLowerCase()))
        : centrosPorPeriodo;

      const totalGeral = dados.reduce((s, cc) => s + cc.valor_total, 0);
      let acumulado = 0;
      const body = dados.map((cc, i) => {
        const pct = totalGeral > 0 ? (cc.valor_total / totalGeral) * 100 : 0;
        acumulado += pct;
        return [
          (i + 1).toString(),
          cc.nome_centrocusto,
          formatCurrencyPDF(cc.valor_7d),
          formatCurrencyPDF(cc.valor_15d),
          formatCurrencyPDF(cc.valor_30d),
          formatCurrencyPDF(cc.valor_total),
          pct.toFixed(2) + '%',
          acumulado.toFixed(2) + '%',
        ];
      });

      y = adicionarTabela(doc, {
        head: [['#', 'Centro de Custo', '7 Dias', '15 Dias', '30 Dias', 'Total', '%', '% Acumulado']],
        body,
        foot: [['', 'TOTAL', formatCurrencyPDF(dados.reduce((s, cc) => s + cc.valor_7d, 0)), formatCurrencyPDF(dados.reduce((s, cc) => s + cc.valor_15d, 0)), formatCurrencyPDF(dados.reduce((s, cc) => s + cc.valor_30d, 0)), formatCurrencyPDF(totalGeral), '100%', '']],
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          2: { halign: 'right', cellWidth: 25 },
          3: { halign: 'right', cellWidth: 25 },
          4: { halign: 'right', cellWidth: 25 },
          5: { halign: 'right', cellWidth: 30 },
          6: { halign: 'right', cellWidth: 18 },
          7: { halign: 'right', cellWidth: 25 },
        },
      }, y, margin);
    } else if (abaAtiva === 'origem') {
      const origens = dadosOrigemTab?.origens || [];
      const origensPorPeriodo = filtroPeriodoOrigem === 'todos'
        ? origens
        : origens.filter(o => {
            if (filtroPeriodoOrigem === '7d') return o.valor_7d > 0;
            if (filtroPeriodoOrigem === '15d') return o.valor_15d > 0;
            return o.valor_30d > 0;
          });
      const dados = buscaOrigem
        ? origensPorPeriodo.filter(o => o.origem.toLowerCase().includes(buscaOrigem.toLowerCase()))
        : origensPorPeriodo;

      const totalGeral = dados.reduce((s, o) => s + o.valor_total, 0);
      let acumulado = 0;
      const body = dados.map((o, i) => {
        const pct = totalGeral > 0 ? (o.valor_total / totalGeral) * 100 : 0;
        acumulado += pct;
        return [
          (i + 1).toString(),
          o.origem,
          formatCurrencyPDF(o.valor_7d),
          formatCurrencyPDF(o.valor_15d),
          formatCurrencyPDF(o.valor_30d),
          formatCurrencyPDF(o.valor_total),
          pct.toFixed(2) + '%',
          acumulado.toFixed(2) + '%',
        ];
      });

      y = adicionarTabela(doc, {
        head: [['#', 'Origem', '7 Dias', '15 Dias', '30 Dias', 'Total', '%', '% Acumulado']],
        body,
        foot: [['', 'TOTAL', formatCurrencyPDF(dados.reduce((s, o) => s + o.valor_7d, 0)), formatCurrencyPDF(dados.reduce((s, o) => s + o.valor_15d, 0)), formatCurrencyPDF(dados.reduce((s, o) => s + o.valor_30d, 0)), formatCurrencyPDF(totalGeral), '100%', '']],
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          2: { halign: 'right', cellWidth: 25 },
          3: { halign: 'right', cellWidth: 25 },
          4: { halign: 'right', cellWidth: 25 },
          5: { halign: 'right', cellWidth: 30 },
          6: { halign: 'right', cellWidth: 18 },
          7: { halign: 'right', cellWidth: 25 },
        },
      }, y, margin);
    } else if (abaAtiva === 'dados') {
      const contasOrdenadas = ordenarContas(contas);
      const body = contasOrdenadas.map(c => [
        c.credor || '-',
        formatDatePDF(c.data_vencimento),
        c.lancamento ? c.lancamento.split('/')[0] : '-',
        formatDatePDF(c.data_pagamento),
        (() => {
          const d = (c as any).dias_atraso;
          return d == null ? '-' : d > 0 ? `${d}d` : d === 0 ? 'No prazo' : `${Math.abs(d)}d antecip.`;
        })(),
        c.nome_centrocusto || '-',
        (c as any).nome_plano_financeiro || '-',
        formatCurrencyPDF((c as any).valor_baixa || 0),
        formatCurrencyPDF(c.valor_total || 0),
      ]);

      y = adicionarTabela(doc, {
        head: [['Credor', 'Vencim.', 'Titulo', 'Pagam.', 'Atraso', 'Centro Custo', 'Plano Fin.', 'Vlr Original', 'Vlr Pago']],
        body,
        foot: [['', '', '', '', '', '', 'SUBTOTAL',
          formatCurrencyPDF(contas.reduce((s, c) => s + ((c as any).valor_baixa || 0), 0)),
          formatCurrencyPDF(contas.reduce((s, c) => s + (c.valor_total || 0), 0)),
        ]],
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 22 },
          2: { halign: 'center', cellWidth: 16 },
          3: { cellWidth: 22 },
          4: { halign: 'center', cellWidth: 22 },
          5: { cellWidth: 40 },
          6: { cellWidth: 40 },
          7: { halign: 'right', cellWidth: 28 },
          8: { halign: 'right', cellWidth: 28 },
        },
      }, y, margin);
    }

    finalizarPDF(doc, gerarNomeArquivo('contas_pagas', abaLabel), dataGeracao);
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
        <SearchableMultiSelect
          options={empresas}
          value={filtroEmpresa}
          onChange={(value) => setFiltroEmpresa(value as number[])}
          label="Empresa"
          emptyText="Todas"
        />

        <SearchableMultiSelect
          options={centrosCusto}
          value={filtroCentroCusto}
          onChange={(value) => setFiltroCentroCusto(value as number[])}
          label="Centro de Custo"
          emptyText="Todos"
        />

        <SearchableMultiSelect
          options={credores.map(credor => ({ id: credor, nome: credor }))}
          value={filtroCredor}
          onChange={(value) => setFiltroCredor(value as string[])}
          label="Credor/Fornecedor"
          emptyText="Todos"
        />

        <SearchableMultiSelect
          options={contasCorrentes}
          value={filtroContaCorrente}
          onChange={(value) => setFiltroContaCorrente(value as string[])}
          label="Conta Corrente"
          emptyText="Todas"
        />

        <SearchableMultiSelect
          options={origensTitulo.map(o => ({ id: o.sigla.trim(), nome: `${o.sigla.trim()} - ${o.descricao}` }))}
          value={filtroOrigemTitulo}
          onChange={(value) => setFiltroOrigemTitulo(value as string[])}
          label="Origem de Documento"
          emptyText="Todas"
        />

        <SearchableMultiSelect
          options={tiposDocumento.map(t => ({ id: t.id, nome: `${t.id} - ${t.nome}` }))}
          value={filtroIdDocumento}
          onChange={(value) => setFiltroIdDocumento(value as string[])}
          label="Tipo Documento"
          emptyText="Todos"
        />

        <SearchableMultiSelect
          options={origensDado.map(o => ({ id: o.id, nome: o.nome }))}
          value={filtroOrigemDado}
          onChange={(value) => setFiltroOrigemDado(value as string[])}
          label="Origem do Dado"
          emptyText="Todas"
        />

        <SearchableMultiSelect
          options={tiposBaixa.map(t => ({ id: t.id, nome: `Tipo ${t.id} - ${t.nome}` }))}
          value={filtroTipoBaixa}
          onChange={(value) => setFiltroTipoBaixa(value as number[])}
          label="Tipo de Baixa"
          emptyText="Todos"
        />

        <SearchableMultiSelect
          options={tiposPagamento.map(t => ({ id: t.id, nome: `${t.id} - ${t.nome}` }))}
          value={filtroTipoPagamento}
          onChange={(value) => setFiltroTipoPagamento(value as number[])}
          label="Tipo Pagamento"
          emptyText="Todos"
        />

        <SearchableMultiSelect
          options={planosFinanceiros.map(p => ({ id: p.id, nome: p.nome }))}
          value={filtroPlanoFinanceiro}
          onChange={(value) => setFiltroPlanoFinanceiro(value as string[])}
          label="Plano Financeiro"
          emptyText="Todos"
        />

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
            <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-300 bg-white shadow-lg">
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
            <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-300 bg-white shadow-lg">
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
      const empresa = empresas.find(e => filtroEmpresa.includes(e.id as number));
      if (empresa) filtrosAtivos.push(`Empresa: ${filtroEmpresa.length > 1 ? filtroEmpresa.length + ' empresas' : empresa.nome}`);
    }
    if (filtroCentroCusto.length > 0) {
      const cc = centrosCusto.find(c => filtroCentroCusto.includes(c.id as number));
      if (cc) filtrosAtivos.push(`Centro Custo: ${filtroCentroCusto.length > 1 ? filtroCentroCusto.length + ' centros' : cc.nome}`);
    }
    if (filtroCredor.length > 0) filtrosAtivos.push(`Credor: ${filtroCredor.length > 1 ? filtroCredor.length + ' credores' : filtroCredor[0]}`);
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

    const fornecedores = dadosFornecedores?.fornecedores || [];
    const fornecedoresPorPeriodo = filtroPeriodo === 'todos'
      ? fornecedores
      : fornecedores.filter(f => {
          if (filtroPeriodo === '7d') return f.valor_7d > 0;
          if (filtroPeriodo === '15d') return f.valor_15d > 0;
          return f.valor_30d > 0;
        });
    const fornecedoresFiltrados = buscaFornecedor
      ? fornecedoresPorPeriodo.filter(f => f.credor.toLowerCase().includes(buscaFornecedor.toLowerCase()))
      : fornecedoresPorPeriodo;

    // Totais
    const totais = fornecedoresFiltrados.reduce((acc, f) => ({
      titulos_7d: acc.titulos_7d + f.titulos_7d,
      valor_7d: acc.valor_7d + f.valor_7d,
      titulos_15d: acc.titulos_15d + f.titulos_15d,
      valor_15d: acc.valor_15d + f.valor_15d,
      titulos_30d: acc.titulos_30d + f.titulos_30d,
      valor_30d: acc.valor_30d + f.valor_30d,
      titulos_total: acc.titulos_total + f.titulos_total,
      valor_total: acc.valor_total + f.valor_total,
    }), { titulos_7d: 0, valor_7d: 0, titulos_15d: 0, valor_15d: 0, titulos_30d: 0, valor_30d: 0, titulos_total: 0, valor_total: 0 });

    const refDateFormatted = dadosFornecedores?.ref_date
      ? (() => {
          const safe = dadosFornecedores.ref_date!.includes('T') ? dadosFornecedores.ref_date! : dadosFornecedores.ref_date! + 'T12:00:00';
          const d = new Date(safe);
          return isNaN(d.getTime()) ? dadosFornecedores.ref_date : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        })()
      : '-';

    return (
      <>
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Pagamentos por Fornecedor
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Ref.: {refDateFormatted} &middot; {dadosFornecedores?.total_fornecedores || 0} fornecedor(es)
                {(buscaFornecedor || filtroPeriodo !== 'todos') && ` \u00b7 ${fornecedoresFiltrados.length} exibido(s)`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportarPDF}
                disabled={fornecedores.length === 0}
                className="flex items-center rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
              >
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Exportar PDF
              </button>
              <button
                type="button"
                onClick={exportarCSV}
                disabled={fornecedores.length === 0}
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
                onClick={() => {
                  limparFiltros();
                  setTimeout(buscarContas, 100);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Limpar todos
              </button>
            </div>
          )}

          {mostrarFiltros && renderFiltros()}
        </div>

        {/* Busca + filtro de período */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <input
            type="text"
            value={buscaFornecedor}
            onChange={(e) => setBuscaFornecedor(e.target.value)}
            placeholder="Buscar fornecedor..."
            className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {([
              { key: 'todos' as const, label: 'Todos' },
              { key: '7d' as const, label: '7 Dias' },
              { key: '15d' as const, label: '15 Dias' },
              { key: '30d' as const, label: '30 Dias' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFiltroPeriodo(key)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  filtroPeriodo === key
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                } ${key !== 'todos' ? 'border-l border-gray-300' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-green-700 sticky top-0 z-10">
                <tr>
                  <th rowSpan={2} className="px-3 py-2 text-center text-xs font-bold text-white border border-green-600">#</th>
                  <th rowSpan={2} className="px-3 py-2 text-left text-xs font-bold text-white border border-green-600">Fornecedor</th>
                  <th colSpan={2} className="px-3 py-2 text-center text-xs font-bold text-white border border-green-600 bg-green-800">7 Dias</th>
                  <th colSpan={2} className="px-3 py-2 text-center text-xs font-bold text-white border border-green-600 bg-green-800">15 Dias</th>
                  <th colSpan={2} className="px-3 py-2 text-center text-xs font-bold text-white border border-green-600 bg-green-800">30 Dias</th>
                  <th rowSpan={2} className="px-3 py-2 text-center text-xs font-bold text-white border border-green-600">Todo o Período</th>
                </tr>
                <tr>
                  <th className="px-3 py-1 text-center text-xs font-medium text-green-100 border border-green-600 bg-green-600">Qtd</th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-green-100 border border-green-600 bg-green-600">Valor (R$)</th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-green-100 border border-green-600 bg-green-600">Qtd</th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-green-100 border border-green-600 bg-green-600">Valor (R$)</th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-green-100 border border-green-600 bg-green-600">Qtd</th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-green-100 border border-green-600 bg-green-600">Valor (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {fornecedoresFiltrados.map((f, index) => (
                  <tr key={f.credor} className={`hover:bg-green-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2 text-center text-xs text-gray-500 border-r border-gray-100">{index + 1}</td>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900 border-r border-gray-100 max-w-xs truncate" title={f.credor}>{f.credor}</td>
                    <td className="px-3 py-2 text-center text-xs text-gray-600 border-r border-gray-100">{f.titulos_7d || '-'}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700 border-r border-gray-100 font-mono">{f.valor_7d ? formatCurrency(f.valor_7d) : '-'}</td>
                    <td className="px-3 py-2 text-center text-xs text-gray-600 border-r border-gray-100">{f.titulos_15d || '-'}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700 border-r border-gray-100 font-mono">{f.valor_15d ? formatCurrency(f.valor_15d) : '-'}</td>
                    <td className="px-3 py-2 text-center text-xs text-gray-600 border-r border-gray-100">{f.titulos_30d || '-'}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700 border-r border-gray-100 font-mono">{f.valor_30d ? formatCurrency(f.valor_30d) : '-'}</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-green-700 font-mono">{formatCurrency(f.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-green-100 sticky bottom-0">
                <tr className="font-bold">
                  <td className="px-3 py-3 text-sm text-gray-900 border-t-2 border-green-300" colSpan={2}>TOTAL GERAL</td>
                  <td className="px-3 py-3 text-center text-sm text-gray-900 border-t-2 border-green-300">{totais.titulos_7d}</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-900 border-t-2 border-green-300 font-mono">{formatCurrency(totais.valor_7d)}</td>
                  <td className="px-3 py-3 text-center text-sm text-gray-900 border-t-2 border-green-300">{totais.titulos_15d}</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-900 border-t-2 border-green-300 font-mono">{formatCurrency(totais.valor_15d)}</td>
                  <td className="px-3 py-3 text-center text-sm text-gray-900 border-t-2 border-green-300">{totais.titulos_30d}</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-900 border-t-2 border-green-300 font-mono">{formatCurrency(totais.valor_30d)}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-green-800 border-t-2 border-green-300 font-mono">{formatCurrency(totais.valor_total)}</td>
                </tr>
              </tfoot>
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
    if (empresasPadrao.length > 0 && filtroEmpresa.length === 0) {
      setFiltroEmpresa(empresasPadrao);
    }
    if (centrosCustoPadrao.length > 0 && filtroCentroCusto.length === 0) {
      setFiltroCentroCusto(centrosCustoPadrao);
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

      {/* Seção de Metas por Origem */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Metas por Origem</h2>
            <p className="text-sm text-gray-600">
              Defina metas para grupos de origens de pagamento. O sistema calcula automaticamente se a meta foi atingida.
            </p>
          </div>
          <button
            onClick={() => {
              setEditandoMeta(null);
              setNovaMetaDescricao('');
              setNovaMetaOrigens('');
              setNovaMetaPercentual('');
              setMostrarFormMeta(true);
            }}
            className="flex items-center rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nova Meta
          </button>
        </div>

        {/* Formulário para criar/editar meta */}
        {mostrarFormMeta && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="mb-4 font-semibold text-gray-900">
              {editandoMeta ? 'Editar Meta' : 'Nova Meta'}
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Descrição</label>
                <input
                  type="text"
                  value={novaMetaDescricao}
                  onChange={(e) => setNovaMetaDescricao(e.target.value)}
                  placeholder="Ex: Meta AC + CF"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Origens (separadas por vírgula)</label>
                <input
                  type="text"
                  value={novaMetaOrigens}
                  onChange={(e) => setNovaMetaOrigens(e.target.value)}
                  placeholder="Ex: AC, CF"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Meta (%)</label>
                <input
                  type="number"
                  value={novaMetaPercentual}
                  onChange={(e) => setNovaMetaPercentual(e.target.value)}
                  placeholder="Ex: 90"
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={salvarMeta}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Salvar
              </button>
              <button
                onClick={() => {
                  setMostrarFormMeta(false);
                  setEditandoMeta(null);
                }}
                className="rounded-lg bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista de metas existentes */}
        {origemMetas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Descrição</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Origens</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Meta</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {origemMetas.map((meta) => (
                  <tr key={meta.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{meta.descricao}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{meta.origens.join(', ')}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{meta.meta_percentual}%</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <button
                        onClick={() => editarMeta(meta)}
                        className="mr-2 text-blue-600 hover:text-blue-800"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => excluirMeta(meta.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg bg-gray-50 p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="mt-2 text-gray-600">Nenhuma meta definida</p>
            <p className="text-sm text-gray-500">Clique em "Nova Meta" para criar sua primeira meta</p>
          </div>
        )}

        <div className="mt-4 rounded-lg bg-yellow-50 p-4">
          <h4 className="mb-2 flex items-center text-sm font-semibold text-yellow-900">
            <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Como funciona?
          </h4>
          <ul className="space-y-1 text-xs text-yellow-800">
            <li>• Defina uma descrição para identificar a meta</li>
            <li>• Informe as origens que devem ser somadas (separadas por vírgula)</li>
            <li>• Defina o percentual meta que o grupo deve atingir</li>
            <li>• O status é calculado automaticamente na aba "Análises" com base nos filtros selecionados</li>
            <li>• Exemplo: Meta AC + CF com 90% significa que a soma de AC e CF deve representar 90% do total</li>
          </ul>
        </div>
      </div>
    </div>
  );

  const exportarCSVCentroCusto = () => {
    if (!dadosCentroCusto?.centros_custo.length) return;
    const centros = dadosCentroCusto.centros_custo;
    const header = '#;Código CC;Nome Centro de Custo;Total 7 Dias;Total 15 Dias;Total 30 Dias;Todo o Período';
    const rows = centros.map((cc, i) =>
      `${i + 1};${cc.codigo_cc};${cc.nome_centrocusto};${cc.valor_7d.toFixed(2).replace('.', ',')};${cc.valor_15d.toFixed(2).replace('.', ',')};${cc.valor_30d.toFixed(2).replace('.', ',')};${cc.valor_total.toFixed(2).replace('.', ',')}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contas_pagas_centro_custo_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderAbaCentroCusto = () => {
    const centros = dadosCentroCusto?.centros_custo || [];
    const centrosPorPeriodo = filtroPeriodoCC === 'todos'
      ? centros
      : centros.filter(cc => {
          if (filtroPeriodoCC === '7d') return cc.valor_7d > 0;
          if (filtroPeriodoCC === '15d') return cc.valor_15d > 0;
          return cc.valor_30d > 0;
        });
    const centrosFiltrados = buscaCentroCusto
      ? centrosPorPeriodo.filter(cc => cc.nome_centrocusto.toLowerCase().includes(buscaCentroCusto.toLowerCase()))
      : centrosPorPeriodo;

    const totais = centrosFiltrados.reduce((acc, cc) => ({
      valor_7d: acc.valor_7d + cc.valor_7d,
      valor_15d: acc.valor_15d + cc.valor_15d,
      valor_30d: acc.valor_30d + cc.valor_30d,
      valor_total: acc.valor_total + cc.valor_total,
    }), { valor_7d: 0, valor_15d: 0, valor_30d: 0, valor_total: 0 });

    const refDateFormatted = dadosCentroCusto?.ref_date
      ? (() => {
          const safe = dadosCentroCusto.ref_date!.includes('T') ? dadosCentroCusto.ref_date! : dadosCentroCusto.ref_date! + 'T12:00:00';
          const d = new Date(safe);
          return isNaN(d.getTime()) ? dadosCentroCusto.ref_date : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        })()
      : '-';

    const filtrosAtivosCC: string[] = [];
    if (filtroEmpresa.length > 0) {
      const emp = empresas.find(e => filtroEmpresa.includes(e.id as number));
      filtrosAtivosCC.push(`Empresa: ${filtroEmpresa.length > 1 ? filtroEmpresa.length + ' empresas' : (emp?.nome || '')}`);
    }
    if (filtroCentroCusto.length > 0) filtrosAtivosCC.push(`Centro Custo: ${filtroCentroCusto.length} centro(s)`);
    if (filtroCredor.length > 0) filtrosAtivosCC.push(`Credor: ${filtroCredor.length > 1 ? filtroCredor.length + ' credores' : filtroCredor[0]}`);
    if (filtroTipoPagamento.length > 0) filtrosAtivosCC.push(`Tipo Pagamento: ${filtroTipoPagamento.length} tipo(s)`);
    if (filtroPlanoFinanceiro.length > 0) filtrosAtivosCC.push(`Plano Financeiro: ${filtroPlanoFinanceiro.length} plano(s)`);
    if (filtroAno.length > 0) filtrosAtivosCC.push(`Anos: ${filtroAno.join(', ')}`);
    if (filtroMes.length > 0) {
      const mesesNomes = filtroMes.map(m => meses.find(mes => mes.valor === m)?.nome).filter(Boolean);
      filtrosAtivosCC.push(`Meses: ${mesesNomes.join(', ')}`);
    }
    if (filtroDataInicio) filtrosAtivosCC.push(`Data Inicio: ${filtroDataInicio}`);
    if (filtroDataFim) filtrosAtivosCC.push(`Data Fim: ${filtroDataFim}`);

    return (
      <>
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Pagamentos por Centro de Custo
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Ref.: {refDateFormatted} &middot; {dadosCentroCusto?.total_centros || 0} centro(s) de custo
                {(buscaCentroCusto || filtroPeriodoCC !== 'todos') && ` \u00b7 ${centrosFiltrados.length} exibido(s)`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportarPDF}
                disabled={centros.length === 0}
                className="flex items-center rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
              >
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Exportar PDF
              </button>
              <button
                type="button"
                onClick={exportarCSVCentroCusto}
                disabled={centros.length === 0}
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
                {filtrosAtivosCC.length > 0 && (
                  <span className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-600">
                    {filtrosAtivosCC.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {!mostrarFiltros && filtrosAtivosCC.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {filtrosAtivosCC.map((filtro, index) => (
                <span key={index} className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">{filtro}</span>
              ))}
              <button type="button" onClick={() => { limparFiltros(); setTimeout(buscarContas, 100); }} className="text-sm text-gray-500 hover:text-gray-700 underline">Limpar todos</button>
            </div>
          )}

          {mostrarFiltros && renderFiltros()}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <input
            type="text"
            value={buscaCentroCusto}
            onChange={(e) => setBuscaCentroCusto(e.target.value)}
            placeholder="Buscar centro de custo..."
            className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {([
              { key: 'todos' as const, label: 'Todos' },
              { key: '7d' as const, label: '7 Dias' },
              { key: '15d' as const, label: '15 Dias' },
              { key: '30d' as const, label: '30 Dias' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFiltroPeriodoCC(key)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  filtroPeriodoCC === key
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                } ${key !== 'todos' ? 'border-l border-gray-300' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-green-700 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-bold text-white border border-green-600 w-12">#</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-white border border-green-600 w-20">Código CC</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-white border border-green-600">Nome Centro de Custo</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-white border border-green-600 bg-green-800">Total 7 Dias</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-white border border-green-600 bg-green-800">Total 15 Dias</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-white border border-green-600 bg-green-800">Total 30 Dias</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-white border border-green-600">Todo o Período</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {centrosFiltrados.map((cc, index) => (
                  <tr key={cc.codigo_cc || index} className={`hover:bg-green-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2 text-center text-xs text-gray-500 border-r border-gray-100">{index + 1}</td>
                    <td className="px-3 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-100">{cc.codigo_cc}</td>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900 border-r border-gray-100 max-w-sm truncate" title={cc.nome_centrocusto}>{cc.nome_centrocusto}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700 border-r border-gray-100 font-mono">{cc.valor_7d ? formatCurrency(cc.valor_7d) : '-'}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700 border-r border-gray-100 font-mono">{cc.valor_15d ? formatCurrency(cc.valor_15d) : '-'}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700 border-r border-gray-100 font-mono">{cc.valor_30d ? formatCurrency(cc.valor_30d) : '-'}</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-green-700 font-mono">{formatCurrency(cc.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-green-100 sticky bottom-0">
                <tr className="font-bold">
                  <td className="px-3 py-3 text-sm text-gray-900 border-t-2 border-green-300" colSpan={3}>TOTAL GERAL</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-900 border-t-2 border-green-300 font-mono">{formatCurrency(totais.valor_7d)}</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-900 border-t-2 border-green-300 font-mono">{formatCurrency(totais.valor_15d)}</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-900 border-t-2 border-green-300 font-mono">{formatCurrency(totais.valor_30d)}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-green-800 border-t-2 border-green-300 font-mono">{formatCurrency(totais.valor_total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </>
    );
  };

  const exportarCSVOrigem = () => {
    if (!dadosOrigemTab?.origens.length) return;
    const origens = dadosOrigemTab.origens;
    const header = '#;Origem;Total 7 Dias;Total 15 Dias;Total 30 Dias;Todo o Período';
    const rows = origens.map((o, i) =>
      `${i + 1};${o.origem};${o.valor_7d.toFixed(2).replace('.', ',')};${o.valor_15d.toFixed(2).replace('.', ',')};${o.valor_30d.toFixed(2).replace('.', ',')};${o.valor_total.toFixed(2).replace('.', ',')}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contas_pagas_por_origem_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderAbaOrigem = () => {
    const origens = dadosOrigemTab?.origens || [];
    const origensPorPeriodo = filtroPeriodoOrigem === 'todos'
      ? origens
      : origens.filter(o => {
          if (filtroPeriodoOrigem === '7d') return o.valor_7d > 0;
          if (filtroPeriodoOrigem === '15d') return o.valor_15d > 0;
          return o.valor_30d > 0;
        });
    const origensFiltradas = buscaOrigem
      ? origensPorPeriodo.filter(o => o.origem.toLowerCase().includes(buscaOrigem.toLowerCase()))
      : origensPorPeriodo;

    const totais = origensFiltradas.reduce((acc, o) => ({
      valor_7d: acc.valor_7d + o.valor_7d,
      valor_15d: acc.valor_15d + o.valor_15d,
      valor_30d: acc.valor_30d + o.valor_30d,
      valor_total: acc.valor_total + o.valor_total,
    }), { valor_7d: 0, valor_15d: 0, valor_30d: 0, valor_total: 0 });

    const refDateFormatted = dadosOrigemTab?.ref_date
      ? (() => {
          const safe = dadosOrigemTab.ref_date!.includes('T') ? dadosOrigemTab.ref_date! : dadosOrigemTab.ref_date! + 'T12:00:00';
          const d = new Date(safe);
          return isNaN(d.getTime()) ? dadosOrigemTab.ref_date : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        })()
      : '-';

    const filtrosAtivosOrigem: string[] = [];
    if (filtroEmpresa.length > 0) {
      const emp = empresas.find(e => filtroEmpresa.includes(e.id as number));
      filtrosAtivosOrigem.push(`Empresa: ${filtroEmpresa.length > 1 ? filtroEmpresa.length + ' empresas' : (emp?.nome || '')}`);
    }
    if (filtroCentroCusto.length > 0) filtrosAtivosOrigem.push(`Centro Custo: ${filtroCentroCusto.length} centro(s)`);
    if (filtroCredor.length > 0) filtrosAtivosOrigem.push(`Credor: ${filtroCredor.length > 1 ? filtroCredor.length + ' credores' : filtroCredor[0]}`);
    if (filtroTipoPagamento.length > 0) filtrosAtivosOrigem.push(`Tipo Pagamento: ${filtroTipoPagamento.length} tipo(s)`);
    if (filtroPlanoFinanceiro.length > 0) filtrosAtivosOrigem.push(`Plano Financeiro: ${filtroPlanoFinanceiro.length} plano(s)`);
    if (filtroAno.length > 0) filtrosAtivosOrigem.push(`Anos: ${filtroAno.join(', ')}`);
    if (filtroMes.length > 0) {
      const mesesNomes = filtroMes.map(m => meses.find(mes => mes.valor === m)?.nome).filter(Boolean);
      filtrosAtivosOrigem.push(`Meses: ${mesesNomes.join(', ')}`);
    }
    if (filtroDataInicio) filtrosAtivosOrigem.push(`Data Inicio: ${filtroDataInicio}`);
    if (filtroDataFim) filtrosAtivosOrigem.push(`Data Fim: ${filtroDataFim}`);

    return (
      <>
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Pagamentos por Origem
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Ref.: {refDateFormatted} &middot; {dadosOrigemTab?.total_origens || 0} origem(ns)
                {(buscaOrigem || filtroPeriodoOrigem !== 'todos') && ` · ${origensFiltradas.length} exibido(s)`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportarPDF}
                disabled={origens.length === 0}
                className="flex items-center rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
              >
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Exportar PDF
              </button>
              <button
                type="button"
                onClick={exportarCSVOrigem}
                disabled={origens.length === 0}
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
                {filtrosAtivosOrigem.length > 0 && (
                  <span className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-600">
                    {filtrosAtivosOrigem.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {!mostrarFiltros && filtrosAtivosOrigem.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {filtrosAtivosOrigem.map((filtro, index) => (
                <span key={index} className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">{filtro}</span>
              ))}
              <button type="button" onClick={() => { limparFiltros(); setTimeout(buscarContas, 100); }} className="text-sm text-gray-500 hover:text-gray-700 underline">Limpar todos</button>
            </div>
          )}

          {mostrarFiltros && renderFiltros()}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <input
            type="text"
            value={buscaOrigem}
            onChange={(e) => setBuscaOrigem(e.target.value)}
            placeholder="Buscar origem..."
            className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {([
              { key: 'todos' as const, label: 'Todos' },
              { key: '7d' as const, label: '7 Dias' },
              { key: '15d' as const, label: '15 Dias' },
              { key: '30d' as const, label: '30 Dias' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFiltroPeriodoOrigem(key)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  filtroPeriodoOrigem === key
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                } ${key !== 'todos' ? 'border-l border-gray-300' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-green-700 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-bold text-white border border-green-600 w-12">#</th>
                  <th className="px-3 py-3 text-left text-xs font-bold text-white border border-green-600">Origem</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-white border border-green-600 bg-green-800">Total 7 Dias</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-white border border-green-600 bg-green-800">Total 15 Dias</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-white border border-green-600 bg-green-800">Total 30 Dias</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-white border border-green-600">Todo o Período</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {origensFiltradas.map((o, index) => (
                  <tr key={o.origem} className={`hover:bg-green-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2 text-center text-xs text-gray-500 border-r border-gray-100">{index + 1}</td>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900 border-r border-gray-100">{o.origem}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700 border-r border-gray-100 font-mono">{o.valor_7d ? formatCurrency(o.valor_7d) : '-'}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700 border-r border-gray-100 font-mono">{o.valor_15d ? formatCurrency(o.valor_15d) : '-'}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700 border-r border-gray-100 font-mono">{o.valor_30d ? formatCurrency(o.valor_30d) : '-'}</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-green-700 font-mono">{formatCurrency(o.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-green-100 sticky bottom-0">
                <tr className="font-bold">
                  <td className="px-3 py-3 text-sm text-gray-900 border-t-2 border-green-300" colSpan={2}>TOTAL GERAL</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-900 border-t-2 border-green-300 font-mono">{formatCurrency(totais.valor_7d)}</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-900 border-t-2 border-green-300 font-mono">{formatCurrency(totais.valor_15d)}</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-900 border-t-2 border-green-300 font-mono">{formatCurrency(totais.valor_30d)}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-green-800 border-t-2 border-green-300 font-mono">{formatCurrency(totais.valor_total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </>
    );
  };

  const renderAbaAnalises = () => {
    const anoAtual = new Date().getFullYear();
    const anoAnterior = anoAtual - 1;

    const filtrosAtivos = [];
    if (filtroEmpresa) {
      const empresa = empresas.find(e => filtroEmpresa.includes(e.id as number));
      if (empresa) filtrosAtivos.push(`Empresa: ${filtroEmpresa.length > 1 ? filtroEmpresa.length + ' empresas' : empresa.nome}`);
    }
    if (filtroCentroCusto.length > 0) {
      const cc = centrosCusto.find(c => filtroCentroCusto.includes(c.id as number));
      if (cc) filtrosAtivos.push(`Centro Custo: ${filtroCentroCusto.length > 1 ? filtroCentroCusto.length + ' centros' : cc.nome}`);
    }
    if (filtroCredor.length > 0) filtrosAtivos.push(`Credor: ${filtroCredor.length > 1 ? filtroCredor.length + ' credores' : filtroCredor[0]}`);
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

        {dadosPorOrigem.length > 0 && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-2 text-xl font-semibold text-gray-900">Pagamentos por Origem</h3>
            <p className="mb-4 text-sm text-gray-500">Distribuicao de pagamentos por tipo de origem</p>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosPorOrigem} layout="vertical" margin={{ top: 5, right: 120, left: 50, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => formatCurrencyShort(value)} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="origem"
                      tick={{ fontSize: 11 }}
                      width={110}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), 'Valor']}
                      labelFormatter={(label) => `Origem: ${label}`}
                    />
                    <Bar dataKey="valor" fill="#8B5CF6" radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (value: number) => formatCurrency(value), fontSize: 10 }}>
                      {dadosPorOrigem.map((_, index) => (
                        <Cell key={`cell-origem-${index}`} fill={['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#EF4444', '#14B8A6'][index % 8]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Origem</th>
                      <th className="py-3 px-4 text-right text-sm font-medium text-gray-700">Quantidade</th>
                      <th className="py-3 px-4 text-right text-sm font-medium text-gray-700">Valor Total</th>
                      <th className="py-3 px-4 text-right text-sm font-medium text-gray-700">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const totalValor = dadosPorOrigem.reduce((acc, item) => acc + item.valor, 0);
                      return dadosPorOrigem.map((item, index) => (
                        <tr key={`origem-row-${index}`} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm font-medium text-gray-900">{item.origem}</td>
                          <td className="py-3 px-4 text-right text-sm text-gray-600">{item.quantidade.toLocaleString('pt-BR')}</td>
                          <td className="py-3 px-4 text-right text-sm font-semibold text-purple-600">{formatCurrency(item.valor)}</td>
                          <td className="py-3 px-4 text-right text-sm text-gray-600">{((item.valor / totalValor) * 100).toFixed(1)}%</td>
                        </tr>
                      ));
                    })()}
                    <tr className="bg-gray-100 font-semibold">
                      <td className="py-3 px-4 text-sm text-gray-900">Total</td>
                      <td className="py-3 px-4 text-right text-sm text-gray-900">{dadosPorOrigem.reduce((acc, item) => acc + item.quantidade, 0).toLocaleString('pt-BR')}</td>
                      <td className="py-3 px-4 text-right text-sm text-purple-700">{formatCurrency(dadosPorOrigem.reduce((acc, item) => acc + item.valor, 0))}</td>
                      <td className="py-3 px-4 text-right text-sm text-gray-900">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Painel de Status das Metas por Origem */}
        {origemMetasStatus.length > 0 && (
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Metas por Origem</h3>
                <p className="text-sm text-gray-500">Acompanhamento do atingimento das metas definidas</p>
              </div>
              <button
                onClick={() => setAbaAtiva('configuracoes')}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                Gerenciar Metas
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {origemMetasStatus.map((meta) => (
                <div
                  key={meta.id}
                  className={`rounded-lg border-2 p-4 ${
                    meta.meta_atingida
                      ? 'border-green-500 bg-green-50'
                      : 'border-red-500 bg-red-50'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900">{meta.descricao}</h4>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${
                        meta.meta_atingida
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                      }`}
                    >
                      {meta.meta_atingida ? 'Atingida' : 'Não Atingida'}
                    </span>
                  </div>
                  <p className="mb-2 text-sm text-gray-600">
                    Origens: <span className="font-medium">{meta.origens.join(', ')}</span>
                  </p>
                  <div className="mb-2">
                    <div className="flex justify-between text-sm">
                      <span>Atingido: <span className="font-bold">{meta.percentual_atingido.toFixed(1)}%</span></span>
                      <span>Meta: <span className="font-bold">{meta.meta_percentual}%</span></span>
                    </div>
                    <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={`h-full transition-all ${
                          meta.meta_atingida ? 'bg-green-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(meta.percentual_atingido, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    <span>{formatCurrency(meta.valor_origens)}</span>
                    <span className="mx-1">de</span>
                    <span>{formatCurrency(meta.valor_total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {rankingCredores && rankingCredores.credores.length > 0 && (() => {
          const credores80 = rankingCredores.credores.find(c => c.percentual_acumulado >= 80);
          const qtdCredores80 = credores80 ? credores80.rank : rankingCredores.credores.length;
          
          return (
          <>
            <div className="rounded-lg bg-gray-900 p-6 shadow">
              <h3 className="mb-2 text-xl font-semibold text-white">Ranking Completo de Credores</h3>
              <p className="mb-4 text-sm text-gray-400">
                {rankingCredores.total_credores} credores | Total: {formatCurrency(rankingCredores.total_geral)}
              </p>
              <div className="mb-4 rounded-lg bg-gradient-to-r from-blue-900 to-purple-900 p-4">
                <p className="text-sm text-gray-300">
                  <span className="text-lg font-bold text-yellow-400">Analise de Pareto:</span> Dos{' '}
                  <span className="font-bold text-white">{rankingCredores.total_credores}</span> credores,{' '}
                  <span className="font-bold text-green-400">80%</span> do valor total foi pago para apenas{' '}
                  <span className="font-bold text-cyan-400">{qtdCredores80}</span> credores{' '}
                  <span className="text-gray-400">({((qtdCredores80 / rankingCredores.total_credores) * 100).toFixed(1)}% do total de credores)</span>
                </p>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="min-w-full">
                  <thead className="sticky top-0 bg-gray-800">
                    <tr className="border-b border-gray-700">
                      <th className="py-3 px-2 text-left text-sm font-medium text-gray-300">Rank</th>
                      <th className="py-3 px-2 text-left text-sm font-medium text-gray-300">Credor</th>
                      <th className="py-3 px-2 text-right text-sm font-medium text-gray-300">Acrescimo</th>
                      <th className="py-3 px-2 text-right text-sm font-medium text-gray-300">Descontos</th>
                      <th className="py-3 px-2 text-right text-sm font-medium text-gray-300">Vlr Pago</th>
                      <th className="py-3 px-2 text-right text-sm font-medium text-gray-300">% Pago</th>
                      <th className="py-3 px-2 text-right text-sm font-medium text-gray-300">% Acum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingCredores.credores.map((credor) => (
                      <tr key={`${credor.credor}-${credor.rank}`} className="border-b border-gray-800 hover:bg-gray-800">
                        <td className="py-3 px-2 text-sm text-gray-400">{credor.rank}</td>
                        <td className="py-3 px-2 text-sm font-medium text-white">{credor.credor}</td>
                        <td className="py-3 px-2 text-right text-sm text-gray-400">{formatCurrency(credor.valor_acrescimo)}</td>
                        <td className="py-3 px-2 text-right text-sm text-gray-400">{formatCurrency(credor.valor_desconto)}</td>
                        <td className="py-3 px-2 text-right text-sm font-semibold text-cyan-400">{formatCurrency(credor.valor_pago)}</td>
                        <td className="py-3 px-2 text-right text-sm text-gray-300">{credor.percentual.toFixed(2)}%</td>
                        <td className="py-3 px-2 text-right text-sm text-gray-300">{credor.percentual_acumulado.toFixed(2)}%</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-800 font-semibold">
                      <td className="py-3 px-2 text-sm text-gray-300" colSpan={2}>Total</td>
                      <td className="py-3 px-2 text-right text-sm text-gray-300">
                        {formatCurrency(rankingCredores.credores.reduce((acc, c) => acc + c.valor_acrescimo, 0))}
                      </td>
                      <td className="py-3 px-2 text-right text-sm text-gray-300">
                        {formatCurrency(rankingCredores.credores.reduce((acc, c) => acc + c.valor_desconto, 0))}
                      </td>
                      <td className="py-3 px-2 text-right text-sm text-cyan-400">{formatCurrency(rankingCredores.total_geral)}</td>
                      <td className="py-3 px-2 text-right text-sm text-gray-300">100,00%</td>
                      <td className="py-3 px-2 text-right text-sm text-gray-300">100,00%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-2 text-xl font-semibold text-gray-900">Grafico de Pareto - Credores</h3>
              <p className="mb-4 text-sm text-gray-500">Analise de concentracao de pagamentos por credor</p>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={rankingCredores.credores.slice(0, 20)} 
                    margin={{ top: 20, right: 60, left: 20, bottom: 120 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="credor" 
                      tick={{ fontSize: 9 }}
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                      height={100}
                    />
                    <YAxis 
                      yAxisId="left"
                      tickFormatter={(value) => formatCurrencyShort(value)} 
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      tickFormatter={(value) => `${value}%`}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const credorData = payload[0]?.payload as RankingCredor | undefined;
                          if (!credorData) return null;
                          return (
                            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                              <p className="mb-2 font-semibold text-gray-900">{label}</p>
                              <p className="text-sm text-blue-600">
                                Valor Pago: {formatCurrency(credorData.valor_pago)}
                              </p>
                              <p className="text-sm text-purple-600">
                                Percentual: {credorData.percentual.toFixed(2)}%
                              </p>
                              <p className="text-sm text-red-600">
                                % Acumulado: {credorData.percentual_acumulado.toFixed(2)}%
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    <Bar 
                      yAxisId="left"
                      dataKey="valor_pago" 
                      fill="#06B6D4" 
                      name="Valor Pago"
                      radius={[4, 4, 0, 0]}
                    >
                      {rankingCredores.credores.slice(0, 20).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="percentual_acumulado" 
                      stroke="#EF4444" 
                      strokeWidth={3}
                      name="% Acumulado"
                      dot={{ r: 4, fill: '#EF4444' }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
          );
        })()}
      </div>
    );
  };

  const renderAbaDadosDetalhados = () => {
    const contasOrdenadas = ordenarContas(contas);
    const totalPaginas = Math.ceil(totalRegistros / itensPorPagina);
    const registroInicio = (paginaAtual - 1) * itensPorPagina + 1;
    const registroFim = Math.min(paginaAtual * itensPorPagina, totalRegistros);

    // Totais da pagina atual
    const totalValorOriginal = contas.reduce((s, c) => s + ((c as any).valor_baixa || 0), 0);
    const totalValorPago = contas.reduce((s, c) => s + (c.valor_total || 0), 0);

    // Gerar numeros de paginas visiveis
    const paginasVisiveis = () => {
      const paginas: number[] = [];
      const maxVisiveis = 7;
      let inicio = Math.max(1, paginaAtual - Math.floor(maxVisiveis / 2));
      const fim = Math.min(totalPaginas, inicio + maxVisiveis - 1);
      inicio = Math.max(1, fim - maxVisiveis + 1);
      for (let i = inicio; i <= fim; i++) paginas.push(i);
      return paginas;
    };

    const filtrosAtivosDados: string[] = [];
    if (filtroEmpresa.length > 0) {
      const emp = empresas.find(e => filtroEmpresa.includes(e.id as number));
      filtrosAtivosDados.push(`Empresa: ${filtroEmpresa.length > 1 ? filtroEmpresa.length + ' empresas' : (emp?.nome || '')}`);
    }
    if (filtroCentroCusto.length > 0) {
      const cc = centrosCusto.find(c => filtroCentroCusto.includes(c.id as number));
      filtrosAtivosDados.push(`Centro Custo: ${filtroCentroCusto.length > 1 ? filtroCentroCusto.length + ' centros' : (cc?.nome || '')}`);
    }
    if (filtroCredor.length > 0) filtrosAtivosDados.push(`Credor: ${filtroCredor.length > 1 ? filtroCredor.length + ' credores' : filtroCredor[0]}`);
    if (filtroIdDocumento.length > 0) filtrosAtivosDados.push(`Docs: ${filtroIdDocumento.length} selecionado(s)`);
    if (filtroOrigemDado.length > 0) filtrosAtivosDados.push(`Origem: ${filtroOrigemDado.length} selecionada(s)`);
    if (filtroTipoBaixa.length > 0) filtrosAtivosDados.push(`Tipo Baixa: ${filtroTipoBaixa.length} tipo(s)`);
    if (filtroTipoPagamento.length > 0) filtrosAtivosDados.push(`Tipo Pagamento: ${filtroTipoPagamento.length} tipo(s)`);
    if (filtroPlanoFinanceiro.length > 0) filtrosAtivosDados.push(`Plano Financeiro: ${filtroPlanoFinanceiro.length} plano(s)`);
    if (filtroContaCorrente.length > 0) filtrosAtivosDados.push(`Conta Corrente: ${filtroContaCorrente.length} conta(s)`);
    if (filtroOrigemTitulo.length > 0) filtrosAtivosDados.push(`Origem Titulo: ${filtroOrigemTitulo.length} origem(ns)`);
    if (filtroAno.length > 0) filtrosAtivosDados.push(`Anos: ${filtroAno.join(', ')}`);
    if (filtroMes.length > 0) {
      const mesesNomes = filtroMes.map(m => meses.find(mes => mes.valor === m)?.nome).filter(Boolean);
      filtrosAtivosDados.push(`Meses: ${mesesNomes.join(', ')}`);
    }
    if (filtroDataInicio) filtrosAtivosDados.push(`Data Inicio: ${filtroDataInicio}`);
    if (filtroDataFim) filtrosAtivosDados.push(`Data Fim: ${filtroDataFim}`);

    return (
      <>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Detalhamento de Pagamentos</h2>
            <p className="mt-1 text-sm text-gray-500">
              {totalRegistros > 0 ? `${registroInicio} - ${registroFim} de ${totalRegistros.toLocaleString('pt-BR')} registro(s)` : '0 registros'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportarPDF}
              disabled={contas.length === 0}
              className="flex items-center rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
            >
              <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Exportar PDF
            </button>
            <button
              type="button"
              onClick={exportarCSVDados}
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
              {filtrosAtivosDados.length > 0 && (
                <span className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-600">
                  {filtrosAtivosDados.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {!mostrarFiltros && filtrosAtivosDados.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {filtrosAtivosDados.map((filtro, index) => (
              <span
                key={index}
                className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800"
              >
                {filtro}
              </span>
            ))}
            <button
              type="button"
              onClick={() => {
                limparFiltros();
                setTimeout(buscarContas, 100);
              }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Limpar todos
            </button>
          </div>
        )}

        {mostrarFiltros && renderFiltros()}

        <div className="rounded-lg bg-white shadow overflow-visible">
          <div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-green-50 sticky top-[85px] z-30 shadow-[0_2px_4px_rgba(0,0,0,0.1)]">
                <tr>
                  <th onClick={() => toggleOrdenacao('credor')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">
                    Credor{renderSortIcon('credor')}
                  </th>
                  <th onClick={() => toggleOrdenacao('data_vencimento')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">
                    Vencimento{renderSortIcon('data_vencimento')}
                  </th>
                  <th onClick={() => toggleOrdenacao('lancamento')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">
                    Titulo{renderSortIcon('lancamento')}
                  </th>
                  <th onClick={() => toggleOrdenacao('data_pagamento')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">
                    Pagamento{renderSortIcon('data_pagamento')}
                  </th>
                  <th onClick={() => toggleOrdenacao('dias_atraso')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">
                    Atraso{renderSortIcon('dias_atraso')}
                  </th>
                  <th onClick={() => toggleOrdenacao('nome_centrocusto')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">
                    Centro de Custo{renderSortIcon('nome_centrocusto')}
                  </th>
                  <th onClick={() => toggleOrdenacao('nome_plano_financeiro')} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">
                    Plano Financeiro{renderSortIcon('nome_plano_financeiro')}
                  </th>
                  <th onClick={() => toggleOrdenacao('valor_baixa')} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">
                    Valor Original{renderSortIcon('valor_baixa')}
                  </th>
                  <th onClick={() => toggleOrdenacao('valor_juros')} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">
                    Juros{renderSortIcon('valor_juros')}
                  </th>
                  <th onClick={() => toggleOrdenacao('valor_acrescimo')} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">
                    Acrescimos{renderSortIcon('valor_acrescimo')}
                  </th>
                  <th onClick={() => toggleOrdenacao('valor_desconto')} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">
                    Descontos{renderSortIcon('valor_desconto')}
                  </th>
                  <th onClick={() => toggleOrdenacao('valor_total')} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-green-100">
                    Valor Pago{renderSortIcon('valor_total')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {contasOrdenadas.map((conta, index) => {
                  const diasAtraso = (conta as any).dias_atraso;
                  const corAtraso = diasAtraso == null ? 'text-gray-400' : diasAtraso > 0 ? 'text-red-600' : diasAtraso === 0 ? 'text-green-600' : 'text-green-600';

                  return (
                    <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 max-w-[250px] truncate" title={conta.credor || '-'}>
                        {conta.credor || '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {formatDate(conta.data_vencimento)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 font-mono">
                        {conta.lancamento ? conta.lancamento.split('/')[0] : '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {formatDate(conta.data_pagamento)}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-sm font-semibold ${corAtraso}`}>
                        {diasAtraso == null ? '-' : diasAtraso > 0 ? `${diasAtraso}d` : diasAtraso === 0 ? 'No prazo' : `${Math.abs(diasAtraso)}d antecip.`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 max-w-[180px] truncate" title={conta.nome_centrocusto || '-'}>
                        {conta.nome_centrocusto || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate" title={(conta as any).nome_plano_financeiro || '-'}>
                        {(conta as any).nome_plano_financeiro || '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-gray-700 text-right font-mono">
                        {formatCurrency((conta as any).valor_baixa)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-right font-mono text-orange-600">
                        {(conta as any).valor_juros ? formatCurrency((conta as any).valor_juros) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-right font-mono text-red-600">
                        {(conta as any).valor_acrescimo ? formatCurrency((conta as any).valor_acrescimo) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-right font-mono text-blue-600">
                        {(conta as any).valor_desconto ? formatCurrency((conta as any).valor_desconto) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-green-700 text-right font-mono">
                        {formatCurrency(conta.valor_total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-green-50">
                <tr>
                  <td colSpan={7} className="px-4 py-3 text-sm font-bold text-gray-900">SUBTOTAL PAGINA</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-700 text-right font-mono">{formatCurrency(totalValorOriginal)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-orange-600 text-right font-mono">-</td>
                  <td className="px-4 py-3 text-sm font-bold text-red-600 text-right font-mono">-</td>
                  <td className="px-4 py-3 text-sm font-bold text-blue-600 text-right font-mono">-</td>
                  <td className="px-4 py-3 text-sm font-bold text-green-700 text-right font-mono">{formatCurrency(totalValorPago)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {totalPaginas > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Mostrando {registroInicio} - {registroFim} de {totalRegistros.toLocaleString('pt-BR')} registros
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => carregarPagina(1)}
                disabled={paginaAtual === 1}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Primeira
              </button>
              <button
                type="button"
                onClick={() => carregarPagina(paginaAtual - 1)}
                disabled={paginaAtual === 1}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              {paginasVisiveis()[0] > 1 && <span className="px-2 text-gray-400">...</span>}
              {paginasVisiveis().map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => carregarPagina(p)}
                  className={`px-3 py-2 text-sm rounded-lg border ${
                    p === paginaAtual
                      ? 'bg-green-600 text-white border-green-600'
                      : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  {p}
                </button>
              ))}
              {paginasVisiveis()[paginasVisiveis().length - 1] < totalPaginas && <span className="px-2 text-gray-400">...</span>}
              <button
                type="button"
                onClick={() => carregarPagina(paginaAtual + 1)}
                disabled={paginaAtual === totalPaginas}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Proxima
              </button>
              <button
                type="button"
                onClick={() => carregarPagina(totalPaginas)}
                disabled={paginaAtual === totalPaginas}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Ultima
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div>
      {estatisticas && (() => {
          const credoresTotal = new Set(contas.map(c => c.credor)).size;
          return (
        <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-lg bg-gradient-to-br from-green-500 to-green-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Líquido Total</div>
            <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_liquido)}</div>
            <div className="mt-1 text-xs opacity-75">{estatisticas.quantidade_titulos.toLocaleString('pt-BR')} títulos | {credoresTotal} credores</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Últimos 7 dias</div>
            <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_7d ?? 0)}</div>
            <div className="mt-1 text-xs opacity-75">Líquido pago</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Últimos 15 dias</div>
            <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_15d ?? 0)}</div>
            <div className="mt-1 text-xs opacity-75">Líquido pago</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Últimos 30 dias</div>
            <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_30d ?? 0)}</div>
            <div className="mt-1 text-xs opacity-75">Líquido pago</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Acréscimos</div>
            <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_acrescimo)}</div>
            <div className="mt-1 text-xs opacity-75">Juros/multas</div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-xs font-medium opacity-90">Descontos</div>
            <div className="text-2xl font-bold">{formatCurrency(estatisticas.valor_desconto)}</div>
            <div className="mt-1 text-xs opacity-75">Economizado</div>
          </div>
        </div>
          );
        })()}

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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Dados
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('fornecedor')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
                abaAtiva === 'fornecedor'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Por Fornecedor
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('centro-custo')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
                abaAtiva === 'centro-custo'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Por Centro de Custo
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('origem')}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
                abaAtiva === 'origem'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <svg className="mr-2 inline-block h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Por Origem
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

      {abaAtiva === 'dados' && renderAbaDadosDetalhados()}
      {abaAtiva === 'fornecedor' && renderAbaDados()}
      {abaAtiva === 'centro-custo' && renderAbaCentroCusto()}
      {abaAtiva === 'origem' && renderAbaOrigem()}
      {abaAtiva === 'analises' && renderAbaAnalises()}
      {abaAtiva === 'configuracoes' && renderAbaConfiguracoes()}
    </div>
  );
};
