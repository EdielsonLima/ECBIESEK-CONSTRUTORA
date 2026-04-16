# Notificações WhatsApp — Evolution API

Esta rotina dispara alertas de **vencimentos próximos** (contas a pagar nos próximos N dias) para destinatários cadastrados, via WhatsApp.

## Arquitetura

```
┌────────────────────┐        ┌─────────────────────┐        ┌──────────────┐
│ Dashboard Backend  │  HTTP  │ Evolution API       │  WS    │   WhatsApp   │
│ FastAPI (scheduler)├───────►│ (Railway self-host) ├───────►│   (celular)  │
└────────────────────┘        └─────────────────────┘        └──────────────┘
        │
        ▼
 Postgres (config,
   destinatarios,
   log de envios)
```

- O **scheduler** (`_wa_scheduler_loop`) é uma thread daemon iniciada com o backend. A cada ~2 min, ele verifica se está no horário configurado e se ainda não disparou hoje. Se sim, envia.
- Cada envio é gravado em `log_whatsapp_notificacoes`.
- Se `somente_dias_uteis=true`, a rotina pula sábados, domingos e feriados cadastrados em `config_feriados`.

## Tabelas criadas (em CONFIG_DB_URL)

- `config_whatsapp_evolution` — 1 linha, configuração global (URL, API key, instância, horário, ativo, dias de antecedência).
- `config_whatsapp_destinatarios` — destinatários (nome, telefone, quais alertas recebem, ativo).
- `log_whatsapp_notificacoes` — histórico de cada tentativa de envio.

## Endpoints (todos exigem admin)

| Método | Rota | Descrição |
|---|---|---|
| GET  | `/api/whatsapp/config` | Config atual (API key mascarada) |
| PUT  | `/api/whatsapp/config` | Atualiza config (envie `api_key` vazio para manter a atual) |
| GET  | `/api/whatsapp/destinatarios` | Lista destinatários |
| POST | `/api/whatsapp/destinatarios` | Cria destinatário |
| PUT  | `/api/whatsapp/destinatarios/{id}` | Atualiza destinatário |
| DELETE | `/api/whatsapp/destinatarios/{id}` | Exclui destinatário |
| POST | `/api/whatsapp/testar` | Envia mensagem ad-hoc `{telefone, mensagem}` |
| GET  | `/api/whatsapp/preview-vencimentos?dias=3` | Retorna a mensagem que SERIA enviada (dry-run) |
| POST | `/api/whatsapp/disparar-vencimentos` | Dispara imediatamente para todos ativos |
| GET  | `/api/whatsapp/logs?limite=100` | Últimos envios |

## Deploy do Evolution API no Railway

### 1. Criar um novo serviço no Railway

No projeto do dashboard, clique em **New → Deploy a Docker Image** e use:

```
atendai/evolution-api:latest
```

Alternativa oficial: `evoapicloud/evolution-api:latest`.

### 2. Adicionar os serviços de suporte

A Evolution API precisa de Postgres + Redis. No mesmo projeto:

- **New → Database → PostgreSQL** (para armazenar instâncias/sessões WhatsApp)
- **New → Database → Redis** (cache)

Esses são separados do Postgres do Dashboard.

### 3. Variáveis de ambiente do serviço Evolution

```env
# Autenticação
AUTHENTICATION_API_KEY=gere-uma-chave-aleatoria-forte-aqui
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true

# Server
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=https://<nome-do-servico>.up.railway.app

# Banco (use a DATABASE_URL do Postgres criado no passo 2)
DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=${{Postgres.DATABASE_URL}}
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=false
DATABASE_SAVE_MESSAGE_UPDATE=false
DATABASE_SAVE_DATA_CONTACTS=false
DATABASE_SAVE_DATA_CHATS=false

# Redis
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=${{Redis.REDIS_URL}}
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_LOCAL_ENABLED=false

# Log
LOG_LEVEL=ERROR,WARN,INFO
LOG_COLOR=true

# Config QR Code
QRCODE_LIMIT=30
```

No Railway, ajuste:
- **Start command**: (deixe vazio, a imagem já traz)
- **Port**: `8080`
- **Public networking**: gere um domínio público

### 4. Criar a instância e conectar o WhatsApp

Abra o terminal (qualquer lugar com curl) e:

```bash
EVO_URL="https://<nome-do-servico>.up.railway.app"
EVO_KEY="a-mesma-AUTHENTICATION_API_KEY"

# 1) criar instancia
curl -X POST "$EVO_URL/instance/create" \
  -H "apikey: $EVO_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instanceName":"ecbiesek","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'

# 2) pegar o QR Code
curl "$EVO_URL/instance/connect/ecbiesek" \
  -H "apikey: $EVO_KEY"
```

A resposta traz um `base64` do QR Code — abra em um viewer (ou navegue até `/manager` se o dashboard da Evolution estiver habilitado) e escaneie com o WhatsApp do celular que vai enviar as mensagens (recomendado: número comercial dedicado).

> 💡 **Dica**: use um número que a empresa NÃO usa manualmente no celular. Apesar de a Evolution ser baseada em Baileys (não-oficial), mandar só para contatos internos e com volume baixo (dezenas/dia) reduz muito o risco de bloqueio.

### 5. Configurar no dashboard

1. Entre no dashboard como admin
2. Menu do usuário → **Notificações WhatsApp**
3. Aba **Configuração**, preencha:
   - **Base URL**: `https://<nome-do-servico>.up.railway.app`
   - **API Key**: a mesma do `AUTHENTICATION_API_KEY`
   - **Nome da instância**: `ecbiesek` (ou o nome usado no passo 4)
   - **Horário**: `08:00`
   - **Dias de antecedência**: `3,7`
   - **Scheduler ativo**: ligado
4. Aba **Destinatários**: adicione os telefones que devem receber
5. Aba **Teste / Disparo**:
   - **Enviar teste** confirma que a conexão funciona
   - **Gerar prévia** mostra exatamente o que será enviado
   - **Disparar agora** envia imediatamente para todos os destinatários ativos

## Troubleshooting

- **401 na API Evolution** → API key errada ou instância não foi criada
- **400 "instance not connected"** → celular desconectado; refaça o QR Code
- **Mensagem não chega** → verifique o formato do telefone (aceita `69999998888` — o sistema adiciona `55` automaticamente) e confirme que o número existe no WhatsApp
- **Scheduler não dispara** → confira:
  - Campo `ativo = true` na config
  - Horário configurado já passou na hora atual (America/Sao_Paulo, UTC-3)
  - Se é dia útil (caso `somente_dias_uteis=true`)
  - Log do Railway: procure `[WhatsApp]` no início das linhas

## Custo estimado

- Evolution API + Postgres + Redis no Railway: **~US$ 5–15/mês** (depende do plano)
- Mensagens: **grátis** (uso direto do WhatsApp via Baileys)
