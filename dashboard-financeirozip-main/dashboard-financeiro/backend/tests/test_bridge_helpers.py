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


def test_formatar_prefixo_com_cid_inclui_token():
    prefixo = formatar_prefixo(
        usuario_bi="eloi@ecbiesek.com",
        role="admin",
        ts="2026-04-18T14:00:00+00:00",
        cid="a3f9b2c1",
    )
    assert prefixo.startswith("[BI_REQ=a3f9b2c1]")
    assert "[BI web | user=eloi@ecbiesek.com" in prefixo


def test_formatar_prefixo_sem_cid_nao_inclui_token():
    prefixo = formatar_prefixo(
        usuario_bi="eloi@ecbiesek.com",
        role="admin",
        ts="2026-04-18T14:00:00+00:00",
    )
    assert "BI_REQ" not in prefixo
