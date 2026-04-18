"""Tool de execucao SQL read-only para a skill bi-agente.

Guardrails em camadas:
1. User Postgres com so GRANT SELECT (defesa primaria)
2. Regex rejeita DML/DDL antes de chegar no DB (defesa secundaria)
3. LIMIT 500 injetado se query de linhas nao tem
4. statement_timeout 20s por sessao
5. Resultado truncado em 50KB
6. Log de toda query em /opt/data/logs/bi-agente-sql.log
"""
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from tools.common import truncar_resultado, extrair_contexto_bi


class QueryNaoPermitida(Exception):
    pass


_DML_DDL_RE = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COMMENT|VACUUM|REINDEX)\b",
    re.IGNORECASE,
)

_AGGREGATE_RE = re.compile(
    r"\b(COUNT|SUM|AVG|MAX|MIN|GROUP\s+BY)\b",
    re.IGNORECASE,
)


def validar_query(query: str) -> None:
    """Levanta QueryNaoPermitida se a query contem DML/DDL."""
    sem_comentarios = re.sub(r"--[^\n]*", "", query)
    sem_comentarios = re.sub(r"/\*.*?\*/", "", sem_comentarios, flags=re.DOTALL)
    if _DML_DDL_RE.search(sem_comentarios):
        raise QueryNaoPermitida(
            f"Query contem DML/DDL nao permitido: {query[:120]}..."
        )


def injetar_limit_se_faltar(query: str, padrao: int = 500) -> str:
    """Injeta LIMIT N se a query nao tem LIMIT nem usa agregacao."""
    if re.search(r"\bLIMIT\b", query, re.IGNORECASE):
        return query
    if _AGGREGATE_RE.search(query):
        return query
    return f"{query.rstrip().rstrip(';')} LIMIT {padrao}"


def _log_query(query: str, contexto: dict, duracao_s: float, linhas: int, erro: str | None) -> None:
    log_path = Path(os.environ.get("BI_AGENTE_SQL_LOG", "/opt/data/logs/bi-agente-sql.log"))
    log_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "user_bi": contexto.get("user"),
        "origem": contexto.get("origem"),
        "query": query[:1000],
        "duracao_s": round(duracao_s, 3),
        "linhas": linhas,
        "erro": erro,
    }
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def sql_query(query: str, timeout_seconds: int = 20, _mensagem_original: str = "") -> dict:
    """Executa SELECT read-only no Postgres BI.

    Args:
        query: SELECT SQL. DML/DDL sera rejeitado.
        timeout_seconds: statement_timeout (max 60s).
        _mensagem_original: mensagem completa do usuario com prefixo (opcional,
            usado para log de auditoria). Nao aparece para o LLM.

    Returns:
        {"rows": [...], "rowcount": N, "columns": [...], "truncado": bool,
         "duracao_s": float, "limit_injetado": bool}
    """
    import psycopg2
    import psycopg2.extras

    validar_query(query)
    query_final = injetar_limit_se_faltar(query)
    limit_injetado = query_final != query
    timeout_ms = min(max(timeout_seconds, 1), 60) * 1000

    contexto = extrair_contexto_bi(_mensagem_original) if _mensagem_original else {}

    dsn = os.environ["DATABASE_URL_RO"]
    inicio = time.monotonic()
    erro_msg = None
    linhas = 0

    try:
        with psycopg2.connect(dsn) as conn:
            conn.autocommit = True
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(f"SET statement_timeout = {timeout_ms}")
                cur.execute("SET default_transaction_read_only = on")
                cur.execute(query_final)
                rows = cur.fetchall()
                columns = [d.name for d in cur.description] if cur.description else []
                linhas = len(rows)

        duracao_s = time.monotonic() - inicio

        rows_serializaveis = [
            {k: (v.isoformat() if hasattr(v, "isoformat") else str(v) if v is not None else None)
             for k, v in r.items()}
            for r in rows
        ]
        preview_json = json.dumps(rows_serializaveis, ensure_ascii=False)
        truncado = len(preview_json.encode("utf-8")) > 50_000
        if truncado:
            rows_serializaveis = rows_serializaveis[:max(10, linhas // 5)]

        _log_query(query_final, contexto, duracao_s, linhas, None)

        return {
            "rows": rows_serializaveis,
            "rowcount": linhas,
            "columns": columns,
            "truncado": truncado,
            "duracao_s": round(duracao_s, 3),
            "limit_injetado": limit_injetado,
        }

    except Exception as e:
        erro_msg = type(e).__name__ + ": " + str(e)[:300]
        duracao_s = time.monotonic() - inicio
        _log_query(query_final, contexto, duracao_s, 0, erro_msg)
        raise
