import axios from 'axios';
import { ContaPagar, DashboardMetrics, GraficoMensal, GraficoPorCategoria, EmpresaOption, CentroCustoOption, TipoDocumentoOption, OrigemDadoOption, TipoBaixaOption, KPI, KPICreate, KPIHistorico, KPIResumo, CalculoDisponivel, TipoDocumento } from '../types';

const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiService = {
  // Métricas principais
  getMetricas: async (): Promise<DashboardMetrics> => {
    const response = await api.get<DashboardMetrics>('/metricas');
    return response.data;
  },

  // Contas a pagar
  getContas: async (status?: string, limite: number = 100): Promise<ContaPagar[]> => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    params.append('limite', limite.toString());
    
    const response = await api.get<ContaPagar[]>(`/contas?${params.toString()}`);
    return response.data;
  },

  // Gráfico mensal
  getGraficoMensal: async (): Promise<GraficoMensal[]> => {
    const response = await api.get<GraficoMensal[]>('/grafico-mensal');
    return response.data;
  },

  // Gráfico por categoria
  getGraficoCategoria: async (): Promise<GraficoPorCategoria[]> => {
    const response = await api.get<GraficoPorCategoria[]>('/grafico-categoria');
    return response.data;
  },

  // Próximos vencimentos
  getProximosVencimentos: async (dias: number = 30): Promise<ContaPagar[]> => {
    const response = await api.get<ContaPagar[]>(`/proximos-vencimentos?dias=${dias}`);
    return response.data;
  },

  // Contas pagas com filtros
  getContasPagasFiltradas: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    credor?: string;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
    ano?: string;
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
    limite?: number;
  }): Promise<ContaPagar[]> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.credor) params.append('credor', filtros.credor);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.origem_dado) params.append('origem_dado', filtros.origem_dado);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros.data_fim) params.append('data_fim', filtros.data_fim);
    if (filtros.limite) params.append('limite', filtros.limite.toString());

    const response = await api.get<ContaPagar[]>(`/contas-pagas-filtradas?${params.toString()}`);
    return response.data;
  },

  // Filtros - Credores
  getCredores: async (): Promise<string[]> => {
    const response = await api.get<string[]>('/filtros/credores');
    return response.data;
  },

  // Filtros - Empresas
  getEmpresas: async (): Promise<EmpresaOption[]> => {
    const response = await api.get<EmpresaOption[]>('/filtros/empresas');
    return response.data;
  },

  // Filtros - Centros de Custo
  getCentrosCusto: async (): Promise<CentroCustoOption[]> => {
    const response = await api.get<CentroCustoOption[]>('/filtros/centros-custo');
    return response.data;
  },

  // Filtros - Tipos de Documento
  getTiposDocumento: async (): Promise<TipoDocumentoOption[]> => {
    const response = await api.get<TipoDocumentoOption[]>('/filtros/tipos-documento');
    return response.data;
  },

  // Filtros - Origem Dado
  getOrigensDado: async (): Promise<OrigemDadoOption[]> => {
    const response = await api.get<OrigemDadoOption[]>('/filtros/origem-dado');
    return response.data;
  },

  // Filtros - Tipos de Baixa
  getTiposBaixa: async (): Promise<TipoBaixaOption[]> => {
    const response = await api.get<TipoBaixaOption[]>('/filtros/tipos-baixa');
    return response.data;
  },

  // Estatísticas Contas Pagas
  getEstatisticasContasPagas: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    credor?: string;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
    ano?: string;
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<{
    quantidade_titulos: number;
    valor_liquido: number;
    valor_baixa: number;
    valor_acrescimo: number;
    valor_desconto: number;
  }> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.credor) params.append('credor', filtros.credor);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.origem_dado) params.append('origem_dado', filtros.origem_dado);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros.data_fim) params.append('data_fim', filtros.data_fim);

    const response = await api.get(`/estatisticas-contas-pagas?${params.toString()}`);
    return response.data;
  },

  // Estatísticas por mês
  getEstatisticasPorMes: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    credor?: string;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
    ano?: string;
  }): Promise<Array<{ mes: string; mes_nome: string; valor: number; quantidade: number }>> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.credor) params.append('credor', filtros.credor);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.origem_dado) params.append('origem_dado', filtros.origem_dado);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);
    if (filtros.ano) params.append('ano', filtros.ano);

    const response = await api.get(`/estatisticas-por-mes?${params.toString()}`);
    return response.data;
  },

  // Estatísticas por empresa
  getEstatisticasPorEmpresa: async (filtros: {
    centro_custo?: number;
    credor?: string;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
    ano?: string;
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<Array<{ empresa: string; valor: number; quantidade: number }>> => {
    const params = new URLSearchParams();
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.credor) params.append('credor', filtros.credor);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.origem_dado) params.append('origem_dado', filtros.origem_dado);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros.data_fim) params.append('data_fim', filtros.data_fim);

    const response = await api.get(`/estatisticas-por-empresa?${params.toString()}`);
    return response.data;
  },

  // Top credores
  getTopCredores: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
    ano?: string;
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
    limite?: number;
  }): Promise<Array<{ credor: string; valor: number; quantidade: number }>> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.origem_dado) params.append('origem_dado', filtros.origem_dado);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros.data_fim) params.append('data_fim', filtros.data_fim);
    if (filtros.limite) params.append('limite', filtros.limite.toString());

    const response = await api.get(`/top-credores?${params.toString()}`);
    return response.data;
  },

  // Comparacao anual (ano atual vs ano anterior)
  getComparacaoAnual: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    credor?: string;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
  }): Promise<Array<{ mes_nome: string; ano_atual: number; ano_anterior: number; variacao: number }>> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.credor) params.append('credor', filtros.credor);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.origem_dado) params.append('origem_dado', filtros.origem_dado);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);

    const response = await api.get(`/comparacao-anual?${params.toString()}`);
    return response.data;
  },

  // Comparacao mensal (ultimos 12 meses com variacao)
  getComparacaoMensal: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    credor?: string;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
  }): Promise<Array<{ periodo: string; valor: number; variacao: number }>> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.credor) params.append('credor', filtros.credor);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.origem_dado) params.append('origem_dado', filtros.origem_dado);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);

    const response = await api.get(`/comparacao-mensal?${params.toString()}`);
    return response.data;
  },

  // ==================== KPIs ====================

  // Listar KPIs
  getKPIs: async (ativo?: boolean): Promise<KPI[]> => {
    const params = new URLSearchParams();
    if (ativo !== undefined) params.append('ativo', ativo.toString());
    const response = await api.get<KPI[]>(`/kpis?${params.toString()}`);
    return response.data;
  },

  // Buscar KPI por ID
  getKPI: async (id: number): Promise<KPI> => {
    const response = await api.get<KPI>(`/kpis/${id}`);
    return response.data;
  },

  // Criar KPI
  createKPI: async (kpi: KPICreate): Promise<KPI> => {
    const response = await api.post<KPI>('/kpis', kpi);
    return response.data;
  },

  // Atualizar KPI
  updateKPI: async (id: number, kpi: Partial<KPICreate>): Promise<KPI> => {
    const response = await api.put<KPI>(`/kpis/${id}`, kpi);
    return response.data;
  },

  // Excluir KPI
  deleteKPI: async (id: number): Promise<void> => {
    await api.delete(`/kpis/${id}`);
  },

  // Buscar histórico de um KPI
  getKPIHistorico: async (kpiId: number, limite: number = 30): Promise<KPIHistorico[]> => {
    const response = await api.get<KPIHistorico[]>(`/kpis/${kpiId}/historico?limite=${limite}`);
    return response.data;
  },

  // Registrar valor de KPI
  registrarValorKPI: async (kpiId: number, valor: number, dataRegistro?: string): Promise<KPIHistorico> => {
    const data: { valor: number; data_registro?: string } = { valor };
    if (dataRegistro) data.data_registro = dataRegistro;
    const response = await api.post<KPIHistorico>(`/kpis/${kpiId}/registrar-valor`, data);
    return response.data;
  },

  // Resumo de KPIs
  getKPIsResumo: async (): Promise<KPIResumo[]> => {
    const response = await api.get<KPIResumo[]>('/kpis-resumo');
    return response.data;
  },

  // Cálculos disponíveis para KPIs automáticos
  getCalculosDisponiveis: async (): Promise<CalculoDisponivel[]> => {
    const response = await api.get<CalculoDisponivel[]>('/calculos-disponiveis');
    return response.data;
  },

  // Tipos de documento disponíveis para exclusão em KPIs
  getTiposDocumentoKPI: async (): Promise<TipoDocumento[]> => {
    const response = await api.get<TipoDocumento[]>('/tipos-documento-kpi');
    return response.data;
  },
};
