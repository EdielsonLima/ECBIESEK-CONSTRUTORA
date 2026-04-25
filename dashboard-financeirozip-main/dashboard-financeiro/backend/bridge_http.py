"""Bridge HTTP direta ao agente Hermes (bi-agente).

Substitui a bridge Telegram: chama o endpoint REST exposto pelo dev do Hermes.

Endpoint: POST {BI_AGENT_URL}/chat
Auth: Bearer {BI_AGENT_TOKEN}
TLS: self-signed (verify=False)
Timeout: 200s (Hermes pode demorar 10-120s)
Multi-turn: session_id por usuario, armazenado em memória.

Env vars:
  BI_AGENT_URL   - base URL, ex: https://187.127.22.213:9443
  BI_AGENT_TOKEN - Bearer token
  BI_AGENTE_BRIDGE_ENABLED - "true" para ativar
"""
import os
from typing import Optional

import httpx

# session_id por email de usuario (multi-turn)
_sessions: dict[str, str] = {}


def _url() -> str:
    base = os.environ.get("BI_AGENT_URL", "").rstrip("/")
    if not base:
        raise RuntimeError("BI_AGENT_URL não configurada")
    return f"{base}/chat"


def _token() -> str:
    tok = os.environ.get("BI_AGENT_TOKEN", "").strip()
    if not tok:
        raise RuntimeError("BI_AGENT_TOKEN não configurada")
    return tok


async def perguntar(mensagem: str, usuario_bi: str, timeout: int = 200) -> str:
    """Envia pergunta ao Hermes e retorna a resposta em texto.

    Mantém session_id por usuário para contexto multi-turn.
    Levanta RuntimeError em caso de falha (main.py captura e faz fallback).
    """
    session_id = _sessions.get(usuario_bi, "")

    payload = {
        "query": mensagem,
        "session_id": session_id,
    }

    async with httpx.AsyncClient(verify=False, timeout=timeout) as client:
        resp = await client.post(
            _url(),
            json=payload,
            headers={
                "Authorization": f"Bearer {_token()}",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code != 200:
        raise RuntimeError(f"Hermes HTTP {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    resposta = data.get("response") or data.get("reply") or ""
    if not resposta:
        raise RuntimeError(f"Hermes retornou resposta vazia: {data}")

    # Persiste session_id para próxima mensagem deste usuario
    novo_sid = data.get("session_id", "")
    if novo_sid:
        _sessions[usuario_bi] = novo_sid

    return resposta


def limpar_sessao(usuario_bi: str) -> None:
    """Remove o session_id do usuario (reinicia contexto do Hermes)."""
    _sessions.pop(usuario_bi, None)
