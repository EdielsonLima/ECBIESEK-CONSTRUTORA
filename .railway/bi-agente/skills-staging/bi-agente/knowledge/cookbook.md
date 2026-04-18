# Cookbook — queries canonicas do BI

Cada bloco tem: **pergunta tipica**, **SQL**, **armadilhas**.
Todas as queries foram testadas contra o dashboard de producao.

## 1. Total realizado por centro de custo no ano

**Pergunta**: "Quanto ja foi realizado por CC em 2026?"

```sql
SELECT
    cc.id_sienge_centrocusto AS codigo,
    cc.nome,
    SUM(cp.valor_liquido) AS realizado
FROM contas_pagas cp
JOIN dim_centrocusto cc ON cc.id_interno_centrocusto = cp.id_centrocusto
WHERE cp.id_tipo_baixa IN (1, 10)
    AND cp.data_baixa >= DATE '2026-01-01'
    AND cp.data_baixa < DATE '2027-01-01'
    AND cp.id_interno_empresa NOT IN (SELECT id_interno_empresa FROM config_empresas_excluidas)
GROUP BY 1, 2
ORDER BY realizado DESC;
```

**Armadilhas**: esquecer filtro `id_tipo_baixa IN (1, 10)` infla valor; esquecer `config_empresas_excluidas` inclui empresas inativas.

## 2. Saldo bancario consolidado por empresa

**Pergunta**: "Qual o saldo bancario total da ECBIESEK hoje?"

Preferir API:
```
api_call("/api/saldos-bancarios")
```

SQL fallback (usa posicao_saldos):
```sql
SELECT
    e.nome AS empresa,
    SUM(ps.saldo) AS saldo_total
FROM posicao_saldos ps
JOIN ecadcontacorrente eccc USING (id_conta_corrente)
JOIN dim_empresa e ON e.id_interno_empresa = eccc.id_interno_empresa
WHERE ps.data_saldo = (SELECT MAX(data_saldo) FROM posicao_saldos)
    AND eccc.tipo <> 'MUTUO'  -- excluir contas mutuo
GROUP BY e.nome
ORDER BY saldo_total DESC;
```

**Armadilhas**: `posicao_saldos` pode ter saldo desatualizado; contas MUTUO devem ser excluidas; contas com mesmo nome em empresas diferentes (ex: CAIXA) — sempre agrupar por empresa.

## 3. 5 maiores fornecedores de 2025 por valor pago

```sql
SELECT
    cp.id_credor,
    COUNT(*) AS titulos,
    SUM(cp.valor_liquido) AS total_pago
FROM contas_pagas cp
WHERE cp.id_tipo_baixa IN (1, 10)
    AND cp.data_baixa >= DATE '2025-01-01' AND cp.data_baixa < DATE '2026-01-01'
    AND cp.id_interno_empresa NOT IN (SELECT id_interno_empresa FROM config_empresas_excluidas)
GROUP BY cp.id_credor
ORDER BY total_pago DESC
LIMIT 5;
```

**Nota**: credor e so id nesta tabela — para nome, JOIN com a tabela de credores (consultar schema se necessario).

## 4. Inadimplencia > 60 dias

```sql
SELECT
    cr.cliente,
    COUNT(*) AS parcelas_vencidas,
    SUM(cr.valor_liquido) AS saldo_devedor,
    MIN(cr.data_vencimento) AS mais_antigo
FROM contas_a_receber cr
WHERE cr.data_vencimento < CURRENT_DATE - INTERVAL '60 days'
    AND cr.id_interno_empresa NOT IN (SELECT id_interno_empresa FROM config_empresas_excluidas)
GROUP BY cr.cliente
ORDER BY saldo_devedor DESC
LIMIT 50;
```

## 5. Vendas do mes corrente

```sql
-- Venda = primeira parcela paga; count distinct por (cliente, titulo_sem_parcela)
WITH primeira_parcela AS (
    SELECT
        cr.cliente,
        SPLIT_PART(cr.lancamento, '/', 1) AS titulo,
        MIN(cr.data_recebimento) AS data_venda
    FROM contas_recebidas cr
    WHERE cr.id_interno_empresa NOT IN (SELECT id_interno_empresa FROM config_empresas_excluidas)
    GROUP BY 1, 2
)
SELECT
    DATE_TRUNC('month', data_venda)::date AS mes,
    COUNT(*) AS qtd_vendas
FROM primeira_parcela
WHERE data_venda >= DATE_TRUNC('month', CURRENT_DATE)
    AND data_venda < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
GROUP BY 1;
```

**Nota**: Se precisar contagem simples de unidades vendidas, usar `imovel_unidade.flag_comercial IN ('V','C')` em vez de contas_recebidas.

## 6. Unidades vendidas vs disponiveis por empreendimento

```sql
SELECT
    cc.nome AS empreendimento,
    COUNT(*) FILTER (WHERE iu.flag_comercial IN ('V', 'C')) AS vendidas,
    COUNT(*) FILTER (WHERE iu.flag_comercial = 'D') AS disponiveis,
    COUNT(*) FILTER (WHERE iu.flag_comercial IN ('R', 'A')) AS reservadas,
    COUNT(*) AS total
FROM imovel_unidade iu
JOIN dim_centrocusto cc ON cc.id_interno_centrocusto = iu.id_centrocusto
WHERE cc.ativo = true
GROUP BY cc.nome
ORDER BY total DESC;
```

## 7. Contas a pagar vencendo esta semana

```sql
SELECT
    cp.data_vencimento,
    COUNT(*) AS qtd,
    SUM(cp.valor_total) AS total
FROM contas_a_pagar cp
WHERE cp.data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    AND cp.id_interno_empresa NOT IN (SELECT id_interno_empresa FROM config_empresas_excluidas)
GROUP BY cp.data_vencimento
ORDER BY cp.data_vencimento;
```

## 8. Extrato de cliente

**Pergunta**: "Saldo devedor e historico do cliente X"

```sql
-- Ajuste: ILIKE para busca parcial no nome
WITH alvo AS (
    SELECT DISTINCT cliente FROM contas_a_receber
    WHERE cliente ILIKE '%joao silva%'
    LIMIT 5
)
SELECT
    'a receber' AS tipo, cr.lancamento, cr.valor_liquido, cr.data_vencimento AS data, NULL::date AS data_pagamento
FROM contas_a_receber cr JOIN alvo USING (cliente)
UNION ALL
SELECT 'recebida', cr.lancamento, cr.valor_liquido, cr.data_vencimento, cr.data_recebimento
FROM contas_recebidas cr JOIN alvo USING (cliente)
ORDER BY data;
```

## 9. Top empreendimentos por valor vendido (valor de tabela)

```sql
SELECT
    cc.nome AS empreendimento,
    COUNT(*) AS unidades_vendidas,
    SUM(iu.quantidade_indexador) AS valor_tabela_total
FROM imovel_unidade iu
JOIN dim_centrocusto cc ON cc.id_interno_centrocusto = iu.id_centrocusto
WHERE iu.flag_comercial IN ('V', 'C')
GROUP BY cc.nome
ORDER BY valor_tabela_total DESC
LIMIT 10;
```

## 10. Realizado vs orcado por mes (ano corrente)

```sql
SELECT
    DATE_TRUNC('month', cp.data_baixa)::date AS mes,
    SUM(cp.valor_liquido) AS realizado
FROM contas_pagas cp
WHERE cp.id_tipo_baixa IN (1, 10)
    AND cp.data_baixa >= DATE_TRUNC('year', CURRENT_DATE)
    AND cp.id_interno_empresa NOT IN (SELECT id_interno_empresa FROM config_empresas_excluidas)
GROUP BY 1
ORDER BY 1;
```

---

**Expandir este cookbook conforme aparecem padroes em `log_atividades` com `acao='chat_ia'`** — e como voce melhora o agente sem redeploy: so editar este arquivo e rodar `deploy-skills.sh`.
