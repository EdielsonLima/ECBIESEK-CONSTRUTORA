import os
import pytest
from tools.sql_query import sql_query, QueryNaoPermitida

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL_RO"),
    reason="DATABASE_URL_RO nao configurada",
)

def test_sql_query_select_simples():
    result = sql_query("SELECT 1 as um, 'texto' as t")
    assert result["rowcount"] == 1
    assert result["rows"][0]["um"] == "1"

def test_sql_query_rejeita_delete():
    with pytest.raises(QueryNaoPermitida):
        sql_query("DELETE FROM contas_a_pagar")

def test_sql_query_injeta_limit():
    result = sql_query("SELECT id FROM contas_a_pagar")
    assert result["limit_injetado"] is True
    assert result["rowcount"] <= 500
