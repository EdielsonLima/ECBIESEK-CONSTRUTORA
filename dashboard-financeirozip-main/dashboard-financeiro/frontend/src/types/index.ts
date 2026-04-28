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
  nome_plano_financeiro?: string;
  valor_acrescimo?: number;
  valor_desconto?: number;
  valor_baixa?: number;
  valor_juros?: number;
  dias_atraso?: number;
  is_inter_empresa?: boolean;
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
  codigo?: number;
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

// -------- Saldos Bancários --------
export interface SaldoBancarioRegistro {
  banco: string;
  conta_corrente: string;
  empresa_id: number;
  empresa_nome: string;
  data_movimento: string;
  saldo_anterior: number;
  entrada: number;
  saida: number;
  saldo_atual: number;
}

export interface SaldoBancarioResumo {
  saldo_total: number;
  data_referencia?: string | null;
  empresas: Array<{ empresa_nome: string; empresa_id: number; saldo: number }>;
  contas: Array<{
    empresa_nome: string;
    empresa_id?: number;
    conta_corrente: string;
    banco: string;
    tipo?: 'bancaria' | 'permuta' | 'mutuo' | 'reapropriacao';
    saldo_anterior?: number;
    entrada?: number;
    saida?: number;
    saldo: number;
    saldo_atual?: number;
    valor_conciliado?: number;
    valor_nao_conciliado?: number;
    tem_conciliacao?: boolean;
  }>;
  serie: Array<{ data: string; saldo: number }>;
  cards?: {
    bancario: number;
    permuta: number;
    mutuo: number;
    reapropriacao: number;
    conciliado?: number;
    nao_conciliado?: number;
  };
  conciliacao_sincronizada_em?: string | null;
  tem_dados_conciliacao?: boolean;
}

export interface MovimentoNaoConciliado {
  id: number;
  data: string;
  valor: number;
  tipo_operacao: string;
  operacao: string;
  historico: string;
  documento_tipo: string;
  documento_numero: string;
  credor_cliente: string;
  conciliado: boolean;
}

export interface MovimentosNaoConciliadosResponse {
  movimentos: MovimentoNaoConciliado[];
  total: number;
  data_inicio: string;
  data_fim: string;
  account_number: string;
  company_id: number;
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

export interface EstoqueDetalhe {
  flag: string;
  status: string;
  quantidade: number;
  valor: number;
}

export interface PainelExecutivoData {
  vgv: number;
  total_vendido: number;
  qtd_vendido: number;
  saldo_a_receber: number;
  estoque: number;
  estoque_detalhes: EstoqueDetalhe[];
  qtd_disponivel: number;
  qtd_total_unidades: number;
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
  exposicao_simples: number;
  exposicao_composta: number;
}

export interface EmpreendimentoOption {
  id: number;
  nome: string;
  codigo: string;
}

// ============ PEDIDOS DE COMPRA ============

export interface PedidoCompra {
  id_pedido: number;
  numero_pedido: string | null;
  id_fornecedor: number | null;
  nome_fornecedor: string | null;
  id_empresa: number | null;
  id_obra: number | null;
  id_centro_custo: number | null;
  nome_centro_custo: string | null;
  data_pedido: string | null;
  data_envio: string | null;
  data_autorizacao: string | null;
  status: string | null;
  autorizado: boolean | null;
  reprovado: boolean | null;
  entrega_atrasada: boolean | null;
  valor_total: number | null;
  valor_desconto: number | null;
  valor_acrescimo: number | null;
  valor_frete: number | null;
  id_comprador: number | null;
  notas_internas: string | null;
  proxima_entrega: string | null;
  sincronizado_em: string | null;
}

export interface ItemPedidoCompra {
  numero_item: number;
  codigo_recurso: string | null;
  descricao_recurso: string | null;
  quantidade: number | null;
  preco_unitario: number | null;
  preco_liquido: number | null;
  desconto: number | null;
  acrescimo_pct: number | null;
  icms_pct: number | null;
  ipi_pct: number | null;
  iss_pct: number | null;
  entregas: EntregaItemPedido[];
}

export interface EntregaItemPedido {
  numero_item: number;
  numero_cronograma: number;
  data_prevista: string | null;
  quantidade_prevista: number | null;
  quantidade_entregue: number | null;
  quantidade_aberta: number | null;
}

export interface KPIBucket {
  valor: number;
  qtd: number;
}

export interface PedidosCompraResponse {
  data: PedidoCompra[];
  total: number;
  kpis: {
    pendente: KPIBucket;
    parcialmente_entregue: KPIBucket;
    totalmente_entregue: KPIBucket;
  };
}

export interface PedidosCompraFiltros {
  empresas: { id: number; nome: string }[];
  centros_custo: { id: number; nome: string; codigo?: number | null }[];
  fornecedores: { id: number; nome: string }[];
  anos: number[];
  status: string[];
}

export interface FiltrosPedidoCompraQuery {
  empresa?: number[];
  centro_custo?: number[];
  fornecedor?: number[];
  status?: string[];
  ano?: number;
  autorizacao?: 'todos' | 'autorizados' | 'nao_autorizados';
  busca?: string;
  limite?: number;
  offset?: number;
}
