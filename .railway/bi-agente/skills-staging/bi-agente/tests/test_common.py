from tools.common import extrair_contexto_bi, truncar_resultado

def test_extrair_contexto_bi_com_prefixo():
    msg = "[BI web | user=marlon@ecbiesek.com | role=analista | ts=2026-04-18T14:00:00+00:00] qual o saldo?"
    ctx = extrair_contexto_bi(msg)
    assert ctx["user"] == "marlon@ecbiesek.com"
    assert ctx["role"] == "analista"
    assert ctx["origem"] == "web"
    assert ctx["mensagem_limpa"] == "qual o saldo?"

def test_extrair_contexto_bi_sem_prefixo():
    ctx = extrair_contexto_bi("qual o saldo?")
    assert ctx["user"] is None
    assert ctx["origem"] == "telegram-direto"
    assert ctx["mensagem_limpa"] == "qual o saldo?"

def test_truncar_resultado_abaixo_do_limite():
    assert truncar_resultado("abc", limite_bytes=100) == "abc"

def test_truncar_resultado_acima_do_limite():
    texto = "x" * 60000
    resultado = truncar_resultado(texto, limite_bytes=50_000)
    assert len(resultado.encode("utf-8")) <= 50_000 + 200  # + nota de truncagem
    assert "truncado" in resultado.lower()
