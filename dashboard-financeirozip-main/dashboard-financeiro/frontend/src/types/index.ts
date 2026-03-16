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
  numero_parcela?: number;
  data_cadastro?: string;
  descricao_observacao?: string;
  data_emissao?: string;
  flautorizacao?: string;
}

export interface TituloDetalhe {
  titulo_id: number;
  numero_documento?: string;
  numero_parcela?: number;
  id_origem?: string;
  origem_nome?: string;
  id_documento?: string;
  data_cadastro?: string;
  data_vencimento?: string;
  credor?: string;
  valor_total?: number;
  lancamento?: string;
  // Dados do Sienge
  registeredBy?: string;
  registeredDate?: string;
  changedBy?: string;
  changedDate?: string;
  issueDate?: string;
  billDate?: string;
  observation?: string;
  authorizationStatus?: string;
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

export interface ContaCorrenteOption {
  id: string;
  nome: string;
  empresa_id: number;
}

export interface OrigemTituloOption {
  id: number;
  sigla: string;
  descricao: string;
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
  tipo_condicao?: string;
  indexador?: string;
  saldo_atual?: number;
  valor_acrescimo?: number;
  valor_desconto?: number;
  valor_baixa?: number;
  status_recebimento?: string;
  dias_atraso_recebimento?: number;
}

export interface ProgressTitulo {
  titulo: string;
  total_parcelas: number;
  parcelas_recebidas: number;
  valor_contrato: number;
  valor_recebido: number;
  percentual: number;
  tipo_condicao: string;
  tipo_condicao_desc: string;
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

export interface PainelExecutivoData {
  vgv: number;
  realizado: number;
  orcamento_total: number;
  saldo_a_realizar: number;
  valor_empreendimento: number;
  saldo_acumulado: number;
  exposicao_simples: number;
  exposicao_composta: number;
}

export interface ExposicaoMensal {
  periodo: string;
  mes_key: string;
  recebido: number;
  pago: number;
  saldo_acumulado: number;
}

export interface EmpreendimentoOption {
  id: number;
  nome: string;
  codigo: string;
}
