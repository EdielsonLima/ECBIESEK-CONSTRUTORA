import axios from 'axios';
import { ContaPagar, TituloDetalhe, DashboardMetrics, GraficoMensal, GraficoPorCategoria, EmpresaOption, CentroCustoOption, TipoDocumentoOption, OrigemDadoOption, TipoBaixaOption, ContaCorrenteOption, OrigemTituloOption, KPI, KPICreate, KPIHistorico, KPIResumo, CalculoDisponivel, TipoDocumento, ContaReceber, MetricasReceber, KPIVariacaoDiaria, KPIHistoricoVariacaoResponse, SnapshotDiarioResponse, PainelExecutivoData, ExposicaoMensal, EmpreendimentoOption, SaldoBancarioResumo, SaldoBancarioRegistro } from '../types';

const API_URL = '/api';

export const api = axios.create({
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
    // So redireciona para login se for 401 em rota protegida (nao na propria rota de login)
    const url = error.config?.url || '';
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/register');
    if (error.response?.status === 401 && !isAuthRoute) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      // So redireciona se nao estiver ja na pagina de login
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
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

  // Detalhes de auditoria de um título (via Sienge)
  getTituloDetalhe: async (tituloId: number): Promise<TituloDetalhe> => {
    const response = await api.get<TituloDetalhe>(`/titulo-detalhe/${tituloId}`);
    return response.data;
  },

  // Autorizações em lote (via Sienge Bulk API)
  getAutorizacoesBulk: async (): Promise<Record<string, string>> => {
    const response = await api.get<Record<string, string>>('/autorizacoes-bulk');
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
    empresa?: number | string;
    centro_custo?: number | string;
    credor?: string;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
    tipo_pagamento?: string;
    conta_corrente?: string;
    origem_titulo?: string;
    plano_financeiro?: string;
    ano?: string;
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
    incluir_inter_empresa?: boolean;
    limite?: number;
    offset?: number;
  }): Promise<{ data: ContaPagar[]; total: number; inter_empresa_ocultas?: { qtd: number; valor: number; incluindo: boolean } }> => {
    const params = new URLSearchParams();
    if (filtros.empresa) params.append('empresa', filtros.empresa.toString());
    if (filtros.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros.credor) params.append('credor', filtros.credor);
    if (filtros.id_documento) params.append('id_documento', filtros.id_documento);
    if (filtros.origem_dado) params.append('origem_dado', filtros.origem_dado);
    if (filtros.tipo_baixa) params.append('tipo_baixa', filtros.tipo_baixa);
    if (filtros.tipo_pagamento) params.append('tipo_pagamento', filtros.tipo_pagamento);
    if (filtros.conta_corrente) params.append('conta_corrente', filtros.conta_corrente);
    if (filtros.origem_titulo) params.append('origem_titulo', filtros.origem_titulo);
    if (filtros.plano_financeiro) params.append('plano_financeiro', filtros.plano_financeiro);
    if (filtros.ano) params.append('ano', filtros.ano);
    if (filtros.mes) params.append('mes', filtros.mes);
    if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros.data_fim) params.append('data_fim', filtros.data_fim);
    if (filtros.incluir_inter_empresa) params.append('incluir_inter_empresa', 'true');
    if (filtros.limite) params.append('limite', filtros.limite.toString());
    if (filtros.offset) params.append('offset', filtros.offset.toString());

    const response = await api.get<{ data: ContaPagar[]; total: number; inter_empresa_ocultas?: { qtd: number; valor: number; incluindo: boolean } }>(`/contas-pagas-filtradas?${params.toString()}`);
    return response.data;
  },

  // Contas pagas agrupadas por fornecedor
  getContasPagasPorFornecedor: async (filtros: {
    empresa?: number | string;
    centro_custo?: number | string;
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
    empresa?: number | string;
    centro_custo?: number | string;
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

  // Filtros - Tipos de Pagamento
  getTiposPagamento: async (): Promise<Array<{ id: number; nome: string }>> => {
    const response = await api.get<Array<{ id: number; nome: string }>>('/filtros/tipos-pagamento');
    return response.data;
  },

  // Feriados
  getFeriados: async (ano?: number): Promise<Array<{ id: number; data: string; descricao: string }>> => {
    const params = ano ? { ano } : {};
    const response = await api.get<Array<{ id: number; data: string; descricao: string }>>('/feriados', { params });
    return response.data;
  },

  addFeriado: async (data: string, descricao: string): Promise<{ success: boolean }> => {
    const response = await api.post<{ success: boolean }>('/feriados', { data, descricao });
    return response.data;
  },

  deleteFeriado: async (id: number): Promise<{ success: boolean }> => {
    const response = await api.delete<{ success: boolean }>(`/feriados/${id}`);
    return response.data;
  },

  // Filtros - Planos Financeiros
  getPlanosFinanceiros: async (): Promise<Array<{ id: string; nome: string }>> => {
    const response = await api.get<Array<{ id: string; nome: string }>>('/filtros/planos-financeiros');
    return response.data;
  },

  // Filtros - Tipos de Baixa
  getTiposBaixa: async (): Promise<TipoBaixaOption[]> => {
    const response = await api.get<TipoBaixaOption[]>('/filtros/tipos-baixa');
    return response.data;
  },

  // Estatísticas Contas Pagas
  getEstatisticasContasPagas: async (filtros: {
    empresa?: number | string;
    centro_custo?: number | string;
    credor?: string;
    id_documento?: string;
    origem_dado?: string;
    tipo_baixa?: string;
    ano?: string;
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
    incluir_inter_empresa?: boolean;
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
    if (filtros.incluir_inter_empresa) params.append('incluir_inter_empresa', 'true');

    const response = await api.get(`/estatisticas-contas-pagas?${params.toString()}`);
    return response.data;
  },

  // Estatísticas por mês
  getEstatisticasPorMes: async (filtros: {
    empresa?: number | string;
    centro_custo?: number | string;
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
    centro_custo?: number | string;
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
    empresa?: number | string;
    centro_custo?: number | string;
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
    empresa?: number | string;
    centro_custo?: number | string;
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
    empresa?: number | string;
    centro_custo?: number | string;
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
    empresa?: number | string;
    centro_custo?: number | string;
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
    empresa?: number | string;
    centro_custo?: number | string;
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
    empresa?: number | string;
    centro_custo?: number | string;
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
    empresa?: number | string;
    centro_custo?: number | string;
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
    empresa?: number | string;
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
    empresa?: number | string;
    centro_custo?: number | string;
    ano?: string;
    mes?: string;
    id_documento?: string;
  }): Promise<{
    quantidade_titulos: number;
    valor_total: number;
    valor_total_corrigido?: number;
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
    empresa?: number | string;
    centro_custo?: number | string;
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
    empresa?: number | string;
    centro_custo?: number | string;
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
    empresa?: number | string;
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
      parcela_display: string;
      tipo_condicao: string;
      data_vencimento: string | null;
      valor_nominal: number;
      correcao_monetaria: number;
      valor_corrigido: number;
      saldo_atual: number;
      acrescimo: number;
      desconto: number;
      data_baixa: string | null;
      valor_baixa: number;
      dias_atraso: number;
      status: string;
      indice: string;
    }>;
    totais: {
      total_nominal: number;
      total_correcao: number;
      total_corrigido: number;
      total_original: number;
      total_recebido: number;
      total_a_receber: number;
      total_atrasado: number;
      total_acrescimo: number;
      total_saldo_atual: number;
      quantidade_parcelas: number;
    };
    calculo_incc_manual: boolean;
    titulos_incc_manual: string[];
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

  // Toggle cálculo INCC manual por título
  toggleTituloInccManual: async (cliente: string, titulo: string, manual: boolean): Promise<{ success: boolean }> => {
    const response = await api.post('/configuracoes/titulos-incc-manual', { cliente, titulo, manual });
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
    empresa?: number | string;
    centro_custo?: number | string;
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
  getTodosCentrosCusto: async (empresa?: number | string): Promise<Array<{
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

  getSaldosContasDisponiveis: async (): Promise<Array<{ id: string; nome: string; empresa_id: number; empresa_nome: string }>> => {
    try {
      const response = await api.get<Array<{ id: string; nome: string; empresa_id: number; empresa_nome: string }>>('/saldos-bancarios/contas-disponiveis');
      return Array.isArray(response.data) ? response.data : [];
    } catch (err) {
      console.error('[saldos/contas-disponiveis] erro:', err);
      return [];
    }
  },

  // Saldos bancários
  getSaldosResumo: async (empresaIds: number[] = [], contaIds: string[] = [], data?: string): Promise<SaldoBancarioResumo> => {
    const params = new URLSearchParams();
    if (empresaIds.length) params.append('empresas', empresaIds.join(','));
    if (contaIds.length) params.append('contas', contaIds.join(','));
    if (data) params.append('data', data);
    try {
      const response = await api.get<SaldoBancarioResumo>(`/saldos-bancarios?${params.toString()}`);
      const d = response.data || ({} as SaldoBancarioResumo);
      return {
        saldo_total: typeof d.saldo_total === 'number' ? d.saldo_total : 0,
        data_referencia: d.data_referencia ?? null,
        empresas: Array.isArray(d.empresas) ? d.empresas : [],
        contas: Array.isArray(d.contas) ? d.contas : [],
        serie: Array.isArray(d.serie) ? d.serie : [],
        cards: d.cards || { bancario: 0, permuta: 0, mutuo: 0, reapropriacao: 0 },
      };
    } catch (err) {
      console.error('[saldos-bancarios] erro:', err);
      return {
        saldo_total: 0,
        data_referencia: null,
        empresas: [],
        contas: [],
        serie: [],
        cards: { bancario: 0, permuta: 0, mutuo: 0, reapropriacao: 0 },
      };
    }
  },

  getSaldosDetalhe: async (empresaIds: number[] = [], contaIds: string[] = []): Promise<SaldoBancarioRegistro[]> => {
    const params = new URLSearchParams();
    if (empresaIds.length) params.append('empresas', empresaIds.join(','));
    if (contaIds.length) params.append('contas', contaIds.join(','));
    try {
      const response = await api.get<SaldoBancarioRegistro[]>(`/saldos-bancarios/detalhe?${params.toString()}`);
      return Array.isArray(response.data) ? response.data : [];
    } catch (err) {
      console.error('[saldos-bancarios/detalhe] erro:', err);
      return [];
    }
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

  // Snapshot detalhado (títulos individuais)
  salvarSnapshotTitulos: async (dados: { data_snapshot: string; titulos: any[] }): Promise<any> => {
    const response = await api.post('/snapshots/titulos-pagar', dados);
    return response.data;
  },

  getSnapshotTitulos: async (data: string): Promise<any[]> => {
    const response = await api.get(`/snapshots/titulos-pagar/${data}`);
    return response.data;
  },

  compararSnapshot: async (data: string): Promise<any> => {
    const response = await api.get(`/snapshots/comparar/${data}`);
    return response.data;
  },

  // Títulos alterados (via Sienge /bills/by-change-date)
  getTitulosAlterados: async (dataInicio: string, dataFim: string): Promise<any[]> => {
    const response = await api.get(`/titulos-alterados?data_inicio=${dataInicio}&data_fim=${dataFim}`);
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
    empresa?: number | string;
    centro_custo?: number | string;
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

  // === Painel Executivo ===

  // CUB RO carregado dinamicamente do backend (config DB)
  _cubRO: 2334.56, // fallback
  _fatorMultiplicador: 1,
  // centro_custo_id: ID do centro de custo no Sienge (para filtrar dados por obra)
  _empreendimentos: [] as Array<{ id: number; nome: string; codigo: string; metragem: number; vgv_mock: number; centro_custo_id: number | null; centro_custo_id_interno: number | null; fator: number }>,

  loadEmpreendimentos: async () => {
    try {
      // Carrega CUB do backend
      try {
        const resCub = await api.get('/configuracoes/cub');
        if (resCub.data?.valor) apiService._cubRO = resCub.data.valor;
      } catch (_) { /* usa fallback */ }
      const res = await api.get('/configuracoes/empreendimentos');
      const data = res.data;
      apiService._empreendimentos = [
        { id: 0, nome: 'Consolidado', codigo: 'ALL', metragem: 0, vgv_mock: 0, centro_custo_id: null, centro_custo_id_interno: null, fator: 1 },
        ...data.map((e: any) => ({
          id: e.id,
          nome: e.nome,
          codigo: e.codigo,
          metragem: e.metragem || 0,
          vgv_mock: e.vgv_mock || 0,
          centro_custo_id: e.centro_custo_id,           // Sienge ID (para /realizado-por-centro-custo)
          centro_custo_id_interno: e.centro_custo_id_interno || null, // Interno (para filtros de outros endpoints)
          fator: e.fator || 1,
        }))
      ];
    } catch (err) {
      console.error('Erro ao carregar empreendimentos do config:', err);
      // Fallback hardcoded caso o backend ainda não tenha a tabela
      if (apiService._empreendimentos.length === 0) {
        apiService._empreendimentos = [
          { id: 0, nome: 'Consolidado', codigo: 'ALL', metragem: 0, vgv_mock: 0, centro_custo_id: null, centro_custo_id_interno: null, fator: 1 },
          { id: 1, nome: 'Lake Boulevard', codigo: 'LKB', metragem: 25392.42, vgv_mock: 120000000, centro_custo_id: 16, centro_custo_id_interno: 19, fator: 1 },
          { id: 2, nome: 'Buenos Aires', codigo: 'BUA', metragem: 18000, vgv_mock: 85000000, centro_custo_id: null, centro_custo_id_interno: null, fator: 1 },
          { id: 3, nome: 'Imperial Residence', codigo: 'IMP', metragem: 12000, vgv_mock: 45000000, centro_custo_id: null, centro_custo_id_interno: null, fator: 1 },
          { id: 4, nome: 'BIE 3', codigo: 'BIE3', metragem: 8000, vgv_mock: 30000000, centro_custo_id: null, centro_custo_id_interno: null, fator: 1 },
          { id: 5, nome: 'BIE 4', codigo: 'BIE4', metragem: 5500, vgv_mock: 20000000, centro_custo_id: null, centro_custo_id_interno: null, fator: 1 },
          { id: 6, nome: 'Valenca', codigo: 'VAL', metragem: 9000, vgv_mock: 12000000, centro_custo_id: null, centro_custo_id_interno: null, fator: 1 },
          { id: 7, nome: 'Lagunas Residencial Clube', codigo: 'LAG', metragem: 7000, vgv_mock: 8000000, centro_custo_id: null, centro_custo_id_interno: null, fator: 1 },
        ];
      }
    }
  },

  getEmpreendimentos: async (): Promise<EmpreendimentoOption[]> => {
    if (apiService._empreendimentos.length <= 1) {
      await apiService.loadEmpreendimentos();
    }
    return apiService._empreendimentos.map(e => ({ id: e.id, nome: e.nome, codigo: e.codigo }));
  },

  getPainelExecutivo: async (empreendimentoId: number, tiposBaixa?: number[]): Promise<PainelExecutivoData> => {
    // Orcamento = CUB x fator x metragem (formula do Edielson)
    // Load empreendimentos from config DB if not loaded yet
    if (apiService._empreendimentos.length <= 1) {
      await apiService.loadEmpreendimentos();
    }
    const emp = apiService._empreendimentos.find(e => e.id === empreendimentoId);
    let metragem: number;
    let fatorConsolidado: number;
    if (empreendimentoId === 0) {
      const ativos = apiService._empreendimentos.filter(e => e.id > 0);
      metragem = ativos.reduce((sum, e) => sum + e.metragem, 0);
      const totalMetragem = ativos.reduce((sum, e) => sum + e.metragem, 0);
      fatorConsolidado = totalMetragem > 0
        ? ativos.reduce((sum, e) => sum + e.fator * e.metragem, 0) / totalMetragem
        : 1;
    } else {
      metragem = emp?.metragem ?? 0;
      fatorConsolidado = emp?.fator ?? 1;
    }
    const orcamento_total = Math.round(apiService._cubRO * fatorConsolidado * metragem);
    // centro_custo_id = Sienge ID (para /realizado-por-centro-custo)
    // centro_custo_id_interno = ID interno BD (para todos os outros endpoints)
    const ccIdInterno = emp?.centro_custo_id_interno;

    // Busca saldo a receber FILTRADO por centro de custo (usa ID interno)
    const filtrosReceber: { centro_custo?: number | string } = {};
    if (ccIdInterno) filtrosReceber.centro_custo = ccIdInterno;
    const estatReceber = await apiService.getEstatisticasContasReceber(filtrosReceber);
    const saldo_a_receber = estatReceber.valor_total_corrigido ?? estatReceber.valor_total; // saldo atual corrigido por indexador

    // Estoque = unidades disponíveis (flag_comercial = 'D') da tabela imovel_unidade
    const paramsEstoque: Record<string, string> = {};
    if (ccIdInterno) paramsEstoque.centro_custo = ccIdInterno.toString();
    const resEstoque = await api.get('/estoque-unidades', { params: paramsEstoque });
    const estoqueData = resEstoque.data;
    const estoque = estoqueData.estoque_disponivel ?? 0;
    // VGV = Vendido + Estoque (todas as unidades do empreendimento)
    const vgv = estoqueData.total_geral ?? 0;

    const anos = '2023,2024,2025,2026';

    // --- REALIZADO: usa /realizado-por-centro-custo (mesmos filtros da Contas Pagas e aba Orçamento) ---
    const ccIdSienge = emp?.centro_custo_id;
    let realizado = 0;
    try {
      const realizadoParams: Record<string, string> = {};
      if (tiposBaixa && tiposBaixa.length > 0) realizadoParams.tipo_baixa = tiposBaixa.join(',');
      const resRealizado = await api.get('/realizado-por-centro-custo', { params: realizadoParams });
      const realizadoMap = resRealizado.data;
      if (empreendimentoId === 0) {
        // Consolidado: soma todos os centros de custo
        realizado = Object.values(realizadoMap).reduce((s: number, v: any) => s + (v.valor_liquido || 0), 0);
      } else if (ccIdSienge) {
        const ccData = realizadoMap[String(ccIdSienge)];
        realizado = ccData?.valor_liquido || 0;
      }
    } catch { /* fallback */ }

    // --- EXPOSICAO: pago e recebido apenas com filtro de centro de custo ---
    // Sem filtros de origens/tipos_baixa para refletir o fluxo de caixa real
    const paramsExposicao: Record<string, string> = { ano: anos };
    if (ccIdInterno) paramsExposicao.centro_custo = ccIdInterno.toString();

    const [resPago, resRecebido] = await Promise.all([
      api.get('/estatisticas-por-mes', { params: paramsExposicao }),
      api.get('/recebidas-por-mes', { params: paramsExposicao }),
    ]);

    const pagos: Array<{ mes: string; valor: number }> = resPago.data;
    const recebidos: Array<{ mes: string; valor: number }> = resRecebido.data;
    const totalPago = pagos.reduce((s, p) => s + p.valor, 0);
    const totalRecebido = recebidos.reduce((s, r) => s + r.valor, 0);

    const saldo_a_realizar = Math.max(0, orcamento_total - realizado);

    // Valor do Empreendimento = Saldo a Receber + Estoque - Saldo a Realizar
    const valor_empreendimento = saldo_a_receber + estoque - saldo_a_realizar;

    // Exposicao de caixa — mesma logica da pagina ExposicaoCaixa.tsx
    // Taxa 1.5% a.m. (padrao da ExposicaoCaixa)
    const TAXA_MENSAL = 1.5;
    let acumulado = 0;
    let jurosAcumulados = 0;

    const recebidoMap: Record<string, number> = {};
    const pagoMap: Record<string, number> = {};
    recebidos.forEach(r => { recebidoMap[r.mes] = r.valor; });
    pagos.forEach(p => { pagoMap[p.mes] = p.valor; });

    const todosMeses = new Set([...Object.keys(recebidoMap), ...Object.keys(pagoMap)]);
    const mesesOrdenados = Array.from(todosMeses).sort();

    let picoExposicao = 0; // pico negativo do acumulado
    let picoExposicaoAjustada = 0; // pico da exposicao + juros compostos

    mesesOrdenados.forEach(mes => {
      const rec = recebidoMap[mes] ?? 0;
      const pag = pagoMap[mes] ?? 0;
      const resultadoMensal = rec - pag;
      acumulado += resultadoMensal;
      const exposicaoNegativa = Math.min(0, acumulado);

      if (exposicaoNegativa < 0) {
        // Composto: (|exposicao| + juros anteriores) * taxa
        const baseLancamento = Math.abs(exposicaoNegativa) + jurosAcumulados;
        const custoMensalComposto = baseLancamento * (TAXA_MENSAL / 100);
        jurosAcumulados += custoMensalComposto;

        const exposicaoAjustada = Math.abs(exposicaoNegativa) + (jurosAcumulados - custoMensalComposto);
        if (exposicaoAjustada > picoExposicaoAjustada) picoExposicaoAjustada = exposicaoAjustada;
      } else {
        jurosAcumulados = 0; // zera quando acumulado volta a positivo
      }

      if (exposicaoNegativa < picoExposicao) picoExposicao = exposicaoNegativa;
    });

    // Exposicao simples = pico negativo do acumulado (valor absoluto)
    const exposicaoSimples = Math.abs(picoExposicao);
    // Exposicao composta = pico da exposicao ajustada (com juros compostos)
    const exposicaoComposta = picoExposicaoAjustada;

    return {
      vgv,
      saldo_a_receber,
      estoque,
      estoque_detalhes: estoqueData.detalhes ?? [],
      qtd_disponivel: estoqueData.qtd_disponivel ?? 0,
      qtd_total_unidades: estoqueData.qtd_geral ?? 0,
      realizado,
      orcamento_total,
      saldo_a_realizar,
      valor_empreendimento,
      saldo_acumulado: exposicaoSimples,
      exposicao_simples: exposicaoSimples,
      exposicao_composta: exposicaoComposta,
    };
  },

  getExposicaoExecutivo: async (empreendimentoId: number): Promise<ExposicaoMensal[]> => {
    // Dados reais: apenas filtro de centro de custo (sem origens/tipos)
    // Consistente com os cards do painel executivo
    if (apiService._empreendimentos.length <= 1) {
      await apiService.loadEmpreendimentos();
    }
    const anos = '2023,2024,2025,2026';
    const params: Record<string, string> = { ano: anos };

    const emp = apiService._empreendimentos.find(e => e.id === empreendimentoId);
    // IMPORTANTE: usar ID INTERNO (não o Sienge), porque /estatisticas-por-mes
    // e /recebidas-por-mes filtram por id_interno_centro_custo
    if (emp?.centro_custo_id_interno) {
      params.centro_custo = emp.centro_custo_id_interno.toString();
    }

    const [resPago, resRecebido] = await Promise.all([
      api.get('/estatisticas-por-mes', { params }),
      api.get('/recebidas-por-mes', { params }),
    ]);

    const pagos: Array<{ mes: string; mes_nome: string; valor: number }> = resPago.data;
    const recebidos: Array<{ mes: string; valor: number }> = resRecebido.data;

    const recebidoMap: Record<string, number> = {};
    recebidos.forEach(r => { recebidoMap[r.mes] = r.valor; });
    const pagoMap: Record<string, number> = {};
    pagos.forEach(p => { pagoMap[p.mes] = p.valor; });

    const todosMeses = new Set([...Object.keys(recebidoMap), ...Object.keys(pagoMap)]);
    const mesesOrdenados = Array.from(todosMeses).sort();

    const MESES_NOME = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const TAXA_MENSAL = 1.5;
    let acumulado = 0;
    let jurosAcumulados = 0;
    let picoExposicaoSimples = 0; // pico (maior valor) de exposicao simples ate o momento
    let picoExposicaoComposta = 0; // pico de exposicao composta ate o momento

    return mesesOrdenados.map(mes => {
      const [ano, mesNum] = mes.split('-');
      const periodo = `${MESES_NOME[parseInt(mesNum) - 1]}/${ano.slice(2)}`;
      const recebido = recebidoMap[mes] ?? 0;
      const pago = pagoMap[mes] ?? 0;
      acumulado += recebido - pago;

      // Exposicao simples no mes = acumulado invertido (positivo = empresa exposta)
      const exposicaoSimplesMes = -acumulado;

      // Pico acumulado: a cada mes, mantem o maior valor de exposicao ja atingido
      // Isso garante que o ultimo ponto do grafico bate com o card "Exposicao Simples"
      if (exposicaoSimplesMes > picoExposicaoSimples) {
        picoExposicaoSimples = exposicaoSimplesMes;
      }

      // Exposicao composta: aplica juros sobre exposicao acumulada
      const exposicaoNegativa = Math.min(0, acumulado);
      if (exposicaoNegativa < 0) {
        const base = Math.abs(exposicaoNegativa) + jurosAcumulados;
        jurosAcumulados += base * (TAXA_MENSAL / 100);
      } else {
        jurosAcumulados = 0;
      }
      const exposicaoCompostaMes = exposicaoSimplesMes + jurosAcumulados;
      if (exposicaoCompostaMes > picoExposicaoComposta) {
        picoExposicaoComposta = exposicaoCompostaMes;
      }

      return {
        periodo,
        mes_key: mes,
        recebido,
        pago,
        saldo_acumulado: acumulado,
        // Retorna o PICO ACUMULADO (curva sempre crescente que bate com o card)
        exposicao_simples: picoExposicaoSimples,
        exposicao_composta: picoExposicaoComposta,
      };
    });
  },

  getOrcamentoPorEmpreendimento: async (tiposBaixa?: number[]): Promise<{
    cubValor: number;
    cubReferencia: string;
    empreendimentos: Array<{
      id: number;
      nome: string;
      fator: number;
      metragem: number;
      orcamento: number;
      realizado: number;
      a_realizar: number;
      percentual_realizado: number;
      status: string;
    }>;
    totais: { orcamento: number; realizado: number; a_realizar: number };
  }> => {
    if (apiService._empreendimentos.length <= 1) {
      await apiService.loadEmpreendimentos();
    }
    const cubValor = apiService._cubRO;
    let cubReferencia = '';
    try {
      const resCub = await api.get('/configuracoes/cub');
      if (resCub.data?.referencia) cubReferencia = resCub.data.referencia;
    } catch (_) {}

    const emps = apiService._empreendimentos.filter(e => e.id > 0);

    // Busca realizado por CC em uma única chamada (com tipos_baixa opcional)
    let realizadoMap: Record<string, number> = {};
    try {
      const realizadoParams: Record<string, string> = {};
      if (tiposBaixa && tiposBaixa.length > 0) realizadoParams.tipo_baixa = tiposBaixa.join(',');
      const res = await api.get('/realizado-por-centro-custo', { params: realizadoParams });
      realizadoMap = Object.fromEntries(
        Object.entries(res.data).map(([k, v]: [string, any]) => [k, v.valor_liquido || 0])
      );
    } catch { /* fallback vazio */ }

    const realizados = emps.map(emp =>
      emp.centro_custo_id ? (realizadoMap[String(emp.centro_custo_id)] || 0) : 0
    );

    // Busca config de empreendimentos para status
    let configEmps: any[] = [];
    try {
      const res = await api.get('/configuracoes/empreendimentos');
      configEmps = res.data;
    } catch (_) {}

    const resultado = emps.map((emp, i) => {
      const orcamento = Math.round(cubValor * (emp.fator || 1) * (emp.metragem || 0));
      const realizado = realizados[i];
      const a_realizar = Math.max(0, orcamento - realizado);
      const percentual_realizado = orcamento > 0 ? (realizado / orcamento) * 100 : 0;
      const configEmp = configEmps.find((c: any) => c.id === emp.id);
      const status = configEmp?.status || 'ativa';
      return {
        id: emp.id,
        nome: emp.nome,
        fator: emp.fator || 1,
        metragem: emp.metragem || 0,
        orcamento,
        realizado,
        a_realizar,
        percentual_realizado,
        status,
      };
    });

    const totais = {
      orcamento: resultado.reduce((s, e) => s + e.orcamento, 0),
      realizado: resultado.reduce((s, e) => s + e.realizado, 0),
      a_realizar: resultado.filter(e => e.status === 'ativa').reduce((s, e) => s + e.a_realizar, 0),
    };

    return { cubValor, cubReferencia, empreendimentos: resultado, totais };
  },

  // Comercial
  getTiposImovel: async () => {
    const response = await api.get('/comercial/tipos-imovel');
    return response.data;
  },
  getComercialDashboard: async (filtros?: { centro_custo?: number; tipo_imovel?: number; ano?: number }) => {
    const params = new URLSearchParams();
    if (filtros?.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros?.tipo_imovel) params.append('tipo_imovel', filtros.tipo_imovel.toString());
    if (filtros?.ano) params.append('ano', filtros.ano.toString());
    const response = await api.get(`/comercial/dashboard?${params.toString()}`);
    return response.data;
  },
  getComercialPorCliente: async (filtros?: { centro_custo?: number; ano?: number }) => {
    const params = new URLSearchParams();
    if (filtros?.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros?.ano) params.append('ano', filtros.ano.toString());
    const response = await api.get(`/comercial/por-cliente?${params.toString()}`);
    return response.data;
  },
  getComercialContratos: async (filtros?: { centro_custo?: number; cliente?: string; ano?: number; limite?: number }) => {
    const params = new URLSearchParams();
    if (filtros?.centro_custo) params.append('centro_custo', filtros.centro_custo.toString());
    if (filtros?.cliente) params.append('cliente', filtros.cliente);
    if (filtros?.ano) params.append('ano', filtros.ano.toString());
    if (filtros?.limite) params.append('limite', filtros.limite.toString());
    const response = await api.get(`/comercial/contratos?${params.toString()}`);
    return response.data;
  },

  // Usuários Online
  enviarHeartbeat: async (data: { user_id: number; user_nome: string; user_email: string; user_permissao: string }) => {
    const response = await api.post('/heartbeat', data);
    return response.data;
  },
  getUsuariosOnline: async () => {
    const response = await api.get('/usuarios-online');
    return response.data;
  },
  removerHeartbeat: async (userId: number) => {
    const response = await api.delete(`/heartbeat/${userId}`);
    return response.data;
  },

  // Solicitações de Melhorias
  getSolicitacoes: async () => {
    const response = await api.get('/solicitacoes');
    return response.data;
  },
  criarSolicitacao: async (data: { titulo: string; descricao: string; secao: string; prioridade: string; usuario_nome: string; usuario_email: string; imagem?: string | null }) => {
    const response = await api.post('/solicitacoes', data);
    return response.data;
  },
  atualizarSolicitacao: async (id: number, data: Record<string, string>) => {
    const response = await api.put(`/solicitacoes/${id}`, data);
    return response.data;
  },
  deletarSolicitacao: async (id: number) => {
    const response = await api.delete(`/solicitacoes/${id}`);
    return response.data;
  },
  validarSolicitacao: async (id: number, data: { aprovado: boolean; aprovado_por: string; comentario?: string }) => {
    const response = await api.post(`/solicitacoes/${id}/validar`, data);
    return response.data;
  },

  // ============ MANUAL DO USUARIO ============
  getManual: async (): Promise<{ secoes: import('../types/manual').ManualSecao[] }> => {
    try {
      const response = await api.get('/manual');
      return response.data || { secoes: [] };
    } catch (err) {
      console.error('[manual] erro:', err);
      return { secoes: [] };
    }
  },

  criarSecaoManual: async (data: { slug: string; titulo: string; icone?: string; ordem?: number; apenas_admin?: boolean }) => {
    const response = await api.post('/manual/secoes', data);
    return response.data;
  },

  editarSecaoManual: async (id: number, data: Partial<{ slug: string; titulo: string; icone: string; ordem: number; apenas_admin: boolean; ativo: boolean }>) => {
    const response = await api.put(`/manual/secoes/${id}`, data);
    return response.data;
  },

  excluirSecaoManual: async (id: number) => {
    const response = await api.delete(`/manual/secoes/${id}`);
    return response.data;
  },

  criarArtigoManual: async (data: { secao_id: number; slug: string; titulo: string; resumo?: string; conteudo_md: string; ordem?: number }) => {
    const response = await api.post('/manual/artigos', data);
    return response.data;
  },

  editarArtigoManual: async (id: number, data: Partial<{ secao_id: number; slug: string; titulo: string; resumo: string; conteudo_md: string; ordem: number; ativo: boolean }>) => {
    const response = await api.put(`/manual/artigos/${id}`, data);
    return response.data;
  },

  excluirArtigoManual: async (id: number) => {
    const response = await api.delete(`/manual/artigos/${id}`);
    return response.data;
  },

  seedManual: async () => {
    const response = await api.post('/manual/seed', {});
    return response.data;
  },
};

// ============ WHATSAPP SERVICE ============

export interface WhatsappConfig {
  id?: number;
  base_url: string;
  api_key?: string;
  api_key_mascarada?: string;
  instance_name: string;
  horario: string;
  ativo: boolean;
  dias_antecedencia: string;
  somente_dias_uteis: boolean;
  atualizado_em?: string;
}

export interface WhatsappDestinatario {
  id?: number;
  nome: string;
  telefone: string;
  alerta_vencimentos: boolean;
  alerta_inadimplencia: boolean;
  alerta_saldo_bancario: boolean;
  ativo: boolean;
  created_at?: string;
}

export interface WhatsappLog {
  id: number;
  tipo: string;
  destinatario_nome?: string;
  destinatario_telefone: string;
  mensagem: string;
  sucesso: boolean;
  resposta_api?: string;
  enviado_em: string;
}

export const whatsappService = {
  getConfig: async (): Promise<WhatsappConfig> => {
    const r = await api.get('/whatsapp/config');
    return r.data;
  },
  salvarConfig: async (config: Partial<WhatsappConfig>) => {
    const r = await api.put('/whatsapp/config', config);
    return r.data;
  },
  listarDestinatarios: async (): Promise<WhatsappDestinatario[]> => {
    const r = await api.get('/whatsapp/destinatarios');
    return r.data;
  },
  criarDestinatario: async (dados: Omit<WhatsappDestinatario, 'id' | 'created_at'>) => {
    const r = await api.post('/whatsapp/destinatarios', dados);
    return r.data;
  },
  atualizarDestinatario: async (id: number, dados: Omit<WhatsappDestinatario, 'id' | 'created_at'>) => {
    const r = await api.put(`/whatsapp/destinatarios/${id}`, dados);
    return r.data;
  },
  deletarDestinatario: async (id: number) => {
    const r = await api.delete(`/whatsapp/destinatarios/${id}`);
    return r.data;
  },
  testar: async (telefone: string, mensagem?: string) => {
    const r = await api.post('/whatsapp/testar', { telefone, mensagem });
    return r.data as { sucesso: boolean; resposta: string };
  },
  preview: async (dias: number) => {
    const r = await api.get(`/whatsapp/preview-vencimentos?dias=${dias}`);
    return r.data as { dias: number; quantidade: number; total: number; mensagem: string };
  },
  dispararVencimentos: async (dias_antecedencia?: string) => {
    const r = await api.post('/whatsapp/disparar-vencimentos', { dias_antecedencia });
    return r.data as { enviados: number; erros: string[]; dias: number[] };
  },
  listarLogs: async (limite = 100): Promise<WhatsappLog[]> => {
    const r = await api.get(`/whatsapp/logs?limite=${limite}`);
    return r.data;
  },
};

// ============ VALIDACAO SERVICE ============

export const validacaoService = {
  getPaginas: async () => {
    const response = await api.get('/validacao/paginas');
    return response.data;
  },
  validarPagina: async (pageId: string, notes?: string) => {
    const response = await api.post(`/validacao/paginas/${pageId}/validar`, { notes });
    return response.data;
  },
  getCheckpoints: async (pageId: string) => {
    const response = await api.get(`/validacao/checkpoints/${pageId}`);
    return response.data;
  },
  criarCheckpoint: async (data: {
    page_id: string;
    checkpoint_label: string;
    endpoint: string;
    query_params: Record<string, string>;
    expected_values: Record<string, unknown>;
    tolerance_pct?: number;
  }) => {
    const response = await api.post('/validacao/checkpoints', data);
    return response.data;
  },
  deletarCheckpoint: async (id: number) => {
    const response = await api.delete(`/validacao/checkpoints/${id}`);
    return response.data;
  },
  verificar: async (pageId?: string) => {
    const response = await api.post('/validacao/verificar', pageId ? { page_id: pageId } : {});
    return response.data;
  },
  getEndpointsDisponiveis: async () => {
    const response = await api.get('/validacao/endpoints-disponiveis');
    return response.data as Record<string, string[]>;
  },
  // Chama um endpoint de dados com parametros para capturar valores
  capturarValores: async (endpoint: string, params: Record<string, string>) => {
    const queryStr = new URLSearchParams(params).toString();
    const url = endpoint.replace('/api/', '/') + (queryStr ? `?${queryStr}` : '');
    const response = await api.get(url);
    return response.data;
  },
};
