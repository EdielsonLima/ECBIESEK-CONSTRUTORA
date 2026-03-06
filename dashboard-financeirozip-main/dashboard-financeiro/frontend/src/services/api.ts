import axios from 'axios';
import { ContaPagar, DashboardMetrics, GraficoMensal, GraficoPorCategoria, EmpresaOption, CentroCustoOption, TipoDocumentoOption, OrigemDadoOption, TipoBaixaOption, ContaCorrenteOption, OrigemTituloOption, KPI, KPICreate, KPIHistorico, KPIResumo, CalculoDisponivel, TipoDocumento, ContaReceber, MetricasReceber, KPIVariacaoDiaria, KPIHistoricoVariacaoResponse, SnapshotDiarioResponse } from '../types';

const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar token de autenticação
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para tratar erros de autenticação
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Interfaces de autenticação
export interface User {
  id: number;
  email: string;
  nome: string;
  permissao: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface AuthCheckResponse {
  authenticated: boolean;
  user?: User;
}

// Serviços de autenticação
export const authService = {
  login: async (email: string, senha: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login-json', { email, senha });
    localStorage.setItem('access_token', response.data.access_token);
    localStorage.setItem('user', JSON.stringify(response.data.user));
    return response.data;
  },

  register: async (email: string, nome: string, senha: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/register', { email, nome, senha });
    localStorage.setItem('access_token', response.data.access_token);
    localStorage.setItem('user', JSON.stringify(response.data.user));
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  },

  checkAuth: async (): Promise<AuthCheckResponse> => {
    try {
      const response = await api.get<AuthCheckResponse>('/auth/check');
      return response.data;
    } catch {
      return { authenticated: false };
    }
  },

  getStoredUser: (): User | null => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('access_token');
  },

  alterarSenha: async (senha_atual: string, nova_senha: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/auth/alterar-senha', { senha_atual, nova_senha });
    return response.data;
  },
};

export interface UsuarioAdmin {
  id: number;
  email: string;
  nome: string;
  permissao: string;
  ativo: number;
  created_at: string;
}

export interface AtividadeLog {
  id: number;
  email: string;
  acao: string;
  detalhes: string | null;
  ip: string | null;
  created_at: string;
}

export const adminService = {
  getUsuarios: async (): Promise<UsuarioAdmin[]> => {
    const response = await api.get('/admin/usuarios');
    return response.data;
  },
  criarUsuario: async (email: string, nome: string, senha: string, permissao: string): Promise<any> => {
    const response = await api.post('/admin/usuarios', { email, nome, senha, permissao });
    return response.data;
  },
  deletarUsuario: async (id: number): Promise<any> => {
    const response = await api.delete(`/admin/usuarios/${id}`);
    return response.data;
  },
  atualizarPermissao: async (id: number, permissao: string): Promise<any> => {
    const response = await api.put(`/admin/usuarios/${id}`, { permissao });
    return response.data;
  },
  getAtividades: async (): Promise<AtividadeLog[]> => {
    const response = await api.get('/admin/atividades');
    return response.data;
  },
};

export const apiService = {
  // Chat IA
  chatIA: async (messages: { role: string; content: string }[]): Promise<{ reply: string }> => {
    const response = await api.post('/ia/chat', { messages });
    return response.data;
  },

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

  // Contas a pagar do ano inteiro (sem filtro de data mínima)
  getContasAno: async (ano?: number): Promise<ContaPagar[]> => {
    const params = new URLSearchParams();
    if (ano) params.append('ano', ano.toString());
    const response = await api.get<ContaPagar[]>(`/contas-ano?${params.toString()}`);
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
    conta_corrente?: string;
    origem_titulo?: string;
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
    if (filtros.conta_corrente) params.append('conta_corrente', filtros.conta_corrente);
    if (filtros.origem_titulo) params.append('origem_titulo', filtros.origem_titulo);
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros.data_fim) params.append('data_fim', filtros.data_fim);
    if (filtros.limite) params.append('limite', filtros.limite.toString());

    const response = await api.get<ContaPagar[]>(`/contas-pagas-filtradas?${params.toString()}`);
    return response.data;
  },

  // Contas pagas agrupadas por fornecedor
  getContasPagasPorFornecedor: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    credor?: string;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
    conta_corrente?: string;
    origem_titulo?: string;
    ano?: string;
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<{
    ref_date: string | null;
    fornecedores: Array<{
      credor: string;
      titulos_7d: number;
      valor_7d: number;
      titulos_15d: number;
      valor_15d: number;
      titulos_30d: number;
      valor_30d: number;
      titulos_total: number;
      valor_total: number;
    }>;
    total_fornecedores: number;
  }> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.credor) params.append('credor', filtros.credor);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.origem_dado) params.append('origem_dado', filtros.origem_dado);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);
    if (filtros.conta_corrente) params.append('conta_corrente', filtros.conta_corrente);
    if (filtros.origem_titulo) params.append('origem_titulo', filtros.origem_titulo);
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros.data_fim) params.append('data_fim', filtros.data_fim);

    const response = await api.get(`/contas-pagas-por-fornecedor?${params.toString()}`);
    return response.data;
  },

  // Contas pagas agrupadas por centro de custo
  getContasPagasPorCentroCusto: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    credor?: string;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
    conta_corrente?: string;
    origem_titulo?: string;
    ano?: string;
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<{
    ref_date: string | null;
    centros_custo: Array<{
      codigo_cc: number;
      nome_centrocusto: string;
      valor_7d: number;
      valor_15d: number;
      valor_30d: number;
      valor_total: number;
    }>;
    total_centros: number;
  }> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.credor) params.append('credor', filtros.credor);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.origem_dado) params.append('origem_dado', filtros.origem_dado);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);
    if (filtros.conta_corrente) params.append('conta_corrente', filtros.conta_corrente);
    if (filtros.origem_titulo) params.append('origem_titulo', filtros.origem_titulo);
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros.data_fim) params.append('data_fim', filtros.data_fim);

    const response = await api.get(`/contas-pagas-por-centro-custo?${params.toString()}`);
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

  // Filtros - Empresas presentes em contas_recebidas
  getEmpresasRecebidas: async (): Promise<EmpresaOption[]> => {
    const response = await api.get<EmpresaOption[]>('/filtros/empresas-recebidas');
    return response.data;
  },

  // Filtros - Centros de Custo
  getCentrosCusto: async (): Promise<CentroCustoOption[]> => {
    const response = await api.get<CentroCustoOption[]>('/filtros/centros-custo');
    return response.data;
  },

  // Filtros - Centros de Custo vinculados a empresas com contas_recebidas
  getCentrosCustoRecebidas: async (): Promise<CentroCustoOption[]> => {
    const response = await api.get<CentroCustoOption[]>('/filtros/centros-custo-recebidas');
    return response.data;
  },

  // Diagnóstico - Empresas com centros de custo aninhados
  getEmpresasCentrosDiagnostico: async (): Promise<{ id: number; nome: string; centros: { id: number; nome: string }[] }[]> => {
    const response = await api.get('/diagnostico/empresas-centros');
    return response.data;
  },

  // Filtros para Configurações — retornam TODOS sem exclusão aplicada
  getTodasEmpresas: async (): Promise<EmpresaOption[]> => {
    const response = await api.get<EmpresaOption[]>('/filtros/todas-empresas');
    return response.data;
  },
  getTodosCentrosCustoConfig: async (): Promise<CentroCustoOption[]> => {
    const response = await api.get<CentroCustoOption[]>('/filtros/todos-centros-custo');
    return response.data;
  },
  getTodosTiposDocumento: async (): Promise<TipoDocumentoOption[]> => {
    const response = await api.get<TipoDocumentoOption[]>('/filtros/todos-tipos-documento');
    return response.data;
  },
  getTodasContasCorrente: async (): Promise<any[]> => {
    const response = await api.get('/filtros/todas-contas-correntes');
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
    valor_7d: number;
    valor_15d: number;
    valor_30d: number;
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

  // Estatísticas por origem
  getEstatisticasPorOrigem: async (filtros: {
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
  }): Promise<Array<{ origem: string; valor: number; quantidade: number }>> => {
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

    const response = await api.get(`/estatisticas-por-origem?${params.toString()}`);
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

  // Ranking completo de credores com percentuais e Pareto
  getRankingCredores: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
    ano?: string;
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<{
    credores: Array<{
      credor: string;
      valor_pago: number;
      valor_acrescimo: number;
      valor_desconto: number;
      quantidade: number;
      rank: number;
      percentual: number;
      percentual_acumulado: number;
    }>;
    total_geral: number;
    total_credores: number;
  }> => {
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

    const response = await api.get(`/ranking-credores?${params.toString()}`);
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

  // Criar snapshot diário de todos os KPIs automáticos
  criarSnapshotDiario: async (): Promise<SnapshotDiarioResponse> => {
    const response = await api.post<SnapshotDiarioResponse>('/kpis/snapshot-diario');
    return response.data;
  },

  // Obter KPIs com variação diária (hoje vs ontem)
  getKPIsVariacaoDiaria: async (): Promise<KPIVariacaoDiaria[]> => {
    const response = await api.get<KPIVariacaoDiaria[]>('/kpis-variacao-diaria');
    return response.data;
  },

  // Obter histórico de variações de um KPI específico
  getKPIHistoricoVariacao: async (kpiId: number, dias: number = 30): Promise<KPIHistoricoVariacaoResponse> => {
    const response = await api.get<KPIHistoricoVariacaoResponse>(`/kpis/${kpiId}/historico-variacao?dias=${dias}`);
    return response.data;
  },

  // ==================== CONTAS A RECEBER ====================

  // Métricas de contas a receber
  getMetricasReceber: async (): Promise<MetricasReceber> => {
    const response = await api.get<MetricasReceber>('/metricas-receber');
    return response.data;
  },

  // Contas a receber
  getContasReceber: async (status?: string, limite: number = 100): Promise<ContaReceber[]> => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    params.append('limite', limite.toString());

    const response = await api.get<ContaReceber[]>(`/contas-receber?${params.toString()}`);
    return response.data;
  },

  // Contas recebidas com filtros
  getContasRecebidasFiltradas: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    cliente?: string;
    id_documento?: string;
    ano?: string;
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
    tipo_baixa?: string;
    limite?: number;
  }): Promise<ContaReceber[]> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.cliente) params.append('cliente', filtros.cliente);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros.data_fim) params.append('data_fim', filtros.data_fim);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);
    if (filtros.limite) params.append('limite', filtros.limite.toString());

    const response = await api.get<ContaReceber[]>(`/contas-recebidas-filtradas?${params.toString()}`);
    return response.data;
  },

  // Totais de contas recebidas sem LIMIT (para estatísticas corretas)
  getContasRecebidasTotais: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    cliente?: string;
    id_documento?: string;
    ano?: string;
    mes?: string;
    tipo_baixa?: string;
  }): Promise<{ total: number; quantidade: number }> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.cliente) params.append('cliente', filtros.cliente);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);
    const response = await api.get<{ total: number; quantidade: number }>(`/contas-recebidas-totais?${params.toString()}`);
    return response.data;
  },

  // Progresso de recebimento por título de um cliente
  getProgressTitulosCliente: async (filtros: {
    cliente: string;
    empresa?: number;
    ano?: string;
    mes?: string;
    tipo_baixa?: string;
  }): Promise<any[]> => {
    const params = new URLSearchParams();
    params.append('cliente', filtros.cliente);
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);
    const response = await api.get<any[]>(`/progress-titulos-cliente?${params.toString()}`);
    return response.data;
  },

  // Estatísticas contas a receber
  getEstatisticasContasReceber: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    ano?: string;
    mes?: string;
    id_documento?: string;
  }): Promise<{
    quantidade_titulos: number;
    valor_total: number;
    valor_medio: number;
    quantidade_atrasados: number;
    valor_atrasados: number;
    quantidade_vence_hoje: number;
    valor_vence_hoje: number;
  }> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);

    const response = await api.get(`/contas-receber-estatisticas?${params.toString()}`);
    return response.data;
  },

  // Estatísticas contas recebidas
  getEstatisticasContasRecebidas: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    ano?: string;
    mes?: string;
    id_documento?: string;
  }): Promise<{
    quantidade_titulos: number;
    valor_total: number;
    valor_medio: number;
  }> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);

    const response = await api.get(`/contas-recebidas-estatisticas?${params.toString()}`);
    return response.data;
  },

  // Contas a receber por cliente
  getContasReceberPorCliente: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    ano?: string;
    mes?: string;
    id_documento?: string;
    limite?: number;
  }): Promise<Array<{ cliente: string; valor: number; quantidade: number }>> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.limite) params.append('limite', filtros.limite.toString());

    const response = await api.get(`/contas-receber-por-cliente?${params.toString()}`);
    return response.data;
  },

  // Contas recebidas por cliente
  getContasRecebidasPorCliente: async (filtros: {
    empresa?: number;
    ano?: string;
    mes?: string;
    id_documento?: string;
    limite?: number;
  }): Promise<Array<{ cliente: string; valor: number; quantidade: number }>> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.limite) params.append('limite', filtros.limite.toString());

    const response = await api.get(`/contas-recebidas-por-cliente?${params.toString()}`);
    return response.data;
  },

  // Extrato do cliente
  getExtratoCliente: async (cliente: string, titulo?: string): Promise<{
    header: { cliente: string; empresa: string; empreendimento: string; documento: string };
    parcelas: Array<{
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
    }>;
    totais: {
      total_original: number;
      total_recebido: number;
      total_a_receber: number;
      total_atrasado: number;
      total_acrescimo: number;
      quantidade_parcelas: number;
    };
  }> => {
    const params = new URLSearchParams();
    params.append('cliente', cliente);
    if (titulo) params.append('titulo', titulo);

    const response = await api.get(`/extrato-cliente?${params.toString()}`);
    return response.data;
  },

  // Lista de clientes para seleção
  getClientesLista: async (): Promise<Array<{ id: string; nome: string; total_titulos: number }>> => {
    const response = await api.get('/clientes-lista');
    return response.data;
  },

  // Títulos de um cliente
  getTitulosCliente: async (cliente: string): Promise<Array<{ id: string; nome: string; valor_total: number }>> => {
    const response = await api.get(`/titulos-cliente?cliente=${encodeURIComponent(cliente)}`);
    return response.data;
  },

  // ==================== METAS POR ORIGEM ====================

  // Listar metas de origem
  getOrigemMetas: async (): Promise<Array<{
    id: number;
    descricao: string;
    origens: string[];
    meta_percentual: number;
    created_at: string | null;
    updated_at: string | null;
  }>> => {
    const response = await api.get('/origem-metas');
    return response.data;
  },

  // Criar meta de origem
  createOrigemMeta: async (data: {
    descricao: string;
    origens: string[];
    meta_percentual: number;
  }): Promise<{ id: number; message: string }> => {
    const response = await api.post('/origem-metas', data);
    return response.data;
  },

  // Atualizar meta de origem
  updateOrigemMeta: async (id: number, data: {
    descricao?: string;
    origens?: string[];
    meta_percentual?: number;
  }): Promise<{ message: string }> => {
    const response = await api.put(`/origem-metas/${id}`, data);
    return response.data;
  },

  // Deletar meta de origem
  deleteOrigemMeta: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/origem-metas/${id}`);
    return response.data;
  },

  // Obter status das metas com base nos filtros
  getOrigemMetasStatus: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    ano?: string;
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<Array<{
    id: number;
    descricao: string;
    origens: string[];
    meta_percentual: number;
    percentual_atingido: number;
    valor_origens: number;
    valor_total: number;
    meta_atingida: boolean;
  }>> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros.data_fim) params.append('data_fim', filtros.data_fim);

    const response = await api.get(`/origem-metas/status?${params.toString()}`);
    return response.data;
  },

  // Classificação de Centros de Custo
  getTodosCentrosCusto: async (empresa?: number): Promise<Array<{
    id_interno_centrocusto: number;
    nome_centrocusto: string;
    id_sienge_empresa: number;
    nome_empresa: string;
    classificacao: string | null;
    observacao: string | null;
    id: number | null;
  }>> => {
    const params = new URLSearchParams();
    if (empresa) params.append('empresa', empresa.toString());
    const response = await api.get(`/centros-custo/todos?${params.toString()}`);
    return response.data;
  },

  getClassificacoesCentrosCusto: async (): Promise<Array<{
    id: number;
    id_interno_centrocusto: number;
    nome_centrocusto: string;
    id_sienge_empresa: number;
    nome_empresa: string;
    classificacao: string;
    observacao: string | null;
  }>> => {
    const response = await api.get('/centros-custo/classificacoes');
    return response.data;
  },

  salvarClassificacaoCentroCusto: async (data: {
    id_interno_centrocusto: number;
    id_sienge_empresa?: number;
    nome_centrocusto?: string;
    nome_empresa?: string;
    classificacao: string;
    observacao?: string;
  }): Promise<any> => {
    const response = await api.post('/centros-custo/classificacoes', data);
    return response.data;
  },

  atualizarClassificacaoCentroCusto: async (id_interno_centrocusto: number, data: {
    classificacao: string;
    observacao?: string;
  }): Promise<any> => {
    const response = await api.put(`/centros-custo/classificacoes/${id_interno_centrocusto}`, data);
    return response.data;
  },

  removerClassificacaoCentroCusto: async (id_interno_centrocusto: number): Promise<any> => {
    const response = await api.delete(`/centros-custo/classificacoes/${id_interno_centrocusto}`);
    return response.data;
  },

  // Origens de Título (ecadorigemtitulo) — para Exposição de Caixa e Contas Pagas
  getOrigensTitulo: async (): Promise<OrigemTituloOption[]> => {
    const response = await api.get<OrigemTituloOption[]>('/filtros/origens-titulo');
    return response.data;
  },
  getOrigensExposicao: async (): Promise<Array<{ id_origem_titulo: number; sigla: string; descricao: string; incluir: boolean; paginas: string }>> => {
    const response = await api.get('/configuracoes/origens-exposicao');
    return response.data;
  },
  toggleOrigemExposicao: async (data: { id_origem_titulo: number; sigla: string; descricao: string; incluir: boolean; paginas: string }): Promise<any> => {
    const response = await api.post('/configuracoes/origens-exposicao/toggle', data);
    return response.data;
  },
  getOrigensExposicaoCaixaSiglas: async (): Promise<{ siglas: string[]; configurado: boolean }> => {
    const response = await api.get('/configuracoes/origens-exposicao-caixa-siglas');
    return response.data;
  },

  // Tipos de Baixa (ecadtipobaixa) — para Exposição de Caixa
  getTiposBaixaCompleto: async (): Promise<Array<{ id: number; nome: string; flag: string; descricao: string }>> => {
    const response = await api.get('/filtros/tipos-baixa-completo');
    return response.data;
  },
  getTiposBaixaExposicao: async (): Promise<Array<{ id_tipo_baixa: number; nome_tipo_baixa: string; flag_sistema_uso: string; incluir: boolean; paginas: string }>> => {
    const response = await api.get('/configuracoes/tipos-baixa-exposicao');
    return response.data;
  },
  toggleTipoBaixaExposicao: async (data: { id_tipo_baixa: number; nome_tipo_baixa: string; flag_sistema_uso: string; incluir: boolean; paginas: string }): Promise<any> => {
    const response = await api.post('/configuracoes/tipos-baixa-exposicao/toggle', data);
    return response.data;
  },
  getTiposBaixaExposicaoCaixaIds: async (): Promise<{ ids: number[]; configurado: boolean }> => {
    const response = await api.get('/configuracoes/tipos-baixa-exposicao-caixa-ids');
    return response.data;
  },

  getConfiguracoes: async (): Promise<any> => {
    const response = await api.get('/configuracoes');
    return response.data;
  },

  toggleEmpresa: async (data: { id_sienge_empresa: number; nome_empresa?: string; excluir: boolean }): Promise<any> => {
    const response = await api.post('/configuracoes/empresas', data);
    return response.data;
  },

  toggleCentroCusto: async (data: { id_interno_centrocusto: number; nome_centrocusto?: string; excluir: boolean }): Promise<any> => {
    const response = await api.post('/configuracoes/centros-custo', data);
    return response.data;
  },

  toggleTipoDocumento: async (data: { id_documento: string; nome_documento?: string; excluir: boolean }): Promise<any> => {
    const response = await api.post('/configuracoes/tipos-documento', data);
    return response.data;
  },

  getContasCorrente: async (): Promise<ContaCorrenteOption[]> => {
    const response = await api.get<ContaCorrenteOption[]>('/filtros/contas-correntes');
    return response.data;
  },

  toggleContaCorrente: async (data: { id_conta_corrente: string; nome_conta_corrente?: string; excluir: boolean }): Promise<any> => {
    const response = await api.post('/configuracoes/contas-correntes', data);
    return response.data;
  },

  salvarSnapshotCardsPagar: async (dados: {
    data_snapshot: string;
    cards: Array<{
      faixa: string;
      data_inicio: string | null;
      data_fim: string | null;
      valor_total: number;
      quantidade_titulos: number;
      quantidade_credores: number;
    }>;
  }): Promise<any> => {
    const response = await api.post('/snapshots/cards-pagar', dados);
    return response.data;
  },

  listarSnapshotsCardsPagar: async (): Promise<Array<{ data_snapshot: string; created_at: string }>> => {
    const response = await api.get('/snapshots/cards-pagar');
    return response.data;
  },

  getSnapshotCardsPagar: async (data: string): Promise<{
    data_snapshot: string;
    cards: Record<string, {
      faixa: string;
      data_inicio: string | null;
      data_fim: string | null;
      valor_total: number;
      quantidade_titulos: number;
      quantidade_credores: number;
    }>;
  }> => {
    const response = await api.get(`/snapshots/cards-pagar/${data}`);
    return response.data;
  },

  getSnapshotHorario: async (): Promise<{ horario: string; ativo: boolean; updated_at: string | null }> => {
    const response = await api.get('/configuracoes/snapshot-horario');
    return response.data;
  },

  setSnapshotHorario: async (dados: { horario: string; ativo: boolean }): Promise<any> => {
    const response = await api.post('/configuracoes/snapshot-horario', dados);
    return response.data;
  },

  getContasPagasPorOrigem: async (filtros: {
    empresa?: number;
    centro_custo?: number;
    credor?: string;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
    conta_corrente?: string;
    origem_titulo?: string;
    ano?: string;
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<{
    ref_date: string | null;
    origens: Array<{
      origem: string;
      valor_7d: number;
      valor_15d: number;
      valor_30d: number;
      valor_total: number;
    }>;
    total_origens: number;
  }> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.credor) params.append('credor', filtros.credor);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.origem_dado) params.append('origem_dado', filtros.origem_dado);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);
    if (filtros.conta_corrente) params.append('conta_corrente', filtros.conta_corrente);
    if (filtros.origem_titulo) params.append('origem_titulo', filtros.origem_titulo);
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros.data_fim) params.append('data_fim', filtros.data_fim);

    const response = await api.get(`/contas-pagas-por-origem?${params.toString()}`);
    return response.data;
  },

  // Última atualização do banco (fulldump_log)
  getUltimaAtualizacao: async (): Promise<{ data: string | null }> => {
    const response = await api.get('/ultima-atualizacao');
    return response.data;
  },
};
