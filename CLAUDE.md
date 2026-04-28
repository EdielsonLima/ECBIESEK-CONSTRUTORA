# ECBIESEK-CONSTRUTORA - Dashboard Financeiro

## Projeto
Dashboard financeiro React 18 + TypeScript + Tailwind CSS (frontend) com FastAPI + PostgreSQL (backend). Deploy automático via Railway ao push para main.

## Regras
- Sempre fazer commit + push após mudanças (deploy é automático via Railway)
- Idioma do código: português (nomes de variáveis, comentários, commits)
- **IMPORTANTE**: Sempre que descobrir uma nova regra de negócio, mapeamento de tabela, ou comportamento específico do sistema/Sienge, **adicionar à seção "Regras de Negócio" do CLAUDE.md** para preservar o conhecimento entre sessões.

## Regras de Negócio

### Centros de Custo (dim_centrocusto)
- Tem **dois IDs** para cada centro:
  - `id_interno_centrocusto`: ID interno do banco local (usado em queries de `contas_a_receber`, `contas_a_pagar`, `contas_recebidas`, `imovel_unidade`)
  - `id_sienge_centrocusto`: ID do Sienge (mostrado ao usuário como "código")
- **Mapeamento**: o frontend mostra `id_sienge` mas o filtro envia `id_interno` para o backend
- **Exemplo**: Lake Boulevard tem `id_interno=19`, `id_sienge=16` → usuário vê "16 - Lake Boulevard"
- Sempre que mostrar código de CC ao usuário, usar `id_sienge_centrocusto`
- Para queries no banco, usar sempre `id_interno_centrocusto`
- O filtro de CC **não deve filtrar por empresa excluída** (já corrigido em /filtros/centros-custo)
- **ATENÇÃO**: ao chamar endpoints como `/estatisticas-por-mes`, `/recebidas-por-mes`, `/contas-pagas-filtradas`, etc, o parâmetro `centro_custo` deve ser o **id_interno** (campo `centro_custo_id_interno` em empreendimentos_config), NUNCA o id_sienge. O endpoint `/realizado-por-centro-custo` é a exceção - ele agrupa por id_sienge.

### Unidades Imobiliárias (imovel_unidade)
- Campo `flag_comercial` define o status da unidade:
  - **`V`** = Vendido
  - **`C`** = Vendido Pré-Contrato (também conta como vendido)
  - **`D`** = Disponível
  - **`R`** = Reserva Técnica
  - **`A`** = Reservada (também conta como reserva)
  - **`P`** = Permuta
  - **`M`** = Mútuo
  - **`O`** = Proposta
  - **`L`** = Locado
  - **`T`** = Transferido
  - **`E`** = Terceiros
  - **`G`** = Gravame
- Campo `quantidade_indexador` = valor de tabela da unidade (não é o valor real do contrato)
- Campo `id_tipo_imovel` → JOIN com tabela `tipo_imovel` para obter nome (Lote, Apartamento, etc)

### Contratos / Vendas (contas_a_receber + contas_recebidas)
- **REGRA CRÍTICA**: No Sienge, **cada venda gera múltiplos títulos** (TC = Tipo de Condição):
  - **PM**: Parcelas Mensais
  - **FI**: Financiamento (geralmente parcela única grande)
  - **PE**: Parcelas Especiais
  - **PS**: Parcelas Semestrais
  - **RE**: Resíduo
  - **AT**: Ato (entrada)
  - **PB**: Parcela Balão
- **Exemplo**: 1 venda no Lake = ~2 títulos no banco. 118 unidades vendidas → ~225 títulos
- **Por isso**: para contar contratos use `qtd_vendido` de `imovel_unidade`, NÃO `COUNT(*)` em `contas_a_receber`
- **Valor do contrato** = SOMA de TODAS as parcelas do título (combinar `contas_a_receber` pendentes + `contas_recebidas` pagas), NÃO o valor de uma parcela única
- **Data da venda** = `MIN(data_recebimento)` da primeira parcela paga em `contas_recebidas`. Não usar `data_vencimento` (que pode ser futura)
- Identificador do contrato no banco: `cliente + SPLIT_PART(lancamento, '/', 1)` (cliente + número do título sem a parcela)

### Tipos de Baixa (config_tipos_baixa_exposicao_caixa)
- Configuração que define quais tipos de baixa entram nos cálculos de Realizado/Contas Pagas:
  - **Tipo 1 - Pagamento**: incluir
  - **Tipo 10 - Adiantamento**: incluir
  - **Tipo 3 - Cancelamento**: NÃO incluir (estorna pagamento)
  - **Tipo 5 - Substituição**: NÃO incluir (gera duplicata)
  - **Tipo 8 - Abatimento de Adiantamento**: avaliar
- Sem essa configuração, valores ficam inflados (incluem cancelamentos)
- O endpoint `/api/realizado-por-centro-custo` aceita parâmetro `tipo_baixa` (override) - usado pelo Painel Executivo para garantir que o card "Realizado" bata com o "Líquido Total" da página Contas Pagas
- O filtro do Painel Executivo é persistido em `localStorage.painel_exec_tipos_baixa`

### Empresas Excluídas
- Algumas empresas estão excluídas via `config_empresas_excluidas` por motivo administrativo
- Empresas excluídas: dados delas NÃO aparecem nos painéis financeiros
- **MAS**: o filtro de centros de custo NÃO deve excluir CCs de empresas excluídas (cada usuário pode ter visão diferente)

### Saldos Bancários
- O banco **NÃO** tem tabela de saldo bancário consolidado
- Saldo por conta corrente = `SUM(contas_recebidas.valor_liquido) - SUM(contas_pagas.valor_liquido WHERE id_tipo_baixa=1)`
- Tabela `ecadcontacorrente` (id_conta_corrente, nome_conta_corrente, id_interno_empresa) tem o cadastro
- Joins: `cp.id_conta_corrente = eccc.id_conta_corrente`
- Endpoints: `/api/saldos-bancarios` e `/api/saldos-bancarios/detalhe`

### Conciliacao Bancaria (Sienge API)
- **Origem dos dados**: API do Sienge, dois endpoints:
  - `GET /accounts-balances` (REST v1): retorna `amount` (saldo total) + `reconciledAmount` (valor ja conciliado) por conta/empresa/data
  - `GET /bank-movement` (Bulk API): movimentos individuais com flag `bankMovementReconcile` ('S' ou 'N') + suporta `onlyDetachedMovement=S` para filtrar movimentos sem titulo vinculado
- **Tabela local**: `saldos_conciliacao` (CONFIG_DB) — chave `(data_referencia, account_number, company_id)` com `saldo_total` + `valor_conciliado`
- **Sync**: roda 1x/dia dentro do `_auto_snapshot_loop` (apos snapshot de cards) + botao manual "Sincronizar conciliação" na pagina Saldos Bancarios
- **Endpoints**:
  - `POST /api/saldos-bancarios/sincronizar-conciliacao?data=YYYY-MM-DD` — forca sync
  - `GET /api/saldos-bancarios/movimentos-nao-conciliados?account_number=X&company_id=Y&apenas_nao_vinculados=true` — drill-down dos movimentos pendentes
- **Calculo de "Nao Conciliado"** = `saldo_atual` (de `posicao_saldos`) - `valor_conciliado` (do Sienge)
- **JOIN entre tabelas**: `posicao_saldos.id_conta_corrente` (string) <-> `saldos_conciliacao.account_number` (string); `id_interno_empresa` -> `id_sienge_empresa` via `dim_centrocusto`. O merge é feito em Python (não SQL) porque as tabelas estão em bancos diferentes (DB_CONFIG vs CONFIG_DB)
- **Importante**: ajustes de conciliacao devem ser feitos no proprio Sienge (modulo Conciliacao Bancaria). O dashboard apenas mostra o status
- **Permissao 403 na API**: o endpoint `/accounts-balances` exige liberacao explicita no painel admin do Sienge para o usuario da API (`biesek-dtconsultorias`). Se aparecer 403, o admin do Sienge precisa habilitar o recurso "Saldos de Contas" para essa credencial. Os endpoints de bills e bank-movement ja estao liberados, mas accounts-balances é separado

### Fuso Horário
- Banco PostgreSQL armazena timestamps em UTC
- Frontend deve converter para `America/Sao_Paulo` ao exibir
- Usar `toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })` ou similar

### Notificacoes WhatsApp (Evolution API)
- Sistema envia alertas de vencimentos proximos via Evolution API self-hosted no Railway
- Scheduler roda como thread daemon no backend (`_wa_scheduler_loop`) — dispara 1x/dia no horario configurado
- Tabelas (CONFIG_DB): `config_whatsapp_evolution`, `config_whatsapp_destinatarios`, `log_whatsapp_notificacoes`
- Pagina admin: Menu do usuario > Notificacoes WhatsApp
- Endpoints: `/api/whatsapp/config`, `/destinatarios`, `/testar`, `/preview-vencimentos`, `/disparar-vencimentos`, `/logs`
- Documentacao completa: `docs/notificacoes-whatsapp.md`
- Telefones sao armazenados sem mascara (so digitos) — o backend adiciona `55` automaticamente se vier com 10/11 digitos
- Respeita `config_feriados` e flag `somente_dias_uteis` ao decidir se dispara

## Release / Versionamento

### Arquivo de changelog
`dashboard-financeirozip-main/dashboard-financeiro/frontend/public/changelog.json`

### Como fazer um release com changelog

Ao finalizar alterações e o usuário pedir para commitar/fazer release, siga este processo:

1. **Analisar os commits** desde a última versão com `git log`
2. **Incrementar a versão** no `changelog.json` (campo `versao_atual`) e no `package.json`
   - **Patch** (1.5.0 → 1.5.1): correções de bugs, ajustes de filtros, novas colunas, melhorias visuais menores
   - **Minor** (1.5.x → 1.6.0): nova página, novo módulo, nova funcionalidade significativa
   - **Major** (1.x.x → 2.0.0): redesign do sistema, migração de tecnologia, mudanças estruturais grandes
   - **IMPORTANTE**: Agrupar múltiplas mudanças da mesma sessão em UMA única versão. Não incrementar a cada commit individual.
   - Só atualizar changelog quando o usuário pedir explicitamente para commitar/release, não automaticamente.
3. **Adicionar nova entrada** no início do array `historico` do `changelog.json` com:
   - `versao`: nova versão
   - `data`: data de hoje (YYYY-MM-DD)
   - `titulo`: "Novidades da Versao X.Y.Z"
   - `secoes`: agrupar mudanças por área, usando linguagem acessível ao usuário final
4. **Seções disponíveis** (usar conforme aplicável):
   - `"titulo": "Contas a Pagar", "icone": "wallet"`
   - `"titulo": "Contas Pagas", "icone": "wallet"`
   - `"titulo": "Contas Atrasadas", "icone": "alert"`
   - `"titulo": "Contas a Receber", "icone": "download"`
   - `"titulo": "Contas Recebidas", "icone": "download"`
   - `"titulo": "Inadimplencia", "icone": "alert"`
   - `"titulo": "Dashboard", "icone": "settings"`
   - `"titulo": "KPIs", "icone": "settings"`
   - `"titulo": "Geral", "icone": "settings"`
5. **Escrever itens em linguagem acessível** - o usuário final não é técnico. Exemplos:
   - BOM: "Novo filtro por Titulo para buscar contas especificas"
   - RUIM: "Adicionado state filtroTitulo com MultiSelectDropdown"
6. **Commit** com mensagem: `release: vX.Y.Z - breve descricao`
7. **Push** para main

## Solicitações de Melhorias

O sistema tem uma página de Kanban onde usuários pedem melhorias. A IA deve trabalhar com essas solicitações automaticamente.

### Fluxo ao iniciar sessão

1. **Verificar pendências**: Chamar `GET https://ecbiesek-construtora-production.up.railway.app/api/solicitacoes/pendentes`
2. **Apresentar ao usuário**: "Há X solicitações pendentes:" com título, descrição, seção e prioridade de cada uma
3. **Sugerir ação** para cada solicitação baseado na descrição e seção
4. **Aguardar aprovação** do usuário antes de implementar

### Ao implementar uma solicitação

1. Fazer as mudanças no código
2. Atualizar o Kanban via API: `PUT https://ecbiesek-construtora-production.up.railway.app/api/solicitacoes/{id}` com:
   - `status`: `"aguardando_validacao"` (NÃO mais `"implementado"` direto)
   - `versao_implementada`: versão atual do changelog
   - `resposta_dev`: breve descrição do que foi feito (linguagem acessível)
3. Incluir a melhoria no changelog ao fazer release
4. **Importante**: a solicitação só vira `implementado` quando o usuário que criou clica em "Aprovar" no card da página de Solicitações. Se ele clicar "Reabrir", ela volta para `pendente` com um comentário do que precisa ajustar.

### Fluxo de status (Kanban)
`pendente` → `em_analise` → `em_desenvolvimento` → `aguardando_validacao` → `implementado` (após aprovação do autor)

A partir de `aguardando_validacao`, o autor pode reabrir → volta para `pendente` (registra `comentario_validacao`).

Endpoint de validação (usado apenas pelo frontend):
`POST /api/solicitacoes/{id}/validar` body `{ aprovado: bool, aprovado_por: str, comentario?: str }`

### Prioridade de atendimento
- **Urgente**: resolver imediatamente
- **Alta**: resolver na sessão atual se possível
- **Media**: resolver quando conveniente
- **Baixa**: resolver quando não houver nada mais urgente

### Estrutura do changelog.json
```json
{
  "versao_atual": "X.Y.Z",
  "historico": [
    {
      "versao": "X.Y.Z",
      "data": "YYYY-MM-DD",
      "titulo": "Novidades da Versao X.Y.Z",
      "secoes": [
        {
          "titulo": "Nome da Secao",
          "icone": "wallet|alert|download|settings",
          "itens": [
            "Descricao acessivel da mudanca 1",
            "Descricao acessivel da mudanca 2"
          ]
        }
      ]
    }
  ]
}
```
