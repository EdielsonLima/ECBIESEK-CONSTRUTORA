---
name: bi-agente
description: Consulta dados do dashboard BI da ECBIESEK — contas a pagar/receber, realizados, saldos bancarios, vendas, inadimplencia, unidades imobiliarias. Use sempre que a pergunta for sobre numeros financeiros, performance de empreendimentos, fornecedores, clientes, ou qualquer metrica do Sienge/BI.
version: 1.0.0
metadata:
  hermes:
    tags: [BI, ECBIESEK, Sienge, Postgres, financeiro]
---

# Skill: Agente BI ECBIESEK

## Quando usar

Ative esta skill SEMPRE que a pergunta for sobre:
- Contas a pagar/receber, contas pagas/recebidas, contas atrasadas
- Realizados, orcado vs realizado, fluxo de caixa
- Saldos bancarios, contas correntes, posicao consolidada
- Vendas, contratos, parcelas, inadimplencia, extrato de cliente
- Unidades imobiliarias (vendido/disponivel/reservado)
- Centros de custo, empreendimentos, empresas (ECBIESEK, WALE, INOTEC)
- Qualquer numero especifico do dashboard BI

## Scripts executaveis (via shell)

Esta skill expoe duas ferramentas como scripts Python CLI. Execute-as via shell, NAO como tools nativas.

Defina shorthand primeiro (usa o Python do venv Hermes, que tem psycopg2 e httpx):
```bash
BI_SKILL="${HERMES_HOME:-/opt/data}/skills/productivity/bi-agente"
HERMES_PY="/opt/hermes/.venv/bin/python"
SQL_QUERY="$HERMES_PY $BI_SKILL/scripts/sql_query.py"
API_CALL="$HERMES_PY $BI_SKILL/scripts/api_call.py"
```

### `sql_query.py "SELECT ..." [timeout_seconds]`

Executa SELECT read-only no Postgres do BI. stdout retorna JSON com `{rows, rowcount, columns, truncado, duracao_s, limit_injetado}`. stderr + exit 1 em erro.

- Apenas SELECT. DML/DDL rejeitados.
- LIMIT 500 injetado automaticamente se ausente (exceto queries com COUNT/SUM/GROUP BY).
- Timeout padrao 20s (max 60s).
- Resultado truncado em 50KB.

Exemplo:
```bash
$SQL_QUERY "SELECT COUNT(*) FROM contas_a_pagar WHERE data_vencimento >= CURRENT_DATE"
```

### `api_call.py /api/endpoint [params_json]`

Chama endpoint GET do dashboard BI com autenticacao X-API-Key. stdout retorna JSON `{status, data, url}`.

Endpoints na allowlist: `/api/metricas`, `/api/saldos-bancarios`, `/api/saldos-bancarios/detalhe`, `/api/estatisticas-por-mes`, `/api/recebidas-por-mes`, `/api/realizado-por-centro-custo`, `/api/contas-pagas-filtradas`, `/api/contas-receber-filtradas`, `/api/inadimplencia`, `/api/filtros/centros-custo`, `/api/filtros/empresas`, `/api/comercial/vendas-por-cc`, `/api/manual/secoes`.

Exemplos:
```bash
$API_CALL /api/metricas
$API_CALL /api/contas-pagas-filtradas '{"ano":2026,"mes":4}'
```

## Quando SQL vs API

1. **Prefira `api_call`** quando a pergunta bater com um endpoint da allowlist. Os endpoints ja aplicam filtros de empresa excluida, tipos de baixa, etc. — resposta confiavel.

2. **Use `sql_query`** quando:
   - Pergunta e ad-hoc e nao tem endpoint correspondente.
   - Precisa cruzar dados de tabelas que o endpoint nao combina.
   - Usuario pede detalhe granular (ex: "lista dos 10 fornecedores mais frequentes em 2025").

3. **Antes de compor SQL complexo**, consulte o knowledge desta skill:
   ```bash
   cat $BI_SKILL/knowledge/regras-negocio.md  # regras peculiares (CCs duplos, TCs, flags, tipos de baixa)
   cat $BI_SKILL/knowledge/schema.md           # tabelas e colunas relevantes
   cat $BI_SKILL/knowledge/cookbook.md         # queries canonicas testadas
   cat $BI_SKILL/knowledge/empresas-ccs.md     # mapa id_interno vs id_sienge
   ```

4. **Se o resultado vier vazio ou incoerente**, NAO invente. Reporte: "A query retornou 0 linhas — pode ser que [hipotese]. Voce pode me dar mais contexto?"

## Formato da resposta

- Tabelas markdown pequenas (<10 linhas) para listas.
- Valores em BRL: `R$ 1.234.567,89`.
- Inclua unidade/periodo explicitamente quando relevante.
- Ao final, diga a fonte: `_Fonte: api_call /api/metricas_` ou `_SQL: 120 linhas em 0.3s_`.
- Se truncou: avise e sugira como refinar.

## Exemplos

Ver `examples/sessoes-validadas.md` para casos ja testados com SQL + resposta esperada.
