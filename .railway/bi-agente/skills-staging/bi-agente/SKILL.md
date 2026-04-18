---
name: bi-agente
description: Consulta dados do dashboard BI da ECBIESEK — contas a pagar/receber, realizados, saldos bancarios, vendas, inadimplencia, unidades imobiliarias. Use sempre que a pergunta for sobre numeros financeiros, performance de empreendimentos, fornecedores, clientes, ou qualquer metrica do Sienge/BI.
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

## Ferramentas

### `sql_query(query, timeout_seconds=20)`

Executa SELECT read-only no Postgres do BI. Retorna `{rows, rowcount, columns, truncado, duracao_s, limit_injetado}`.

- Apenas SELECT. DML/DDL sao rejeitados.
- LIMIT 500 injetado se ausente (exceto queries com COUNT/SUM/GROUP BY).
- Timeout 20s por query.
- Resultado truncado em 50KB.

### `api_call(endpoint, params=None)`

Chama endpoint GET do dashboard BI. Retorna `{status, data, url}`.

Endpoints permitidos (allowlist): `/api/metricas`, `/api/saldos-bancarios`, `/api/saldos-bancarios/detalhe`, `/api/estatisticas-por-mes`, `/api/recebidas-por-mes`, `/api/realizado-por-centro-custo`, `/api/contas-pagas-filtradas`, `/api/contas-receber-filtradas`, `/api/inadimplencia`, `/api/filtros/centros-custo`, `/api/filtros/empresas`, `/api/comercial/vendas-por-cc`, `/api/manual/secoes`.

## Quando SQL vs API

1. **Primeiro preferir `api_call`** quando a pergunta bater com um endpoint da allowlist. Os endpoints ja aplicam filtros de empresa excluida, tipos de baixa, etc. — resposta confiavel.

2. **Usar `sql_query`** quando:
   - Pergunta e ad-hoc e nao tem endpoint correspondente
   - Precisa cruzar dados de tabelas que o endpoint nao combina
   - Usuario pede detalhe granular (ex: "lista dos 10 fornecedores mais frequentes em 2025")

3. **Antes de compor SQL complexo**, consulte:
   - `knowledge/regras-negocio.md` — regras peculiares (CCs duplos, TCs, flag_comercial, tipos de baixa)
   - `knowledge/schema.md` — tabelas e colunas relevantes
   - `knowledge/cookbook.md` — queries canonicas testadas
   - `knowledge/empresas-ccs.md` — mapa id_interno vs id_sienge

4. **Se o resultado vier vazio ou incoerente**, NAO invente. Reporte: "A query retornou 0 linhas — pode ser que [hipotese]. Voce pode me dar mais contexto?"

## Formato da resposta

- Use tabelas markdown pequenas (<10 linhas) para listas
- Formate valores em BRL: `R$ 1.234.567,89`
- Inclua unidade/periodo explicitamente quando relevante
- Ao final, diga de onde veio a informacao: `_Fonte: api_call /api/metricas_` ou `_SQL (0.3s, 42 linhas)_`
- Se truncou: avise e sugira como refinar

## Exemplos

Ver `examples/sessoes-validadas.md` para casos ja testados com SQL + resposta esperada.
