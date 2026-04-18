import pytest
from tools.sql_query import validar_query, injetar_limit_se_faltar, QueryNaoPermitida

def test_validar_query_aceita_select():
    validar_query("SELECT * FROM contas_a_pagar LIMIT 10")  # nao levanta

@pytest.mark.parametrize("q", [
    "INSERT INTO x VALUES (1)",
    "DELETE FROM contas_a_pagar",
    "UPDATE contas SET valor=0",
    "DROP TABLE users",
    "ALTER TABLE x ADD COLUMN y INT",
    "TRUNCATE contas_recebidas",
    "GRANT ALL ON x TO pg_monitor",
    "CREATE TABLE lol AS SELECT * FROM x",
    "SELECT 1; DELETE FROM x",  # multi-statement com DML
])
def test_validar_query_rejeita_dml_ddl(q):
    with pytest.raises(QueryNaoPermitida):
        validar_query(q)

def test_injetar_limit_adiciona_quando_ausente():
    out = injetar_limit_se_faltar("SELECT id FROM contas_a_pagar", padrao=500)
    assert "LIMIT 500" in out.upper()

def test_injetar_limit_nao_duplica_quando_presente():
    out = injetar_limit_se_faltar("SELECT id FROM x LIMIT 10", padrao=500)
    assert out.upper().count("LIMIT") == 1
    assert "LIMIT 10" in out.upper()

def test_injetar_limit_ignora_queries_agregadas():
    out = injetar_limit_se_faltar("SELECT COUNT(*) FROM contas_a_pagar", padrao=500)
    assert "LIMIT" not in out.upper()
    out2 = injetar_limit_se_faltar("SELECT cliente, SUM(valor) FROM x GROUP BY cliente", padrao=500)
    assert "LIMIT" not in out2.upper()
