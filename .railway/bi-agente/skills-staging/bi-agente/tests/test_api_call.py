import pytest
from tools.api_call import validar_endpoint, EndpointNaoPermitido, ENDPOINTS_PERMITIDOS

def test_validar_endpoint_aceita_allowlist():
    validar_endpoint("/api/metricas")
    validar_endpoint("/api/saldos-bancarios")
    validar_endpoint("/api/realizado-por-centro-custo")

@pytest.mark.parametrize("ep", [
    "/api/auth/login",
    "/api/admin/atividades",
    "/api/solicitacoes/123/validar",
    "/api/whatsapp/disparar-vencimentos",
    "/api/ia/chat",
    "/api/../etc/passwd",
    "https://evil.com/api/metricas",
])
def test_validar_endpoint_rejeita_fora_lista(ep):
    with pytest.raises(EndpointNaoPermitido):
        validar_endpoint(ep)

def test_allowlist_contem_endpoints_core():
    esperados = {
        "/api/metricas", "/api/saldos-bancarios", "/api/saldos-bancarios/detalhe",
        "/api/estatisticas-por-mes", "/api/recebidas-por-mes",
        "/api/realizado-por-centro-custo", "/api/contas-pagas-filtradas",
        "/api/contas-receber-filtradas", "/api/inadimplencia",
        "/api/filtros/centros-custo", "/api/filtros/empresas",
        "/api/comercial/vendas-por-cc", "/api/manual/secoes",
    }
    assert esperados.issubset(ENDPOINTS_PERMITIDOS)
