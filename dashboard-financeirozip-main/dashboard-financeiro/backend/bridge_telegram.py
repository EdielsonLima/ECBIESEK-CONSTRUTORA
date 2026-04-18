"""Bridge MTProto entre FastAPI e o bot Telegram do agente BI.

Envia mensagem do usuario BI (web) via conta Telethon ao bot do Hermes,
aguarda resposta, devolve ao caller.

Limitacao V1: correlacao pergunta<->resposta pela "ultima pendente",
DMs sao seriais no mesmo chat. Ver spec secao 5.2.
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

# Telethon e um import pesado — so carregar quando realmente usar
_client = None
_bot_entity = None
_pending: dict[str, asyncio.Future] = {}
_iniciado = False
_lock_envio = asyncio.Lock()


def formatar_prefixo(usuario_bi: str, role: str | None, ts: str) -> str:
    """Formata o prefixo que encapsula mensagens da bridge."""
    role = role or "user"
    return f"[BI web | user={usuario_bi} | role={role} | ts={ts}]"


async def iniciar_bridge() -> None:
    """Conecta o cliente Telethon e registra handler de respostas do bot."""
    global _client, _bot_entity, _iniciado
    if _iniciado:
        return

    from telethon import TelegramClient, events
    from telethon.sessions import StringSession

    _client = TelegramClient(
        StringSession(os.environ["TELETHON_SESSION_STRING"]),
        int(os.environ["TELEGRAM_API_ID"]),
        os.environ["TELEGRAM_API_HASH"],
    )
    await _client.start()
    _bot_entity = await _client.get_entity(os.environ["TELEGRAM_BOT_USERNAME"])

    async def _on_bot_reply(event):
        texto = event.message.text or ""
        if _pending:
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

    Levanta HTTPException 504 se timeout, 503 se bridge nao iniciada.
    """
    from fastapi import HTTPException

    if not _iniciado or _client is None or _bot_entity is None:
        raise HTTPException(503, "Bridge do agente BI nao iniciada")

    if len(mensagem) > 2000:
        raise HTTPException(400, "Mensagem muito longa (max 2000 chars)")

    cid = str(uuid.uuid4())[:8]
    loop = asyncio.get_event_loop()
    fut: asyncio.Future = loop.create_future()
    _pending[cid] = fut

    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    prefixo = formatar_prefixo(usuario_bi, role, ts)
    texto = f"{prefixo} {mensagem}"

    try:
        async with _lock_envio:
            await _client.send_message(_bot_entity, texto)
        return await asyncio.wait_for(fut, timeout=timeout)
    except asyncio.TimeoutError:
        from fastapi import HTTPException as _HTTPException
        _pending.pop(cid, None)
        raise _HTTPException(504, f"Agente nao respondeu em {timeout}s")
