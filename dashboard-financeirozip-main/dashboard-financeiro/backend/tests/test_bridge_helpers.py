from bridge_telegram import formatar_prefixo

def test_formatar_prefixo_padrao():
    prefixo = formatar_prefixo(
        usuario_bi="marlon@ecbiesek.com",
        role="analista",
        ts="2026-04-18T14:00:00+00:00",
    )
    assert prefixo.startswith("[BI web | user=marlon@ecbiesek.com")
    assert "role=analista" in prefixo
    assert prefixo.endswith("]")

def test_formatar_prefixo_sem_role():
    prefixo = formatar_prefixo(
        usuario_bi="eloi@ecbiesek.com",
        role=None,
        ts="2026-04-18T14:00:00+00:00",
    )
    assert "role=user" in prefixo  # default
