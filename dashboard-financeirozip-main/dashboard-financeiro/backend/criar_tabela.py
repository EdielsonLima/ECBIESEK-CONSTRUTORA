"""
Script para criar a tabela contas_a_pagar no banco de dados
"""

import psycopg2

# Configuração do banco
DB_CONFIG = {
    'host': '8iv70o.easypanel.host',
    'port': 42128,
    'database': 'ecbiesek',
    'user': 'dtKJdFrDX5dt',
    'password': 'dtM7gvwVaDaieR0xqNNGRGnJeo6fYhOnCTdt'
}

def criar_tabela():
    """Cria a tabela contas_a_pagar se não existir"""
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    try:
        print("Criando tabela contas_a_pagar...")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS contas_a_pagar (
                id SERIAL PRIMARY KEY,
                descricao TEXT,
                fornecedor VARCHAR(255),
                categoria VARCHAR(100),
                valor NUMERIC(12, 2) NOT NULL,
                data_vencimento DATE NOT NULL,
                data_pagamento DATE,
                status VARCHAR(50) NOT NULL,
                observacoes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.commit()
        print("✅ Tabela criada com sucesso!")

        # Verificar se a tabela foi criada
        cursor.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'contas_a_pagar'
            ORDER BY ordinal_position
        """)

        colunas = cursor.fetchall()
        print("\nColunas da tabela:")
        for coluna in colunas:
            print(f"  - {coluna[0]}: {coluna[1]}")

    except Exception as e:
        print(f"❌ Erro ao criar tabela: {e}")
        conn.rollback()

    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    print("=" * 60)
    print("CRIAÇÃO DA TABELA CONTAS_A_PAGAR")
    print("=" * 60)
    print()
    criar_tabela()
