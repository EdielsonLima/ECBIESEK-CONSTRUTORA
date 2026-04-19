#!/usr/bin/env python3
"""CLI wrapper para api_call. Uso:
    api_call.py /api/endpoint [params_json]
Exemplos:
    api_call.py /api/metricas
    api_call.py /api/contas-pagas-filtradas '{"ano":2026,"mes":4}'
Imprime JSON no stdout, erros em stderr com exit != 0.
"""
import json, os, sys

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SKILL_DIR)

from tools.api_call import api_call, EndpointNaoPermitido

def main():
    if len(sys.argv) < 2:
        print("ERRO: uso: api_call.py /api/endpoint [params_json]", file=sys.stderr)
        sys.exit(2)
    endpoint = sys.argv[1]
    params = json.loads(sys.argv[2]) if len(sys.argv) > 2 else None
    try:
        result = api_call(endpoint, params=params)
        print(json.dumps(result, ensure_ascii=False, default=str))
    except EndpointNaoPermitido as e:
        print(json.dumps({"erro": "EndpointNaoPermitido", "mensagem": str(e)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"erro": type(e).__name__, "mensagem": str(e)[:500]}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
