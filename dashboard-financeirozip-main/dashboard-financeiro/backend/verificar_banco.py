"""
Script para verificar a estrutura do banco de dados
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

def verificar_banco():
    """Verifica estrutura do banco"""
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    try:
        print("Verificando tabelas existentes...")

        # Listar todas as tabelas
        cursor.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        """)

        tabelas = cursor.fetchall()
        print(f"\nTabelas encontradas: {len(tabelas)}")
        for tabela in tabelas:
            print(f"  - {tabela[0]}")

        # Se a tabela contas_a_pagar existir, mostrar suas colunas
        if any('contas_a_pagar' in str(t) for t in tabelas):
            print("\nColunas da tabela contas_a_pagar:")
            cursor.execute("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'contas_a_pagar'
                ORDER BY ordinal_position
            """)

            colunas = cursor.fetchall()
            for coluna in colunas:
                print(f"  - {coluna[0]}: {coluna[1]} (NULL: {coluna[2]})")

            # Contar registros
            cursor.execute("SELECT COUNT(*) FROM contas_a_pagar")
            count = cursor.fetchone()[0]
            print(f"\nTotal de registros: {count}")

    except Exception as e:
        print(f"Erro: {e}")

    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    print("=" * 60)
    print("VERIFICACAO DO BANCO DE DADOS")
    print("=" * 60)
    print()
    verificar_banco()
