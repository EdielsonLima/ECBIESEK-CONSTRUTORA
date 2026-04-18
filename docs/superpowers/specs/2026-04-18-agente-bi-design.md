# Agente BI — Design da V1

**Data:** 2026-04-18
**Autor:** Eloi N. Biesek (com Claude)
**Status:** Design aprovado, pendente plano de implementação

## 1. Contexto e objetivo

O dashboard BI da ECBIESEK já tem a página `ChatIA.tsx` com UI de chat que chama `POST /api/ia/chat`. Hoje esse endpoint usa `claude-3-haiku-20240307` direto via SDK Anthropic, injetando só dois números estáticos (total pago e total a pagar) no system prompt — não tem ferramentas, não acessa dados reais, não tem memória.

O objetivo desta feature é substituir essa implementação por um **agente autônomo real** baseado no framework Hermes (`nousresearch/hermes-agent`), seguindo o mesmo padrão do projeto `bermes` já em produção (documentado em `~/OneDrive/SecondBrain/.railway/bermes/`). O novo agente:

- Conhece profundamente o schema e as regras de negócio do BI (CCs duplos, tipos de condição de contratos, flags de unidade, tipos de baixa, empresas excluídas, etc.)
- É acessível via dois canais: **Telegram** (DM direto ao bot `@bibibi4393884444_bot`) e **web** (através da `ChatIA.tsx`, via proxy MTProto no backend FastAPI)
- **Read-only**: responde perguntas analíticas, nunca muta dados

Não está no escopo desta V1: agente executar ações (criar task ClickUp, baixar parcela Sienge, mandar WhatsApp), streaming de resposta no frontend, RBAC por centro de custo, dashboard de métricas dedicado.

## 2. Decisões tomadas no brainstorm

| Decisão | Opção escolhida | Motivo |
|---------|-----------------|--------|
| Integração web ↔ Hermes | **A — Proxy via Telegram** | Zero fork do Hermes, reusa runtime inteiro. Aceita ~1-3s de latência extra. |
| Acesso a dados | **C — Híbrido (SQL + tools de API)** | SQL direto cobre ad-hoc; tools de API reusam endpoints validados para perguntas comuns. |
| Escopo | **A — Read-only puro** | Ship uma V1 enxuta antes de adicionar ações (que viram riscos e complexidade). |
| Deploy | **A — Novo projeto Railway dedicado** | Isolamento 1:1 com o padrão Bermes. |
| Identidade da bridge | **ii — Conta Telegram pessoal do Eloi** | Aceita como débito técnico da V1; migra pra chip corporativo quando o time crescer. |

## 3. Arquitetura macro

```
┌────────────────────────────────┐   ┌───────────────────────────────────┐
│  BI Dashboard (React, Railway) │   │  Agente BI (novo projeto Railway) │
│                                │   │                                   │
│  ChatIA.tsx (UI existente)     │   │  ┌────────────────────────────┐   │
│         │                      │   │  │  bi-agente (service 24/7)  │   │
│         ▼                      │   │  │  Dockerfile →              │   │
│  FastAPI /api/ia/chat          │   │  │  nousresearch/hermes-agent │   │
│   (substituído — faz proxy)    │   │  │  + config.yaml + SOUL.md   │   │
│         │                      │   │  │  + skills BI custom        │   │
│         │ MTProto (Telethon)   │   │  │  + gateway wrapper         │   │
│         ▼                      │◀──┤  │  Volume /opt/data          │   │
│  Conta Telegram pessoal Eloi   │   │  └───────────┬────────────────┘   │
│   envia DM ao bot              │   │              │ polling            │
│                                │   │              ▼                    │
│                                │   │     ┌─────────────────┐           │
│                                │   │     │ Telegram API    │           │
│                                │   │     │ @bibibi..._bot  │◀──────────┤
│                                │   │     └─────────────────┘           │
│                                │   │  ┌────────────────────────────┐   │
│                                │   │  │  autoupdate (cron 03 UTC)  │   │
│                                │   │  └────────────────────────────┘   │
└────────────────────────────────┘   └───────────────────────────────────┘
          │                                             │
          └─────── Postgres do BI (Railway) ◀──── read-only SQL + httpx
                   user dedicado `bi_agente_ro`         chama endpoints
                   SELECT em todo o schema              na allowlist
```

**Componentes:**

1. **`bi-agente`** (Railway, novo projeto) — container Hermes vanilla + config.yaml customizado + SOUL.md + skill `bi-agente`.
2. **`bi-agente-autoupdate`** (Railway, mesmo projeto) — cron 03h UTC que chama `serviceInstanceRedeploy` via GraphQL do Railway, idêntico ao `bermes-autoupdate`.
3. **Bridge web ↔ Telegram** (novo módulo `bridge_telegram.py` no backend BI) — rota `/api/ia/chat` vira proxy MTProto via Telethon.
4. **User Postgres read-only** (`bi_agente_ro`) — `GRANT SELECT` em todas as tabelas.

**Fluxo web:**
```
Web → FastAPI /api/ia/chat
    → Telethon.send_message(bot, "[BI web | user=X] <pergunta>")
    → Hermes processa, roda skill bi-agente
    → Telegram DM entrega resposta
    → Telethon event handler → devolve JSON ao frontend
```

**Fluxo Telegram direto:** usuário (Eloi, time) DM `@bibibi..._bot` → Hermes processa → responde na DM.

## 4. Skill `bi-agente` (camada de dados)

Instalada em `/opt/data/skills/productivity/bi-agente/` no container. Source of truth versionado em `.railway/bi-agente/skills-staging/bi-agente/`.

```
bi-agente/
├── SKILL.md                    # entry point
├── knowledge/
│   ├── schema.md               # tabelas, colunas, gotchas
│   ├── regras-negocio.md       # extraído do CLAUDE.md do BI, em formato IF/THEN
│   ├── cookbook.md             # ~20 queries canônicas testadas
│   └── empresas-ccs.md         # mapeamento id_interno ↔ id_sienge
├── tools/
│   ├── sql_query.py            # executa SELECT read-only
│   ├── api_call.py             # chama endpoints da allowlist
│   └── common.py
└── examples/
    └── sessoes-validadas.md    # 5-10 Q&A reais validados
```

### 4.1 Tool `sql_query`

```python
def sql_query(query: str, timeout_seconds: int = 20) -> dict:
    """Executa SELECT read-only no BI. Retorna {rows, rowcount, columns}."""
```

Guardrails (na tool, não só no prompt):
- Conexão com `bi_agente_ro` (só `GRANT SELECT` no DB)
- Regex rejeita `INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT` antes do DB (defesa em camadas)
- `SET statement_timeout = '20s'` na sessão
- Injeta `LIMIT 500` se faltar (exceto em queries com COUNT/SUM/GROUP BY)
- Truncagem do resultado em 50 KB
- Log de toda query em `/opt/data/logs/bi-agente-sql.log` com timestamp e user BI do prefixo

### 4.2 Tool `api_call`

```python
def api_call(endpoint: str, params: dict = None) -> dict:
    """Chama endpoint read-only do BI. Só GETs da allowlist."""
```

Guardrails:
- Allowlist explícita no código (array constante) — inicial: `/api/metricas`, `/api/saldos-bancarios`, `/api/saldos-bancarios/detalhe`, `/api/estatisticas-por-mes`, `/api/recebidas-por-mes`, `/api/realizado-por-centro-custo`, `/api/contas-pagas-filtradas`, `/api/contas-receber-filtradas`, `/api/inadimplencia`, `/api/filtros/centros-custo`, `/api/filtros/empresas`, `/api/comercial/vendas-por-cc`, `/api/manual/secoes`. Expandir conforme demanda.
- Só método GET
- Auth via `BI_API_SERVICE_TOKEN` (JWT de user de serviço `bi-agente@servico.ecbiesek`, role `leitor_servico`, flag `is_service_account=true`)
- Timeout 30s

### 4.3 Knowledge base

Três camadas documentadas no `SKILL.md`:

1. **`regras-negocio.md`** — reescrita do CLAUDE.md do BI em formato IF/THEN. Exemplo:
   > *Se o usuário pergunta sobre "realizado" ou "contas pagas", SEMPRE filtrar por `id_tipo_baixa IN (1, 10)` via JOIN com `config_tipos_baixa_exposicao_caixa`. Incluir tipo 3 (cancelamento) ou 5 (substituição) infla o resultado.*

2. **`schema.md`** — schema documentado para as tabelas relevantes (`contas_a_receber`, `contas_recebidas`, `contas_a_pagar`, `contas_pagas`, `imovel_unidade`, `tipo_imovel`, `dim_centrocusto`, `dim_empresa`, `ecadcontacorrente`, `posicao_saldos`, `config_tipos_baixa_exposicao_caixa`, `config_empresas_excluidas`). Para cada tabela: colunas principais, chaves, gotchas.

3. **`cookbook.md`** — ~20 queries canônicas com SQL + exemplo de resultado + armadilhas. Ex: "Total realizado por CC no ano", "Saldo bancário consolidado", "Inadimplência > 60 dias", "Vendas do mês".

### 4.4 Decisão de SQL vs API

O SKILL.md instrui:
> Quando a pergunta bate com cookbook.md ou com endpoint da allowlist, use `api_call`. Quando é ad-hoc ou cruza dados, use `sql_query` — puxando primeiro o trecho relevante de `regras-negocio.md` e `schema.md`. Se o resultado SQL vier vazio ou incoerente, NÃO invente — reporte.

### 4.5 Criação do user Postgres RO

Script SQL executado 1x no BI DB:

```sql
CREATE USER bi_agente_ro WITH PASSWORD '<random>';
GRANT CONNECT ON DATABASE railway TO bi_agente_ro;
GRANT USAGE ON SCHEMA public TO bi_agente_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bi_agente_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO bi_agente_ro;
```

Connection string no Railway do `bi-agente`: `DATABASE_URL_RO`.

## 5. Bridge web ↔ Telegram (backend BI)

Módulo novo: `dashboard-financeirozip-main/dashboard-financeiro/backend/bridge_telegram.py`. Rota `/api/ia/chat` substituída mantendo fallback legacy.

### 5.1 Conta MTProto

- Conta Telegram pessoal do Eloi (aceito como débito técnico)
- `TELEGRAM_API_ID=31863837`, `TELEGRAM_API_HASH=<secret>` (de https://my.telegram.org) — nomes usados em env var e no código Telethon
- `TELETHON_SESSION_STRING` gerado 1x localmente pelo script `scripts/gerar_sessao_telethon.py` (login interativo com SMS), armazenado **só** no Railway
- O user ID dessa conta é adicionado a `TELEGRAM_ALLOWED_USERS` no `bi-agente` — senão o Hermes ignora as DMs proxied

### 5.2 Padrão da bridge

```python
# bridge_telegram.py (esqueleto)
from telethon import TelegramClient, events
from telethon.sessions import StringSession
import asyncio, os, uuid

_client: TelegramClient | None = None
_pending: dict[str, asyncio.Future] = {}
_bot_entity = None

async def iniciar_bridge():
    global _client, _bot_entity
    _client = TelegramClient(
        StringSession(os.environ["TELETHON_SESSION_STRING"]),
        int(os.environ["TELEGRAM_API_ID"]),
        os.environ["TELEGRAM_API_HASH"],
    )
    await _client.start()
    _bot_entity = await _client.get_entity(os.environ["TELEGRAM_BOT_USERNAME"])
    _client.add_event_handler(_on_bot_reply, events.NewMessage(from_users=_bot_entity))
    asyncio.create_task(_client.run_until_disconnected())

async def _on_bot_reply(event):
    texto = event.message.text or ""
    if _pending:
        cid, fut = next(iter(_pending.items()))
        if not fut.done():
            fut.set_result(texto)
        _pending.pop(cid, None)

async def perguntar(mensagem: str, usuario_bi: str, role: str, timeout: int = 90) -> str:
    cid = str(uuid.uuid4())[:8]
    fut = asyncio.get_event_loop().create_future()
    _pending[cid] = fut
    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    texto = f"[BI web | user={usuario_bi} | role={role} | ts={ts}] {mensagem}"
    await _client.send_message(_bot_entity, texto)
    try:
        return await asyncio.wait_for(fut, timeout=timeout)
    except asyncio.TimeoutError:
        _pending.pop(cid, None)
        raise HTTPException(504, "Agente não respondeu em 90s")
```

**Limitação V1:** correlação pergunta↔resposta pela "última pendente" — aceito porque DMs são seriais no mesmo chat. Se 2 users BI mandarem ao mesmo tempo, elas enfileiram (V1 target: 5-10 perguntas/dia).

### 5.3 Rota substituída

```python
@app.post("/api/ia/chat")
async def chat_ia(req: ChatRequest, current_user: dict = Depends(get_current_user)):
    if os.environ.get("BI_AGENTE_BRIDGE_ENABLED") == "true":
        ultima_msg = req.messages[-1].content
        resposta = await bridge_telegram.perguntar(
            mensagem=ultima_msg,
            usuario_bi=current_user["email"],
            role=current_user.get("role", "user"),
            timeout=90,
        )
        registrar_atividade(current_user, "chat_ia",
                            {"pergunta": ultima_msg[:500],
                             "resposta_preview": resposta[:200]})
        return {"reply": resposta}
    return await _chat_ia_legacy(req)  # fallback Anthropic direto (código atual)
```

**Mudanças em relação ao endpoint atual:**
- Função atual `chat_ia` (linha 815-877 do `main.py` de hoje) é renomeada para `_chat_ia_legacy` (função privada, não decorada) e o novo `chat_ia` com `@app.post("/api/ia/chat")` envolve os dois caminhos
- `get_current_user_optional` → `get_current_user` (exigir auth sempre)
- Histórico (`req.messages` inteiro) **ignorado** na V1 — só a última mensagem vai pro proxy; Hermes gerencia sessão do lado dele (idle reset 24h)
- Fallback legacy mantido pra rollback instantâneo via flip da env var

### 5.4 Startup / lifecycle

```python
@app.on_event("startup")
async def startup():
    if os.environ.get("BI_AGENTE_BRIDGE_ENABLED") == "true":
        try:
            await bridge_telegram.iniciar_bridge()
            print("[bridge] Telethon conectado")
        except Exception as e:
            print(f"[bridge] FALHOU: {e} — caindo pra fallback legacy")
```

Se a bridge falha no start, o backend continua com o modo legacy — rollback sem deploy.

### 5.5 Rate limiting

Dicionário em memória com TTL (sem Redis):
- 10 perguntas/min por user BI
- 30 perguntas/min global

### 5.6 Dependência nova no backend BI

Adicionar em `requirements.txt`:
```
telethon
```

## 6. Infra / deploy

### 6.1 Estrutura de diretórios no repo BI

```
.railway/
└── bi-agente/
    ├── Dockerfile
    ├── README.md
    ├── config.yaml          # copiado do bermes, sem mcp_servers.n8n-mcp
    ├── SOUL.md              # persona do agente BI
    ├── railway.toml
    ├── deploy-skills.sh     # upload da skill via railway ssh
    └── skills-staging/
        └── bi-agente/
            ├── SKILL.md
            ├── knowledge/...
            ├── tools/...
            └── examples/...
```

### 6.2 Dockerfile

```dockerfile
FROM nousresearch/hermes-agent:latest
USER root
COPY config.yaml /etc/bi-agente/config.yaml
COPY SOUL.md /etc/bi-agente/SOUL.md
RUN printf '#!/bin/bash\nset -e\nHERMES_HOME="${HERMES_HOME:-/opt/data}"\nmkdir -p "$HERMES_HOME"\ncp -f /etc/bi-agente/config.yaml "$HERMES_HOME/config.yaml"\ncp -f /etc/bi-agente/SOUL.md "$HERMES_HOME/SOUL.md"\nchown hermes:hermes "$HERMES_HOME"/{config.yaml,SOUL.md} 2>/dev/null || true\nexec /opt/hermes/docker/entrypoint.sh gateway "$@"\n' > /usr/local/bin/gateway \
 && chmod +x /usr/local/bin/gateway
```

### 6.3 config.yaml

Copiado do `~/OneDrive/SecondBrain/.railway/bermes/config.yaml`. Ajustes:
- `mcp_servers.n8n-mcp` removido
- `TELEGRAM_HOME_CHANNEL` = ID do Telegram pessoal do Eloi
- `display.personality` = `concise` (em vez de `kawaii` — agente corporativo)
- `memory.memory_enabled: true`, char_limit default
- `session_reset.idle_minutes: 1440` (24h default)

### 6.4 SOUL.md (persona)

Persona redigida com:
- Identidade: "Analista BI da ECBIESEK"
- Tom: direto, conciso, português brasileiro, markdown leve
- Escopo: responder perguntas sobre dados do dashboard; usar `sql_query` ou `api_call` antes de afirmar números
- Regras: nunca inventar; se SQL vier vazio, reportar; se prefixo `[BI web | user=X]` presente, responder profissionalmente em vez de tratar como dono do agente; nunca expor credenciais em output
- Contexto: empresas (ECBIESEK, WALE, INOTEC), equipe financeira (Deiane, Jennifer, Marlon, Lucas), ERP Sienge, fuso UTC-4

### 6.5 Env vars

**Projeto `bi-agente`:**
| Var | Origem |
|-----|--------|
| `TELEGRAM_BOT_TOKEN` | @BotFather (token novo, após revogar o vazado) |
| `TELEGRAM_ALLOWED_USERS` | `<id_eloi>,<id_conta_bridge>,<ids_team>` |
| `OPENROUTER_API_KEY` | igual Bermes |
| `OPENAI_API_KEY` | igual Bermes (pra STT whisper-1) |
| `TAVILY_API_KEY` | igual Bermes (web search) |
| `DATABASE_URL_RO` | `postgres://bi_agente_ro:<senha>@<host>/<db>?sslmode=require` |
| `BI_API_BASE_URL` | `https://ecbiesek-construtora-production.up.railway.app` |
| `BI_API_SERVICE_TOKEN` | JWT do user `bi-agente@servico.ecbiesek` (90 dias) |

**Projeto BI (dashboard existente):**
| Var | Valor |
|-----|-------|
| `TELEGRAM_API_ID` | `31863837` |
| `TELEGRAM_API_HASH` | (secret, gerado em my.telegram.org) |
| `TELETHON_SESSION_STRING` | (secret, gerado 1x localmente) |
| `TELEGRAM_BOT_USERNAME` | `bibibi4393884444_bot` |
| `BI_AGENTE_BRIDGE_ENABLED` | `false` inicialmente, `true` no flip final |

### 6.6 Serviço `bi-agente-autoupdate`

Image `python:3.12-alpine`, cron `0 3 * * *` (03:00 UTC). Env var `REDEPLOY_SCRIPT` com Python inline que chama mutation GraphQL `serviceInstanceRedeploy`. Idêntico ao `bermes-autoupdate`, trocando `BERMES_SERVICE_ID` → `BI_AGENTE_SERVICE_ID`.

### 6.7 Sequência de setup (ordem importa)

1. Criar user Postgres `bi_agente_ro` no BI DB (script SQL manual via Railway Postgres console)
2. Criar user de serviço `bi-agente@servico.ecbiesek` no BI auth + emitir JWT de 90 dias
3. Revogar `TELEGRAM_BOT_TOKEN` vazado via @BotFather → gerar novo
4. Gerar `TELETHON_SESSION_STRING` localmente (`scripts/gerar_sessao_telethon.py`, login interativo com SMS)
5. Criar projeto Railway `bi-agente` com Dockerfile local
6. Subir env vars do `bi-agente`
7. Primeiro deploy → testar DM "Oi" do Telegram pessoal pro bot
8. Rodar `deploy-skills.sh` para instalar skill no volume
9. Criar service `bi-agente-autoupdate`
10. Adicionar env vars no projeto BI (com `BI_AGENTE_BRIDGE_ENABLED=false`)
11. Deploy do backend BI com `bridge_telegram.py`
12. Flip `BI_AGENTE_BRIDGE_ENABLED=true` em preview/staging → Fase 2 dos testes
13. Flip em prod → rollout escalonado

Rollback: `BI_AGENTE_BRIDGE_ENABLED=false` em qualquer momento, <1min.

### 6.8 Custo estimado

- Railway `bi-agente` service: ~$5-10/mês
- Railway volume 1GB: ~$0.25/mês
- `autoupdate` cron: ~$0.10/mês
- OpenRouter (qwen3.6-plus + deepseek fallback, ~20 perguntas/dia): ~$3-5/mês
- **Total: ~$10-15/mês**

## 7. Auth, identidade e auditoria

### 7.1 Quem pode falar com o agente

**Via BI web:** qualquer user autenticado no BI. Rota usa `Depends(get_current_user)` (não optional).
**Via Telegram direto:** só IDs em `TELEGRAM_ALLOWED_USERS` (Eloi + conta bridge + 3-5 do time financeiro).

### 7.2 Prefixo de identidade

Mensagens proxied chegam com prefixo que o SOUL.md ensina a interpretar:
```
[BI web | user=marlon@ecbiesek.com | role=analista | ts=2026-04-18T14:23:10+00:00] qual o saldo da Caixa ECBIESEK?
```

O agente usa esse metadado para personalizar resposta e auditoria; **não** usa `role` pra gatekeeping na V1.

### 7.3 Auditoria (3 camadas)

1. **BI backend** (`log_atividades` no users.db) — cada chamada `/api/ia/chat`: autor, pergunta, preview resposta (200 chars), latência
2. **Skill SQL** (`/opt/data/logs/bi-agente-sql.log` no volume do `bi-agente`) — toda query SQL: timestamp, user BI do prefixo, query, duração, tamanho resultado
3. **Hermes nativo** — sessions e logs em `/opt/data/sessions/` (default do framework)

Acesso posterior: `log_atividades` vive em `users.db` (SQLite) dentro do container BI, leitura via `railway ssh "sqlite3 /app/backend/users.db 'SELECT ... FROM log_atividades WHERE acao=\"chat_ia\"'"` (projeto BI) — ou expor endpoint admin dedicado quando virar frequente; log SQL da skill via `railway ssh "cat /opt/data/logs/bi-agente-sql.log"` (projeto `bi-agente`).

### 7.4 Limites operacionais

| Item | Limite |
|------|--------|
| Perguntas/min por user BI | 10 |
| Perguntas/min global | 30 |
| Timeout total web→proxy→Hermes→resposta | 90s |
| Tamanho máx pergunta | 2000 chars |
| Tamanho máx resultado SQL | 50 KB |
| Linhas máx SQL sem LIMIT | 500 (injetado) |
| Postgres `statement_timeout` | 20s |
| Max turns por sessão Hermes | 60 |
| Idle reset sessão Hermes | 24h |

### 7.5 Secret management

| Secret | Vive em | Rotação |
|--------|---------|---------|
| `TELEGRAM_BOT_TOKEN` | Railway `bi-agente` | @BotFather `/revoke` |
| `TELETHON_SESSION_STRING` | Railway BI | Regenerar localmente + resubir |
| `TELEGRAM_API_ID/HASH` | Railway BI | Só muda recriando app |
| Senha `bi_agente_ro` | Railway `bi-agente` | ALTER USER + update env var |
| `BI_API_SERVICE_TOKEN` | Railway `bi-agente` | Trimestral, manual |
| `OPENROUTER_API_KEY` | Railway `bi-agente` | Mesma do Bermes, rotaciona junto |

Nada em `.env` local. Nada em `git`. O `scripts/gerar_sessao_telethon.py` usa `StringSession` (imprime ao terminal, nunca grava arquivo no repo).

## 8. Testes e rollout

### 8.1 Roteiro de validação manual

**Fase 1 — Hermes isolado no Telegram (sem bridge):**
1. DM "Oi" do Telegram pessoal → bot responde
2. "Quantas contas a pagar vencem esta semana?" → skill roda SQL, responde com número + tabela curta
3. "5 maiores fornecedores de 2025 por valor pago" → SQL mais complexo, verifica filtro de tipo de baixa
4. "Saldo da conta Caixa da ECBIESEK hoje" → `posicao_saldos` ou `/api/saldos-bancarios`
5. Teste hostil: "DELETE FROM contas_a_pagar" → precisa recusar
6. "SELECT * FROM users" → executa ou avisa, não pode quebrar
7. "Saldo devedor do cliente João Silva" → `ILIKE` em `cliente`

**Fase 2 — Bridge em staging:**
8. Env Railway de preview com `BI_AGENTE_BRIDGE_ENABLED=true`, chat web funciona <30s
9. Mesma pergunta da Fase 1 tem resposta equivalente
10. Duas abas de users diferentes perguntando junto → uma espera a outra (serial OK)
11. Derrubar container `bi-agente` → BI responde erro 504 em 90s, sem quebrar backend
12. Religar + flip `enabled=false` → chat volta pra legacy sem erro

**Fase 3 — Produção, 1 semana:**
13. Eloi usa primeiro (1-2 dias)
14. Convida 1 pessoa do time financeiro
15. Itera skill baseado em erros
16. Libera pro time todo

### 8.2 Observabilidade V1

- Dashboard Railway nativo (`bi-agente` e BI): CPU/mem/restarts, latência `/api/ia/chat`
- `log_atividades` consultável via `railway connect postgres`
- Log SQL no volume `/opt/data/logs/`
- **Sem** dashboard dedicado nem alertas automatizados (V1.1)

### 8.3 Cronograma

| Semana | Entregas |
|--------|----------|
| 1 | User Postgres RO + service token BI + bot token novo + projeto Railway vazio + Telethon session |
| 2 | Skill `bi-agente` completa (SKILL.md, knowledge, tools) + Fase 1 de testes |
| 3 | `bridge_telegram.py` + preview staging + Fase 2 + merge `main` com `enabled=false` |
| 4 | Flip prod, rollout Eloi → 1 pessoa → time, coleta padrões pra V1.1 |

## 9. Débitos técnicos conhecidos (V1.1+)

Catalogados explicitamente para não serem esquecidos:

1. **Conta Telegram pessoal** como bridge → migrar pra chip corporativo quando time >5 pessoas ou quando mensagens BI poluírem histórico pessoal
2. **Correlação serial** na bridge → trocar por tópicos de grupo ou lock por sessão quando concorrência virar incômodo
3. **Sem streaming** → SSE do frontend quando latência percebida virar problema
4. **Histórico ignorado no proxy** → passar conversa inteira quando contexto entre turnos fizer diferença
5. **Sem RBAC** → filtrar por `role` e/ou centros de custo permitidos ao user BI
6. **Sem dashboard dedicado** → página `/admin/agente-metricas` com p95 de latência, top users, queries/dia
7. **Allowlist de endpoints manual** → gerar automaticamente do OpenAPI do FastAPI
8. **Knowledge estático** → regenerar `schema.md` automaticamente quando banco migrar
9. **Fallback legacy duplicado** → remover `_chat_ia_legacy` depois que a bridge provar estabilidade >30 dias

## 10. Não-objetivos desta V1

Explicitamente fora de escopo, pra evitar scope creep durante implementação:

- Ações (criar task ClickUp, baixar parcela Sienge, mandar WhatsApp)
- RBAC por centro de custo ou empresa
- Dashboard de métricas do agente
- Streaming de resposta (SSE) no frontend
- Histórico de conversa multi-turn no proxy
- Alertas automáticos quando agente cair
- Auto-geração do `schema.md` a partir do banco
- Tradução de endpoints FastAPI em tools individuais (mantém `api_call` genérico com allowlist)
- Testes automatizados da skill BI (validação é manual na V1)
