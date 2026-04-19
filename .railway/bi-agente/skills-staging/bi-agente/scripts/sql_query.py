#!/usr/bin/env python3
"""CLI wrapper para sql_query. Uso:
    sql_query.py "SELECT ..." [timeout_seconds]
Imprime JSON no stdout, erros em stderr com exit != 0.
"""
import json, os, sys

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SKILL_DIR)

from tools.sql_query import sql_query, QueryNaoPermitida

def main():
    if len(sys.argv) < 2:
        print("ERRO: uso: sql_query.py 'SELECT ...' [timeout_seconds]", file=sys.stderr)
        sys.exit(2)
    query = sys.argv[1]
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    try:
        result = sql_query(query, timeout_seconds=timeout)
        print(json.dumps(result, ensure_ascii=False, default=str))
    except QueryNaoPermitida as e:
        print(json.dumps({"erro": "QueryNaoPermitida", "mensagem": str(e)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"erro": type(e).__name__, "mensagem": str(e)[:500]}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
