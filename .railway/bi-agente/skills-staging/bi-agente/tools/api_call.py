"""Tool de chamada HTTP read-only aos endpoints do BI dashboard.

Allowlist rigida + so GET + auth via JWT de user de servico.
"""
import os

import httpx

ENDPOINTS_PERMITIDOS = frozenset({
    "/api/metricas",
    "/api/saldos-bancarios",
    "/api/saldos-bancarios/detalhe",
    "/api/estatisticas-por-mes",
    "/api/recebidas-por-mes",
    "/api/realizado-por-centro-custo",
    "/api/contas-pagas-filtradas",
    "/api/contas-receber-filtradas",
    "/api/inadimplencia",
    "/api/filtros/centros-custo",
    "/api/filtros/empresas",
    "/api/comercial/vendas-por-cc",
    "/api/manual/secoes",
    # Expandir aqui conforme demanda aparecer (V1.1+)
})


class EndpointNaoPermitido(Exception):
    pass


def validar_endpoint(endpoint: str) -> None:
    """Levanta EndpointNaoPermitido se nao estiver na allowlist."""
    if not endpoint.startswith("/"):
        raise EndpointNaoPermitido(f"Endpoint deve comecar com '/': {endpoint}")
    if ".." in endpoint:
        raise EndpointNaoPermitido(f"Path traversal nao permitido: {endpoint}")
    if endpoint not in ENDPOINTS_PERMITIDOS:
        raise EndpointNaoPermitido(
            f"Endpoint {endpoint} nao esta na allowlist. "
            f"Permitidos: {sorted(ENDPOINTS_PERMITIDOS)}"
        )


def api_call(endpoint: str, params: dict | None = None, timeout_seconds: int = 30) -> dict:
    """Chama endpoint GET do BI com JWT de service account.

    Args:
        endpoint: path comecando com '/api/...'. Deve estar em ENDPOINTS_PERMITIDOS.
        params: query string params (dict). Opcional.
        timeout_seconds: timeout HTTP (max 60s).

    Returns:
        {"status": int, "data": ..., "url": str}
    """
    validar_endpoint(endpoint)
    base = os.environ["BI_API_BASE_URL"].rstrip("/")
    token = os.environ["BI_API_SERVICE_TOKEN"]
    url = f"{base}{endpoint}"
    timeout = min(max(timeout_seconds, 1), 60)

    with httpx.Client(timeout=timeout) as client:
        resp = client.get(
            url,
            params=params or {},
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        try:
            data = resp.json()
        except Exception:
            data = {"_text": resp.text[:5000]}
        return {
            "status": resp.status_code,
            "data": data,
            "url": str(resp.request.url),
        }
