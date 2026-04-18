"""Cria user de servico bi-agente@servico.ecbiesek no users.db
e imprime um JWT de 90 dias para usar como BI_API_SERVICE_TOKEN.

Rodar 1x localmente com as env vars do BI apontando para prod:
    railway service bi-dashboard
    railway run python scripts/setup/criar_user_servico_bi.py
"""
import os
import sys
import secrets
import bcrypt
from datetime import datetime, timedelta, timezone
from jose import jwt

sys.path.insert(0, "dashboard-financeirozip-main/dashboard-financeiro/backend")
from main import get_users_db, SECRET_KEY, ALGORITHM  # reusa config do backend

EMAIL = "bi-agente@servico.ecbiesek"
NOME = "Agente BI (service account)"
PERMISSAO = "leitor_servico"  # role nova, sem acesso a rotas admin
DIAS_VALIDADE = 90

def main():
    senha_plain = secrets.token_urlsafe(32)
    senha_hash = bcrypt.hashpw(senha_plain.encode(), bcrypt.gensalt()).decode()

    conn = get_users_db()
    try:
        existing = conn.execute(
            "SELECT id FROM usuarios WHERE email = ?", (EMAIL,)
        ).fetchone()
        if existing:
            print(f"[skip] User {EMAIL} ja existe (id={existing['id']})")
        else:
            conn.execute(
                "INSERT INTO usuarios (email, nome, senha_hash, ativo, permissao) "
                "VALUES (?, ?, ?, 1, ?)",
                (EMAIL, NOME, senha_hash, PERMISSAO),
            )
            conn.commit()
            print(f"[ok] User {EMAIL} criado. Senha (descartar): {senha_plain}")
    finally:
        conn.close()

    exp = datetime.now(timezone.utc) + timedelta(days=DIAS_VALIDADE)
    token = jwt.encode(
        {"sub": EMAIL, "permissao": PERMISSAO, "exp": exp, "service": True},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    print(f"\nBI_API_SERVICE_TOKEN (valido ate {exp.isoformat()}):")
    print(token)

if __name__ == "__main__":
    main()
