from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor
from decimal import Decimal
import os
from pathlib import Path
from passlib.context import CryptContext
from jose import JWTError, jwt

app = FastAPI(title="Dashboard Financeiro - Construtora")

# Configuração de segurança JWT
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'fallback-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 horas

# Configuração de hash de senha
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Em produção, especifique os domínios permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuração do banco de dados externo (dados financeiros)
DB_CONFIG = {
    'host': '8iv70o.easypanel.host',
    'port': 42128,
    'database': 'ecbiesek',
    'user': 'dtKJdFrDX5dt',
    'password': 'dtM7gvwVaDaieR0xqNNGRGnJeo6fYhOnCTdt'
}

# Configuração do banco de dados Replit (metas e configurações)
REPLIT_DB_URL = os.environ.get('DATABASE_URL')

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

class OrigemMetaCreate(BaseModel):
    descricao: str
    origens: List[str]  # Lista de origens (ex: ["AC", "CF"])
    meta_percentual: float  # Meta em percentual (ex: 90.0 para 90%)

class OrigemMetaUpdate(BaseModel):
    descricao: Optional[str] = None
    origens: Optional[List[str]] = None
    meta_percentual: Optional[float] = None

# Modelos de autenticação
class UserCreate(BaseModel):
    email: str
    nome: str
    senha: str

class UserLogin(BaseModel):
    email: str
    senha: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    email: str
    nome: str
    ativo: bool

# Funções auxiliares
def get_db_connection():
    """Cria conexão com o banco de dados externo (dados financeiros)"""
    try:
        conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao conectar ao banco: {str(e)}")

def get_replit_db_connection():
    """Cria conexão com o banco de dados Replit (metas e configurações)"""
    try:
        if not REPLIT_DB_URL:
            raise HTTPException(status_code=500, detail="Banco de dados Replit não configurado")
        conn = psycopg2.connect(REPLIT_DB_URL, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao conectar ao banco Replit: {str(e)}")

def decimal_to_float(obj):
    """Converte Decimal para float"""
    if isinstance(obj, Decimal):
        return float(obj)
    return obj

def create_origem_metas_table():
    """Cria tabela de metas por origem no banco Replit se não existir"""
    if not REPLIT_DB_URL:
        print("Banco de dados Replit não configurado, pulando criação de tabela origem_metas")
        return
    conn = get_replit_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS origem_metas (
                id SERIAL PRIMARY KEY,
                descricao VARCHAR(255) NOT NULL,
                origens TEXT NOT NULL,
                meta_percentual NUMERIC(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        print("Tabela origem_metas criada/verificada com sucesso")
    except Exception as e:
        conn.rollback()
        print(f"Erro ao criar tabela origem_metas: {e}")
    finally:
        cursor.close()
        conn.close()

create_origem_metas_table()

# ============ AUTENTICAÇÃO ============

def create_users_table():
    """Cria tabela de usuários no banco Replit se não existir"""
    if not REPLIT_DB_URL:
        print("Banco de dados Replit não configurado, pulando criação de tabela usuarios")
        return
    conn = get_replit_db_connection()
    cursor = conn.cursor()
    try:
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
        print("Tabela usuarios criada/verificada com sucesso")
    except Exception as e:
        conn.rollback()
        print(f"Erro ao criar tabela usuarios: {e}")
    finally:
        cursor.close()
        conn.close()

create_users_table()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica se a senha corresponde ao hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Gera hash da senha"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Cria token JWT"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def get_user_by_email(email: str):
    """Busca usuário por email"""
    if not REPLIT_DB_URL:
        return None
    conn = get_replit_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, email, nome, senha_hash, ativo FROM usuarios WHERE email = %s", (email,))
        return cursor.fetchone()
    finally:
        cursor.close()
        conn.close()

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Obtém usuário atual a partir do token JWT"""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autenticado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = get_user_by_email(email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

async def get_current_user_optional(token: str = Depends(oauth2_scheme)):
    """Obtém usuário atual se autenticado, ou None se não"""
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        return get_user_by_email(email)
    except JWTError:
        return None

# Endpoints de autenticação
@app.post("/api/auth/register")
def register_user(user: UserCreate):
    """Registra novo usuário"""
    if not REPLIT_DB_URL:
        raise HTTPException(status_code=500, detail="Banco de dados não configurado")
    
    existing_user = get_user_by_email(user.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    if len(user.senha) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter pelo menos 6 caracteres")
    
    senha_hash = get_password_hash(user.senha)
    
    conn = get_replit_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO usuarios (email, nome, senha_hash)
            VALUES (%s, %s, %s)
            RETURNING id
        """, (user.email.lower(), user.nome, senha_hash))
        new_id = cursor.fetchone()['id']
        conn.commit()
        
        access_token = create_access_token(data={"sub": user.email.lower()})
        return {"access_token": access_token, "token_type": "bearer", "user": {"id": new_id, "email": user.email.lower(), "nome": user.nome}}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.post("/api/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login de usuário"""
    user = get_user_by_email(form_data.username.lower())
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not verify_password(form_data.password, user['senha_hash']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user['ativo']:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário desativado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user['email']})
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": user['id'], "email": user['email'], "nome": user['nome']}}

@app.post("/api/auth/login-json")
def login_json(user_login: UserLogin):
    """Login de usuário via JSON"""
    user = get_user_by_email(user_login.email.lower())
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )
    
    if not verify_password(user_login.senha, user['senha_hash']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )
    
    if not user['ativo']:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário desativado",
        )
    
    access_token = create_access_token(data={"sub": user['email']})
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": user['id'], "email": user['email'], "nome": user['nome']}}

@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Retorna dados do usuário autenticado"""
    return {"id": current_user['id'], "email": current_user['email'], "nome": current_user['nome'], "ativo": current_user['ativo']}

@app.get("/api/auth/check")
async def check_auth(current_user: dict = Depends(get_current_user_optional)):
    """Verifica se usuário está autenticado"""
    if current_user:
        return {"authenticated": True, "user": {"id": current_user['id'], "email": current_user['email'], "nome": current_user['nome']}}
    return {"authenticated": False}

# Endpoints
@app.get("/api/health")
def health_check():
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
                SELECT cp.credor, cp.data_pagamento as data_vencimento, cp.valor_liquido as valor_total,
                       cp.lancamento, cp.numero_documento, cp.id_plano_financeiro,
                       cp.id_interno_empresa, cp.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto
                FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                ORDER BY cp.data_pagamento DESC
                LIMIT %s
            """
            cursor.execute(query, (limite,))
        elif status == "a_pagar":
            query = """
                SELECT cap.credor, cap.data_vencimento, cap.valor_total,
                       cap.lancamento, cap.numero_documento, cap.id_plano_financeiro,
                       cap.id_interno_empresa, cap.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto,
                       TRIM(cap.id_documento) as id_documento
                FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cap.data_vencimento >= %s
                ORDER BY cap.data_vencimento ASC
                LIMIT %s
            """
            cursor.execute(query, (hoje, limite))
        elif status == "em_atraso":
            query = """
                SELECT cap.credor, cap.data_vencimento, cap.valor_total,
                       cap.lancamento, cap.numero_documento, cap.id_plano_financeiro,
                       cap.id_interno_empresa, cap.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto,
                       TRIM(cap.id_documento) as id_documento
                FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cap.data_vencimento < %s
                ORDER BY cap.data_vencimento ASC
                LIMIT %s
            """
            cursor.execute(query, (hoje, limite))
        else:
            query = """
                SELECT cap.credor, cap.data_vencimento, cap.valor_total,
                       cap.lancamento, cap.numero_documento, cap.id_plano_financeiro,
                       cap.id_interno_empresa, cap.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto
                FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                ORDER BY cap.data_vencimento DESC
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

@app.get("/api/estatisticas-por-origem")
def get_estatisticas_por_origem(
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
    """Retorna estatísticas de contas pagas agrupadas por origem"""
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
                origem_conditions.append("TRIM(cp.id_origem) = %s")
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
                COALESCE(TRIM(cp.id_origem), 'Sem Origem') as origem,
                COALESCE(SUM(cp.valor_liquido), 0) as valor_total,
                COUNT(*) as quantidade
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
            GROUP BY TRIM(cp.id_origem)
            ORDER BY valor_total DESC
        """

        cursor.execute(query, params)
        rows = cursor.fetchall()

        resultado = []
        for row in rows:
            resultado.append({
                'origem': row['origem'],
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

@app.get("/api/ranking-credores")
def get_ranking_credores(
    empresa: Optional[int] = None,
    centro_custo: Optional[int] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None
):
    """Retorna ranking completo de credores com percentuais e Pareto"""
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
            WITH credores_agregados AS (
                SELECT 
                    COALESCE(cp.credor, 'Sem Nome') as credor,
                    COALESCE(SUM(cp.valor_liquido), 0) as valor_pago,
                    COALESCE(SUM(cp.valor_acrescimo), 0) as valor_acrescimo,
                    COALESCE(SUM(cp.valor_desconto), 0) as valor_desconto,
                    COUNT(*) as quantidade
                FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE {where_clause}
                GROUP BY cp.credor
            ),
            total AS (
                SELECT COALESCE(SUM(valor_pago), 0) as total_geral FROM credores_agregados
            ),
            ranking AS (
                SELECT 
                    c.credor,
                    c.valor_pago,
                    c.valor_acrescimo,
                    c.valor_desconto,
                    c.quantidade,
                    ROW_NUMBER() OVER (ORDER BY c.valor_pago DESC) as rank,
                    CASE WHEN t.total_geral > 0 
                         THEN ROUND((c.valor_pago / t.total_geral * 100)::numeric, 2) 
                         ELSE 0 
                    END as percentual,
                    CASE WHEN t.total_geral > 0 
                         THEN ROUND((SUM(c.valor_pago) OVER (ORDER BY c.valor_pago DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) / t.total_geral * 100)::numeric, 2)
                         ELSE 0 
                    END as percentual_acumulado
                FROM credores_agregados c
                CROSS JOIN total t
                ORDER BY c.valor_pago DESC
            )
            SELECT * FROM ranking
        """

        cursor.execute(query, params)
        rows = cursor.fetchall()

        total_geral = sum(decimal_to_float(row['valor_pago']) for row in rows) if rows else 0
        
        resultado = []
        for row in rows:
            resultado.append({
                'credor': row['credor'],
                'valor_pago': decimal_to_float(row['valor_pago']),
                'valor_acrescimo': decimal_to_float(row['valor_acrescimo']),
                'valor_desconto': decimal_to_float(row['valor_desconto']),
                'quantidade': row['quantidade'],
                'rank': row['rank'],
                'percentual': float(row['percentual']),
                'percentual_acumulado': float(row['percentual_acumulado'])
            })

        return {
            'credores': resultado,
            'total_geral': total_geral,
            'total_credores': len(resultado)
        }

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

def init_kpi_tables():
    """Inicializa as tabelas de KPIs no banco local se não existirem"""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("DATABASE_URL não configurado - tabelas de KPI não serão criadas")
        return
    
    try:
        conn = psycopg2.connect(database_url, cursor_factory=RealDictCursor)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS kpis (
                id SERIAL PRIMARY KEY,
                descricao VARCHAR(500) NOT NULL,
                categoria VARCHAR(100),
                indice VARCHAR(50),
                formula TEXT,
                meta DECIMAL(18, 2),
                tipo_meta VARCHAR(20) DEFAULT 'maior',
                unidade VARCHAR(50),
                ativo BOOLEAN DEFAULT true,
                calculo_automatico VARCHAR(100),
                documentos_excluidos TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS kpis_historico (
                id SERIAL PRIMARY KEY,
                kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
                valor DECIMAL(18, 2) NOT NULL,
                data_registro DATE NOT NULL DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(kpi_id, data_registro)
            )
        """)
        
        conn.commit()
        print("Tabelas de KPI inicializadas com sucesso")
    except Exception as e:
        print(f"Erro ao inicializar tabelas de KPI: {e}")
    finally:
        if 'cursor' in dir():
            cursor.close()
        if 'conn' in dir():
            conn.close()

init_kpi_tables()

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
        
        elif calculo_automatico == 'receber_vencidos_qtd':
            cursor.execute(f"""
                SELECT COUNT(*) as valor FROM contas_a_receber 
                WHERE data_vencimento < %s
            """, (hoje,))
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'receber_vencidos_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(valor_total), 0) as valor FROM contas_a_receber 
                WHERE data_vencimento < %s
            """, (hoje,))
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
            
        elif calculo_automatico == 'receber_a_vencer_qtd':
            cursor.execute(f"""
                SELECT COUNT(*) as valor FROM contas_a_receber 
                WHERE data_vencimento >= %s
            """, (hoje,))
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'receber_a_vencer_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(valor_total), 0) as valor FROM contas_a_receber 
                WHERE data_vencimento >= %s
            """, (hoje,))
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
            
        elif calculo_automatico == 'receber_hoje_qtd':
            cursor.execute(f"""
                SELECT COUNT(*) as valor FROM contas_a_receber 
                WHERE data_vencimento = %s
            """, (hoje,))
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'receber_hoje_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(valor_total), 0) as valor FROM contas_a_receber 
                WHERE data_vencimento = %s
            """, (hoje,))
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
            
        elif calculo_automatico == 'receber_7dias_qtd':
            cursor.execute(f"""
                SELECT COUNT(*) as valor FROM contas_a_receber 
                WHERE data_vencimento BETWEEN %s AND %s
            """, (hoje, hoje + timedelta(days=7)))
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'receber_7dias_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(valor_total), 0) as valor FROM contas_a_receber 
                WHERE data_vencimento BETWEEN %s AND %s
            """, (hoje, hoje + timedelta(days=7)))
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
            
        elif calculo_automatico == 'receber_mes_qtd':
            cursor.execute("""
                SELECT COUNT(*) as valor FROM contas_a_receber 
                WHERE EXTRACT(MONTH FROM data_vencimento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM data_vencimento) = EXTRACT(YEAR FROM CURRENT_DATE)
            """)
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'receber_mes_valor':
            cursor.execute("""
                SELECT COALESCE(SUM(valor_total), 0) as valor FROM contas_a_receber 
                WHERE EXTRACT(MONTH FROM data_vencimento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM data_vencimento) = EXTRACT(YEAR FROM CURRENT_DATE)
            """)
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
            
        elif calculo_automatico == 'recebidos_mes_qtd':
            cursor.execute("""
                SELECT COUNT(*) as valor FROM contas_recebidas 
                WHERE EXTRACT(MONTH FROM data_recebimento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM data_recebimento) = EXTRACT(YEAR FROM CURRENT_DATE)
            """)
            result = cursor.fetchone()
            valor = result['valor'] if result else 0
            
        elif calculo_automatico == 'recebidos_mes_valor':
            cursor.execute("""
                SELECT COALESCE(SUM(valor_liquido), 0) as valor FROM contas_recebidas 
                WHERE EXTRACT(MONTH FROM data_recebimento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM data_recebimento) = EXTRACT(YEAR FROM CURRENT_DATE)
            """)
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0
            
        elif calculo_automatico == 'ticket_medio_recebimentos_mes':
            cursor.execute("""
                SELECT COALESCE(AVG(valor_liquido), 0) as valor FROM contas_recebidas 
                WHERE EXTRACT(MONTH FROM data_recebimento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM data_recebimento) = EXTRACT(YEAR FROM CURRENT_DATE)
            """)
            result = cursor.fetchone()
            valor = round(decimal_to_float(result['valor']), 2) if result else 0
            
        elif calculo_automatico == 'percentual_inadimplencia_receber':
            cursor.execute("""
                SELECT 
                    CASE WHEN total_aberto > 0 
                        THEN (total_vencido::numeric / total_aberto::numeric) * 100 
                        ELSE 0 
                    END as valor
                FROM (
                    SELECT 
                        (SELECT COALESCE(SUM(valor_total), 0) FROM contas_a_receber WHERE data_vencimento < CURRENT_DATE) as total_vencido,
                        (SELECT COALESCE(SUM(valor_total), 0) FROM contas_a_receber) as total_aberto
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
        {'id': 'titulos_vencidos_qtd', 'nome': 'Títulos Vencidos - A Pagar (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'titulos_vencidos_valor', 'nome': 'Títulos Vencidos - A Pagar (Valor)', 'unidade': 'R$'},
        {'id': 'titulos_vencidos_2025_qtd', 'nome': 'Títulos Vencidos 2025 - A Pagar (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'titulos_vencidos_2025_valor', 'nome': 'Títulos Vencidos 2025 - A Pagar (Valor)', 'unidade': 'R$'},
        {'id': 'titulos_a_vencer_qtd', 'nome': 'Títulos a Vencer - A Pagar (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'titulos_a_vencer_valor', 'nome': 'Títulos a Vencer - A Pagar (Valor)', 'unidade': 'R$'},
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
        {'id': 'receber_vencidos_qtd', 'nome': 'Títulos Vencidos - A Receber (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'receber_vencidos_valor', 'nome': 'Títulos Vencidos - A Receber (Valor)', 'unidade': 'R$'},
        {'id': 'receber_a_vencer_qtd', 'nome': 'Títulos a Vencer - A Receber (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'receber_a_vencer_valor', 'nome': 'Títulos a Vencer - A Receber (Valor)', 'unidade': 'R$'},
        {'id': 'receber_hoje_qtd', 'nome': 'Contas a Receber Hoje (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'receber_hoje_valor', 'nome': 'Contas a Receber Hoje (Valor)', 'unidade': 'R$'},
        {'id': 'receber_7dias_qtd', 'nome': 'Contas a Receber em 7 Dias (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'receber_7dias_valor', 'nome': 'Contas a Receber em 7 Dias (Valor)', 'unidade': 'R$'},
        {'id': 'receber_mes_qtd', 'nome': 'Contas a Receber no Mês (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'receber_mes_valor', 'nome': 'Contas a Receber no Mês (Valor)', 'unidade': 'R$'},
        {'id': 'recebidos_mes_qtd', 'nome': 'Títulos Recebidos no Mês (Quantidade)', 'unidade': 'Qtd.'},
        {'id': 'recebidos_mes_valor', 'nome': 'Títulos Recebidos no Mês (Valor)', 'unidade': 'R$'},
        {'id': 'ticket_medio_recebimentos_mes', 'nome': 'Ticket Médio de Recebimentos no Mês', 'unidade': 'R$'},
        {'id': 'percentual_inadimplencia_receber', 'nome': 'Percentual de Inadimplência - A Receber', 'unidade': '%'},
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

@app.post("/api/kpis/snapshot-diario")
def criar_snapshot_diario():
    """Cria um snapshot de todos os KPIs automáticos para hoje.
    Deve ser chamado uma vez por dia para salvar os valores atuais.
    """
    conn_local = get_local_db_connection()
    cursor_local = conn_local.cursor()
    
    try:
        hoje = datetime.now().date()
        
        cursor_local.execute("SELECT * FROM kpis WHERE ativo = true AND calculo_automatico IS NOT NULL")
        kpis = cursor_local.fetchall()
        
        registros_criados = 0
        registros_atualizados = 0
        
        for kpi in kpis:
            try:
                calc_result = calcular_kpi_automatico(kpi['calculo_automatico'], kpi.get('documentos_excluidos'))
                if calc_result['valor'] is not None:
                    cursor_local.execute(
                        "SELECT id FROM kpis_historico WHERE kpi_id = %s AND data_registro = %s",
                        (kpi['id'], hoje)
                    )
                    existing = cursor_local.fetchone()
                    
                    if existing:
                        cursor_local.execute(
                            "UPDATE kpis_historico SET valor = %s WHERE id = %s",
                            (calc_result['valor'], existing['id'])
                        )
                        registros_atualizados += 1
                    else:
                        cursor_local.execute(
                            "INSERT INTO kpis_historico (kpi_id, valor, data_registro) VALUES (%s, %s, %s)",
                            (kpi['id'], calc_result['valor'], hoje)
                        )
                        registros_criados += 1
            except Exception as e:
                print(f"Erro ao criar snapshot para KPI {kpi['id']}: {e}")
        
        conn_local.commit()
        return {
            "success": True, 
            "data": str(hoje),
            "registros_criados": registros_criados,
            "registros_atualizados": registros_atualizados
        }
    
    finally:
        cursor_local.close()
        conn_local.close()

@app.get("/api/kpis-variacao-diaria")
def get_kpis_variacao_diaria():
    """Retorna todos os KPIs ativos com valor atual, valor de ontem e variação.
    Ideal para acompanhamento diário com indicadores de tendência.
    """
    conn_local = get_local_db_connection()
    cursor_local = conn_local.cursor()
    
    try:
        hoje = datetime.now().date()
        ontem = hoje - timedelta(days=1)
        
        cursor_local.execute("""
            SELECT k.*,
                   h_hoje.valor as valor_hoje,
                   h_ontem.valor as valor_ontem
            FROM kpis k
            LEFT JOIN kpis_historico h_hoje ON k.id = h_hoje.kpi_id AND h_hoje.data_registro = %s
            LEFT JOIN kpis_historico h_ontem ON k.id = h_ontem.kpi_id AND h_ontem.data_registro = %s
            WHERE k.ativo = true
            ORDER BY k.categoria, k.descricao
        """, (hoje, ontem))
        
        rows = cursor_local.fetchall()
        resultado = []
        
        for row in rows:
            valor_hoje = decimal_to_float(row['valor_hoje']) if row['valor_hoje'] else None
            valor_ontem = decimal_to_float(row['valor_ontem']) if row['valor_ontem'] else None
            meta = decimal_to_float(row['meta']) if row['meta'] else None
            calculo_automatico = row.get('calculo_automatico')
            documentos_excluidos = row.get('documentos_excluidos')
            
            if calculo_automatico:
                try:
                    calc_result = calcular_kpi_automatico(calculo_automatico, documentos_excluidos)
                    if calc_result['valor'] is not None:
                        valor_hoje = calc_result['valor']
                except Exception as e:
                    print(f"Erro ao calcular KPI automático {calculo_automatico}: {e}")
            
            variacao_absoluta = None
            variacao_percentual = None
            tendencia = None
            
            if valor_hoje is not None and valor_ontem is not None:
                variacao_absoluta = valor_hoje - valor_ontem
                if valor_ontem != 0:
                    variacao_percentual = round((variacao_absoluta / abs(valor_ontem)) * 100, 2)
                
                if variacao_absoluta > 0:
                    tendencia = 'subindo'
                elif variacao_absoluta < 0:
                    tendencia = 'descendo'
                else:
                    tendencia = 'estavel'
            
            status_meta = None
            if valor_hoje is not None and meta is not None:
                tipo_meta = row['tipo_meta'] or 'maior'
                if tipo_meta == 'maior':
                    status_meta = 'ok' if valor_hoje >= meta else 'atencao'
                elif tipo_meta == 'menor':
                    status_meta = 'ok' if valor_hoje <= meta else 'atencao'
                else:
                    status_meta = 'ok' if abs(valor_hoje - meta) < 0.01 else 'atencao'
            
            resultado.append({
                'id': row['id'],
                'descricao': row['descricao'],
                'categoria': row['categoria'],
                'indice': row['indice'],
                'meta': meta,
                'tipo_meta': row['tipo_meta'],
                'unidade': row['unidade'],
                'valor_hoje': valor_hoje,
                'valor_ontem': valor_ontem,
                'variacao_absoluta': variacao_absoluta,
                'variacao_percentual': variacao_percentual,
                'tendencia': tendencia,
                'status_meta': status_meta,
                'calculo_automatico': calculo_automatico
            })
        
        return resultado
    
    finally:
        cursor_local.close()
        conn_local.close()

@app.get("/api/kpis/{kpi_id}/historico-variacao")
def get_kpi_historico_variacao(kpi_id: int, dias: int = 30):
    """Retorna histórico de variações diárias de um KPI específico.
    Mostra valor, variação em relação ao dia anterior, e percentual.
    """
    conn_local = get_local_db_connection()
    cursor_local = conn_local.cursor()
    
    try:
        cursor_local.execute("SELECT * FROM kpis WHERE id = %s", (kpi_id,))
        kpi = cursor_local.fetchone()
        if not kpi:
            raise HTTPException(status_code=404, detail="KPI não encontrado")
        
        cursor_local.execute("""
            SELECT data_registro, valor
            FROM kpis_historico
            WHERE kpi_id = %s
            ORDER BY data_registro DESC
            LIMIT %s
        """, (kpi_id, dias + 1))
        
        rows = cursor_local.fetchall()
        rows.reverse()
        
        resultado = []
        valor_anterior = None
        
        for row in rows:
            valor = decimal_to_float(row['valor'])
            variacao_absoluta = None
            variacao_percentual = None
            tendencia = None
            
            if valor_anterior is not None:
                variacao_absoluta = valor - valor_anterior
                if valor_anterior != 0:
                    variacao_percentual = round((variacao_absoluta / abs(valor_anterior)) * 100, 2)
                
                if variacao_absoluta > 0:
                    tendencia = 'subindo'
                elif variacao_absoluta < 0:
                    tendencia = 'descendo'
                else:
                    tendencia = 'estavel'
            
            resultado.append({
                'data': row['data_registro'].isoformat() if hasattr(row['data_registro'], 'isoformat') else str(row['data_registro']),
                'valor': valor,
                'variacao_absoluta': variacao_absoluta,
                'variacao_percentual': variacao_percentual,
                'tendencia': tendencia
            })
            
            valor_anterior = valor
        
        return {
            'kpi': {
                'id': kpi['id'],
                'descricao': kpi['descricao'],
                'categoria': kpi['categoria'],
                'unidade': kpi['unidade'],
                'meta': decimal_to_float(kpi['meta']) if kpi['meta'] else None
            },
            'historico': resultado
        }
    
    finally:
        cursor_local.close()
        conn_local.close()

# ==================== CONTAS A RECEBER ====================

@app.get("/api/contas-receber")
def get_contas_receber(status: Optional[str] = None, limite: int = 100):
    """Retorna lista de contas a receber com filtro opcional por status"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        hoje = datetime.now().date()

        if status == "recebido":
            query = """
                SELECT cr.cliente, cr.data_recebimento as data_vencimento, cr.valor_liquido as valor_total,
                       cr.titulo as lancamento, cr.id_documento, cr.id_interno_empresa,
                       cc.nome_empresa, cc.nome_centrocusto,
                       TRIM(cr.id_documento) as id_documento
                FROM contas_recebidas cr
                LEFT JOIN dim_centrocusto cc ON cr.id_interno_empresa = cc.id_sienge_empresa
                ORDER BY cr.data_recebimento DESC
                LIMIT %s
            """
            cursor.execute(query, (limite,))
        elif status == "a_receber":
            query = """
                SELECT car.cliente, car.data_vencimento, car.valor_total,
                       car.lancamento, car.numero_documento, car.id_plano_financeiro,
                       car.id_interno_empresa, car.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto,
                       TRIM(car.id_documento) as id_documento
                FROM contas_a_receber car
                LEFT JOIN dim_centrocusto cc ON car.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE car.data_vencimento >= %s
                ORDER BY car.data_vencimento ASC
                LIMIT %s
            """
            cursor.execute(query, (hoje, limite))
        elif status == "em_atraso":
            query = """
                SELECT car.cliente, car.data_vencimento, car.valor_total,
                       car.lancamento, car.numero_documento, car.id_plano_financeiro,
                       car.id_interno_empresa, car.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto,
                       TRIM(car.id_documento) as id_documento
                FROM contas_a_receber car
                LEFT JOIN dim_centrocusto cc ON car.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE car.data_vencimento < %s
                ORDER BY car.data_vencimento ASC
                LIMIT %s
            """
            cursor.execute(query, (hoje, limite))
        else:
            query = """
                SELECT car.cliente, car.data_vencimento, car.valor_total,
                       car.lancamento, car.numero_documento, car.id_plano_financeiro,
                       car.id_interno_empresa, car.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto,
                       TRIM(car.id_documento) as id_documento
                FROM contas_a_receber car
                LEFT JOIN dim_centrocusto cc ON car.id_interno_centro_custo = cc.id_interno_centrocusto
                ORDER BY car.data_vencimento DESC
                LIMIT %s
            """
            cursor.execute(query, (limite,))

        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/contas-recebidas-filtradas")
def get_contas_recebidas_filtradas(
    empresa: Optional[int] = None,
    centro_custo: Optional[int] = None,
    cliente: Optional[str] = None,
    id_documento: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    limite: int = 100
):
    """Retorna contas recebidas com filtros avançados"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conditions = []
        params = []

        if empresa is not None:
            conditions.append("cr.id_interno_empresa = %s")
            params.append(empresa)

        if cliente:
            conditions.append("cr.cliente ILIKE %s")
            params.append(f"%{cliente}%")

        if id_documento:
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = []
            for doc in docs:
                doc_conditions.append("TRIM(cr.id_documento) = %s")
                params.append(doc)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM cr.data_recebimento) IN ({ano_placeholders})")
            params.extend(anos)

        if mes:
            meses = [int(m.strip()) for m in mes.split(',')]
            mes_placeholders = ', '.join(['%s'] * len(meses))
            conditions.append(f"EXTRACT(MONTH FROM cr.data_recebimento) IN ({mes_placeholders})")
            params.extend(meses)

        if data_inicio:
            conditions.append("cr.data_recebimento >= %s")
            params.append(data_inicio)

        if data_fim:
            conditions.append("cr.data_recebimento <= %s")
            params.append(data_fim)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT
                cr.cliente,
                cr.data_recebimento,
                cr.valor_liquido as valor_total,
                cr.titulo as lancamento,
                cr.id_interno_empresa,
                cc.nome_empresa,
                TRIM(cr.id_documento) as id_documento
            FROM contas_recebidas cr
            LEFT JOIN dim_centrocusto cc ON cr.id_interno_empresa = cc.id_sienge_empresa
            WHERE {where_clause}
            ORDER BY cr.data_recebimento DESC, cr.cliente, cr.valor_liquido
            LIMIT %s
        """
        params.append(limite)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/contas-receber-estatisticas")
def get_contas_receber_estatisticas(
    empresa: Optional[int] = None,
    centro_custo: Optional[int] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    id_documento: Optional[str] = None
):
    """Retorna estatísticas de contas a receber"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conditions = []
        params = []

        if empresa is not None:
            conditions.append("cc.id_sienge_empresa = %s")
            params.append(empresa)

        if centro_custo is not None:
            conditions.append("car.id_interno_centro_custo = %s")
            params.append(centro_custo)

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM car.data_vencimento) IN ({ano_placeholders})")
            params.extend(anos)

        if mes:
            meses = [int(m.strip()) for m in mes.split(',')]
            mes_placeholders = ', '.join(['%s'] * len(meses))
            conditions.append(f"EXTRACT(MONTH FROM car.data_vencimento) IN ({mes_placeholders})")
            params.extend(meses)

        if id_documento:
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = []
            for doc in docs:
                doc_conditions.append("TRIM(car.id_documento) = %s")
                params.append(doc)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        hoje = datetime.now().date()

        query = f"""
            SELECT
                COUNT(*) as quantidade_titulos,
                COALESCE(SUM(car.valor_total), 0) as valor_total,
                COALESCE(AVG(car.valor_total), 0) as valor_medio,
                COUNT(CASE WHEN car.data_vencimento < %s THEN 1 END) as quantidade_atrasados,
                COALESCE(SUM(CASE WHEN car.data_vencimento < %s THEN car.valor_total ELSE 0 END), 0) as valor_atrasados,
                COUNT(CASE WHEN car.data_vencimento = %s THEN 1 END) as quantidade_vence_hoje,
                COALESCE(SUM(CASE WHEN car.data_vencimento = %s THEN car.valor_total ELSE 0 END), 0) as valor_vence_hoje
            FROM contas_a_receber car
            LEFT JOIN dim_centrocusto cc ON car.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
        """
        params_with_dates = [hoje, hoje, hoje, hoje] + params
        
        cursor.execute(query, params_with_dates)
        row = cursor.fetchone()

        return {
            'quantidade_titulos': row['quantidade_titulos'],
            'valor_total': float(row['valor_total']),
            'valor_medio': float(row['valor_medio']),
            'quantidade_atrasados': row['quantidade_atrasados'],
            'valor_atrasados': float(row['valor_atrasados']),
            'quantidade_vence_hoje': row['quantidade_vence_hoje'],
            'valor_vence_hoje': float(row['valor_vence_hoje'])
        }

    finally:
        cursor.close()
        conn.close()

@app.get("/api/contas-recebidas-estatisticas")
def get_contas_recebidas_estatisticas(
    empresa: Optional[int] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    id_documento: Optional[str] = None
):
    """Retorna estatísticas de contas recebidas"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conditions = []
        params = []

        if empresa is not None:
            conditions.append("cr.id_interno_empresa = %s")
            params.append(empresa)

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM cr.data_recebimento) IN ({ano_placeholders})")
            params.extend(anos)

        if mes:
            meses = [int(m.strip()) for m in mes.split(',')]
            mes_placeholders = ', '.join(['%s'] * len(meses))
            conditions.append(f"EXTRACT(MONTH FROM cr.data_recebimento) IN ({mes_placeholders})")
            params.extend(meses)

        if id_documento:
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = []
            for doc in docs:
                doc_conditions.append("TRIM(cr.id_documento) = %s")
                params.append(doc)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT
                COUNT(*) as quantidade_titulos,
                COALESCE(SUM(cr.valor_liquido), 0) as valor_total,
                COALESCE(AVG(cr.valor_liquido), 0) as valor_medio
            FROM contas_recebidas cr
            WHERE {where_clause}
        """
        
        cursor.execute(query, params)
        row = cursor.fetchone()

        return {
            'quantidade_titulos': row['quantidade_titulos'],
            'valor_total': float(row['valor_total']),
            'valor_medio': float(row['valor_medio'])
        }

    finally:
        cursor.close()
        conn.close()

@app.get("/api/contas-receber-por-cliente")
def get_contas_receber_por_cliente(
    empresa: Optional[int] = None,
    centro_custo: Optional[int] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    id_documento: Optional[str] = None,
    limite: int = 15
):
    """Retorna contas a receber agrupadas por cliente"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conditions = []
        params = []

        if empresa is not None:
            conditions.append("cc.id_sienge_empresa = %s")
            params.append(empresa)

        if centro_custo is not None:
            conditions.append("car.id_interno_centro_custo = %s")
            params.append(centro_custo)

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM car.data_vencimento) IN ({ano_placeholders})")
            params.extend(anos)

        if mes:
            meses = [int(m.strip()) for m in mes.split(',')]
            mes_placeholders = ', '.join(['%s'] * len(meses))
            conditions.append(f"EXTRACT(MONTH FROM car.data_vencimento) IN ({mes_placeholders})")
            params.extend(meses)

        if id_documento:
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = []
            for doc in docs:
                doc_conditions.append("TRIM(car.id_documento) = %s")
                params.append(doc)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT
                car.cliente,
                SUM(car.valor_total) as valor,
                COUNT(*) as quantidade
            FROM contas_a_receber car
            LEFT JOIN dim_centrocusto cc ON car.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
            GROUP BY car.cliente
            ORDER BY valor DESC
            LIMIT %s
        """
        params.append(limite)

        cursor.execute(query, params)
        rows = cursor.fetchall()

        return [{'cliente': row['cliente'], 'valor': float(row['valor']), 'quantidade': row['quantidade']} for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/contas-recebidas-por-cliente")
def get_contas_recebidas_por_cliente(
    empresa: Optional[int] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    id_documento: Optional[str] = None,
    limite: int = 15
):
    """Retorna contas recebidas agrupadas por cliente"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conditions = []
        params = []

        if empresa is not None:
            conditions.append("cr.id_interno_empresa = %s")
            params.append(empresa)

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM cr.data_recebimento) IN ({ano_placeholders})")
            params.extend(anos)

        if mes:
            meses = [int(m.strip()) for m in mes.split(',')]
            mes_placeholders = ', '.join(['%s'] * len(meses))
            conditions.append(f"EXTRACT(MONTH FROM cr.data_recebimento) IN ({mes_placeholders})")
            params.extend(meses)

        if id_documento:
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = []
            for doc in docs:
                doc_conditions.append("TRIM(cr.id_documento) = %s")
                params.append(doc)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT
                cr.cliente,
                SUM(cr.valor_liquido) as valor,
                COUNT(*) as quantidade
            FROM contas_recebidas cr
            WHERE {where_clause}
            GROUP BY cr.cliente
            ORDER BY valor DESC
            LIMIT %s
        """
        params.append(limite)

        cursor.execute(query, params)
        rows = cursor.fetchall()

        return [{'cliente': row['cliente'], 'valor': float(row['valor']), 'quantidade': row['quantidade']} for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/metricas-receber")
def get_metricas_receber():
    """Retorna métricas gerais de contas a receber para o dashboard"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        hoje = datetime.now().date()

        # Contas recebidas
        cursor.execute("""
            SELECT COALESCE(SUM(valor_liquido), 0) as total, COUNT(*) as quantidade
            FROM contas_recebidas
        """)
        recebido = cursor.fetchone()

        # Contas a receber (não vencidas)
        cursor.execute("""
            SELECT COALESCE(SUM(valor_total), 0) as total, COUNT(*) as quantidade
            FROM contas_a_receber
            WHERE data_vencimento >= %s
        """, (hoje,))
        a_receber = cursor.fetchone()

        # Contas em atraso (vencidas e não recebidas)
        cursor.execute("""
            SELECT COALESCE(SUM(valor_total), 0) as total, COUNT(*) as quantidade
            FROM contas_a_receber
            WHERE data_vencimento < %s
        """, (hoje,))
        em_atraso = cursor.fetchone()

        return {
            'total_recebido': float(recebido['total']),
            'total_a_receber': float(a_receber['total']),
            'total_em_atraso': float(em_atraso['total']),
            'quantidade_recebido': recebido['quantidade'],
            'quantidade_a_receber': a_receber['quantidade'],
            'quantidade_em_atraso': em_atraso['quantidade']
        }

    finally:
        cursor.close()
        conn.close()

# ============ ENDPOINTS DE METAS POR ORIGEM ============

@app.get("/api/origem-metas")
def get_origem_metas():
    """Lista todas as metas de origem"""
    if not REPLIT_DB_URL:
        return []
    conn = get_replit_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, descricao, origens, meta_percentual, created_at, updated_at FROM origem_metas ORDER BY id")
        rows = cursor.fetchall()
        return [{
            'id': row['id'],
            'descricao': row['descricao'],
            'origens': row['origens'].split(','),
            'meta_percentual': float(row['meta_percentual']),
            'created_at': row['created_at'].isoformat() if row['created_at'] else None,
            'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None
        } for row in rows]
    except Exception as e:
        print(f"Erro ao listar metas: {e}")
        return []
    finally:
        cursor.close()
        conn.close()

@app.post("/api/origem-metas")
def create_origem_meta(meta: OrigemMetaCreate):
    """Cria uma nova meta de origem"""
    if not REPLIT_DB_URL:
        raise HTTPException(status_code=500, detail="Banco de dados Replit não configurado")
    conn = get_replit_db_connection()
    cursor = conn.cursor()
    try:
        origens_str = ','.join([o.strip().upper() for o in meta.origens])
        cursor.execute("""
            INSERT INTO origem_metas (descricao, origens, meta_percentual)
            VALUES (%s, %s, %s)
            RETURNING id
        """, (meta.descricao, origens_str, meta.meta_percentual))
        new_id = cursor.fetchone()['id']
        conn.commit()
        return {'id': new_id, 'message': 'Meta criada com sucesso'}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.put("/api/origem-metas/{meta_id}")
def update_origem_meta(meta_id: int, meta: OrigemMetaUpdate):
    """Atualiza uma meta de origem existente"""
    if not REPLIT_DB_URL:
        raise HTTPException(status_code=500, detail="Banco de dados Replit não configurado")
    conn = get_replit_db_connection()
    cursor = conn.cursor()
    try:
        updates = []
        params = []
        if meta.descricao is not None:
            updates.append("descricao = %s")
            params.append(meta.descricao)
        if meta.origens is not None:
            updates.append("origens = %s")
            params.append(','.join([o.strip().upper() for o in meta.origens]))
        if meta.meta_percentual is not None:
            updates.append("meta_percentual = %s")
            params.append(meta.meta_percentual)
        
        if not updates:
            raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
        
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(meta_id)
        
        query = f"UPDATE origem_metas SET {', '.join(updates)} WHERE id = %s"
        cursor.execute(query, params)
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Meta não encontrada")
        
        return {'message': 'Meta atualizada com sucesso'}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.delete("/api/origem-metas/{meta_id}")
def delete_origem_meta(meta_id: int):
    """Remove uma meta de origem"""
    if not REPLIT_DB_URL:
        raise HTTPException(status_code=500, detail="Banco de dados Replit não configurado")
    conn = get_replit_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM origem_metas WHERE id = %s", (meta_id,))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Meta não encontrada")
        return {'message': 'Meta removida com sucesso'}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.get("/api/origem-metas/status")
def get_origem_metas_status(
    empresa: Optional[int] = None,
    centro_custo: Optional[int] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None
):
    """Calcula o status de atingimento das metas com base nos filtros"""
    # Buscar metas do banco Replit
    if not REPLIT_DB_URL:
        return []
    
    replit_conn = get_replit_db_connection()
    replit_cursor = replit_conn.cursor()
    try:
        replit_cursor.execute("SELECT id, descricao, origens, meta_percentual FROM origem_metas")
        metas = replit_cursor.fetchall()
    except Exception as e:
        print(f"Erro ao buscar metas: {e}")
        metas = []
    finally:
        replit_cursor.close()
        replit_conn.close()
    
    if not metas:
        return []
    
    # Usar o banco externo para dados financeiros
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Construir condições de filtro
        conditions = []
        params = []
        
        if empresa is not None:
            conditions.append("cc.id_sienge_empresa = %s")
            params.append(empresa)
        
        if centro_custo is not None:
            conditions.append("cp.id_interno_centro_custo = %s")
            params.append(centro_custo)
        
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
        
        # Calcular total geral
        query_total = f"""
            SELECT COALESCE(SUM(cp.valor_liquido), 0) as total
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
        """
        cursor.execute(query_total, params)
        total_geral = float(cursor.fetchone()['total'])
        
        resultados = []
        for meta in metas:
            origens = [o.strip().upper() for o in meta['origens'].split(',')]
            
            # Calcular soma das origens desta meta
            origem_conditions = []
            origem_params = list(params)  # Copiar params base
            for origem in origens:
                origem_conditions.append("TRIM(UPPER(cp.id_origem)) = %s")
                origem_params.append(origem)
            
            origem_filter = f"({' OR '.join(origem_conditions)})"
            
            query_origem = f"""
                SELECT COALESCE(SUM(cp.valor_liquido), 0) as total
                FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE {where_clause} AND {origem_filter}
            """
            cursor.execute(query_origem, origem_params)
            total_origens = float(cursor.fetchone()['total'])
            
            # Calcular percentual atingido
            percentual_atingido = (total_origens / total_geral * 100) if total_geral > 0 else 0
            meta_atingida = percentual_atingido >= float(meta['meta_percentual'])
            
            resultados.append({
                'id': meta['id'],
                'descricao': meta['descricao'],
                'origens': origens,
                'meta_percentual': float(meta['meta_percentual']),
                'percentual_atingido': round(percentual_atingido, 2),
                'valor_origens': total_origens,
                'valor_total': total_geral,
                'meta_atingida': meta_atingida
            })
        
        return resultados
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
