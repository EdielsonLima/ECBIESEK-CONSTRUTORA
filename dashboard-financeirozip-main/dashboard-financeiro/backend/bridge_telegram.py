"""Bridge MTProto entre FastAPI e o bot Telegram do agente BI.

Envia mensagem do usuario BI (web) via conta Telethon ao bot do Hermes,
aguarda resposta, devolve ao caller.

Chat compartilhado entre administradores:
    - Todos os admins falam no MESMO chat do Telegram com o Hermes
    - Contexto do agente e unico (Hermes "lembra" de perguntas anteriores de qualquer admin)
    - Respostas do bot sao visiveis no Telegram para quem tiver acesso ao chat

Correlacao pergunta<->resposta:
    - Cada requisicao injeta um token `[BI_REQ=<cid>]` no prefixo enviado ao bot
    - Se o bot ecoar o token, o handler roteia a resposta pelo cid (preciso)
    - Caso contrario, as requisicoes sao serializadas por um lock global:
      apenas uma pergunta fica pendente por vez, eliminando ambiguidade de FIFO
"""
import asyncio
import os
import re
import uuid
from datetime import datetime, timezone

# Telethon e um import pesado — so carregar quando realmente usar
_client = None
_bot_entity = None
_pending: dict[str, asyncio.Future] = {}
_iniciado = False
_lock_envio = asyncio.Lock()

_TOKEN_RE = re.compile(r'\[BI_REQ=([a-f0-9]{8})\]')


def formatar_prefixo(usuario_bi: str, role: str | None, ts: str, cid: str | None = None) -> str:
    """Formata o prefixo que encapsula mensagens da bridge.

    Quando `cid` e fornecido, prefixa com `[BI_REQ=<cid>]` para correlacao.
    """
    role = role or "user"
    base = f"[BI web | user={usuario_bi} | role={role} | ts={ts}]"
    if cid:
        return f"[BI_REQ={cid}] {base}"
    return base


async def iniciar_bridge() -> None:
    """Conecta o cliente Telethon e registra handler de respostas do bot."""
    global _client, _bot_entity, _iniciado
    if _iniciado:
        return

    from telethon import TelegramClient, events
    from telethon.sessions import StringSession

    # strip() em todas as envs para tolerar espacos/quebras de linha acidentais
    session_str = os.environ["TELETHON_SESSION_STRING"].strip()
    api_id_str = os.environ["TELEGRAM_API_ID"].strip()
    api_hash = os.environ["TELEGRAM_API_HASH"].strip()
    bot_username = os.environ["TELEGRAM_BOT_USERNAME"].strip()

    _client = TelegramClient(
        StringSession(session_str),
        int(api_id_str),
        api_hash,
    )
    await _client.start()
    _bot_entity = await _client.get_entity(bot_username)

    async def _on_bot_reply(event):
        texto = event.message.text or ""

        # Tentativa 1: casar pelo token [BI_REQ=<cid>] ecoado pelo bot
        m = _TOKEN_RE.search(texto)
        if m:
            cid = m.group(1)
            fut = _pending.get(cid)
            if fut and not fut.done():
                resposta_limpa = _TOKEN_RE.sub('', texto).strip()
                fut.set_result(resposta_limpa)
            _pending.pop(cid, None)
            return

        # Tentativa 2 (fallback): requisicoes sao serializadas por _lock_envio,
        # portanto no maximo 1 pending por vez. Se houver exatamente 1, resolve.
        # Mais de 1 = estado inesperado; ignora para nao entregar resposta trocada.
        if len(_pending) == 1:
            cid, fut = next(iter(_pending.items()))
            if not fut.done():
                fut.set_result(texto)
            _pending.pop(cid, None)

    _client.add_event_handler(_on_bot_reply, events.NewMessage(from_users=_bot_entity))
    asyncio.create_task(_client.run_until_disconnected())
    _iniciado = True


async def perguntar(mensagem: str, usuario_bi: str, role: str | None = None,
                    timeout: int = 90) -> str:
    """Envia pergunta ao bot e retorna a resposta.

    Requisicoes sao serializadas: o lock abrange o ciclo completo
    send+aguarda-resposta, garantindo no maximo uma pendente por vez e
    eliminando cross-talk entre usuarios no chat compartilhado.

    Levanta HTTPException 504 se timeout, 503 se bridge nao iniciada.
    """
    from fastapi import HTTPException

    if not _iniciado or _client is None or _bot_entity is None:
        raise HTTPException(503, "Bridge do agente BI nao iniciada")

    if len(mensagem) > 2000:
        raise HTTPException(400, "Mensagem muito longa (max 2000 chars)")

    async with _lock_envio:
        cid = uuid.uuid4().hex[:8]
        loop = asyncio.get_event_loop()
        fut: asyncio.Future = loop.create_future()
        _pending[cid] = fut

        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        prefixo = formatar_prefixo(usuario_bi, role, ts, cid=cid)
        texto = f"{prefixo} {mensagem}"

        try:
            await _client.send_message(_bot_entity, texto)
            return await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError:
            raise HTTPException(504, f"Agente nao respondeu em {timeout}s")
        finally:
            _pending.pop(cid, None)
