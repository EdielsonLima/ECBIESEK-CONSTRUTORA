# Fluxo de Dados — Dashboard Financeiro ECBIESEK

Documento de referência que explica de onde vem cada valor exibido em cada página do sistema.

---

## 1. Dashboard (Página Inicial)

### Cards — Contas a Pagar
| Valor | Fonte | Endpoint | Tabelas |
|-------|-------|----------|---------|
| Total Pago | SUM(valor_liquido) | GET /api/metricas | contas_pagas |
| Total A Pagar | SUM(valor_total) | GET /api/metricas | contas_a_pagar |
| Total Em Atraso | SUM(valor_total) WHERE vencimento < hoje | GET /api/metricas | contas_a_pagar |

### Cards — Contas a Receber
| Valor | Fonte | Endpoint | Tabelas |
|-------|-------|----------|---------|
| Total Recebido | SUM(valor_liquido) | GET /api/metricas-receber | contas_recebidas |
| Total A Receber | SUM(valor_total) | GET /api/metricas-receber | contas_a_receber |
| Total Atrasados | SUM(valor_total) WHERE vencimento < hoje | GET /api/metricas-receber | contas_a_receber |

### Gráficos
| Gráfico | Endpoint | Descrição |
|---------|----------|-----------|
| Evolução Mensal | GET /api/grafico-mensal | Últimos 12 meses: pago, a pagar, em atraso |
| Despesas por Categoria | GET /api/grafico-categoria | Top 8 categorias por plano financeiro |

### Filtros automáticos aplicados
- Exclusões de empresas, centros de custo, tipos de documento (config)
- **Não** aplica filtro de origens ou tipos_baixa

---

## 2. Contas Pagas

### Visão por Centro de Custo
| Valor | Fonte | Endpoint |
|-------|-------|----------|
| Líquido 7d | SUM(valor_liquido) últimos 7 dias | GET /api/contas-pagas-por-centro-custo |
| Líquido 15d | SUM(valor_liquido) últimos 15 dias | (mesmo) |
| Líquido 30d | SUM(valor_liquido) últimos 30 dias | (mesmo) |
| Líquido Total | SUM(valor_liquido) sem filtro de data | (mesmo) |

### Visão por Fornecedor
| Valor | Fonte | Endpoint |
|-------|-------|----------|
| Líquido Total | SUM(valor_liquido) | GET /api/contas-pagas-por-fornecedor |
| Qtd Títulos | COUNT(DISTINCT SPLIT_PART(lancamento, '/', 1)) | (mesmo) |

### Filtros automáticos aplicados
1. Exclusões gerais (empresas, CCs, docs, contas correntes)
2. Origens excluídas (`config_origens_exposicao_caixa` WHERE incluir=false OR paginas NOT LIKE '%contas_pagas%'`)
3. Tipos de baixa permitidos (`config_tipos_baixa_exposicao_caixa` WHERE incluir=1 AND paginas LIKE '%contas_pagas%'`)
4. Transferências inter-empresa (credor NOT IN nomes de empresas do grupo)

### Filtros opcionais do usuário
empresa, centro_custo, credor, id_documento, origem_dado, tipo_baixa, conta_corrente, origem_titulo, ano, mês, data_inicio, data_fim

---

## 3. Contas a Pagar

### Cards
| Valor | Fonte | Endpoint |
|-------|-------|----------|
| Total | SUM(valor_total) | GET /api/metricas |
| Quantidade | COUNT(*) | (mesmo) |

### Filtros automáticos
- Exclusões gerais (empresas, CCs, docs)
- Classificação por centro de custo (centros_custo_classificacoes)

### Filtros opcionais do usuário
empresa, centro_custo, credor, ano, mês, tipo_documento, data_inicio, data_fim

---

## 4. Contas Atrasadas

### Métricas
| Valor | Fonte | Endpoint |
|-------|-------|----------|
| Qtd Títulos | COUNT(*) WHERE vencimento < hoje | GET /api/contas (status=em_atraso) |
| Valor Total | SUM(valor_total) | (mesmo) |
| Dias Atraso | hoje - data_vencimento | calculado no frontend |

### Agrupamentos
- Por Credor, Por Empresa, Por Centro de Custo
- Faixas de atraso: 1-7d, 8-15d, 16-30d, 31-60d, 61-90d, +90d

---

## 5. Contas a Receber

### Métricas
| Valor | Fonte | Endpoint |
|-------|-------|----------|
| Total A Receber | SUM(valor_total) | GET /api/contas-receber-estatisticas |
| Quantidade | COUNT(*) | (mesmo) |
| Valor Médio | AVG(valor_total) | (mesmo) |

---

## 6. Contas Recebidas

### Métricas
| Valor | Fonte | Endpoint |
|-------|-------|----------|
| Líquido Total | SUM(valor_liquido) | GET /api/contas-recebidas-totais |
| Quantidade | COUNT(*) | (mesmo) |

### Filtros automáticos
- Exclusões gerais

---

## 7. Inadimplência (Recebimentos Atrasados)

### Métricas
| Valor | Fonte | Endpoint |
|-------|-------|----------|
| Total Atrasado | SUM(valor_total) WHERE vencimento < hoje | GET /api/contas-receber (status=atrasado) |
| Qtd Títulos | COUNT(*) | (mesmo) |

---

## 8. Extrato Cliente

### Dados
| Valor | Fonte | Endpoint |
|-------|-------|----------|
| Valor Nominal | parcela.valor_nominal | GET /api/extrato-cliente |
| Correção Monetária | cálculo INCC via ecadindexhist | (mesmo) |
| Valor Corrigido | nominal × fator_correcao | (mesmo) |
| Saldo | corrigido - recebido | (mesmo) |

### Índice INCC
- Fonte: tabela `ecadindexhist` (histórico de índices)
- Cálculo: fator_correcao = indice_atual / indice_base
- Títulos marcados como "INCC manual" em `config_titulos_incc_manual` usam cálculo alternativo

---

## 9. Painel Executivo > Aba Geral

### Métricas
| Valor | Fonte | Endpoint |
|-------|-------|----------|
| VGV | Soma de preços das unidades | GET /api/painel-executivo |
| Saldo a Receber | contas_a_receber pendentes | (mesmo) |
| Estoque | Unidades disponíveis × preço | (mesmo) |
| Realizado | SUM(contas_pagas.valor_liquido) | (mesmo) |
| Exposição Simples | Recebido - Pago (acumulado mensal) | GET /api/exposicao-executivo |
| Exposição Composta | Exposição com juros compostos | (mesmo) |

---

## 10. Painel Executivo > Aba Orçamento

### Realizado
- **Fonte**: tabela `contas_pagas`, coluna `valor_liquido`
- **Endpoint**: `GET /api/realizado-por-centro-custo`
- **Chave**: `id_sienge_centrocusto` (código Sienge, NÃO o id interno)
- **Agrupamento**: SUM(valor_liquido) GROUP BY id_sienge_centrocusto
- **Filtros aplicados** (mesmos da página Contas Pagas):
  1. Exclusões gerais (empresas, CCs, docs, contas correntes)
  2. Origens excluídas (config_origens_exposicao_caixa)
  3. Tipos baixa permitidos (config_tipos_baixa_exposicao_caixa)
  4. Transferências inter-empresa (credor NOT IN nomes de empresas)
- **Deve bater com**: Líquido Total da página Contas Pagas para o mesmo centro de custo
- **Mapeamento**: empreendimentos_config.centro_custo_id = id_sienge_centrocusto

### Orçamento
- **Fórmula**: CUB × Fator × M²
- **CUB**: valor do CUB/RO carregado de `GET /api/configuracoes/cub`
- **Fator**: campo `fator` em `empreendimentos_config` (editável em Configurações > Orçamentos)
- **M²**: campo `metragem` em `empreendimentos_config` (editável em Configurações > Orçamentos)
- **Calculado no**: frontend (api.ts, função getOrcamentoPorEmpreendimento)

### À Realizar
- **Fórmula**: MAX(0, Orçamento - Realizado)
- **Calculado no**: frontend (api.ts)

### % Realizado
- **Fórmula**: (Realizado / Orçamento) × 100
- **Calculado no**: frontend (api.ts)

---

## 11. Exposição de Caixa

### Dados mensais
| Valor | Fonte | Endpoint |
|-------|-------|----------|
| Recebido (mês) | SUM(contas_recebidas.valor_liquido) | GET /api/exposicao-caixa |
| Pago (mês) | SUM(contas_pagas.valor_liquido) | (mesmo) |
| Saldo Acumulado | Σ(Recebido - Pago) acumulado | calculado no backend |

### Filtros automáticos
- Origens incluídas para exposição (config_origens_exposicao_caixa WHERE incluir=true AND paginas LIKE '%exposicao%')
- Tipos de baixa (config_tipos_baixa_exposicao_caixa WHERE incluir=1 AND paginas LIKE '%exposicao%')

---

## 12. KPIs

### Tipos de cálculo automático
| Cálculo | Fonte |
|---------|-------|
| total_pago_mes | SUM(contas_pagas.valor_liquido) do mês atual |
| total_a_pagar | SUM(contas_a_pagar.valor_total) pendentes |
| total_em_atraso | SUM(contas_a_pagar.valor_total) vencidas |
| total_recebido_mes | SUM(contas_recebidas.valor_liquido) do mês atual |
| total_a_receber | SUM(contas_a_receber.valor_total) pendentes |

### Snapshots
- Valores são registrados diariamente via `POST /api/kpis/snapshot-diario`
- Histórico armazenado em `kpi_historico` (data + valor)

---

## Configurações que afetam os valores

### Exclusões (afetam TODAS as páginas)
| Config | Tabela | Efeito |
|--------|--------|--------|
| Empresas excluídas | config_empresas_excluidas | Remove todos os dados dessa empresa |
| Centros de custo excluídos | config_centros_custo_excluidos | Remove dados desse CC |
| Tipos documento excluídos | config_tipos_documento_excluidos | Remove títulos desse tipo |
| Contas correntes excluídas | config_contas_correntes_excluidas | Remove títulos dessa conta |

### Filtros por página (afetam páginas específicas)
| Config | Tabela | Efeito |
|--------|--------|--------|
| Origens por página | config_origens_exposicao_caixa | Controla quais origens aparecem em cada página |
| Tipos baixa por página | config_tipos_baixa_exposicao_caixa | Controla quais tipos de baixa aparecem em cada página |

---

## Bancos de dados

| Banco | Uso | Conexão |
|-------|-----|---------|
| PostgreSQL (ecbiesek) | Dados financeiros do Sienge | host: 8iv70o.easypanel.host:42128 |
| SQLite (ecbiesek_config.db) | Configurações locais, usuários | arquivo local no servidor |
| PostgreSQL (config, se CONFIG_DB_URL) | Configurações em produção (Railway) | variável de ambiente |
