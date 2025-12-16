from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor
from decimal import Decimal
import os
from pathlib import Path

app = FastAPI(title="Dashboard Financeiro - Construtora")

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Em produção, especifique os domínios permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuração do banco de dados
DB_CONFIG = {
    'host': '8iv70o.easypanel.host',
    'port': 42128,
    'database': 'ecbiesek',
    'user': 'dtKJdFrDX5dt',
    'password': 'dtM7gvwVaDaieR0xqNNGRGnJeo6fYhOnCTdt'
}

# Modelos Pydantic
class ContaPagar(BaseModel):
    credor: Optional[str]
    id_credor: Optional[int]
    data_vencimento: Optional[date]
    lancamento: Optional[str]
    numero_parcela: Optional[int]
    valor_original: Optional[float]
    valor_total: Optional[float]
    id_documento: Optional[str]
    numero_documento: Optional[str]
    id_plano_financeiro: Optional[str]

class DashboardMetrics(BaseModel):
    total_pago: float
    total_a_pagar: float
    total_em_atraso: float
    quantidade_pago: int
    quantidade_a_pagar: int
    quantidade_em_atraso: int

class GraficoMensal(BaseModel):
    mes: str
    pago: float
    a_pagar: float
    em_atraso: float

class GraficoPorCategoria(BaseModel):
    categoria: str
    valor: float
    quantidade: int

# Funções auxiliares
def get_db_connection():
    """Cria conexão com o banco de dados"""
    try:
        conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao conectar ao banco: {str(e)}")

def decimal_to_float(obj):
    """Converte Decimal para float"""
    if isinstance(obj, Decimal):
        return float(obj)
    return obj

# Endpoints
@app.get("/")
def root():
    return {"message": "Dashboard Financeiro API - Construtora", "status": "online"}

@app.get("/api/metricas", response_model=DashboardMetrics)
def get_metricas():
    """Retorna métricas principais do dashboard"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        hoje = datetime.now().date()

        # Total e quantidade de contas pagas
        cursor.execute("""
            SELECT
                COALESCE(SUM(valor_liquido), 0) as total,
                COUNT(*) as quantidade
            FROM contas_pagas
        """)
        pago = cursor.fetchone()

        # Total e quantidade de contas a pagar (não vencidas)
        cursor.execute("""
            SELECT
                COALESCE(SUM(valor_total), 0) as total,
                COUNT(*) as quantidade
            FROM contas_a_pagar
            WHERE data_vencimento >= %s
        """, (hoje,))
        a_pagar = cursor.fetchone()

        # Total e quantidade de contas em atraso
        cursor.execute("""
            SELECT
                COALESCE(SUM(valor_total), 0) as total,
                COUNT(*) as quantidade
            FROM contas_a_pagar
            WHERE data_vencimento < %s
        """, (hoje,))
        em_atraso = cursor.fetchone()

        return DashboardMetrics(
            total_pago=decimal_to_float(pago['total']),
            total_a_pagar=decimal_to_float(a_pagar['total']),
            total_em_atraso=decimal_to_float(em_atraso['total']),
            quantidade_pago=pago['quantidade'],
            quantidade_a_pagar=a_pagar['quantidade'],
            quantidade_em_atraso=em_atraso['quantidade']
        )

    finally:
        cursor.close()
        conn.close()

@app.get("/api/contas")
def get_contas(status: Optional[str] = None, limite: int = 100):
    """Retorna lista de contas com filtro opcional por status"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        hoje = datetime.now().date()

        if status == "pago":
            query = """
                SELECT credor, data_pagamento as data_vencimento, valor_liquido as valor_total,
                       lancamento, numero_documento, id_plano_financeiro
                FROM contas_pagas
                ORDER BY data_pagamento DESC
                LIMIT %s
            """
            cursor.execute(query, (limite,))
        elif status == "a_pagar":
            query = """
                SELECT credor, data_vencimento, valor_total,
                       lancamento, numero_documento, id_plano_financeiro
                FROM contas_a_pagar
                WHERE data_vencimento >= %s
                ORDER BY data_vencimento ASC
                LIMIT %s
            """
            cursor.execute(query, (hoje, limite))
        elif status == "em_atraso":
            query = """
                SELECT credor, data_vencimento, valor_total,
                       lancamento, numero_documento, id_plano_financeiro
                FROM contas_a_pagar
                WHERE data_vencimento < %s
                ORDER BY data_vencimento ASC
                LIMIT %s
            """
            cursor.execute(query, (hoje, limite))
        else:
            query = """
                SELECT credor, data_vencimento, valor_total,
                       lancamento, numero_documento, id_plano_financeiro
                FROM contas_a_pagar
                ORDER BY data_vencimento DESC
                LIMIT %s
            """
            cursor.execute(query, (limite,))

        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/grafico-mensal", response_model=List[GraficoMensal])
def get_grafico_mensal():
    """Retorna dados para gráfico de evolução mensal"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        hoje = datetime.now().date()

        cursor.execute("""
            WITH meses AS (
                SELECT TO_CHAR(data_pagamento, 'YYYY-MM') as mes, SUM(valor_liquido) as pago
                FROM contas_pagas
                WHERE data_pagamento >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')
                GROUP BY mes
            ),
            a_pagar_mes AS (
                SELECT TO_CHAR(data_vencimento, 'YYYY-MM') as mes, SUM(valor_total) as valor
                FROM contas_a_pagar
                WHERE data_vencimento >= %s
                  AND data_vencimento >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')
                GROUP BY mes
            ),
            em_atraso_mes AS (
                SELECT TO_CHAR(data_vencimento, 'YYYY-MM') as mes, SUM(valor_total) as valor
                FROM contas_a_pagar
                WHERE data_vencimento < %s
                  AND data_vencimento >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')
                GROUP BY mes
            )
            SELECT
                COALESCE(m.mes, a.mes, e.mes) as mes,
                COALESCE(m.pago, 0) as pago,
                COALESCE(a.valor, 0) as a_pagar,
                COALESCE(e.valor, 0) as em_atraso
            FROM meses m
            FULL OUTER JOIN a_pagar_mes a ON m.mes = a.mes
            FULL OUTER JOIN em_atraso_mes e ON COALESCE(m.mes, a.mes) = e.mes
            ORDER BY mes
        """, (hoje, hoje))

        rows = cursor.fetchall()

        resultado = []
        for row in rows:
            resultado.append(GraficoMensal(
                mes=row['mes'],
                pago=decimal_to_float(row['pago']),
                a_pagar=decimal_to_float(row['a_pagar']),
                em_atraso=decimal_to_float(row['em_atraso'])
            ))

        return resultado

    finally:
        cursor.close()
        conn.close()

@app.get("/api/grafico-categoria", response_model=List[GraficoPorCategoria])
def get_grafico_categoria():
    """Retorna dados para gráfico por plano financeiro"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                COALESCE(id_plano_financeiro, 'Sem Categoria') as categoria,
                SUM(valor_total) as valor,
                COUNT(*) as quantidade
            FROM contas_a_pagar
            GROUP BY id_plano_financeiro
            ORDER BY valor DESC
            LIMIT 10
        """)

        rows = cursor.fetchall()

        resultado = []
        for row in rows:
            resultado.append(GraficoPorCategoria(
                categoria=row['categoria'],
                valor=decimal_to_float(row['valor']),
                quantidade=row['quantidade']
            ))

        return resultado

    finally:
        cursor.close()
        conn.close()

@app.get("/api/proximos-vencimentos")
def get_proximos_vencimentos(dias: int = 30):
    """Retorna contas que vencem nos próximos X dias"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT credor, data_vencimento, valor_total,
                   lancamento, numero_documento, id_plano_financeiro
            FROM contas_a_pagar
            WHERE data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + %s
            ORDER BY data_vencimento ASC
        """, (dias,))

        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/contas-pagas-filtradas")
def get_contas_pagas_filtradas(
    empresa: Optional[int] = None,
    centro_custo: Optional[int] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    limite: int = 100
):
    """Retorna contas pagas com filtros avançados"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conditions = []
        params = []

        if empresa is not None:
            conditions.append("cc.id_sienge_empresa = %s")
            params.append(empresa)

        if centro_custo is not None:
            conditions.append("cp.id_interno_centro_custo = %s")
            params.append(centro_custo)

        if credor:
            conditions.append("cp.credor ILIKE %s")
            params.append(f"%{credor}%")

        if id_documento:
            # Suporta múltiplos documentos separados por vírgula
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = []
            for doc in docs:
                doc_conditions.append("TRIM(cp.id_documento) = %s")
                params.append(doc)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        if origem_dado:
            # Suporta múltiplas origens separadas por vírgula
            origens = [origem.strip() for origem in origem_dado.split(',')]
            origem_conditions = []
            for origem in origens:
                origem_conditions.append("TRIM(cp.origem_dado) = %s")
                params.append(origem)
            conditions.append(f"({' OR '.join(origem_conditions)})")

        if tipo_baixa:
            # Suporta múltiplos tipos separados por vírgula
            tipos = [int(t.strip()) for t in tipo_baixa.split(',')]
            tipo_placeholders = ', '.join(['%s'] * len(tipos))
            conditions.append(f"cp.id_tipo_baixa IN ({tipo_placeholders})")
            params.extend(tipos)

        if ano:
            # Suporta múltiplos anos separados por vírgula
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM cp.data_pagamento) IN ({ano_placeholders})")
            params.extend(anos)

        if mes:
            # Suporta múltiplos meses separados por vírgula
            meses = [int(m.strip()) for m in mes.split(',')]
            mes_placeholders = ', '.join(['%s'] * len(meses))
            conditions.append(f"EXTRACT(MONTH FROM cp.data_pagamento) IN ({mes_placeholders})")
            params.extend(meses)

        if data_inicio:
            conditions.append("cp.data_pagamento >= %s")
            params.append(data_inicio)

        if data_fim:
            conditions.append("cp.data_pagamento <= %s")
            params.append(data_fim)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT
                cp.credor,
                (cp.data_pagamento + INTERVAL '1 day')::date as data_pagamento,
                cp.valor_liquido as valor_total,
                cp.lancamento,
                cp.numero_documento,
                cp.id_plano_financeiro,
                cp.id_interno_empresa,
                cp.id_interno_centro_custo,
                cc.nome_empresa,
                cc.nome_centrocusto
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
            ORDER BY cp.data_pagamento DESC, cp.credor, cp.valor_liquido
            LIMIT %s
        """
        params.append(limite)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/estatisticas-contas-pagas")
def get_estatisticas_contas_pagas(
    empresa: Optional[int] = None,
    centro_custo: Optional[int] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None
):
    """Retorna estatísticas das contas pagas com filtros"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conditions = []
        params = []

        if empresa is not None:
            conditions.append("cc.id_sienge_empresa = %s")
            params.append(empresa)

        if centro_custo is not None:
            conditions.append("cp.id_interno_centro_custo = %s")
            params.append(centro_custo)

        if credor:
            conditions.append("cp.credor ILIKE %s")
            params.append(f"%{credor}%")

        if id_documento:
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = []
            for doc in docs:
                doc_conditions.append("TRIM(cp.id_documento) = %s")
                params.append(doc)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        if origem_dado:
            origens = [origem.strip() for origem in origem_dado.split(',')]
            origem_conditions = []
            for origem in origens:
                origem_conditions.append("TRIM(cp.origem_dado) = %s")
                params.append(origem)
            conditions.append(f"({' OR '.join(origem_conditions)})")

        if tipo_baixa:
            tipos = [int(t.strip()) for t in tipo_baixa.split(',')]
            tipo_placeholders = ', '.join(['%s'] * len(tipos))
            conditions.append(f"cp.id_tipo_baixa IN ({tipo_placeholders})")
            params.extend(tipos)

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM cp.data_pagamento) IN ({ano_placeholders})")
            params.extend(anos)

        if mes:
            meses = [int(m.strip()) for m in mes.split(',')]
            mes_placeholders = ', '.join(['%s'] * len(meses))
            conditions.append(f"EXTRACT(MONTH FROM cp.data_pagamento) IN ({mes_placeholders})")
            params.extend(meses)

        if data_inicio:
            conditions.append("cp.data_pagamento >= %s")
            params.append(data_inicio)

        if data_fim:
            conditions.append("cp.data_pagamento <= %s")
            params.append(data_fim)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT
                COUNT(*) as quantidade_titulos,
                COALESCE(SUM(cp.valor_liquido), 0) as valor_liquido_total,
                COALESCE(SUM(CASE WHEN cp.id_tipo_baixa NOT IN (3, 5, 8, 12) THEN cp.valor_baixa ELSE 0 END), 0) as valor_baixa_total,
                COALESCE(SUM(cp.valor_acrescimo), 0) as valor_acrescimo_total,
                COALESCE(SUM(cp.valor_desconto), 0) as valor_desconto_total
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
        """

        cursor.execute(query, params)
        row = cursor.fetchone()

        return {
            'quantidade_titulos': row['quantidade_titulos'],
            'valor_liquido': decimal_to_float(row['valor_liquido_total']),
            'valor_baixa': decimal_to_float(row['valor_baixa_total']),
            'valor_acrescimo': decimal_to_float(row['valor_acrescimo_total']),
            'valor_desconto': decimal_to_float(row['valor_desconto_total']),
        }

    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/credores")
def get_credores():
    """Retorna lista de credores únicos"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT DISTINCT credor
            FROM contas_pagas
            WHERE credor IS NOT NULL
            ORDER BY credor
        """)
        rows = cursor.fetchall()
        return [row['credor'] for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/empresas")
def get_empresas():
    """Retorna lista de empresas únicas (usando id_sienge_empresa)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT DISTINCT cc.id_sienge_empresa, cc.nome_empresa
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE cc.id_sienge_empresa IS NOT NULL
            ORDER BY cc.id_sienge_empresa
        """)
        rows = cursor.fetchall()
        return [{'id': row['id_sienge_empresa'], 'nome': row['nome_empresa']} for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/centros-custo")
def get_centros_custo():
    """Retorna lista de centros de custo com empresa associada"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT id_interno_centrocusto, nome_centrocusto, id_interno_empresa
            FROM dim_centrocusto
            ORDER BY nome_centrocusto
        """)
        rows = cursor.fetchall()
        return [{'id': row['id_interno_centrocusto'], 'nome': row['nome_centrocusto'], 'id_empresa': row['id_interno_empresa']} for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/tipos-documento")
def get_tipos_documento():
    """Retorna lista de tipos de documentos"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT TRIM(id_documento) as id, TRIM(nome_documento) as nome
            FROM ecaddocumento
            ORDER BY id_documento
        """)
        rows = cursor.fetchall()
        return [{'id': row['id'], 'nome': row['nome']} for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/origem-dado")
def get_origem_dado():
    """Retorna lista de origens de dados"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT DISTINCT TRIM(origem_dado) as id
            FROM contas_pagas
            WHERE origem_dado IS NOT NULL AND TRIM(origem_dado) != ''
            ORDER BY TRIM(origem_dado)
        """)
        rows = cursor.fetchall()
        return [{'id': row['id'], 'nome': row['id']} for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/tipos-baixa")
def get_tipos_baixa():
    """Retorna lista de tipos de baixa disponíveis"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT DISTINCT id_tipo_baixa as id
            FROM contas_pagas
            WHERE id_tipo_baixa IS NOT NULL
            ORDER BY id_tipo_baixa
        """)
        rows = cursor.fetchall()
        tipos_nomes = {
            1: 'Pagamento',
            3: 'Cancelamento',
            5: 'Substituição',
            8: 'Abatimento de Adiantamento',
            10: 'Adiantamento',
            11: 'Por Bens',
            12: 'Outros',
            22: 'Estorno'
        }
        return [{'id': row['id'], 'nome': tipos_nomes.get(row['id'], f'Tipo {row["id"]}')} for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/estatisticas-por-mes")
def get_estatisticas_por_mes(
    empresa: Optional[int] = None,
    centro_custo: Optional[int] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
    ano: Optional[str] = None
):
    """Retorna estatísticas de contas pagas agrupadas por mês"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conditions = []
        params = []

        if empresa is not None:
            conditions.append("cc.id_sienge_empresa = %s")
            params.append(empresa)

        if centro_custo is not None:
            conditions.append("cp.id_interno_centro_custo = %s")
            params.append(centro_custo)

        if credor:
            conditions.append("cp.credor ILIKE %s")
            params.append(f"%{credor}%")

        if id_documento:
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = []
            for doc in docs:
                doc_conditions.append("TRIM(cp.id_documento) = %s")
                params.append(doc)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        if origem_dado:
            origens = [origem.strip() for origem in origem_dado.split(',')]
            origem_conditions = []
            for origem in origens:
                origem_conditions.append("TRIM(cp.origem_dado) = %s")
                params.append(origem)
            conditions.append(f"({' OR '.join(origem_conditions)})")

        if tipo_baixa:
            tipos = [int(t.strip()) for t in tipo_baixa.split(',')]
            tipo_placeholders = ', '.join(['%s'] * len(tipos))
            conditions.append(f"cp.id_tipo_baixa IN ({tipo_placeholders})")
            params.extend(tipos)

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM cp.data_pagamento) IN ({ano_placeholders})")
            params.extend(anos)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT 
                TO_CHAR(cp.data_pagamento, 'YYYY-MM') as mes,
                EXTRACT(MONTH FROM cp.data_pagamento) as mes_num,
                COALESCE(SUM(cp.valor_liquido), 0) as valor_total,
                COUNT(*) as quantidade
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
            GROUP BY TO_CHAR(cp.data_pagamento, 'YYYY-MM'), EXTRACT(MONTH FROM cp.data_pagamento)
            ORDER BY mes
        """

        cursor.execute(query, params)
        rows = cursor.fetchall()

        meses_nomes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
        resultado = []
        for row in rows:
            mes_num = int(row['mes_num'])
            resultado.append({
                'mes': row['mes'],
                'mes_nome': meses_nomes[mes_num],
                'valor': decimal_to_float(row['valor_total']),
                'quantidade': row['quantidade']
            })

        return resultado

    finally:
        cursor.close()
        conn.close()

@app.get("/api/estatisticas-por-empresa")
def get_estatisticas_por_empresa(
    centro_custo: Optional[int] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None
):
    """Retorna estatísticas de contas pagas agrupadas por empresa"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conditions = []
        params = []

        if centro_custo is not None:
            conditions.append("cp.id_interno_centro_custo = %s")
            params.append(centro_custo)

        if credor:
            conditions.append("cp.credor ILIKE %s")
            params.append(f"%{credor}%")

        if id_documento:
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = []
            for doc in docs:
                doc_conditions.append("TRIM(cp.id_documento) = %s")
                params.append(doc)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        if origem_dado:
            origens = [origem.strip() for origem in origem_dado.split(',')]
            origem_conditions = []
            for origem in origens:
                origem_conditions.append("TRIM(cp.origem_dado) = %s")
                params.append(origem)
            conditions.append(f"({' OR '.join(origem_conditions)})")

        if tipo_baixa:
            tipos = [int(t.strip()) for t in tipo_baixa.split(',')]
            tipo_placeholders = ', '.join(['%s'] * len(tipos))
            conditions.append(f"cp.id_tipo_baixa IN ({tipo_placeholders})")
            params.extend(tipos)

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM cp.data_pagamento) IN ({ano_placeholders})")
            params.extend(anos)

        if mes:
            meses = [int(m.strip()) for m in mes.split(',')]
            mes_placeholders = ', '.join(['%s'] * len(meses))
            conditions.append(f"EXTRACT(MONTH FROM cp.data_pagamento) IN ({mes_placeholders})")
            params.extend(meses)

        if data_inicio:
            conditions.append("cp.data_pagamento >= %s")
            params.append(data_inicio)

        if data_fim:
            conditions.append("cp.data_pagamento <= %s")
            params.append(data_fim)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT 
                COALESCE(cc.nome_empresa, 'Sem Empresa') as empresa,
                COALESCE(SUM(cp.valor_liquido), 0) as valor_total,
                COUNT(*) as quantidade
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
            GROUP BY cc.nome_empresa
            ORDER BY valor_total DESC
            LIMIT 15
        """

        cursor.execute(query, params)
        rows = cursor.fetchall()

        resultado = []
        for row in rows:
            resultado.append({
                'empresa': row['empresa'],
                'valor': decimal_to_float(row['valor_total']),
                'quantidade': row['quantidade']
            })

        return resultado

    finally:
        cursor.close()
        conn.close()

@app.get("/api/top-credores")
def get_top_credores(
    empresa: Optional[int] = None,
    centro_custo: Optional[int] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    limite: int = 10
):
    """Retorna top credores por valor pago"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conditions = []
        params = []

        if empresa is not None:
            conditions.append("cc.id_sienge_empresa = %s")
            params.append(empresa)

        if centro_custo is not None:
            conditions.append("cp.id_interno_centro_custo = %s")
            params.append(centro_custo)

        if id_documento:
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = []
            for doc in docs:
                doc_conditions.append("TRIM(cp.id_documento) = %s")
                params.append(doc)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        if origem_dado:
            origens = [origem.strip() for origem in origem_dado.split(',')]
            origem_conditions = []
            for origem in origens:
                origem_conditions.append("TRIM(cp.origem_dado) = %s")
                params.append(origem)
            conditions.append(f"({' OR '.join(origem_conditions)})")

        if tipo_baixa:
            tipos = [int(t.strip()) for t in tipo_baixa.split(',')]
            tipo_placeholders = ', '.join(['%s'] * len(tipos))
            conditions.append(f"cp.id_tipo_baixa IN ({tipo_placeholders})")
            params.extend(tipos)

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM cp.data_pagamento) IN ({ano_placeholders})")
            params.extend(anos)

        if mes:
            meses = [int(m.strip()) for m in mes.split(',')]
            mes_placeholders = ', '.join(['%s'] * len(meses))
            conditions.append(f"EXTRACT(MONTH FROM cp.data_pagamento) IN ({mes_placeholders})")
            params.extend(meses)

        if data_inicio:
            conditions.append("cp.data_pagamento >= %s")
            params.append(data_inicio)

        if data_fim:
            conditions.append("cp.data_pagamento <= %s")
            params.append(data_fim)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT 
                COALESCE(cp.credor, 'Sem Nome') as credor,
                COALESCE(SUM(cp.valor_liquido), 0) as valor_total,
                COUNT(*) as quantidade
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
            GROUP BY cp.credor
            ORDER BY valor_total DESC
            LIMIT %s
        """
        params.append(limite)

        cursor.execute(query, params)
        rows = cursor.fetchall()

        resultado = []
        for row in rows:
            resultado.append({
                'credor': row['credor'],
                'valor': decimal_to_float(row['valor_total']),
                'quantidade': row['quantidade']
            })

        return resultado

    finally:
        cursor.close()
        conn.close()

@app.get("/api/comparacao-anual")
def get_comparacao_anual(
    empresa: Optional[int] = None,
    centro_custo: Optional[int] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None
):
    """Retorna comparacao de pagamentos entre ano atual e anterior por mes"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conditions = []
        params = []

        if empresa is not None:
            conditions.append("cc.id_sienge_empresa = %s")
            params.append(empresa)

        if centro_custo is not None:
            conditions.append("cp.id_interno_centro_custo = %s")
            params.append(centro_custo)

        if credor:
            conditions.append("cp.credor ILIKE %s")
            params.append(f"%{credor}%")

        if id_documento:
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = []
            for doc in docs:
                doc_conditions.append("TRIM(cp.id_documento) = %s")
                params.append(doc)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        if origem_dado:
            origens = [origem.strip() for origem in origem_dado.split(',')]
            origem_conditions = []
            for origem in origens:
                origem_conditions.append("TRIM(cp.origem_dado) = %s")
                params.append(origem)
            conditions.append(f"({' OR '.join(origem_conditions)})")

        if tipo_baixa:
            tipos = [int(t.strip()) for t in tipo_baixa.split(',')]
            tipo_placeholders = ', '.join(['%s'] * len(tipos))
            conditions.append(f"cp.id_tipo_baixa IN ({tipo_placeholders})")
            params.extend(tipos)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            WITH dados_ano AS (
                SELECT 
                    EXTRACT(YEAR FROM cp.data_pagamento) as ano,
                    EXTRACT(MONTH FROM cp.data_pagamento) as mes,
                    COALESCE(SUM(cp.valor_liquido), 0) as valor_total
                FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE {where_clause}
                    AND EXTRACT(YEAR FROM cp.data_pagamento) >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
                GROUP BY ano, mes
            )
            SELECT 
                mes,
                COALESCE(MAX(CASE WHEN ano = EXTRACT(YEAR FROM CURRENT_DATE) THEN valor_total END), 0) as ano_atual,
                COALESCE(MAX(CASE WHEN ano = EXTRACT(YEAR FROM CURRENT_DATE) - 1 THEN valor_total END), 0) as ano_anterior
            FROM dados_ano
            GROUP BY mes
            ORDER BY mes
        """

        cursor.execute(query, params)
        rows = cursor.fetchall()

        meses_nomes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
        resultado = []
        for row in rows:
            mes_num = int(row['mes'])
            ano_atual = decimal_to_float(row['ano_atual'])
            ano_anterior = decimal_to_float(row['ano_anterior'])
            variacao = 0
            if ano_anterior > 0:
                variacao = ((ano_atual - ano_anterior) / ano_anterior) * 100
            resultado.append({
                'mes_nome': meses_nomes[mes_num],
                'ano_atual': ano_atual,
                'ano_anterior': ano_anterior,
                'variacao': round(variacao, 1)
            })

        return resultado

    finally:
        cursor.close()
        conn.close()

@app.get("/api/comparacao-mensal")
def get_comparacao_mensal(
    empresa: Optional[int] = None,
    centro_custo: Optional[int] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None
):
    """Retorna evolucao dos ultimos 12 meses com variacao percentual"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conditions = []
        params = []

        if empresa is not None:
            conditions.append("cc.id_sienge_empresa = %s")
            params.append(empresa)

        if centro_custo is not None:
            conditions.append("cp.id_interno_centro_custo = %s")
            params.append(centro_custo)

        if credor:
            conditions.append("cp.credor ILIKE %s")
            params.append(f"%{credor}%")

        if id_documento:
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = []
            for doc in docs:
                doc_conditions.append("TRIM(cp.id_documento) = %s")
                params.append(doc)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        if origem_dado:
            origens = [origem.strip() for origem in origem_dado.split(',')]
            origem_conditions = []
            for origem in origens:
                origem_conditions.append("TRIM(cp.origem_dado) = %s")
                params.append(origem)
            conditions.append(f"({' OR '.join(origem_conditions)})")

        if tipo_baixa:
            tipos = [int(t.strip()) for t in tipo_baixa.split(',')]
            tipo_placeholders = ', '.join(['%s'] * len(tipos))
            conditions.append(f"cp.id_tipo_baixa IN ({tipo_placeholders})")
            params.extend(tipos)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT 
                TO_CHAR(cp.data_pagamento, 'MM/YY') as periodo,
                TO_CHAR(cp.data_pagamento, 'YYYY-MM') as ordem,
                COALESCE(SUM(cp.valor_liquido), 0) as valor_total
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
                AND cp.data_pagamento >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
            GROUP BY periodo, ordem
            ORDER BY ordem
        """

        cursor.execute(query, params)
        rows = cursor.fetchall()

        resultado = []
        valor_anterior = 0
        for row in rows:
            valor = decimal_to_float(row['valor_total'])
            variacao = 0
            if valor_anterior > 0:
                variacao = ((valor - valor_anterior) / valor_anterior) * 100
            resultado.append({
                'periodo': row['periodo'],
                'valor': valor,
                'variacao': round(variacao, 1)
            })
            valor_anterior = valor

        return resultado

    finally:
        cursor.close()
        conn.close()

# ==================== KPIs ====================

# Conexão com banco local (Replit PostgreSQL) para KPIs
def get_local_db_connection():
    """Cria conexão com o banco de dados local (Replit PostgreSQL)"""
    try:
        database_url = os.environ.get('DATABASE_URL')
        if not database_url:
            raise HTTPException(status_code=500, detail="DATABASE_URL não configurado")
        conn = psycopg2.connect(database_url, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao conectar ao banco local: {str(e)}")

# Modelos Pydantic para KPIs
class KPIBase(BaseModel):
    descricao: str
    categoria: Optional[str] = None
    indice: Optional[str] = None
    formula: Optional[str] = None
    meta: Optional[float] = None
    tipo_meta: Optional[str] = None  # 'maior', 'menor', 'igual'
    unidade: Optional[str] = None
    ativo: bool = True
    calculo_automatico: Optional[str] = None
    documentos_excluidos: Optional[str] = None  # Lista de tipos separados por vírgula

class KPICreate(KPIBase):
    pass

class KPIUpdate(BaseModel):
    descricao: Optional[str] = None
    categoria: Optional[str] = None
    indice: Optional[str] = None
    formula: Optional[str] = None
    meta: Optional[float] = None
    tipo_meta: Optional[str] = None
    unidade: Optional[str] = None
    ativo: Optional[bool] = None
    calculo_automatico: Optional[str] = None
    documentos_excluidos: Optional[str] = None

class KPIResponse(KPIBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class KPIHistoricoCreate(BaseModel):
    valor: float
    data_registro: Optional[date] = None

class KPIHistoricoResponse(BaseModel):
    id: int
    kpi_id: int
    valor: float
    data_registro: date
    created_at: Optional[datetime] = None

# Endpoints de KPIs

@app.get("/api/kpis", response_model=List[KPIResponse])
def get_kpis(ativo: Optional[bool] = None):
    """Retorna lista de todos os KPIs"""
    conn = get_local_db_connection()
    cursor = conn.cursor()

    try:
        if ativo is not None:
            cursor.execute("SELECT * FROM kpis WHERE ativo = %s ORDER BY id", (ativo,))
        else:
            cursor.execute("SELECT * FROM kpis ORDER BY id")
        
        rows = cursor.fetchall()
        resultado = []
        for row in rows:
            resultado.append({
                'id': row['id'],
                'descricao': row['descricao'],
                'categoria': row['categoria'],
                'indice': row['indice'],
                'formula': row['formula'],
                'meta': decimal_to_float(row['meta']) if row['meta'] else None,
                'tipo_meta': row['tipo_meta'],
                'unidade': row['unidade'],
                'ativo': row['ativo'],
                'calculo_automatico': row.get('calculo_automatico'),
                'documentos_excluidos': row.get('documentos_excluidos'),
                'created_at': row['created_at'],
                'updated_at': row['updated_at']
            })
        return resultado

    finally:
        cursor.close()
        conn.close()

@app.get("/api/kpis/{kpi_id}", response_model=KPIResponse)
def get_kpi(kpi_id: int):
    """Retorna um KPI específico"""
    conn = get_local_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM kpis WHERE id = %s", (kpi_id,))
        row = cursor.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="KPI não encontrado")
        
        return {
            'id': row['id'],
            'descricao': row['descricao'],
            'categoria': row['categoria'],
            'indice': row['indice'],
            'formula': row['formula'],
            'meta': decimal_to_float(row['meta']) if row['meta'] else None,
            'tipo_meta': row['tipo_meta'],
            'unidade': row['unidade'],
            'ativo': row['ativo'],
            'calculo_automatico': row.get('calculo_automatico'),
            'documentos_excluidos': row.get('documentos_excluidos'),
            'created_at': row['created_at'],
            'updated_at': row['updated_at']
        }

    finally:
        cursor.close()
        conn.close()

@app.post("/api/kpis", response_model=KPIResponse)
def create_kpi(kpi: KPICreate):
    """Cria um novo KPI"""
    conn = get_local_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO kpis (descricao, categoria, indice, formula, meta, tipo_meta, unidade, ativo, calculo_automatico, documentos_excluidos)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (kpi.descricao, kpi.categoria, kpi.indice, kpi.formula, kpi.meta, kpi.tipo_meta, kpi.unidade, kpi.ativo, kpi.calculo_automatico, kpi.documentos_excluidos))
        
        row = cursor.fetchone()
        conn.commit()
        
        return {
            'id': row['id'],
            'descricao': row['descricao'],
            'categoria': row['categoria'],
            'indice': row['indice'],
            'formula': row['formula'],
            'meta': decimal_to_float(row['meta']) if row['meta'] else None,
            'tipo_meta': row['tipo_meta'],
            'unidade': row['unidade'],
            'ativo': row['ativo'],
            'calculo_automatico': row.get('calculo_automatico'),
            'documentos_excluidos': row.get('documentos_excluidos'),
            'created_at': row['created_at'],
            'updated_at': row['updated_at']
        }

    finally:
        cursor.close()
        conn.close()

@app.put("/api/kpis/{kpi_id}", response_model=KPIResponse)
def update_kpi(kpi_id: int, kpi: KPIUpdate):
    """Atualiza um KPI existente"""
    conn = get_local_db_connection()
    cursor = conn.cursor()

    try:
        # Verificar se existe
        cursor.execute("SELECT * FROM kpis WHERE id = %s", (kpi_id,))
        existing = cursor.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="KPI não encontrado")

        # Construir query de update apenas com campos fornecidos
        updates = []
        params = []
        
        if kpi.descricao is not None:
            updates.append("descricao = %s")
            params.append(kpi.descricao)
        if kpi.categoria is not None:
            updates.append("categoria = %s")
            params.append(kpi.categoria)
        if kpi.indice is not None:
            updates.append("indice = %s")
            params.append(kpi.indice)
        if kpi.formula is not None:
            updates.append("formula = %s")
            params.append(kpi.formula)
        if kpi.meta is not None:
            updates.append("meta = %s")
            params.append(kpi.meta)
        if kpi.tipo_meta is not None:
            updates.append("tipo_meta = %s")
            params.append(kpi.tipo_meta)
        if kpi.unidade is not None:
            updates.append("unidade = %s")
            params.append(kpi.unidade)
        if kpi.ativo is not None:
            updates.append("ativo = %s")
            params.append(kpi.ativo)
        if kpi.calculo_automatico is not None:
            updates.append("calculo_automatico = %s")
            params.append(kpi.calculo_automatico if kpi.calculo_automatico else None)
        if kpi.documentos_excluidos is not None:
            updates.append("documentos_excluidos = %s")
            params.append(kpi.documentos_excluidos if kpi.documentos_excluidos else None)

        if updates:
            updates.append("updated_at = NOW()")
            params.append(kpi_id)
            
            cursor.execute(f"""
                UPDATE kpis SET {', '.join(updates)}
                WHERE id = %s
                RETURNING *
            """, params)
            
            row = cursor.fetchone()
            conn.commit()
        else:
            row = existing

        return {
            'id': row['id'],
            'descricao': row['descricao'],
            'categoria': row['categoria'],
            'indice': row['indice'],
            'formula': row['formula'],
            'meta': decimal_to_float(row['meta']) if row['meta'] else None,
            'tipo_meta': row['tipo_meta'],
            'unidade': row['unidade'],
            'ativo': row['ativo'],
            'calculo_automatico': row.get('calculo_automatico'),
            'documentos_excluidos': row.get('documentos_excluidos'),
            'created_at': row['created_at'],
            'updated_at': row['updated_at']
        }

    finally:
        cursor.close()
        conn.close()

@app.delete("/api/kpis/{kpi_id}")
def delete_kpi(kpi_id: int):
    """Exclui um KPI"""
    conn = get_local_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT id FROM kpis WHERE id = %s", (kpi_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="KPI não encontrado")

        # Excluir histórico primeiro
        cursor.execute("DELETE FROM kpis_historico WHERE kpi_id = %s", (kpi_id,))
        cursor.execute("DELETE FROM kpis WHERE id = %s", (kpi_id,))
        conn.commit()
        
        return {"message": "KPI excluído com sucesso"}

    finally:
        cursor.close()
        conn.close()

@app.get("/api/kpis/{kpi_id}/historico", response_model=List[KPIHistoricoResponse])
def get_kpi_historico(kpi_id: int, limite: int = 30):
    """Retorna histórico de valores de um KPI"""
    conn = get_local_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT * FROM kpis_historico 
            WHERE kpi_id = %s 
            ORDER BY data_registro DESC 
            LIMIT %s
        """, (kpi_id, limite))
        
        rows = cursor.fetchall()
        resultado = []
        for row in rows:
            resultado.append({
                'id': row['id'],
                'kpi_id': row['kpi_id'],
                'valor': decimal_to_float(row['valor']),
                'data_registro': row['data_registro'],
                'created_at': row['created_at']
            })
        return resultado

    finally:
        cursor.close()
        conn.close()

@app.post("/api/kpis/{kpi_id}/registrar-valor", response_model=KPIHistoricoResponse)
def registrar_valor_kpi(kpi_id: int, dados: KPIHistoricoCreate):
    """Registra um novo valor para um KPI"""
    conn = get_local_db_connection()
    cursor = conn.cursor()

    try:
        # Verificar se KPI existe
        cursor.execute("SELECT id FROM kpis WHERE id = %s", (kpi_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="KPI não encontrado")

        data_registro = dados.data_registro or datetime.now().date()

        cursor.execute("""
            INSERT INTO kpis_historico (kpi_id, valor, data_registro)
            VALUES (%s, %s, %s)
            RETURNING *
        """, (kpi_id, dados.valor, data_registro))
        
        row = cursor.fetchone()
        conn.commit()
        
        return {
            'id': row['id'],
            'kpi_id': row['kpi_id'],
            'valor': decimal_to_float(row['valor']),
            'data_registro': row['data_registro'],
            'created_at': row['created_at']
        }

    finally:
        cursor.close()
        conn.close()

def calcular_kpi_automatico(calculo_automatico: str, documentos_excluidos: Optional[str] = None) -> dict:
    """Calcula valor de KPI automático baseado no identificador
    
    Args:
        calculo_automatico: Identificador do cálculo a ser realizado
        documentos_excluidos: String com tipos de documento separados por vírgula para excluir
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        hoje = datetime.now().date()
        valor = None
        
        # Se não tiver documentos específicos, usa padrão (PPC, PRV, PRC)
        if documentos_excluidos:
            docs = [f"'{d.strip()}'" for d in documentos_excluidos.split(',') if d.strip()]
            if docs:
                filtro_previsao = f"AND TRIM(id_documento) NOT IN ({', '.join(docs)})"
                filtro_previsao_pagas = f"AND TRIM(id_documento) NOT IN ({', '.join(docs)})"
            else:
                filtro_previsao = ""
                filtro_previsao_pagas = ""
        else:
            # Padrão: excluir PPC, PRV, PRC
            filtro_previsao = "AND TRIM(id_documento) NOT IN ('PPC', 'PRV', 'PRC')"
            filtro_previsao_pagas = "AND TRIM(id_documento) NOT IN ('PPC', 'PRV', 'PRC')"
        
        if calculo_automatico == 'titulos_vencidos_qtd':
            cursor.execute(f"""
                SELECT COUNT(*) as valor FROM contas_a_pagar 
                WHERE data_vencimento < %s {filtro_previsao}
            """, (hoje,))
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'titulos_vencidos_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(valor_total), 0) as valor FROM contas_a_pagar 
                WHERE data_vencimento < %s {filtro_previsao}
            """, (hoje,))
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
            
        elif calculo_automatico == 'titulos_a_vencer_qtd':
            cursor.execute(f"""
                SELECT COUNT(*) as valor FROM contas_a_pagar 
                WHERE data_vencimento >= %s {filtro_previsao}
            """, (hoje,))
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'titulos_a_vencer_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(valor_total), 0) as valor FROM contas_a_pagar 
                WHERE data_vencimento >= %s {filtro_previsao}
            """, (hoje,))
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
            
        elif calculo_automatico == 'titulos_pagos_mes_qtd':
            cursor.execute(f"""
                SELECT COUNT(*) as valor FROM contas_pagas 
                WHERE EXTRACT(MONTH FROM data_pagamento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM data_pagamento) = EXTRACT(YEAR FROM CURRENT_DATE)
                {filtro_previsao_pagas}
            """)
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'titulos_pagos_mes_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(valor_liquido), 0) as valor FROM contas_pagas 
                WHERE EXTRACT(MONTH FROM data_pagamento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM data_pagamento) = EXTRACT(YEAR FROM CURRENT_DATE)
                {filtro_previsao_pagas}
            """)
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
            
        elif calculo_automatico == 'titulos_vencidos_2025_qtd':
            cursor.execute(f"""
                SELECT COUNT(*) as valor FROM contas_a_pagar 
                WHERE data_vencimento < %s
                AND EXTRACT(YEAR FROM data_vencimento) = 2025
                {filtro_previsao}
            """, (hoje,))
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'titulos_vencidos_2025_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(valor_total), 0) as valor FROM contas_a_pagar 
                WHERE data_vencimento < %s
                AND EXTRACT(YEAR FROM data_vencimento) = 2025
                {filtro_previsao}
            """, (hoje,))
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
        
        elif calculo_automatico == 'contas_a_pagar_hoje_qtd':
            cursor.execute(f"""
                SELECT COUNT(*) as valor FROM contas_a_pagar 
                WHERE data_vencimento = %s {filtro_previsao}
            """, (hoje,))
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'contas_a_pagar_hoje_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(valor_total), 0) as valor FROM contas_a_pagar 
                WHERE data_vencimento = %s {filtro_previsao}
            """, (hoje,))
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
            
        elif calculo_automatico == 'contas_a_pagar_7dias_qtd':
            cursor.execute(f"""
                SELECT COUNT(*) as valor FROM contas_a_pagar 
                WHERE data_vencimento BETWEEN %s AND %s {filtro_previsao}
            """, (hoje, hoje + timedelta(days=7)))
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'contas_a_pagar_7dias_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(valor_total), 0) as valor FROM contas_a_pagar 
                WHERE data_vencimento BETWEEN %s AND %s {filtro_previsao}
            """, (hoje, hoje + timedelta(days=7)))
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
            
        elif calculo_automatico == 'contas_a_pagar_mes_qtd':
            cursor.execute(f"""
                SELECT COUNT(*) as valor FROM contas_a_pagar 
                WHERE EXTRACT(MONTH FROM data_vencimento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM data_vencimento) = EXTRACT(YEAR FROM CURRENT_DATE)
                {filtro_previsao}
            """)
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'contas_a_pagar_mes_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(valor_total), 0) as valor FROM contas_a_pagar 
                WHERE EXTRACT(MONTH FROM data_vencimento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM data_vencimento) = EXTRACT(YEAR FROM CURRENT_DATE)
                {filtro_previsao}
            """)
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
            
        elif calculo_automatico == 'ticket_medio_pagamentos_mes':
            cursor.execute(f"""
                SELECT COALESCE(AVG(valor_liquido), 0) as valor FROM contas_pagas 
                WHERE EXTRACT(MONTH FROM data_pagamento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM data_pagamento) = EXTRACT(YEAR FROM CURRENT_DATE)
                {filtro_previsao_pagas}
            """)
            result = cursor.fetchone()
            valor = round(decimal_to_float(result['valor']), 2) if result else 0
            
        elif calculo_automatico == 'percentual_inadimplencia':
            cursor.execute(f"""
                SELECT 
                    CASE WHEN total_aberto > 0 
                        THEN (total_vencido::numeric / total_aberto::numeric) * 100 
                        ELSE 0 
                    END as valor
                FROM (
                    SELECT 
                        (SELECT COALESCE(SUM(valor_total), 0) FROM contas_a_pagar WHERE data_vencimento < CURRENT_DATE {filtro_previsao}) as total_vencido,
                        (SELECT COALESCE(SUM(valor_total), 0) FROM contas_a_pagar WHERE 1=1 {filtro_previsao}) as total_aberto
                ) subq
            """)
            result = cursor.fetchone()
            valor = round(decimal_to_float(result['valor']), 2) if result else 0
        
        return {'valor': valor, 'data': hoje}
        
    finally:
        cursor.close()
        conn.close()

@app.get("/api/kpis-resumo")
def get_kpis_resumo():
    """Retorna resumo de todos os KPIs ativos com último valor e comparação com meta"""
    conn = get_local_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT k.*, 
                   h.valor as ultimo_valor,
                   h.data_registro as ultima_atualizacao
            FROM kpis k
            LEFT JOIN LATERAL (
                SELECT valor, data_registro 
                FROM kpis_historico 
                WHERE kpi_id = k.id 
                ORDER BY data_registro DESC 
                LIMIT 1
            ) h ON true
            WHERE k.ativo = true
            ORDER BY k.categoria, k.descricao
        """)
        
        rows = cursor.fetchall()
        resultado = []
        
        for row in rows:
            ultimo_valor = decimal_to_float(row['ultimo_valor']) if row['ultimo_valor'] else None
            ultima_atualizacao = row['ultima_atualizacao']
            meta = decimal_to_float(row['meta']) if row['meta'] else None
            calculo_automatico = row.get('calculo_automatico')
            documentos_excluidos = row.get('documentos_excluidos')
            
            # Se for KPI automático, calcular valor em tempo real
            if calculo_automatico:
                try:
                    calc_result = calcular_kpi_automatico(calculo_automatico, documentos_excluidos)
                    if calc_result['valor'] is not None:
                        ultimo_valor = calc_result['valor']
                        ultima_atualizacao = calc_result['data']
                except Exception as e:
                    print(f"Erro ao calcular KPI automático {calculo_automatico}: {e}")
            
            # Calcular status em relação à meta
            status_meta = None
            if ultimo_valor is not None and meta is not None:
                tipo_meta = row['tipo_meta'] or 'maior'
                if tipo_meta == 'maior':
                    status_meta = 'ok' if ultimo_valor >= meta else 'atencao'
                elif tipo_meta == 'menor':
                    status_meta = 'ok' if ultimo_valor <= meta else 'atencao'
                else:  # igual
                    status_meta = 'ok' if abs(ultimo_valor - meta) < 0.01 else 'atencao'
            
            resultado.append({
                'id': row['id'],
                'descricao': row['descricao'],
                'categoria': row['categoria'],
                'indice': row['indice'],
                'meta': meta,
                'tipo_meta': row['tipo_meta'],
                'unidade': row['unidade'],
                'ultimo_valor': ultimo_valor,
                'ultima_atualizacao': ultima_atualizacao,
                'status_meta': status_meta,
                'calculo_automatico': calculo_automatico,
                'documentos_excluidos': documentos_excluidos
            })
        
        return resultado

    finally:
        cursor.close()
        conn.close()

@app.get("/api/calculos-disponiveis")
def get_calculos_disponiveis():
    """Retorna lista de cálculos automáticos disponíveis"""
    return [
        {'id': 'titulos_vencidos_qtd', 'nome': 'Títulos Vencidos (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'titulos_vencidos_valor', 'nome': 'Títulos Vencidos (Valor)', 'unidade': 'R$'},
        {'id': 'titulos_vencidos_2025_qtd', 'nome': 'Títulos Vencidos em 2025 (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'titulos_vencidos_2025_valor', 'nome': 'Títulos Vencidos em 2025 (Valor)', 'unidade': 'R$'},
        {'id': 'titulos_a_vencer_qtd', 'nome': 'Títulos a Vencer (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'titulos_a_vencer_valor', 'nome': 'Títulos a Vencer (Valor)', 'unidade': 'R$'},
        {'id': 'titulos_pagos_mes_qtd', 'nome': 'Títulos Pagos no Mês (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'titulos_pagos_mes_valor', 'nome': 'Títulos Pagos no Mês (Valor)', 'unidade': 'R$'},
        {'id': 'contas_a_pagar_hoje_qtd', 'nome': 'Contas a Pagar Hoje (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'contas_a_pagar_hoje_valor', 'nome': 'Contas a Pagar Hoje (Valor)', 'unidade': 'R$'},
        {'id': 'contas_a_pagar_7dias_qtd', 'nome': 'Contas a Pagar em 7 Dias (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'contas_a_pagar_7dias_valor', 'nome': 'Contas a Pagar em 7 Dias (Valor)', 'unidade': 'R$'},
        {'id': 'contas_a_pagar_mes_qtd', 'nome': 'Contas a Pagar no Mês (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'contas_a_pagar_mes_valor', 'nome': 'Contas a Pagar no Mês (Valor)', 'unidade': 'R$'},
        {'id': 'ticket_medio_pagamentos_mes', 'nome': 'Ticket Médio de Pagamentos no Mês', 'unidade': 'R$'},
        {'id': 'percentual_inadimplencia', 'nome': 'Percentual de Inadimplência', 'unidade': '%'},
    ]

@app.get("/api/tipos-documento-kpi")
def get_tipos_documento_kpi():
    """Retorna lista de tipos de documento para exclusão em KPIs"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT TRIM(id_documento) as id, TRIM(nome_documento) as nome
            FROM ecaddocumento
            ORDER BY id_documento
        """)
        rows = cursor.fetchall()
        return [{'id': row['id'], 'nome': row['nome']} for row in rows]

    finally:
        cursor.close()
        conn.close()

FRONTEND_BUILD_DIR = Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_BUILD_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_BUILD_DIR / "assets"), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = FRONTEND_BUILD_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_BUILD_DIR / "index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
