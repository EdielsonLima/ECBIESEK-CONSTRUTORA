# Regras de Negocio — BI ECBIESEK

Reescrita prescritiva das regras do CLAUDE.md do BI. Cada regra: **SE ... ENTAO ...**.

## Centros de Custo (dim_centrocusto)

**SE** precisa filtrar por CC em contas_a_pagar, contas_a_receber, contas_pagas, contas_recebidas, imovel_unidade → usar `id_interno_centrocusto` (NUNCA `id_sienge_centrocusto`).

**SE** precisa exibir o codigo de CC ao usuario → usar `id_sienge_centrocusto` (o "codigo" que aparece no Sienge).

**SE** o usuario pergunta por CC por nome → JOIN `dim_centrocusto cc ON cc.id_interno_centrocusto = tabela.id_centrocusto`, buscar por `cc.nome ILIKE '%<termo>%'`.

**EXEMPLO**: Lake Boulevard tem `id_interno_centrocusto=19` e `id_sienge_centrocusto=16`. Ao mostrar ao usuario: "16 - Lake Boulevard".

**EXCECAO**: o endpoint `/api/realizado-por-centro-custo` agrupa por `id_sienge_centrocusto` (nao `id_interno`) — unica excecao da API.

## Empresas excluidas

**SE** calcular totais financeiros (realizado, a pagar, recebido, etc.) → FILTRAR OUT empresas em `config_empresas_excluidas`.

```sql
WHERE tabela.id_interno_empresa NOT IN (
    SELECT id_interno_empresa FROM config_empresas_excluidas
)
```

**EXCECAO**: o filtro de CCs (`/api/filtros/centros-custo`) NAO deve excluir empresas — cada user pode ter visao diferente.

## Tipos de Baixa (config_tipos_baixa_exposicao_caixa)

Quando calcular "realizado" ou "contas pagas":

**SE** quer resultado compativel com o dashboard → filtrar por `id_tipo_baixa IN (1, 10)`:
- Tipo 1 = Pagamento
- Tipo 10 = Adiantamento

**NAO inclua**:
- Tipo 3 = Cancelamento (estorna pagamento, infla o total)
- Tipo 5 = Substituicao (gera duplicata)

**EXEMPLO**:
```sql
SELECT SUM(valor_liquido)
FROM contas_pagas cp
WHERE cp.id_tipo_baixa IN (1, 10);
```

## Contratos / Vendas

**SE** pergunta "quantos contratos / unidades foram vendidas" → usar `imovel_unidade.qtd_vendido` agregado. **NUNCA** usar `COUNT(*)` em `contas_a_receber`.

**Motivo**: cada venda gera varios titulos no Sienge (TCs diferentes):
- PM = Parcelas Mensais
- FI = Financiamento
- PE = Parcelas Especiais
- PS = Parcelas Semestrais
- RE = Residuo
- AT = Ato (entrada)
- PB = Parcela Balao

1 venda Lake = ~2 titulos no banco. 118 unidades vendidas → ~225 titulos.

**SE** precisa "valor do contrato" → SOMA de TODAS parcelas do titulo, combinando `contas_a_receber` pendentes + `contas_recebidas` pagas (e NAO o valor de uma parcela unica).

**SE** precisa "data da venda" → usar `MIN(data_recebimento)` da primeira parcela paga em `contas_recebidas`. NUNCA usar `data_vencimento` (pode ser futura).

**Identificador do contrato**: `cliente + SPLIT_PART(lancamento, '/', 1)` — cliente + numero do titulo sem a parcela.

## Unidades imobiliarias (imovel_unidade)

Campo `flag_comercial`:

| Flag | Significado | Como "conta" |
|------|-------------|---------------|
| V | Vendido | Vendido |
| C | Vendido Pre-Contrato | Vendido |
| D | Disponivel | Disponivel |
| R | Reserva Tecnica | Reserva |
| A | Reservada | Reserva |
| P | Permuta | — |
| M | Mutuo | — |
| O | Proposta | — |
| L | Locado | — |
| T | Transferido | — |
| E | Terceiros | — |
| G | Gravame | — |

**SE** conta "vendidos" → `flag_comercial IN ('V', 'C')`.
**SE** conta "disponiveis" → `flag_comercial = 'D'`.
**SE** conta "reservados" → `flag_comercial IN ('R', 'A')`.

Campo `quantidade_indexador` = valor de TABELA da unidade (nao e o valor do contrato).

JOIN com nome do tipo: `JOIN tipo_imovel ti ON ti.id_tipo_imovel = iu.id_tipo_imovel` → `ti.nome` (Lote, Apartamento, etc).

## Saldos bancarios

NAO existe tabela consolidada. Calcular:

```sql
-- Por conta corrente
SELECT
    eccc.nome_conta_corrente,
    COALESCE(SUM(cr.valor_liquido), 0)
        - COALESCE(SUM(cp.valor_liquido) FILTER (WHERE cp.id_tipo_baixa = 1), 0)
    AS saldo
FROM ecadcontacorrente eccc
LEFT JOIN contas_recebidas cr USING (id_conta_corrente)
LEFT JOIN contas_pagas cp USING (id_conta_corrente)
GROUP BY 1;
```

OU melhor: usar `/api/saldos-bancarios` ou tabela `posicao_saldos` (espelho do Sienge, mais rapido).

## Fuso horario

Banco Postgres armazena timestamps em UTC.
Ao exibir ao usuario: converter para `America/Sao_Paulo` (UTC-3) ou Porto Velho (UTC-4, America/Porto_Velho).

```sql
SELECT data_vencimento AT TIME ZONE 'America/Porto_Velho' AS data_local
FROM contas_a_pagar;
```

Ao responder textualmente com datas: `25/12/2026` ou `25 de dezembro de 2026`, nunca ISO.
