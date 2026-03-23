"""
Script para criar/resetar usuario no banco de dados.
Execute: python setup_usuario.py
"""
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import bcrypt
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'port': int(os.environ.get('DB_PORT', '5432')),
    'database': os.environ.get('DB_NAME', 'ecbiesek'),
    'user': os.environ.get('DB_USER', ''),
    'password': os.environ.get('DB_PASSWORD', ''),
}

EMAIL = os.environ.get('DEFAULT_ADMIN_EMAIL', 'edielson@dtconsultorias.com')
NOME  = os.environ.get('DEFAULT_ADMIN_NAME', 'Edielson Lima')
SENHA = os.environ.get('DEFAULT_ADMIN_PASSWORD', '')

def main():
    print("Conectando ao banco de dados...")
    try:
        conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
        print("Conexao OK!")
    except Exception as e:
        print(f"ERRO ao conectar: {e}")
        return

    cursor = conn.cursor()
    try:
        # Criar tabela se nao existir
        print("Criando tabela usuarios se nao existir...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                nome VARCHAR(255) NOT NULL,
                senha_hash VARCHAR(255) NOT NULL,
                ativo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        print("Tabela OK!")

        # Gerar hash da senha
        senha_hash = bcrypt.hashpw(SENHA.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        # Verificar se usuario existe
        cursor.execute("SELECT id FROM usuarios WHERE email = %s", (EMAIL,))
        existing = cursor.fetchone()

        if existing:
            # Atualizar senha
            cursor.execute(
                "UPDATE usuarios SET senha_hash = %s, nome = %s, ativo = TRUE WHERE email = %s",
                (senha_hash, NOME, EMAIL)
            )
            print(f"Usuario '{EMAIL}' atualizado com nova senha!")
        else:
            # Inserir usuario
            cursor.execute(
                "INSERT INTO usuarios (email, nome, senha_hash) VALUES (%s, %s, %s)",
                (EMAIL, NOME, senha_hash)
            )
            print(f"Usuario '{EMAIL}' criado com sucesso!")

        conn.commit()
        print()
        print("=" * 40)
        print("CREDENCIAIS DE ACESSO:")
        print(f"  Email: {EMAIL}")
        print(f"  Senha: {SENHA}")
        print("=" * 40)

    except Exception as e:
        conn.rollback()
        print(f"ERRO: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    main()
