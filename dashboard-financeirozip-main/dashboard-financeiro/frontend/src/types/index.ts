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
  id_sienge_empresa?: number;
  nome_empresa?: string;
  nome_centrocusto?: string;
  id_documento?: string;
  id_origem?: string;
}

export interface EmpresaOption {
  id: number;
  nome: string;
}

export interface CentroCustoOption {
  id: number;
  nome: string;
  id_empresa?: number;
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

export interface KPIVariacaoDiaria {
  id: number;
  descricao: string;
  categoria?: string;
  indice?: string;
  meta?: number;
  tipo_meta?: string;
  unidade?: string;
  valor_hoje?: number;
  valor_ontem?: number;
  variacao_absoluta?: number;
  variacao_percentual?: number;
  tendencia?: 'subindo' | 'descendo' | 'estavel';
  status_meta?: string;
  calculo_automatico?: string;
}

export interface KPIHistoricoVariacao {
  data: string;
  valor: number;
  variacao_absoluta?: number;
  variacao_percentual?: number;
  tendencia?: 'subindo' | 'descendo' | 'estavel';
}

export interface KPIHistoricoVariacaoResponse {
  kpi: {
    id: number;
    descricao: string;
    categoria?: string;
    unidade?: string;
    meta?: number;
  };
  historico: KPIHistoricoVariacao[];
}

export interface SnapshotDiarioResponse {
  success: boolean;
  data: string;
  registros_criados: number;
  registros_atualizados: number;
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
  titulo?: string;
  numero_parcela?: string;
  id_tipo_baixa?: number;
}

export interface MetricasReceber {
  total_recebido: number;
  total_a_receber: number;
  total_em_atraso: number;
  quantidade_recebido: number;
  quantidade_a_receber: number;
  quantidade_em_atraso: number;
}

export interface ExtratoClienteHeader {
  cliente: string;
  empresa: string;
  empreendimento: string;
  documento: string;
}

export interface ExtratoClienteParcela {
  titulo: string;
  parcela: number;
  data_vencimento: string | null;
  valor_original: number;
  data_baixa: string | null;
  valor_baixa: number;
  dias_atraso: number;
  status: 'Recebido' | 'Atrasado' | 'A Receber';
}

export interface ExtratoClienteTotais {
  total_original: number;
  total_recebido: number;
  total_a_receber: number;
  total_atrasado: number;
  quantidade_parcelas: number;
}

export interface ExtratoClienteResponse {
  header: ExtratoClienteHeader;
  parcelas: ExtratoClienteParcela[];
  totais: ExtratoClienteTotais;
}

export interface ClienteLista {
  id: string;
  nome: string;
  total_titulos: number;
}

export interface TituloCliente {
  id: string;
  nome: string;
  valor_total: number;
}
