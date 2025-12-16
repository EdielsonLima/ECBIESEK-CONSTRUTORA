export interface ContaPagar {
  id: number;
  descricao: string | null;
  valor: number;
  valor_total?: number;
  data_vencimento: string;
  data_pagamento?: string;
  status: string;
  fornecedor: string | null;
  credor?: string;
  categoria: string | null;
  observacoes: string | null;
  numero_documento?: string;
  lancamento?: string;
  id_plano_financeiro?: string;
  id_interno_empresa?: number;
  id_interno_centro_custo?: number;
  nome_empresa?: string;
  nome_centrocusto?: string;
  id_documento?: string;
}

export interface EmpresaOption {
  id: number;
  nome: string;
}

export interface CentroCustoOption {
  id: number;
  nome: string;
}

export interface TipoDocumentoOption {
  id: string;
  nome: string;
}

export interface OrigemDadoOption {
  id: string;
  nome: string;
}

export interface TipoBaixaOption {
  id: number;
  nome: string;
}

export interface DashboardMetrics {
  total_pago: number;
  total_a_pagar: number;
  total_em_atraso: number;
  quantidade_pago: number;
  quantidade_a_pagar: number;
  quantidade_em_atraso: number;
}

export interface GraficoMensal {
  mes: string;
  pago: number;
  a_pagar: number;
  em_atraso: number;
}

export interface GraficoPorCategoria {
  categoria: string;
  valor: number;
  quantidade: number;
}

export interface KPI {
  id: number;
  descricao: string;
  categoria?: string;
  indice?: string;
  formula?: string;
  meta?: number;
  tipo_meta?: string;
  unidade?: string;
  ativo: boolean;
  calculo_automatico?: string;
  documentos_excluidos?: string;
  created_at?: string;
  updated_at?: string;
}

export interface KPICreate {
  descricao: string;
  categoria?: string;
  indice?: string;
  formula?: string;
  meta?: number;
  tipo_meta?: string;
  unidade?: string;
  ativo?: boolean;
  calculo_automatico?: string;
  documentos_excluidos?: string;
}

export interface TipoDocumento {
  id: string;
  nome: string;
}

export interface CalculoDisponivel {
  id: string;
  nome: string;
  unidade: string;
}

export interface KPIHistorico {
  id: number;
  kpi_id: number;
  valor: number;
  data_registro: string;
  created_at?: string;
}

export interface KPIResumo {
  id: number;
  descricao: string;
  categoria?: string;
  indice?: string;
  meta?: number;
  tipo_meta?: string;
  unidade?: string;
  ultimo_valor?: number;
  ultima_atualizacao?: string;
  status_meta?: string;
  calculo_automatico?: string;
}

export interface ContaReceber {
  cliente: string;
  id_cliente?: number;
  data_vencimento?: string;
  data_recebimento?: string;
  valor_total: number;
  lancamento?: string;
  numero_documento?: string;
  id_documento?: string;
  id_plano_financeiro?: string;
  id_interno_empresa?: number;
  id_interno_centro_custo?: number;
  nome_empresa?: string;
  nome_centrocusto?: string;
}

export interface MetricasReceber {
  total_recebido: number;
  total_a_receber: number;
  total_em_atraso: number;
  quantidade_recebido: number;
  quantidade_a_receber: number;
  quantidade_em_atraso: number;
}
