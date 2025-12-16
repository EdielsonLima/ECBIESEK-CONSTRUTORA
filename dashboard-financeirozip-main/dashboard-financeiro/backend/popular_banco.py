"""
Script para popular o banco de dados com dados de exemplo
ATENÇÃO: Execute apenas se quiser adicionar dados de teste!
"""

import psycopg2
from datetime import datetime, timedelta
import random

# Configuração do banco
DB_CONFIG = {
    'host': '8iv70o.easypanel.host',
    'port': 42128,
    'database': 'ecbiesek',
    'user': 'dtKJdFrDX5dt',
    'password': 'dtM7gvwVaDaieR0xqNNGRGnJeo6fYhOnCTdt'
}

# Dados de exemplo
FORNECEDORES = [
    'Construtora ABC Ltda',
    'Materiais de Construção XYZ',
    'Hidráulica & Cia',
    'Elétrica Moderna',
    'Transportadora Rápida',
    'Serralheria Industrial',
    'Vidraçaria Premium',
    'Pinturas e Acabamentos',
    'Pisos & Revestimentos',
    'Madeireira Central'
]

CATEGORIAS = [
    'Material de Construção',
    'Mão de Obra',
    'Equipamentos',
    'Transporte',
    'Serviços',
    'Administrativo',
    'Marketing',
    'Jurídico',
    'Consultoria',
    'Manutenção'
]

DESCRICOES = [
    'Compra de cimento e areia',
    'Pagamento de pedreiros - Obra Residencial',
    'Aluguel de betoneira',
    'Frete de materiais',
    'Instalação elétrica',
    'Material hidráulico',
    'Pintura externa',
    'Esquadrias de alumínio',
    'Instalação de pisos',
    'Telhado e estrutura metálica'
]

def gerar_dados_exemplo(quantidade=100):
    """Gera dados de exemplo para contas a pagar"""
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    hoje = datetime.now().date()
    
    print(f"Gerando {quantidade} contas de exemplo...")
    
    for i in range(quantidade):
        # Gerar dados aleatórios
        descricao = random.choice(DESCRICOES)
        fornecedor = random.choice(FORNECEDORES)
        categoria = random.choice(CATEGORIAS)
        valor = round(random.uniform(500, 50000), 2)
        
        # Gerar datas
        dias_aleatorio = random.randint(-90, 60)  # Entre 90 dias atrás e 60 dias à frente
        data_vencimento = hoje + timedelta(days=dias_aleatorio)
        
        # 60% das contas pagas, 40% não pagas
        if random.random() < 0.6:
            # Conta paga
            dias_pagamento = random.randint(-30, 5)  # Pago até 30 dias antes ou 5 dias depois
            data_pagamento = data_vencimento + timedelta(days=dias_pagamento)
            status = 'Pago'
        else:
            # Conta não paga
            data_pagamento = None
            if data_vencimento < hoje:
                status = 'Em Atraso'
            else:
                status = 'A Pagar'
        
        observacoes = f'Observação da conta #{i+1}' if random.random() < 0.3 else None
        
        # Inserir no banco
        try:
            cursor.execute("""
                INSERT INTO contas_a_pagar 
                (descricao, fornecedor, categoria, valor, data_vencimento, data_pagamento, status, observacoes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (descricao, fornecedor, categoria, valor, data_vencimento, data_pagamento, status, observacoes))
            
            if (i + 1) % 10 == 0:
                print(f"  {i + 1} contas inseridas...")
        
        except Exception as e:
            print(f"Erro ao inserir conta {i+1}: {e}")
            conn.rollback()
            continue
    
    conn.commit()
    cursor.close()
    conn.close()
    
    print(f"\n✅ {quantidade} contas de exemplo foram inseridas com sucesso!")
    print("\nDistribuição aproximada:")
    print("  - 60% Contas Pagas")
    print("  - 40% Contas A Pagar ou Em Atraso")

if __name__ == '__main__':
    print("=" * 60)
    print("SCRIPT DE POPULAÇÃO DO BANCO DE DADOS")
    print("=" * 60)
    print("\n⚠️  ATENÇÃO: Este script vai inserir dados de EXEMPLO no banco!")
    print("\nTem certeza que deseja continuar? (s/n): ", end='')
    
    resposta = input().lower().strip()
    
    if resposta == 's':
        try:
            quantidade = int(input("\nQuantas contas deseja gerar? (padrão: 100): ") or 100)
            gerar_dados_exemplo(quantidade)
        except Exception as e:
            print(f"\n❌ Erro: {e}")
    else:
        print("\n❌ Operação cancelada.")
