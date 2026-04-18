# Schema BI — tabelas relevantes

Apenas as tabelas mais usadas em analises. Output simplificado para LLM.

## contas_a_pagar

Titulos em aberto (a pagar).

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | int PK | |
| id_interno_empresa | int | FK dim_empresa; filtrar contra config_empresas_excluidas |
| id_centrocusto | int | e o `id_interno_centrocusto` (NAO id_sienge) |
| id_credor | int | FK credor |
| valor_total | numeric | |
| valor_liquido | numeric | apos descontos |
| data_vencimento | date | |
| data_emissao | date | |
| lancamento | text | ex "12345/3" (titulo/parcela) |
| documento | text | |

**Gotchas:**
- `id_centrocusto` e o interno. Para codigo Sienge, JOIN com `dim_centrocusto`.
- Para valor do contrato, combinar com contas_pagas (nao somar so esta tabela).

## contas_pagas

Titulos ja pagos (baixados).

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | int PK | |
| id_interno_empresa | int | |
| id_centrocusto | int | interno |
| id_credor | int | |
| id_tipo_baixa | int | 1=pagamento, 10=adiantamento, 3=cancelamento, 5=substituicao |
| id_conta_corrente | int | FK ecadcontacorrente |
| valor_liquido | numeric | |
| data_baixa | date | data real do pagamento |
| data_vencimento | date | |
| lancamento | text | |

**Gotcha critico**: para "realizado" usar `id_tipo_baixa IN (1, 10)`. Incluir 3 ou 5 infla.

## contas_a_receber

Titulos de vendas em aberto (parcelas futuras).

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | int PK | |
| id_interno_empresa | int | |
| id_centrocusto | int | interno |
| cliente | text | nome do cliente |
| valor_total | numeric | |
| valor_liquido | numeric | |
| data_vencimento | date | |
| lancamento | text | |
| tc | text | PM/FI/PE/PS/RE/AT/PB |

**Gotcha**: 1 venda = varios titulos (TCs diferentes). Para contar vendas, usar imovel_unidade.qtd_vendido.

## contas_recebidas

Parcelas de venda ja pagas.

(similar a contas_a_receber + `data_recebimento`, `id_tipo_baixa`, `id_conta_corrente`)

**Gotcha**: data da venda = MIN(data_recebimento) da primeira parcela paga.

## imovel_unidade

Unidades imobiliarias (lotes, apartamentos, salas).

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | int PK | |
| id_centrocusto | int | interno |
| id_tipo_imovel | int | FK tipo_imovel |
| flag_comercial | char(1) | V/C=vendido, D=disp, R/A=reserva, etc |
| quantidade_indexador | numeric | valor de TABELA (nao do contrato) |
| qtd_vendido | int | |
| numero_unidade | text | |

## dim_centrocusto

| Coluna | Tipo | Notas |
|--------|------|-------|
| id_interno_centrocusto | int PK | usar em queries |
| id_sienge_centrocusto | int | mostrar ao usuario como "codigo" |
| nome | text | |
| id_interno_empresa | int | FK dim_empresa |
| ativo | bool | |

## dim_empresa

| Coluna | Tipo | Notas |
|--------|------|-------|
| id_interno_empresa | int PK | |
| id_sienge_empresa | int | |
| nome | text | ECBIESEK, WALE, INOTEC, ... |
| cnpj | text | |

## ecadcontacorrente

Cadastro de contas correntes bancarias.

| Coluna | Tipo | Notas |
|--------|------|-------|
| id_conta_corrente | int PK | |
| nome_conta_corrente | text | ex "Caixa ECBIESEK", "BB PRD 123" |
| id_interno_empresa | int | |
| tipo | text | CAIXA, PERMUTA, MUTUO, etc |

**Gotcha**: mesmo nome pode aparecer em empresas diferentes (ex: CAIXA). Sempre filtrar por empresa.

## posicao_saldos

Espelho diario do Sienge de saldos por conta corrente. Preferir em vez de calcular via contas_recebidas-contas_pagas.

| Coluna | Tipo | Notas |
|--------|------|-------|
| id_conta_corrente | int | |
| data_saldo | date | |
| saldo | numeric | |

## config_tipos_baixa_exposicao_caixa

| Coluna | Tipo | Notas |
|--------|------|-------|
| id_tipo_baixa | int PK | |
| descricao | text | |
| incluir_exposicao | bool | |

## config_empresas_excluidas

| Coluna | Tipo | Notas |
|--------|------|-------|
| id_interno_empresa | int PK | |
| motivo | text | |
