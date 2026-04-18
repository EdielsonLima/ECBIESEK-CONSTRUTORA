# bi-agente — Hermes Agent do BI no Railway

Deploy do agente BI (Hermes) no Railway, com bot Telegram próprio `@bibibi4393884444_bot` e bridge MTProto para a UI web do dashboard. Read-only.

## Identidade

| Item | Valor |
|------|-------|
| Projeto Railway | `bi-agente` |
| Project ID | `<preencher após Task 1.5>` |
| Environment ID (production) | `<preencher>` |
| Bot Telegram | `@bibibi4393884444_bot` |
| Volume | `/opt/data` (`bi-agente-volume`) — persiste skills, sessions, memories |

## Serviços

### `bi-agente` (gateway 24/7)

Base image `nousresearch/hermes-agent:latest`. Start command `gateway run` (wrapper em `/usr/local/bin/gateway` — ver Dockerfile).

### `bi-agente-autoupdate` (cron)

Image `python:3.12-alpine`, cron `0 3 * * *` (03h UTC = 23h AMT). Chama `serviceInstanceRedeploy` via GraphQL Railway para pegar nova tag do `hermes-agent`.

## Env vars

| Var | Origem | Notas |
|-----|--------|-------|
| `TELEGRAM_BOT_TOKEN` | @BotFather | Token novo (pós-revoke do vazado) |
| `TELEGRAM_ALLOWED_USERS` | Lista CSV | Eloi + conta bridge + team; sem isso ninguem fala com o bot |
| `OPENROUTER_API_KEY` | igual Bermes | |
| `OPENAI_API_KEY` | igual Bermes | STT whisper-1 |
| `TAVILY_API_KEY` | igual Bermes | Web search |
| `DATABASE_URL_RO` | Postgres BI | User `bi_agente_ro` (SELECT only) |
| `BI_API_BASE_URL` | URL do dashboard | `https://ecbiesek-construtora-production.up.railway.app` |
| `BI_API_SERVICE_TOKEN` | JWT 90d | Script `criar_user_servico_bi.py` |

## Operações comuns

### Deploy de config novo

```bash
cd .railway/bi-agente
# edita config.yaml ou SOUL.md
railway service bi-agente
railway up --detach
```

### Deploy de skill nova/alterada

```bash
cd .railway/bi-agente
bash deploy-skills.sh
```

### Ver logs

```bash
railway service bi-agente
railway logs --deployment
```

### Inspecionar container

```bash
railway ssh "cat /opt/data/config.yaml"
railway ssh "tail -50 /opt/data/logs/bi-agente-sql.log"
```

### Link inicial em outra máquina

```bash
cd .railway/bi-agente
railway link --project <id> --environment production --service bi-agente
```

## Arquitetura resumida

```
 Web BI → FastAPI → Telethon → @bibibi..._bot → Hermes (skill bi-agente)
                                                     │
  Eloi / team DM → @bibibi..._bot ────────────────────┘
                                                     │
                                         sql_query ──▶ Postgres BI (bi_agente_ro)
                                         api_call  ──▶ BI /api/... (JWT service)
```
