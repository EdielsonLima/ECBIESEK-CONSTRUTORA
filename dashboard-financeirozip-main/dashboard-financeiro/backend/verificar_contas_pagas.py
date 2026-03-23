"""
Script para verificar a estrutura da tabela contas_pagas
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# Configuração do banco
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'port': int(os.environ.get('DB_PORT', '5432')),
    'database': os.environ.get('DB_NAME', 'ecbiesek'),
    'user': os.environ.get('DB_USER', ''),
    'password': os.environ.get('DB_PASSWORD', ''),
}

def verificar_contas_pagas():
    """Verifica estrutura da tabela contas_pagas"""
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    try:
        print("Colunas da tabela contas_pagas:")
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'contas_pagas'
            ORDER BY ordinal_position
        """)

        colunas = cursor.fetchall()
        for coluna in colunas:
            print(f"  - {coluna[0]}: {coluna[1]} (NULL: {coluna[2]})")

        # Contar registros
        cursor.execute("SELECT COUNT(*) FROM contas_pagas")
        count = cursor.fetchone()[0]
        print(f"\nTotal de registros em contas_pagas: {count}")

        # Mostrar alguns registros de exemplo
        cursor.execute("SELECT * FROM contas_pagas LIMIT 3")
        rows = cursor.fetchall()
        print(f"\nPrimeiros 3 registros:")
        for row in rows:
            print(f"  {row}")

    except Exception as e:
        print(f"Erro: {e}")

    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    print("=" * 60)
    print("VERIFICACAO DA TABELA CONTAS_PAGAS")
    print("=" * 60)
    print()
    verificar_contas_pagas()
