# Mapa de Endpoints — Dashboard Financeiro ECBIESEK

Referência completa de todos os endpoints da API.

---

## Health Check

| Rota | Método | Descrição | Tabelas |
|------|--------|-----------|---------|
| /health | GET | Status do servidor | — |
| /api/health | GET | Status da API do dashboard | — |

## Autenticação

| Rota | Método | Descrição | Tabelas |
|------|--------|-----------|---------|
| /api/auth/register | POST | Registra novo usuário | usuarios (SQLite) |
| /api/auth/login | POST | Login via form | usuarios |
| /api/auth/login-json | POST | Login via JSON | usuarios |
| /api/auth/me | GET | Dados do usuário autenticado | — |
| /api/auth/check | GET | Verifica sessão ativa | — |
| /api/auth/alterar-senha | POST | Altera senha | usuarios |

## Admin

| Rota | Método | Descrição | Tabelas |
|------|--------|-----------|---------|
| /api/admin/usuarios | GET | Lista todos os usuários | usuarios |
| /api/admin/usuarios | POST | Cria novo usuário | usuarios |
| /api/admin/usuarios/{id} | PUT | Altera permissão | usuarios |
| /api/admin/usuarios/{id} | DELETE | Desativa usuário | usuarios |
| /api/admin/atividades | GET | Log de atividades | log_atividades |

## Dashboard Principal

| Rota | Método | Descrição | Tabelas |
|------|--------|-----------|---------|
| /api/metricas | GET | Cards: total pago, a pagar, em atraso | contas_pagas, contas_a_pagar, dim_centrocusto |
| /api/metricas-receber | GET | Cards: recebido, a receber, atrasados | contas_a_receber, contas_recebidas, dim_centrocusto |
| /api/grafico-mensal | GET | Evolução mensal (12 meses) | contas_pagas, contas_a_pagar |
| /api/grafico-categoria | GET | Despesas por plano financeiro | contas_pagas |
| /api/contas | GET | Lista contas filtradas por status | contas_pagas, contas_a_pagar |
| /api/contas-ano | GET | Contas a pagar de um ano | contas_a_pagar |
| /api/proximos-vencimentos | GET | Próximos vencimentos (N dias) | contas_a_pagar |
| /api/ultima-atualizacao | GET | Data da última carga de dados | fulldump_log |

## Contas Pagas

| Rota | Método | Descrição | Tabelas | Filtros auto |
|------|--------|-----------|---------|--------------|
| /api/contas-pagas-filtradas | GET | Lista com filtros múltiplos | contas_pagas, dim_centrocusto | exclusões, origens, tipos_baixa, inter-empresa |
| /api/contas-pagas-por-fornecedor | GET | Agrupado por credor | contas_pagas, dim_centrocusto | exclusões, origens, tipos_baixa, inter-empresa |
| /api/contas-pagas-por-centro-custo | GET | Agrupado por CC (7d/15d/30d/total) | contas_pagas, dim_centrocusto | exclusões, origens, tipos_baixa, inter-empresa |
| /api/contas-pagas-por-origem | GET | Agrupado por origem | contas_pagas | exclusões |
| /api/estatisticas-contas-pagas | GET | Estatísticas gerais | contas_pagas, dim_centrocusto | exclusões, origens, tipos_baixa |
| /api/estatisticas-por-mes | GET | Estatísticas mensais | contas_pagas, dim_centrocusto | exclusões |
| /api/estatisticas-por-empresa | GET | Estatísticas por empresa | contas_pagas, dim_centrocusto | exclusões |
| /api/estatisticas-por-origem | GET | Estatísticas por origem | contas_pagas | exclusões |
| /api/top-credores | GET | Top N credores por volume | contas_pagas, dim_credores | exclusões |
| /api/ranking-credores | GET | Ranking detalhado de credores | contas_pagas, dim_credores | exclusões |
| /api/comparacao-anual | GET | Comparação ano a ano | contas_pagas, contas_a_pagar | exclusões |
| /api/comparacao-mensal | GET | Comparação mês a mês | contas_pagas, contas_a_pagar | exclusões |

## Contas a Receber

| Rota | Método | Descrição | Tabelas |
|------|--------|-----------|---------|
| /api/contas-receber | GET | Lista contas a receber | contas_a_receber, dim_centrocusto |
| /api/contas-recebidas-filtradas | GET | Contas recebidas com filtros | contas_recebidas, dim_centrocusto |
| /api/contas-recebidas-totais | GET | Totais de contas recebidas | contas_recebidas, dim_centrocusto |
| /api/contas-receber-estatisticas | GET | Estatísticas a receber | contas_a_receber, dim_centrocusto |
| /api/contas-recebidas-estatisticas | GET | Estatísticas recebidas | contas_recebidas, dim_centrocusto |
| /api/contas-receber-por-cliente | GET | Agrupado por cliente | contas_a_receber |
| /api/contas-recebidas-por-cliente | GET | Recebidas por cliente | contas_recebidas |
| /api/recebidas-por-mes | GET | Recebidas por mês | contas_recebidas |
| /api/estoque-unidades | GET | Estoque por flag comercial | imovel_unidade |
| /api/extrato-cliente | GET | Extrato completo do cliente (INCC) | contas_a_receber, contas_recebidas, ecadindexhist |
| /api/clientes-lista | GET | Lista de clientes (dropdown) | contas_a_receber |
| /api/titulos-cliente | GET | Títulos de um cliente | contas_a_receber |
| /api/progress-titulos-cliente | GET | Progresso de pagamento | contas_a_receber |

## Painel Executivo

| Rota | Método | Descrição | Tabelas |
|------|--------|-----------|---------|
| /api/painel-executivo | GET | Métricas executivas | contas_pagas, contas_a_receber, imovel_unidade |
| /api/exposicao-executivo | GET | Exposição mensal | contas_pagas, contas_recebidas |
| /api/realizado-por-centro-custo | GET | Realizado por CC (Sienge ID) | contas_pagas, dim_centrocusto |

## KPIs

| Rota | Método | Descrição | Tabelas |
|------|--------|-----------|---------|
| /api/kpis | GET | Lista todos os KPIs | kpis |
| /api/kpis | POST | Cria novo KPI | kpis |
| /api/kpis/{id} | GET | KPI específico | kpis |
| /api/kpis/{id} | PUT | Atualiza KPI | kpis |
| /api/kpis/{id} | DELETE | Exclui KPI | kpis, kpi_historico |
| /api/kpis/{id}/historico | GET | Histórico de valores | kpi_historico |
| /api/kpis/{id}/registrar-valor | POST | Registra valor | kpi_historico |
| /api/kpis/{id}/historico-variacao | GET | Variação diária | kpi_historico |
| /api/kpis-resumo | GET | Resumo de KPIs ativos | kpis, kpi_historico |
| /api/kpis-variacao-diaria | GET | Variação de todos os KPIs | kpis, kpi_historico |
| /api/kpis/snapshot-diario | POST | Snapshot diário automático | kpi_historico |
| /api/calculos-disponiveis | GET | Lista cálculos automáticos | — |
| /api/tipos-documento-kpi | GET | Tipos doc para exclusão | — |

## Centros de Custo

| Rota | Método | Descrição | Tabelas |
|------|--------|-----------|---------|
| /api/centros-custo/todos | GET | Todos os CCs com classificações | dim_centrocusto, centros_custo_classificacoes |
| /api/centros-custo/classificacoes | GET | Classificações salvas | centros_custo_classificacoes |
| /api/centros-custo/classificacoes | POST | Cria/atualiza classificação | centros_custo_classificacoes |
| /api/centros-custo/classificacoes/{id} | PUT | Atualiza classificação | centros_custo_classificacoes |
| /api/centros-custo/classificacoes/{id} | DELETE | Remove classificação | centros_custo_classificacoes |

## Metas por Origem

| Rota | Método | Descrição | Tabelas |
|------|--------|-----------|---------|
| /api/origem-metas | GET | Lista metas | origem_metas |
| /api/origem-metas | POST | Cria meta | origem_metas |
| /api/origem-metas/{id} | PUT | Atualiza meta | origem_metas |
| /api/origem-metas/{id} | DELETE | Remove meta | origem_metas |
| /api/origem-metas/status | GET | Status metas vs realizado | origem_metas, contas_pagas |

## Filtros (Dropdowns)

| Rota | Método | Descrição | Respeita exclusões? |
|------|--------|-----------|---------------------|
| /api/filtros/credores | GET | Credores únicos | Sim |
| /api/filtros/empresas | GET | Empresas ativas | Sim |
| /api/filtros/centros-custo | GET | CCs ativos | Sim |
| /api/filtros/tipos-documento | GET | Tipos doc ativos | Sim |
| /api/filtros/contas-correntes | GET | Contas correntes ativas | Sim |
| /api/filtros/origem-dado | GET | Origens de dados | Não |
| /api/filtros/tipos-baixa | GET | Tipos de baixa | Não |
| /api/filtros/origens-titulo | GET | Origens de título | Não |
| /api/filtros/tipos-baixa-completo | GET | Tipos baixa (completo) | Não |
| /api/filtros/todas-empresas | GET | TODAS as empresas (config) | Não |
| /api/filtros/todos-centros-custo | GET | TODOS os CCs (config) | Não |
| /api/filtros/todos-tipos-documento | GET | TODOS os tipos doc (config) | Não |
| /api/filtros/todas-contas-correntes | GET | TODAS as contas (config) | Não |
| /api/filtros/empresas-recebidas | GET | Empresas (recebíveis) | Sim |
| /api/filtros/centros-custo-recebidas | GET | CCs (recebíveis) | Sim |

## Configurações

| Rota | Método | Descrição |
|------|--------|-----------|
| /api/configuracoes | GET | Todas as exclusões |
| /api/configuracoes/empresas | POST | Toggle exclusão empresa |
| /api/configuracoes/centros-custo | POST | Toggle exclusão CC |
| /api/configuracoes/tipos-documento | POST | Toggle exclusão tipo doc |
| /api/configuracoes/contas-correntes | POST | Toggle exclusão conta |
| /api/configuracoes/origens-exposicao | GET | Config origens exposição |
| /api/configuracoes/origens-exposicao/toggle | POST | Toggle origem |
| /api/configuracoes/origens-exposicao-caixa-siglas | GET | Siglas origens ativas |
| /api/configuracoes/tipos-baixa-exposicao | GET | Config tipos baixa |
| /api/configuracoes/tipos-baixa-exposicao/toggle | POST | Toggle tipo baixa |
| /api/configuracoes/tipos-baixa-exposicao-caixa-ids | GET | IDs tipos baixa ativos |
| /api/configuracoes/titulos-incc-manual | GET | Títulos INCC manual |
| /api/configuracoes/titulos-incc-manual | POST | Toggle INCC manual |
| /api/configuracoes/empreendimentos | GET | Lista empreendimentos |
| /api/configuracoes/empreendimentos | POST | Cria empreendimento |
| /api/configuracoes/empreendimentos/{id} | PUT | Atualiza empreendimento |
| /api/configuracoes/empreendimentos/{id} | DELETE | Remove empreendimento |
| /api/configuracoes/cub | GET | Valor CUB/RO |
| /api/configuracoes/cub | PUT | Atualiza CUB/RO |
| /api/configuracoes/snapshot-horario | GET | Horário snapshot |
| /api/configuracoes/snapshot-horario | POST | Define horário snapshot |

## Snapshots

| Rota | Método | Descrição |
|------|--------|-----------|
| /api/snapshots/cards-pagar | POST | Salva snapshot cards |
| /api/snapshots/cards-pagar | GET | Lista snapshots |
| /api/snapshots/cards-pagar/{data} | GET | Snapshot de uma data |
| /api/snapshots/titulos-pagar | POST | Salva títulos snapshot |
| /api/snapshots/titulos-pagar/{data} | GET | Títulos de um snapshot |
| /api/snapshots/comparar/{data} | GET | Compara snapshot vs atual |

## Diagnóstico e Debug

| Rota | Método | Descrição |
|------|--------|-----------|
| /api/diagnostico/empresas-centros | GET | Empresas → CCs (árvore) |
| /api/debug/tipos-previsao | GET | Tipos doc de previsão |
| /api/debug/empresa-detalhe | GET | Análise de empresa vs PBI |
| /api/debug/diferenca-pbi | GET | Diferença dashboard vs PBI |
| /api/debug/exclusoes | GET | Exclusões ativas + banco config |

## Sienge (API Externa)

| Rota | Método | Descrição |
|------|--------|-----------|
| /api/autorizacoes-bulk | GET | Status autorização (Sienge bulk) |
| /api/titulos-alterados | GET | Títulos alterados por período |
| /api/titulo-detalhe/{id} | GET | Auditoria de título |

## IA

| Rota | Método | Descrição |
|------|--------|-----------|
| /api/ia/chat | POST | Chat com agente financeiro IA |
