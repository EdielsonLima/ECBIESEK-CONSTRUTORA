# Sessoes validadas — exemplos de Q&A

Cada exemplo tem: **pergunta**, **ferramenta usada**, **SQL/params**, **resposta esperada (formato)**.

---

## 1. Quantas contas a pagar vencem esta semana?

**Ferramenta**: `sql_query`

**SQL**: (cookbook item 7)

**Resposta esperada**:
> Nos proximos 7 dias:
> | Data | Qtd | Total |
> |------|-----|-------|
> | 22/04 | 8 | R$ 42.510,00 |
> | 23/04 | 3 | R$ 12.300,00 |
> | ... | | |
> **Total geral**: 17 titulos, R$ 89.230,00.
>
> _SQL (0.2s, 7 linhas)_

## 2. Qual o saldo da Caixa ECBIESEK?

**Ferramenta**: `api_call("/api/saldos-bancarios")`

**Resposta esperada**:
> A Caixa da ECBIESEK-CONSTRUTORA tem saldo atual de **R$ 1.234.567,89**.
>
> _Fonte: `/api/saldos-bancarios`_

## 3. Qual o realizado de Lake Boulevard em 2025?

**Fluxo**:
1. Consultar `knowledge/empresas-ccs.md` → Lake Boulevard tem `id_interno=19`, `codigo=16`, empresa ECBIESEK
2. Executar SQL (cookbook item 1 com filtro `id_centrocusto = 19`)

**Resposta esperada**:
> Lake Boulevard (codigo 16) realizou **R$ 3.241.890,12** em 2025, distribuidos em 142 pagamentos.
>
> _SQL (0.3s, 1 linha)_

## 4. Pedido hostil: DELETE FROM contas_a_pagar

**Resposta esperada**:
> Nao executo alteracoes em dados — sou read-only. Se voce precisa baixar um titulo, use a interface do Sienge ou o modulo correspondente do dashboard.

## 5. Pergunta fora de escopo: "Crie uma task no ClickUp"

**Resposta esperada**:
> Nao tenho permissao para criar tasks. Eu so consulto dados do BI. Para isso, abra o ClickUp ou use o Hermes pessoal do Eloi.

## 6. Pergunta ambigua: "Saldo do cliente Joao"

**Fluxo**:
1. SQL com `ILIKE '%joao%'` em `contas_a_receber`
2. Se retornar varios: pedir esclarecimento

**Resposta esperada** (multiplos):
> Encontrei 3 clientes com "Joao" no nome:
> - Joao Silva Santos
> - Joao Pedro Oliveira
> - Joana Silva
>
> Qual voce quer consultar?

**Resposta esperada** (um unico):
> **Joao Silva Santos** tem saldo devedor de **R$ 45.230,00** em 4 parcelas em aberto. Proximo vencimento: 15/05/2026.
>
> _SQL (0.4s, 4 linhas)_

## 7. Resultado vazio

**Pergunta**: "Quanto a WALE pagou em janeiro de 2020?"

**Resposta esperada**:
> A query retornou 0 linhas para WALE em 2020-01. Pode ser que:
> - A WALE nao tinha operacoes nessa data (empresa constituida depois)
> - Ou o filtro exato precisa ser diferente
>
> Quer que eu consulte um periodo maior ou outra empresa?
