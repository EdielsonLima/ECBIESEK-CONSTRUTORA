# Design — Painel Executivo

**Data:** 2026-03-16
**Branch:** eloi-biesek
**Origem:** Reuniao alinhamento painel executivo e IA (Eloi + Edielson, 2026-03-16)

## Contexto

Painel executivo para visao macro de 5 minutos — modelo mental do Eloi Carlos.
"Conta de padeiro": VGV - orcamento a realizar = valor do empreendimento.
Tela completa com dados mock onde nao houver endpoint, servindo como spec visual pro Edielson.

## Decisoes

- Pagina nova e independente (nao expande ExposicaoCaixa existente)
- Visao consolidada por padrao, com filtro por empreendimento
- Todos os cards do mesmo tamanho, sem hierarquia visual
- Abordagem single-page: cards + grafico, sem abas

## Layout

```
Header: "Painel Executivo"  +  [Filtro Empreendimento: Consolidado]

Row 1: [VGV] [Realizado] [Orcamento Total] [Saldo a Realizar]
Row 2: [Valor Empreend.] [Saldo Acumulado] [Exposicao Simples] [Exposicao Composta]

Grafico: LineChart acumulado (Recebido vs Pago vs Saldo Acumulado)
```

## Cards — 8 indicadores

| # | Card | Calculo | Cor | Icone | Fonte |
|---|------|---------|-----|-------|-------|
| 1 | VGV | estoque + vendas | blue | DollarSign | Mock |
| 2 | Realizado | total contas pagas | green | CheckCircle | API existente |
| 3 | Orcamento Total | orcamento completo | slate | FileText | Mock |
| 4 | Saldo a Realizar | orcamento - realizado | orange | Clock | Mock (calculado) |
| 5 | Valor do Empreendimento | VGV - saldo a realizar | indigo | Building | Mock (calculado) |
| 6 | Saldo Acumulado | capital aportado | purple | Wallet | API existente |
| 7 | Exposicao Simples | capital investido | red | TrendingDown | API existente |
| 8 | Exposicao Composta | c/ custo oportunidade | rose | Calculator | API existente |

## Componentes

- Filtro: SearchableSelect existente (Consolidado + empreendimentos)
- Cards: MetricCard existente
- Grafico: LineChart Recharts com 3 linhas
- Exportacao PDF: utilitarios existentes (pdfExport.ts)

## Dados mock (referencia Lake Boulevard)

- VGV: R$ 120.000.000
- Realizado: R$ 43.000.000
- Orcamento: R$ 58.000.000
- Serie mensal: 36 meses (mar/2023 a mar/2026)

## Integracao

- Arquivo: src/pages/PainelExecutivo.tsx
- Rota: 'painel-executivo' no App.tsx
- Menu: item no grupo Financeiro do Sidebar.tsx (icone LayoutDashboard)
- API: novos metodos em api.ts com fallback mock
- Tipos: novas interfaces em types/index.ts
