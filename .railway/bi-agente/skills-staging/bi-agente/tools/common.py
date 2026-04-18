"""Helpers compartilhados entre tools da skill bi-agente."""
import re

_PREFIX_RE = re.compile(
    r"^\[BI web \| user=([^\s|]+) \| role=([^\s|]+) \| ts=([^\]]+)\]\s*(.*)$",
    re.DOTALL,
)


def extrair_contexto_bi(mensagem: str) -> dict:
    """Extrai metadados do prefixo `[BI web | user=... | role=... | ts=...]`.

    Retorna dict com:
        user (str|None), role (str|None), ts (str|None),
        origem ('web'|'telegram-direto'), mensagem_limpa (str)
    """
    m = _PREFIX_RE.match(mensagem.strip())
    if m:
        return {
            "user": m.group(1),
            "role": m.group(2),
            "ts": m.group(3),
            "origem": "web",
            "mensagem_limpa": m.group(4).strip(),
        }
    return {
        "user": None,
        "role": None,
        "ts": None,
        "origem": "telegram-direto",
        "mensagem_limpa": mensagem.strip(),
    }


def truncar_resultado(texto: str, limite_bytes: int = 50_000) -> str:
    """Trunca string se ultrapassar limite em bytes UTF-8, adicionando nota."""
    encoded = texto.encode("utf-8")
    if len(encoded) <= limite_bytes:
        return texto
    truncado = encoded[:limite_bytes].decode("utf-8", errors="ignore")
    return truncado + f"\n\n[resultado truncado — total={len(encoded)} bytes, limite={limite_bytes} bytes. Refine a query com WHERE/GROUP BY/LIMIT.]"
