from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, timedelta
from collections import defaultdict
import psycopg2
from psycopg2.extras import RealDictCursor
from decimal import Decimal
import os
import secrets
import sqlite3
from pathlib import Path
import bcrypt
from jose import JWTError, jwt
import threading
import time
from dotenv import load_dotenv
import anthropic
import httpx
import base64

load_dotenv()

# Banco SQLite local para usuarios (auth)
_DATA_DIR = os.environ.get('DATA_DIR', os.path.dirname(os.path.abspath(__file__)))
USERS_DB_PATH = os.path.join(_DATA_DIR, 'users.db')

def get_users_db():
    conn = sqlite3.connect(USERS_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_users_db():
    conn = None
    try:
        conn = get_users_db()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                nome TEXT NOT NULL,
                senha_hash TEXT NOT NULL,
                ativo INTEGER DEFAULT 1,
                permissao TEXT DEFAULT 'admin',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Adicionar coluna permissao se não existir (migração para bancos antigos)
        try:
            conn.execute("ALTER TABLE usuarios ADD COLUMN permissao TEXT DEFAULT 'admin'")
        except Exception:
            pass  # Coluna já existe
        conn.execute("""
            CREATE TABLE IF NOT EXISTS log_atividades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                acao TEXT NOT NULL,
                detalhes TEXT,
                ip TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        # Criar usuario padrao se nao existir — senha via variável de ambiente
        _default_admin_email = os.environ.get('DEFAULT_ADMIN_EMAIL', '')
        _default_admin_password = os.environ.get('DEFAULT_ADMIN_PASSWORD', '')
        _default_admin_name = os.environ.get('DEFAULT_ADMIN_NAME', 'Admin')
        if _default_admin_email and _default_admin_password:
            senha_hash = bcrypt.hashpw(_default_admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            conn.execute(
                "INSERT OR IGNORE INTO usuarios (email, nome, senha_hash, permissao) VALUES (?, ?, ?, ?)",
                (_default_admin_email, _default_admin_name, senha_hash, 'admin')
            )
            conn.commit()
        print("Banco de usuarios (SQLite) inicializado com sucesso")
    except Exception as e:
        print(f"Erro ao inicializar banco de usuarios: {e}")
    finally:
        if conn:
            conn.close()

try:
    init_users_db()
except Exception as e:
    print(f"[WARN] Falha ao inicializar DB de usuarios: {e}")

# SQLite mantido apenas para users.db — configs e snapshots agora usam PostgreSQL

app = FastAPI(title="Dashboard Financeiro - Construtora")

@app.on_event("startup")
async def startup_event():
    """Garante que tabelas de config existam no PostgreSQL ao iniciar."""
    # Remove VIEW antiga que pode ter ficado no banco
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("DROP VIEW IF EXISTS vw_contas_a_pagar")
        conn.commit()
        cursor.close()
        conn.close()
        print("[STARTUP] View vw_contas_a_pagar removida (se existia)")
    except Exception as e:
        print(f"[STARTUP] Erro ao remover view antiga: {e}")

    try:
        _ensure_config_tables_in_postgres()
    except Exception as e:
        print(f"[STARTUP] Erro ao garantir tabelas de config: {e}")

# Configuração de segurança JWT
_jwt_from_env = os.environ.get('JWT_SECRET_KEY', '')
if not _jwt_from_env:
    _jwt_from_env = secrets.token_urlsafe(64)
    print("[SECURITY] JWT_SECRET_KEY não definida — gerada automaticamente (tokens invalidam ao reiniciar)")
JWT_SECRET_KEY = _jwt_from_env
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 horas

# Configuração API Anthropic
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
IA_MODELO = os.environ.get('IA_MODELO', 'claude-3-haiku-20240307')

anthropic_client = None
if ANTHROPIC_API_KEY:
    try:
        anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    except Exception as e:
        print(f"[WARN] Falha ao inicializar Anthropic client: {e}")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Configurar CORS — domínios permitidos via env var ou padrões seguros
_allowed_origins_env = os.environ.get('ALLOWED_ORIGINS', '')
ALLOWED_ORIGINS = [o.strip() for o in _allowed_origins_env.split(',') if o.strip()] if _allowed_origins_env else [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Utilitário para conversão segura de int
def _safe_int(val, default):
    try:
        return int(val) if val else default
    except (ValueError, TypeError):
        return default

# ==================== RATE LIMITING NO LOGIN ====================
_login_attempts: dict = defaultdict(list)  # ip -> [timestamps]
LOGIN_RATE_LIMIT = _safe_int(os.environ.get('LOGIN_RATE_LIMIT'), 10)
LOGIN_RATE_WINDOW = _safe_int(os.environ.get('LOGIN_RATE_WINDOW'), 300)

def check_rate_limit(ip: str) -> bool:
    """Retorna True se o IP excedeu o limite de tentativas de login."""
    now = time.time()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < LOGIN_RATE_WINDOW]
    if len(_login_attempts[ip]) >= LOGIN_RATE_LIMIT:
        return True
    _login_attempts[ip].append(now)
    return False

# Configuração do banco de dados externo (dados financeiros) — via variáveis de ambiente

DB_CONFIG = {
    'host': os.environ.get('DB_HOST') or 'localhost',
    'port': _safe_int(os.environ.get('DB_PORT'), 5432),
    'database': os.environ.get('DB_NAME') or 'ecbiesek',
    'user': os.environ.get('DB_USER') or '',
    'password': os.environ.get('DB_PASSWORD') or '',
}
if not DB_CONFIG['user'] or not DB_CONFIG['password']:
    print("[SECURITY] ATENÇÃO: DB_USER e DB_PASSWORD devem ser definidos como variáveis de ambiente!")
print(f"[STARTUP] DB_HOST={DB_CONFIG['host']}, DB_PORT={DB_CONFIG['port']}, DB_USER={'***' if DB_CONFIG['user'] else 'NÃO DEFINIDO'}")

# Configuração do banco de dados Replit (metas e configurações)
REPLIT_DB_URL = os.environ.get('DATABASE_URL')

# Banco de configurações separado (gravável) — via env var ou SQLite como fallback
# No EasyPanel: crie um PostgreSQL de configs e defina CONFIG_DB_URL nas variáveis de ambiente
CONFIG_DB_URL = os.environ.get('CONFIG_DB_URL') or os.environ.get('DATABASE_URL')

# Caminho do SQLite de fallback — monte este diretório como volume persistente no EasyPanel
import sqlite3 as _sqlite3
CONFIG_SQLITE_PATH = os.path.join(_DATA_DIR, 'ecbiesek_config.db')

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

# Modelos IA
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

# Funções auxiliares
def parse_csv_int(value: str) -> list:
    """Converte string CSV em lista de ints. Ex: '1,2,3' -> [1, 2, 3]"""
    return [int(v.strip()) for v in value.split(',') if v.strip().isdigit()]

def parse_csv_str(value: str) -> list:
    """Converte string CSV em lista de strings. Ex: 'a,b' -> ['a', 'b']"""
    return [v.strip() for v in value.split(',') if v.strip()]

def add_multi_filter(conditions, params, value_str, column, is_int=False):
    """Adiciona filtro multi-valor (CSV) à query. Suporta int e str."""
    if not value_str:
        return
    values = parse_csv_int(value_str) if is_int else parse_csv_str(value_str)
    if not values:
        return
    placeholders = ', '.join(['%s'] * len(values))
    conditions.append(f"{column} IN ({placeholders})")
    params.extend(values)

def get_db_connection():
    """Cria conexão com o banco de dados externo (dados financeiros)"""
    try:
        conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao conectar ao banco: {str(e)}")

def get_replit_db_connection():
    """Cria conexão com banco de configurações/usuários (Replit ou banco externo como fallback)"""
    try:
        if REPLIT_DB_URL:
            conn = psycopg2.connect(REPLIT_DB_URL, cursor_factory=RealDictCursor)
        else:
            # Fallback: usa o mesmo banco externo dos dados financeiros
            conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao conectar ao banco: {str(e)}")

# ---- Banco de configurações gravável (SQLite ou PostgreSQL separado) ----

class _SqliteRealDictRow(dict):
    pass

class _SqliteConn:
    """Wrapper SQLite que imita interface psycopg2 (commit/close/cursor)."""
    def __init__(self, path):
        self._conn = _sqlite3.connect(path)
        self._conn.row_factory = _sqlite3.Row
    def cursor(self):
        return _SqliteCursor(self._conn.cursor())
    def commit(self):
        self._conn.commit()
    def rollback(self):
        self._conn.rollback()
    def close(self):
        self._conn.close()

class _SqliteCursor:
    """Wrapper cursor SQLite — adapta SQL PostgreSQL para SQLite."""
    def __init__(self, cur):
        self._cur = cur
    def execute(self, sql, params=None):
        import re as _re
        sql = sql.replace('%s', '?')
        # INSERT ... ON CONFLICT DO NOTHING → INSERT OR IGNORE ...
        if _re.search(r'ON CONFLICT\s+DO NOTHING', sql, _re.IGNORECASE):
            sql = _re.sub(r'\s+ON CONFLICT\s+DO NOTHING', '', sql, flags=_re.IGNORECASE)
            sql = _re.sub(r'^INSERT\s+INTO', 'INSERT OR IGNORE INTO', sql.strip(), flags=_re.IGNORECASE)
        # INSERT ... ON CONFLICT (...) DO UPDATE SET ... → INSERT OR REPLACE ...
        elif _re.search(r'ON CONFLICT\s*\(', sql, _re.IGNORECASE):
            sql = _re.sub(r'\s+ON CONFLICT\s*\(.*', '', sql, flags=_re.IGNORECASE | _re.DOTALL)
            sql = _re.sub(r'^INSERT\s+INTO', 'INSERT OR REPLACE INTO', sql.strip(), flags=_re.IGNORECASE)
        # SERIAL → não existe no SQLite (é INTEGER PRIMARY KEY AUTOINCREMENT)
        sql = _re.sub(r'\bSERIAL\b', 'INTEGER', sql, flags=_re.IGNORECASE)
        # TIMESTAMP/VARCHAR com tamanho → SQLite ignora tipos mas aceita
        if params:
            self._cur.execute(sql, params)
        else:
            self._cur.execute(sql)
    def fetchall(self):
        rows = self._cur.fetchall()
        return [dict(r) for r in rows]
    def fetchone(self):
        r = self._cur.fetchone()
        return dict(r) if r else None
    def close(self):
        self._cur.close()

_CONFIG_USE_POSTGRES = bool(CONFIG_DB_URL)

def get_config_db_connection():
    """Retorna conexão com o banco de configurações gravável.
    - Se CONFIG_DB_URL estiver definido: usa PostgreSQL dedicado
    - Caso contrário: usa SQLite local
    IMPORTANTE: Não faz fallback silencioso para SQLite quando PostgreSQL está configurado.
    """
    if CONFIG_DB_URL:
        try:
            conn = psycopg2.connect(CONFIG_DB_URL, cursor_factory=RealDictCursor)
            return conn
        except Exception as e:
            print(f"[ERRO CONFIG DB] Falha ao conectar PostgreSQL ({CONFIG_DB_URL[:30]}...): {e}")
            # Tenta novamente uma vez antes de desistir
            try:
                import time
                time.sleep(0.5)
                conn = psycopg2.connect(CONFIG_DB_URL, cursor_factory=RealDictCursor)
                print("[CONFIG DB] Reconectou com sucesso na segunda tentativa")
                return conn
            except Exception as e2:
                print(f"[ERRO CONFIG DB] Segunda tentativa falhou: {e2}")
                print("[CONFIG DB] Usando SQLite como fallback temporário")
    return _SqliteConn(CONFIG_SQLITE_PATH)

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


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica se a senha corresponde ao hash"""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    """Gera hash da senha"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

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
    """Busca usuário por email (SQLite local)"""
    conn = get_users_db()
    try:
        row = conn.execute(
            "SELECT id, email, nome, senha_hash, ativo, permissao FROM usuarios WHERE email = ?",
            (email.lower(),)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def log_atividade(email: str, acao: str, detalhes: str = None, ip: str = None):
    """Registra uma atividade no log"""
    try:
        conn = get_users_db()
        conn.execute(
            "INSERT INTO log_atividades (email, acao, detalhes, ip) VALUES (?, ?, ?, ?)",
            (email, acao, detalhes, ip)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Erro ao registrar log: {e}")

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

async def require_admin(current_user: dict = Depends(get_current_user)):
    """Verifica se o usuário é admin"""
    if current_user.get('permissao') != 'admin':
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    return current_user

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
    
    existing_user = get_user_by_email(user.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    if len(user.senha) < 8:
        raise HTTPException(status_code=400, detail="Senha deve ter pelo menos 8 caracteres")
    
    senha_hash = get_password_hash(user.senha)

    conn = get_users_db()
    try:
        cursor = conn.execute(
            "INSERT INTO usuarios (email, nome, senha_hash) VALUES (?, ?, ?)",
            (user.email.lower(), user.nome, senha_hash)
        )
        new_id = cursor.lastrowid
        conn.commit()
        access_token = create_access_token(data={"sub": user.email.lower()})
        return {"access_token": access_token, "token_type": "bearer", "user": {"id": new_id, "email": user.email.lower(), "nome": user.nome}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/auth/login")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    """Login de usuário"""
    ip = request.client.host if request.client else 'unknown'
    if check_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Muitas tentativas de login. Tente novamente em alguns minutos.")
    user = get_user_by_email(form_data.username.lower())
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou senha incorretos", headers={"WWW-Authenticate": "Bearer"})
    if not verify_password(form_data.password, user['senha_hash']):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou senha incorretos", headers={"WWW-Authenticate": "Bearer"})
    if not user['ativo']:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário desativado", headers={"WWW-Authenticate": "Bearer"})
    log_atividade(user['email'], 'LOGIN', 'Login realizado', ip)
    access_token = create_access_token(data={"sub": user['email']})
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": user['id'], "email": user['email'], "nome": user['nome'], "permissao": user.get('permissao', 'admin')}}

@app.post("/api/auth/login-json")
def login_json(request: Request, user_login: UserLogin):
    """Login de usuário via JSON"""
    ip = request.client.host if request.client else 'unknown'
    if check_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Muitas tentativas de login. Tente novamente em alguns minutos.")
    user = get_user_by_email(user_login.email.lower())
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou senha incorretos")
    if not verify_password(user_login.senha, user['senha_hash']):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou senha incorretos")
    if not user['ativo']:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário desativado")
    log_atividade(user['email'], 'LOGIN', 'Login realizado', ip)
    access_token = create_access_token(data={"sub": user['email']})
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": user['id'], "email": user['email'], "nome": user['nome'], "permissao": user.get('permissao', 'admin')}}

@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Retorna dados do usuário autenticado"""
    return {"id": current_user['id'], "email": current_user['email'], "nome": current_user['nome'], "ativo": current_user['ativo'], "permissao": current_user.get('permissao', 'admin')}

@app.get("/api/auth/check")
async def check_auth(current_user: dict = Depends(get_current_user_optional)):
    """Verifica se usuário está autenticado"""
    if current_user:
        return {"authenticated": True, "user": {"id": current_user['id'], "email": current_user['email'], "nome": current_user['nome'], "permissao": current_user.get('permissao', 'admin')}}
    return {"authenticated": False}

@app.post("/api/auth/alterar-senha")
async def alterar_senha(dados: dict, request: Request, current_user: dict = Depends(get_current_user)):
    """Altera senha do usuário autenticado"""
    senha_atual = dados.get('senha_atual', '')
    nova_senha = dados.get('nova_senha', '')
    if not verify_password(senha_atual, current_user['senha_hash']):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    if len(nova_senha) < 8:
        raise HTTPException(status_code=400, detail="Nova senha deve ter pelo menos 8 caracteres")
    nova_hash = get_password_hash(nova_senha)
    conn = get_users_db()
    try:
        conn.execute("UPDATE usuarios SET senha_hash = ? WHERE id = ?", (nova_hash, current_user['id']))
        conn.commit()
        ip = request.client.host if request.client else None
        log_atividade(current_user['email'], 'ALTERAR_SENHA', 'Senha alterada com sucesso', ip)
        return {"success": True, "message": "Senha alterada com sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ==================== ADMIN — GERENCIAR USUÁRIOS ====================

@app.get("/api/admin/usuarios")
async def listar_usuarios(current_user: dict = Depends(require_admin)):
    """Lista todos os usuários (admin only)"""
    conn = get_users_db()
    try:
        rows = conn.execute(
            "SELECT id, email, nome, permissao, ativo, created_at FROM usuarios ORDER BY created_at ASC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/admin/usuarios")
async def criar_usuario(dados: dict, request: Request, current_user: dict = Depends(require_admin)):
    """Cria novo usuário (admin only)"""
    email = dados.get('email', '').lower().strip()
    nome = dados.get('nome', '').strip()
    senha = dados.get('senha', '')
    permissao = dados.get('permissao', 'somente_leitura')
    if not email or not nome:
        raise HTTPException(status_code=400, detail="Email e nome são obrigatórios")
    if len(senha) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter pelo menos 6 caracteres")
    if permissao not in ('admin', 'somente_leitura'):
        raise HTTPException(status_code=400, detail="Permissão inválida")
    if get_user_by_email(email):
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    senha_hash = get_password_hash(senha)
    conn = get_users_db()
    try:
        cursor = conn.execute(
            "INSERT INTO usuarios (email, nome, senha_hash, permissao) VALUES (?, ?, ?, ?)",
            (email, nome, senha_hash, permissao)
        )
        conn.commit()
        ip = request.client.host if request.client else None
        log_atividade(current_user['email'], 'CRIAR_USUARIO', f'Usuário {email} criado', ip)
        return {"success": True, "id": cursor.lastrowid, "email": email, "nome": nome, "permissao": permissao}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/admin/usuarios/{usuario_id}")
async def desativar_usuario(usuario_id: int, request: Request, current_user: dict = Depends(require_admin)):
    """Desativa um usuário (admin only) — não permite desativar a si mesmo"""
    if usuario_id == current_user['id']:
        raise HTTPException(status_code=400, detail="Não é possível desativar seu próprio usuário")
    conn = get_users_db()
    try:
        row = conn.execute("SELECT email FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        conn.execute("DELETE FROM usuarios WHERE id = ?", (usuario_id,))
        conn.commit()
        ip = request.client.host if request.client else None
        log_atividade(current_user['email'], 'REMOVER_USUARIO', f'Usuário {row["email"]} removido', ip)
        return {"success": True}
    finally:
        conn.close()

@app.put("/api/admin/usuarios/{usuario_id}")
async def atualizar_usuario(usuario_id: int, dados: dict, request: Request, current_user: dict = Depends(require_admin)):
    """Altera permissão de um usuário (admin only)"""
    nova_permissao = dados.get('permissao', '').strip()
    if nova_permissao not in ('admin', 'somente_leitura'):
        raise HTTPException(status_code=400, detail="Permissão inválida")
    conn = get_users_db()
    try:
        row = conn.execute("SELECT email FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        conn.execute("UPDATE usuarios SET permissao = ? WHERE id = ?", (nova_permissao, usuario_id))
        conn.commit()
        ip = request.client.host if request.client else None
        log_atividade(current_user['email'], 'ALTERAR_PERMISSAO', f'Permissão de {row["email"]} → {nova_permissao}', ip)
        return {"success": True}
    finally:
        conn.close()

@app.get("/api/admin/atividades")
async def listar_atividades(current_user: dict = Depends(require_admin)):
    """Lista log de atividades (admin only)"""
    conn = get_users_db()
    try:
        rows = conn.execute(
            "SELECT id, email, acao, detalhes, ip, created_at FROM log_atividades ORDER BY created_at DESC LIMIT 200"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

# ==================== ROTAS DE IA ====================

@app.post("/api/ia/chat")
async def chat_ia(req: ChatRequest, current_user: dict = Depends(get_current_user_optional)):
    """Rota para comunicação com o Agente de IA Financeiro"""
    load_dotenv(override=True)
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    modelo = os.environ.get('IA_MODELO', 'claude-3-haiku-20240307')
    
    if not api_key:
        raise HTTPException(status_code=500, detail="Chave da Anthropic não configurada no backend.")
    
    client = anthropic.Anthropic(api_key=api_key)
    
    try:
        # Puxa alguns indicadores brutos para enriquecer o contexto da IA
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Puxar métricas de exemplo (pode ser substituído por Tools futuramente)
        cursor.execute("SELECT COALESCE(SUM(valor_liquido), 0) as total FROM contas_pagas")
        total_pago = decimal_to_float(cursor.fetchone()['total'])
        
        cursor.execute("SELECT COALESCE(SUM(valor_total), 0) as total FROM contas_a_pagar WHERE data_vencimento >= CURRENT_DATE")
        total_a_pagar = decimal_to_float(cursor.fetchone()['total'])

        cursor.close()
        conn.close()

        system_prompt = f"""Você é o Analista Financeiro Virtual da ECBIESEK-CONSTRUTORA.
Sua missão é ajudar os gestores a analisar o dashboard estratégico.
Você sempre responde em português do Brasil e utiliza formatação Markdown para deixar as respostas bonitas, usando negritos, bullet points e pequenas tabelas se necessário.

Dados Atuais do Negócio (Contexto em tempo real):
- Histórico Total de Contas Pagas: R$ {total_pago:,.2f}
- Previsão de Contas A Pagar: R$ {total_a_pagar:,.2f}

Regra Importante: Responda as perguntas de forma direta, concisa e profissional. Se não souber o valor exato, informe ao usuário que você precisa de acesso a relatórios mais específicos para calcular orçamentos futuros e recomende verificar o Dashboard Metas.
"""
        
        mensagens_anthropic = []
        for msg in req.messages:
            mensagens_anthropic.append({"role": msg.role if msg.role in ['user', 'assistant'] else 'user', "content": msg.content})

        # Anthropic exige que a primeira mensagem seja 'user'
        while mensagens_anthropic and mensagens_anthropic[0]["role"] != "user":
            mensagens_anthropic.pop(0)

        if not mensagens_anthropic:
            mensagens_anthropic.append({"role": "user", "content": "Olá, continue nossa conversa."})

        response = client.messages.create(
            model=modelo,
            system=system_prompt,
            messages=mensagens_anthropic,
            max_tokens=2048,
            temperature=0.3
        )
        
        reply_text = response.content[0].text
        return {"reply": reply_text}
        
    except Exception as e:
        print(f"Erro no chat da IA: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Endpoints
@app.get("/api/health")
def health_check():
    return {"message": "Dashboard Financeiro API - Construtora", "status": "online"}

# ┌──────────────────────────────────────────────────────────────┐
# │ DOCUMENTAÇÃO: GET /api/metricas                              │
# ├──────────────────────────────────────────────────────────────┤
# │ FONTE: contas_pagas (total_pago), contas_a_pagar (a_pagar)  │
# │ FILTROS: exclusões gerais (empresas, CCs, docs)              │
# │ USADO POR: Dashboard > Cards (Total Pago, A Pagar, Atraso)  │
# │ RETORNA: total_pago, total_a_pagar, total_em_atraso + qtds  │
# └──────────────────────────────────────────────────────────────┘
@app.get("/api/metricas", response_model=DashboardMetrics)
def get_metricas():
    """Retorna métricas principais do dashboard"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        hoje = datetime.now().date()
        exclusoes = get_exclusoes()

        excl_conds_cp, excl_params_cp = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        excl_conds_cap, excl_params_cap = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)

        cp_where = (" AND " + " AND ".join(excl_conds_cp)) if excl_conds_cp else ""
        cap_where_extra = (" AND " + " AND ".join(excl_conds_cap)) if excl_conds_cap else ""

        cursor.execute(f"""
            SELECT
                COALESCE(SUM(cp.valor_liquido), 0) as total,
                COUNT(*) as quantidade
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE 1=1{cp_where}
        """, excl_params_cp)
        pago = cursor.fetchone()

        cursor.execute(f"""
            SELECT
                COALESCE(SUM(cap.valor_total), 0) as total,
                COUNT(*) as quantidade
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE cap.data_vencimento >= %s{cap_where_extra}
        """, [hoje] + excl_params_cap)
        a_pagar = cursor.fetchone()

        cursor.execute(f"""
            SELECT
                COALESCE(SUM(cap.valor_total), 0) as total,
                COUNT(*) as quantidade
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE cap.data_vencimento < %s{cap_where_extra}
        """, [hoje] + excl_params_cap)
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
        exclusoes = get_exclusoes()

        if status == "pago":
            excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
            excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""
            query = f"""
                SELECT cp.credor, cp.data_pagamento as data_vencimento, cp.valor_liquido as valor_total,
                       cp.lancamento, cp.numero_documento, cp.id_plano_financeiro,
                       cp.id_interno_empresa, cp.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto,
                       cc.id_sienge_centrocusto as codigo_centrocusto
                FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE 1=1{excl_where}
                ORDER BY cp.data_pagamento DESC
                LIMIT %s
            """
            cursor.execute(query, excl_params + [limite])
        elif status == "a_pagar":
            excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)
            excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""
            query = f"""
                SELECT cap.credor, cap.data_vencimento, cap.valor_total,
                       cap.lancamento, cap.numero_documento, cap.id_plano_financeiro,
                       cap.id_interno_empresa, cap.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto,
                       cc.id_sienge_empresa,
                       cc.id_sienge_centrocusto as codigo_centrocusto,
                       TRIM(cap.id_documento) as id_documento,
                       TRIM(cap.id_origem) as id_origem,
                       cap.numero_parcela,
                       cap.data_cadastro,
                       cap.flautorizacao,
                       t.descricao_observacao,
                       t.data_emissao,
                       pf.nome_plano_financeiro,
                       cap.id_tipo_pagamento,
                       COALESCE(tp.nome_tipo_pagamento, '') as nome_tipo_pagamento
                FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                LEFT JOIN ecpgtitulo t ON t.id_pg_titulo = CAST(SPLIT_PART(cap.lancamento, '/', 1) AS INTEGER)
                    AND t.id_credor = cap.id_credor
                LEFT JOIN ecadplanofin pf ON cap.id_plano_financeiro = pf.id_plano_financeiro
                LEFT JOIN ecadtipopagamento tp ON cap.id_tipo_pagamento = tp.id_tipo_pagamento
                WHERE 1=1{excl_where}
                ORDER BY cap.data_vencimento ASC
                LIMIT %s
            """
            cursor.execute(query, excl_params + [limite])
        elif status == "em_atraso":
            excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)
            excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""
            query = f"""
                SELECT cap.credor, cap.data_vencimento, cap.valor_total,
                       cap.lancamento, cap.numero_documento, cap.id_plano_financeiro,
                       cap.id_interno_empresa, cap.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto,
                       cc.id_sienge_empresa,
                       cc.id_sienge_centrocusto as codigo_centrocusto,
                       TRIM(cap.id_documento) as id_documento,
                       TRIM(cap.id_origem) as id_origem,
                       cap.numero_parcela,
                       cap.data_cadastro,
                       cap.flautorizacao,
                       t.descricao_observacao,
                       t.data_emissao,
                       pf.nome_plano_financeiro,
                       cap.id_tipo_pagamento,
                       COALESCE(tp.nome_tipo_pagamento, '') as nome_tipo_pagamento
                FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                LEFT JOIN ecpgtitulo t ON t.id_pg_titulo = CAST(SPLIT_PART(cap.lancamento, '/', 1) AS INTEGER)
                    AND t.id_credor = cap.id_credor
                LEFT JOIN ecadplanofin pf ON cap.id_plano_financeiro = pf.id_plano_financeiro
                LEFT JOIN ecadtipopagamento tp ON cap.id_tipo_pagamento = tp.id_tipo_pagamento
                WHERE cap.data_vencimento < %s{excl_where}
                ORDER BY cap.data_vencimento ASC
                LIMIT %s
            """
            cursor.execute(query, [hoje] + excl_params + [limite])
        else:
            excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)
            excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""
            query = f"""
                SELECT cap.credor, cap.data_vencimento, cap.valor_total,
                       cap.lancamento, cap.numero_documento, cap.id_plano_financeiro,
                       cap.id_interno_empresa, cap.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto,
                       cc.id_sienge_centrocusto as codigo_centrocusto,
                       cap.numero_parcela,
                       cap.data_cadastro,
                       cap.flautorizacao,
                       t.descricao_observacao,
                       t.data_emissao,
                       pf.nome_plano_financeiro,
                       cap.id_tipo_pagamento,
                       COALESCE(tp.nome_tipo_pagamento, '') as nome_tipo_pagamento
                FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                LEFT JOIN ecpgtitulo t ON t.id_pg_titulo = CAST(SPLIT_PART(cap.lancamento, '/', 1) AS INTEGER)
                    AND t.id_credor = cap.id_credor
                LEFT JOIN ecadplanofin pf ON cap.id_plano_financeiro = pf.id_plano_financeiro
                LEFT JOIN ecadtipopagamento tp ON cap.id_tipo_pagamento = tp.id_tipo_pagamento
                WHERE 1=1{excl_where}
                ORDER BY cap.data_vencimento DESC
                LIMIT %s
            """
            cursor.execute(query, excl_params + [limite])

        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/contas-ano")
def get_contas_ano(ano: int = None):
    """Retorna todas as contas a pagar de um ano específico (a partir de hoje, sem limite)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if ano is None:
            ano = datetime.now().year
        hoje = datetime.now().date()
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)
        excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""
        query = f"""
            SELECT cap.credor, cap.data_vencimento, cap.valor_total,
                   cap.lancamento, cap.numero_documento, cap.id_plano_financeiro,
                   cap.id_interno_empresa, cap.id_interno_centro_custo,
                   cc.nome_empresa, cc.nome_centrocusto,
                   cc.id_sienge_centrocusto as codigo_centrocusto,
                   cc.id_sienge_empresa,
                   TRIM(cap.id_documento) as id_documento,
                   TRIM(cap.id_origem) as id_origem,
                   cap.data_cadastro,
                   cap.flautorizacao,
                   t.descricao_observacao,
                   t.data_emissao,
                   pf.nome_plano_financeiro,
                   cap.id_tipo_pagamento,
                   COALESCE(tp.nome_tipo_pagamento, '') as nome_tipo_pagamento
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            LEFT JOIN ecpgtitulo t ON t.id_pg_titulo = CAST(SPLIT_PART(cap.lancamento, '/', 1) AS INTEGER)
                AND t.id_credor = cap.id_credor
            LEFT JOIN ecadplanofin pf ON cap.id_plano_financeiro = pf.id_plano_financeiro
            LEFT JOIN ecadtipopagamento tp ON cap.id_tipo_pagamento = tp.id_tipo_pagamento
            WHERE cap.data_vencimento >= %s
              AND EXTRACT(YEAR FROM cap.data_vencimento) = %s{excl_where}
            ORDER BY cap.data_vencimento ASC
        """
        cursor.execute(query, [hoje, ano] + excl_params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        cursor.close()
        conn.close()

# Cache em memória para detalhes de títulos do Sienge
_titulo_detalhe_cache: dict = {}
_TITULO_CACHE_TTL = 300  # 5 minutos

# Cache em memória para autorizações bulk
_autorizacoes_bulk_cache: dict = {"data": None, "timestamp": 0}
_AUTORIZACOES_CACHE_TTL = 600  # 10 minutos

SIENGE_API_URL = "https://api.sienge.com.br/biesek/public/api/v1"
SIENGE_BULK_API_URL = "https://api.sienge.com.br/biesek/public/api/bulk-data/v1"
SIENGE_USERNAME = "biesek-dtconsultorias"
SIENGE_PASSWORD = "W8LWWpo170P3LPpJDD42RL456fEvudEE"

@app.get("/api/autorizacoes-bulk")
async def get_autorizacoes_bulk():
    """Busca status de autorização de todos os títulos via Sienge Bulk API /outcome"""
    import time as _time

    now = _time.time()
    if _autorizacoes_bulk_cache["data"] is not None and (now - _autorizacoes_bulk_cache["timestamp"]) < _AUTORIZACOES_CACHE_TTL:
        return _autorizacoes_bulk_cache["data"]

    hoje = datetime.now().strftime("%Y-%m-%d")
    credentials = base64.b64encode(f"{SIENGE_USERNAME}:{SIENGE_PASSWORD}".encode()).decode()

    url = f"{SIENGE_BULK_API_URL}/outcome"
    # endDate futuro para incluir títulos com vencimento adiante
    end_date = f"{datetime.now().year + 2}-12-31"
    params = {
        "startDate": "2024-01-01",
        "endDate": end_date,
        "selectionType": "D",
        "correctionIndexerId": "0",
        "correctionDate": hoje,
        "withAuthorizations": "false",
        "withBankMovements": "false",
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(url, params=params, headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/json",
            })
            response.raise_for_status()
            raw = response.json()
            data = raw.get("data", raw) if isinstance(raw, dict) else raw

        resultado = {}
        for item in data:
            bill_id = item.get("billId")
            installment_id = item.get("installmentId")
            auth_status = item.get("authorizationStatus", "N")
            if bill_id is not None:
                key = f"{bill_id}/{installment_id}" if installment_id else str(bill_id)
                resultado[key] = auth_status

        _autorizacoes_bulk_cache["data"] = resultado
        _autorizacoes_bulk_cache["timestamp"] = now
        return resultado
    except Exception as e:
        print(f"Erro ao buscar autorizações bulk: {e}")
        if _autorizacoes_bulk_cache["data"] is not None:
            return _autorizacoes_bulk_cache["data"]
        return {}


# Cache para títulos alterados
_titulos_alterados_cache: dict = {}
_TITULOS_ALTERADOS_TTL = 300  # 5 minutos

@app.get("/api/titulos-alterados")
async def get_titulos_alterados(data_inicio: str, data_fim: str):
    """Busca títulos alterados em um período via Sienge API /bills/by-change-date"""
    import time as _time

    cache_key = f"{data_inicio}_{data_fim}"
    now = _time.time()
    if cache_key in _titulos_alterados_cache:
        cached = _titulos_alterados_cache[cache_key]
        if (now - cached["timestamp"]) < _TITULOS_ALTERADOS_TTL:
            return cached["data"]

    credentials = base64.b64encode(f"{SIENGE_USERNAME}:{SIENGE_PASSWORD}".encode()).decode()
    todos_titulos = []
    offset = 0
    limit = 200

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                response = await client.get(
                    f"{SIENGE_API_URL}/bills/by-change-date",
                    params={"startDate": data_inicio, "endDate": data_fim, "limit": limit, "offset": offset},
                    headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/json"},
                )
                response.raise_for_status()
                data = response.json()
                results = data.get("results", data) if isinstance(data, dict) else data
                if isinstance(results, list):
                    todos_titulos.extend(results)
                    if len(results) < limit:
                        break
                    offset += limit
                else:
                    break

        # Busca nomes dos credores no banco local
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            credor_map = {}
            creditor_ids = list(set(t.get("creditorId") for t in todos_titulos if t.get("creditorId")))
            if creditor_ids:
                placeholders = ",".join(["%s"] * len(creditor_ids))
                cursor.execute(f"SELECT DISTINCT id_credor, credor FROM contas_a_pagar WHERE id_credor IN ({placeholders})", creditor_ids)
                for row in cursor.fetchall():
                    credor_map[row["id_credor"]] = row["credor"]
        finally:
            cursor.close()
            conn.close()

        resultado = []
        for t in todos_titulos:
            resultado.append({
                "id": t.get("id"),
                "creditorId": t.get("creditorId"),
                "creditorName": credor_map.get(t.get("creditorId"), ""),
                "documentNumber": t.get("documentNumber"),
                "documentIdentificationId": t.get("documentIdentificationId"),
                "totalInvoiceAmount": t.get("totalInvoiceAmount"),
                "originId": t.get("originId"),
                "registeredBy": t.get("registeredBy"),
                "registeredDate": t.get("registeredDate"),
                "changedBy": t.get("changedBy"),
                "changedDate": t.get("changedDate"),
            })

        _titulos_alterados_cache[cache_key] = {"data": resultado, "timestamp": now}
        return resultado
    except Exception as e:
        print(f"Erro ao buscar títulos alterados: {e}")
        return []


@app.get("/api/titulo-detalhe/{titulo_id}")
async def get_titulo_detalhe(titulo_id: int):
    """Busca detalhes de auditoria de um título na API do Sienge"""
    cache_key = str(titulo_id)
    now = time.time()

    # Verificar cache
    if cache_key in _titulo_detalhe_cache:
        cached = _titulo_detalhe_cache[cache_key]
        if now - cached['timestamp'] < _TITULO_CACHE_TTL:
            return cached['data']

    # Buscar data de vencimento do título no banco local para montar o range da API
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT data_vencimento, data_cadastro, numero_documento, numero_parcela,
                   id_origem, id_documento, id_interno_empresa,
                   credor, valor_total, lancamento
            FROM contas_a_pagar
            WHERE CAST(SPLIT_PART(lancamento, '/', 1) AS INTEGER) = %s
            LIMIT 1
        """, [titulo_id])
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Título não encontrado")
        local_data = dict(row)
    finally:
        cursor.close()
        conn.close()

    # Chamar API v1 do Sienge (endpoint /bills/{id})
    auth_str = base64.b64encode(f"{SIENGE_USERNAME}:{SIENGE_PASSWORD}".encode()).decode()
    sienge_data = None
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{SIENGE_API_URL}/bills/{titulo_id}",
                headers={
                    "Authorization": f"Basic {auth_str}",
                    "Content-Type": "application/json",
                }
            )
            if resp.status_code == 200:
                item = resp.json()
                sienge_data = {
                    'registeredBy': item.get('registeredBy', ''),
                    'registeredDate': item.get('registeredDate', ''),
                    'changedBy': item.get('changedBy', ''),
                    'changedDate': item.get('changedDate', ''),
                    'issueDate': item.get('issueDate', ''),
                    'billDate': item.get('billDate', ''),
                    'observation': item.get('notes', ''),
                }
    except Exception as e:
        print(f"[titulo-detalhe] Erro ao consultar Sienge: {e}")

    NOMES_ORIGEM = {
        'CP': 'Contas a Pagar', 'AC': 'Acordo', 'ME': 'Medição', 'CO': 'Contrato',
        'NF': 'Nota Fiscal', 'GR': 'Guia de Recolhimento', 'RE': 'Recibo',
        'BO': 'Boleto', 'CH': 'Cheque', 'DP': 'Depósito', 'FP': 'Folha de Pagamento',
    }

    resultado = {
        'titulo_id': titulo_id,
        'numero_documento': local_data.get('numero_documento'),
        'numero_parcela': local_data.get('numero_parcela'),
        'id_origem': local_data.get('id_origem'),
        'origem_nome': NOMES_ORIGEM.get((local_data.get('id_origem') or '').strip(), local_data.get('id_origem')),
        'id_documento': local_data.get('id_documento'),
        'data_cadastro': str(local_data.get('data_cadastro')) if local_data.get('data_cadastro') else None,
        'data_vencimento': str(local_data.get('data_vencimento')) if local_data.get('data_vencimento') else None,
        'credor': local_data.get('credor'),
        'valor_total': float(local_data.get('valor_total') or 0),
        'lancamento': local_data.get('lancamento'),
        # Dados do Sienge (podem ser None se a API falhar)
        'registeredBy': sienge_data.get('registeredBy') if sienge_data else None,
        'registeredDate': sienge_data.get('registeredDate') if sienge_data else None,
        'changedBy': sienge_data.get('changedBy') if sienge_data else None,
        'changedDate': sienge_data.get('changedDate') if sienge_data else None,
        'issueDate': sienge_data.get('issueDate') if sienge_data else None,
        'billDate': sienge_data.get('billDate') if sienge_data else None,
        'observation': sienge_data.get('observation') if sienge_data else None,
        'authorizationStatus': sienge_data.get('authorizationStatus') if sienge_data else None,
    }

    # Salvar no cache
    _titulo_detalhe_cache[cache_key] = {'data': resultado, 'timestamp': now}

    return resultado

@app.get("/api/grafico-mensal", response_model=List[GraficoMensal])
def get_grafico_mensal():
    """Retorna dados para gráfico de evolução mensal"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        hoje = datetime.now().date()
        exclusoes = get_exclusoes()

        excl_conds_cp, excl_params_cp = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        excl_conds_cap, excl_params_cap = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)

        cp_extra = (" AND " + " AND ".join(excl_conds_cp)) if excl_conds_cp else ""
        cap_extra = (" AND " + " AND ".join(excl_conds_cap)) if excl_conds_cap else ""

        cursor.execute(f"""
            WITH meses AS (
                SELECT TO_CHAR(cp.data_pagamento, 'YYYY-MM') as mes, SUM(cp.valor_liquido) as pago
                FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cp.data_pagamento >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months'){cp_extra}
                GROUP BY mes
            ),
            a_pagar_mes AS (
                SELECT TO_CHAR(cap.data_vencimento, 'YYYY-MM') as mes, SUM(cap.valor_total) as valor
                FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cap.data_vencimento >= %s
                  AND cap.data_vencimento >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months'){cap_extra}
                GROUP BY mes
            ),
            em_atraso_mes AS (
                SELECT TO_CHAR(cap.data_vencimento, 'YYYY-MM') as mes, SUM(cap.valor_total) as valor
                FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cap.data_vencimento < %s
                  AND cap.data_vencimento >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months'){cap_extra}
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
        """, excl_params_cp + [hoje] + excl_params_cap + [hoje] + excl_params_cap)

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
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)
        excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""

        cursor.execute(f"""
            SELECT
                COALESCE(cap.id_plano_financeiro, 'Sem Categoria') as categoria,
                SUM(cap.valor_total) as valor,
                COUNT(*) as quantidade
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE 1=1{excl_where}
            GROUP BY cap.id_plano_financeiro
            ORDER BY valor DESC
            LIMIT 10
        """, excl_params)

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
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)
        excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""

        cursor.execute(f"""
            SELECT cap.credor, cap.data_vencimento, cap.valor_total,
                   cap.lancamento, cap.numero_documento, cap.id_plano_financeiro
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE cap.data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + %s{excl_where}
            ORDER BY cap.data_vencimento ASC
        """, [dias] + excl_params)

        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    finally:
        cursor.close()
        conn.close()

# ┌──────────────────────────────────────────────────────────────┐
# │ DOCUMENTAÇÃO: GET /api/contas-pagas-filtradas                │
# ├──────────────────────────────────────────────────────────────┤
# │ FONTE: contas_pagas (todas as colunas)                       │
# │ FILTROS AUTO: exclusões gerais, origens, tipos_baixa,        │
# │   transferências inter-empresa                               │
# │ FILTROS OPCIONAIS: empresa, centro_custo, credor,            │
# │   id_documento, origem_dado, tipo_baixa, conta_corrente,     │
# │   origem_titulo, ano, mes, data_inicio, data_fim             │
# │ USADO POR: Contas Pagas > lista detalhada de títulos         │
# └──────────────────────────────────────────────────────────────┘
@app.get("/api/contas-pagas-filtradas")
def get_contas_pagas_filtradas(
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
    tipo_pagamento: Optional[str] = None,
    conta_corrente: Optional[str] = None,
    origem_titulo: Optional[str] = None,
    plano_financeiro: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    limite: int = 100,
    offset: int = 0
):
    """Retorna contas pagas com filtros avançados"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)

        # Auto-excluir origens sem contas_pagas habilitado + ler tipos_baixa da config
        try:
            cfg_conn = get_config_db_connection()
            cfg_cursor = cfg_conn.cursor()
            try:
                cfg_cursor.execute(
                    "SELECT sigla FROM config_origens_exposicao_caixa WHERE incluir = %s OR paginas NOT LIKE %s",
                    (False, '%contas_pagas%')
                )
                origens_excluidas_cp = [r['sigla'].strip().upper() for r in cfg_cursor.fetchall() if r['sigla']]
                if origens_excluidas_cp:
                    oe_placeholders = ', '.join(['%s'] * len(origens_excluidas_cp))
                    conditions.append(f"TRIM(UPPER(cp.id_origem)) NOT IN ({oe_placeholders})")
                    params.extend(origens_excluidas_cp)

                # Ler tipos_baixa habilitados para contas_pagas da config
                cfg_cursor.execute(
                    "SELECT id_tipo_baixa FROM config_tipos_baixa_exposicao_caixa WHERE incluir = 1 AND paginas LIKE %s",
                    ('%contas_pagas%',)
                )
                tipos_baixa_config_filt = [r['id_tipo_baixa'] for r in cfg_cursor.fetchall()]
            finally:
                cfg_cursor.close()
                cfg_conn.close()
        except Exception:
            tipos_baixa_config_filt = []

        # Aplicar filtro de tipo_baixa da config (se não veio parâmetro manual)
        if tipos_baixa_config_filt and not tipo_baixa:
            tb_placeholders = ', '.join(['%s'] * len(tipos_baixa_config_filt))
            conditions.append(f"cp.id_tipo_baixa IN ({tb_placeholders})")
            params.extend(tipos_baixa_config_filt)

        # Excluir transferências inter-empresa (credores que são nomes de empresas do grupo)
        try:
            cursor.execute("SELECT DISTINCT TRIM(nome_empresa) as nome FROM dim_centrocusto WHERE nome_empresa IS NOT NULL")
            empresa_names_filt = [r['nome'] for r in cursor.fetchall() if r['nome']]
            if empresa_names_filt:
                en_placeholders = ', '.join(['%s'] * len(empresa_names_filt))
                conditions.append(f"TRIM(cp.credor) NOT IN ({en_placeholders})")
                params.extend(empresa_names_filt)
        except Exception:
            pass

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"""cp.id_interno_empresa IN (
                    SELECT DISTINCT cp2.id_interno_empresa FROM contas_pagas cp2
                    JOIN dim_centrocusto cc2 ON cp2.id_interno_centro_custo = cc2.id_interno_centrocusto
                    WHERE cc2.id_sienge_empresa IN ({emp_ph})
                )""")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

        if credor:
            credores_list = parse_csv_str(credor)
            if len(credores_list) == 1:
                conditions.append("cp.credor ILIKE %s")
                params.append(f"%{credores_list[0]}%")
            elif len(credores_list) > 1:
                cr_conds = []
                for cr in credores_list:
                    cr_conds.append("cp.credor ILIKE %s")
                    params.append(f"%{cr}%")
                conditions.append(f"({' OR '.join(cr_conds)})")

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

        if tipo_pagamento:
            tipos_pag = [int(t.strip()) for t in tipo_pagamento.split(",")]
            tp_placeholders = ", ".join(["%s"] * len(tipos_pag))
            conditions.append(f"cp.id_tipo_pagamento IN ({tp_placeholders})")
            params.extend(tipos_pag)

        if conta_corrente:
            contas = [c.strip() for c in conta_corrente.split(',')]
            conta_placeholders = ', '.join(['%s'] * len(contas))
            conditions.append(f"cp.id_conta_corrente IN ({conta_placeholders})")
            params.extend(contas)

        if origem_titulo:
            siglas = [s.strip().upper() for s in origem_titulo.split(',') if s.strip()]
            if siglas:
                ot_placeholders = ', '.join(['%s'] * len(siglas))
                conditions.append(f"TRIM(UPPER(cp.id_origem)) IN ({ot_placeholders})")
                params.extend(siglas)

        if plano_financeiro:
            planos = [p.strip() for p in plano_financeiro.split(',') if p.strip()]
            if planos:
                pf_placeholders = ', '.join(['%s'] * len(planos))
                conditions.append(f"cp.id_plano_financeiro IN ({pf_placeholders})")
                params.extend(planos)

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
            conditions.append("(cp.data_pagamento + INTERVAL '1 day')::date >= %s")
            params.append(data_inicio)

        if data_fim:
            conditions.append("(cp.data_pagamento + INTERVAL '1 day')::date <= %s")
            params.append(data_fim)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            WITH cp_base AS (
                SELECT cp.*,
                    CASE WHEN cp.lancamento ~ '^[0-9]+/[0-9]+$'
                         THEN CAST(SPLIT_PART(cp.lancamento, '/', 1) AS INTEGER)
                         ELSE NULL END as _titulo_id,
                    CASE WHEN cp.lancamento ~ '^[0-9]+/[0-9]+$'
                         THEN CAST(SPLIT_PART(cp.lancamento, '/', 2) AS INTEGER)
                         ELSE NULL END as _parcela_num
                FROM contas_pagas cp
            )
            SELECT
                TRIM(REGEXP_REPLACE(COALESCE(cp.credor, 'SEM CREDOR'), '^[0-9][0-9.\-/]+ ', '')) as credor,
                (cp.data_pagamento + INTERVAL '1 day')::date as data_pagamento,
                cp.valor_liquido as valor_total,
                cp.lancamento,
                cp.numero_documento,
                cp.id_plano_financeiro,
                cp.id_interno_empresa,
                cp.id_interno_centro_custo,
                cp.id_origem,
                cc.nome_empresa,
                cc.nome_centrocusto,
                cc.id_sienge_centrocusto as codigo_centrocusto,
                pp.data_vencimento,
                COALESCE(pf.nome_plano_financeiro, '') as nome_plano_financeiro,
                cp.valor_acrescimo,
                cp.valor_desconto,
                cp.valor_baixa,
                COALESCE(pp.valor_juros, 0) as valor_juros,
                CASE WHEN pp.data_vencimento IS NOT NULL
                     THEN ((cp.data_pagamento + INTERVAL '1 day')::date - pp.data_vencimento)
                     ELSE NULL END as dias_atraso,
                TRIM(cp.id_documento) as id_documento
            FROM cp_base cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            LEFT JOIN ecpgparcela pp ON cp._titulo_id = pp.id_pg_titulo AND cp._parcela_num = pp.numero_parcela
            LEFT JOIN ecadplanofin pf ON cp.id_plano_financeiro = pf.id_plano_financeiro
            WHERE {where_clause}
            ORDER BY cp.data_pagamento DESC, cp.credor, cp.valor_liquido
            LIMIT %s OFFSET %s
        """
        params.append(limite)
        params.append(offset)

        # Count total
        count_query = f"""
            WITH cp_base AS (
                SELECT cp.*,
                    CASE WHEN cp.lancamento ~ '^[0-9]+/[0-9]+$'
                         THEN CAST(SPLIT_PART(cp.lancamento, '/', 1) AS INTEGER)
                         ELSE NULL END as _titulo_id
                FROM contas_pagas cp
            )
            SELECT COUNT(*) as total
            FROM cp_base cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
        """
        count_params = list(params[:-2])  # sem limite e offset
        cursor.execute(count_query, count_params)
        total_count = cursor.fetchone()['total']

        cursor.execute(query, params)
        rows = cursor.fetchall()
        return {"data": [dict(row) for row in rows], "total": total_count}

    finally:
        cursor.close()
        conn.close()

# ┌──────────────────────────────────────────────────────────────┐
# │ DOCUMENTAÇÃO: GET /api/contas-pagas-por-fornecedor           │
# ├──────────────────────────────────────────────────────────────┤
# │ FONTE: contas_pagas, agrupado por credor (fornecedor)        │
# │ NORMALIZAÇÃO: REGEXP_REPLACE remove prefixo CPF/CNPJ         │
# │ TÍTULOS: COUNT(DISTINCT SPLIT_PART(lancamento,'/',1))         │
# │   → rateados (8302/1, 8302/2) contam como 1 título           │
# │ PERÍODOS: 7d, 15d, 30d, total (baseado em dump_date)         │
# │ FILTROS AUTO: exclusões, origens, tipos_baixa, inter-empresa │
# │ USADO POR: Contas Pagas > visão por fornecedor               │
# └──────────────────────────────────────────────────────────────┘
@app.get("/api/contas-pagas-por-fornecedor")
def get_contas_pagas_por_fornecedor(
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
    conta_corrente: Optional[str] = None,
    origem_titulo: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
):
    """Retorna contas pagas agrupadas por fornecedor com períodos 7d/15d/30d/total."""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Buscar data de referência (última dump_date)
        cursor.execute("SELECT MAX(dump_date) as ultima FROM fulldump_log")
        ref_row = cursor.fetchone()
        ref_date = ref_row['ultima'] if ref_row else None

        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(
            exclusoes, cc_alias='cc', table_alias='cp',
            has_conta_corrente=True
        )
        conditions = list(excl_conds)
        params = list(excl_params)

        # Excluir origem BC + ler tipos_baixa da config
        try:
            cfg_conn = get_config_db_connection()
            cfg_cursor = cfg_conn.cursor()
            try:
                cfg_cursor.execute(
                    "SELECT sigla FROM config_origens_exposicao_caixa WHERE incluir = %s OR paginas NOT LIKE %s",
                    (False, '%contas_pagas%')
                )
                origens_excluidas_cp = [r['sigla'].strip().upper() for r in cfg_cursor.fetchall() if r['sigla']]
                if origens_excluidas_cp:
                    oe_placeholders = ', '.join(['%s'] * len(origens_excluidas_cp))
                    conditions.append(f"TRIM(UPPER(cp.id_origem)) NOT IN ({oe_placeholders})")
                    params.extend(origens_excluidas_cp)

                # Ler tipos_baixa habilitados para contas_pagas da config
                cfg_cursor.execute(
                    "SELECT id_tipo_baixa FROM config_tipos_baixa_exposicao_caixa WHERE incluir = 1 AND paginas LIKE %s",
                    ('%contas_pagas%',)
                )
                tipos_baixa_config = [r['id_tipo_baixa'] for r in cfg_cursor.fetchall()]
            finally:
                cfg_cursor.close()
                cfg_conn.close()
        except Exception:
            tipos_baixa_config = []

        # Aplicar filtro de tipo_baixa da config (se não veio parâmetro manual)
        if tipos_baixa_config and not tipo_baixa:
            tb_placeholders = ', '.join(['%s'] * len(tipos_baixa_config))
            conditions.append(f"cp.id_tipo_baixa IN ({tb_placeholders})")
            params.extend(tipos_baixa_config)

        # Excluir transferências inter-empresa (credores que são nomes de empresas do grupo)
        try:
            cursor.execute("SELECT DISTINCT TRIM(nome_empresa) as nome FROM dim_centrocusto WHERE nome_empresa IS NOT NULL")
            empresa_names = [r['nome'] for r in cursor.fetchall() if r['nome']]
            if empresa_names:
                en_placeholders = ', '.join(['%s'] * len(empresa_names))
                conditions.append(f"TRIM(cp.credor) NOT IN ({en_placeholders})")
                params.extend(empresa_names)
        except Exception:
            pass

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"""cp.id_interno_empresa IN (
                    SELECT DISTINCT cp2.id_interno_empresa FROM contas_pagas cp2
                    JOIN dim_centrocusto cc2 ON cp2.id_interno_centro_custo = cc2.id_interno_centrocusto
                    WHERE cc2.id_sienge_empresa IN ({emp_ph})
                )""")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

        if credor:
            credores_list = parse_csv_str(credor)
            if len(credores_list) == 1:
                conditions.append("cp.credor ILIKE %s")
                params.append(f"%{credores_list[0]}%")
            elif len(credores_list) > 1:
                cr_conds = []
                for cr in credores_list:
                    cr_conds.append("cp.credor ILIKE %s")
                    params.append(f"%{cr}%")
                conditions.append(f"({' OR '.join(cr_conds)})")

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

        if conta_corrente:
            contas = [c.strip() for c in conta_corrente.split(',')]
            conta_placeholders = ', '.join(['%s'] * len(contas))
            conditions.append(f"cp.id_conta_corrente IN ({conta_placeholders})")
            params.extend(contas)

        if origem_titulo:
            siglas = [s.strip().upper() for s in origem_titulo.split(',') if s.strip()]
            if siglas:
                ot_placeholders = ', '.join(['%s'] * len(siglas))
                conditions.append(f"TRIM(UPPER(cp.id_origem)) IN ({ot_placeholders})")
                params.extend(siglas)

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
            conditions.append("(cp.data_pagamento + INTERVAL '1 day')::date >= %s")
            params.append(data_inicio)

        if data_fim:
            conditions.append("(cp.data_pagamento + INTERVAL '1 day')::date <= %s")
            params.append(data_fim)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        # Datas dos períodos baseadas em ref_date
        query_params = []
        if ref_date:
            d7 = ref_date - __import__('datetime').timedelta(days=6)
            d15 = ref_date - __import__('datetime').timedelta(days=14)
            d30 = ref_date - __import__('datetime').timedelta(days=29)
            query_params = [d7, ref_date, d7, ref_date, d15, ref_date, d15, ref_date, d30, ref_date, d30, ref_date]
        else:
            # Fallback: usar CURRENT_DATE
            d7 = d15 = d30 = ref_date = None

        if ref_date:
            query = f"""
                SELECT
                    TRIM(REGEXP_REPLACE(COALESCE(cp.credor, 'SEM CREDOR'), '^[0-9][0-9.\-/]+ ', '')) as credor,
                    COUNT(DISTINCT CASE WHEN cp.data_pagamento >= %s AND cp.data_pagamento <= %s THEN SPLIT_PART(cp.lancamento, '/', 1) END) as titulos_7d,
                    COALESCE(SUM(CASE WHEN cp.data_pagamento >= %s AND cp.data_pagamento <= %s THEN cp.valor_liquido ELSE 0 END), 0) as valor_7d,
                    COUNT(DISTINCT CASE WHEN cp.data_pagamento >= %s AND cp.data_pagamento <= %s THEN SPLIT_PART(cp.lancamento, '/', 1) END) as titulos_15d,
                    COALESCE(SUM(CASE WHEN cp.data_pagamento >= %s AND cp.data_pagamento <= %s THEN cp.valor_liquido ELSE 0 END), 0) as valor_15d,
                    COUNT(DISTINCT CASE WHEN cp.data_pagamento >= %s AND cp.data_pagamento <= %s THEN SPLIT_PART(cp.lancamento, '/', 1) END) as titulos_30d,
                    COALESCE(SUM(CASE WHEN cp.data_pagamento >= %s AND cp.data_pagamento <= %s THEN cp.valor_liquido ELSE 0 END), 0) as valor_30d,
                    COUNT(DISTINCT SPLIT_PART(cp.lancamento, '/', 1)) as titulos_total,
                    COALESCE(SUM(cp.valor_liquido), 0) as valor_total
                FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE {where_clause}
                GROUP BY TRIM(REGEXP_REPLACE(COALESCE(cp.credor, 'SEM CREDOR'), '^[0-9][0-9.\-/]+ ', ''))
                ORDER BY valor_total DESC
            """
            all_params = query_params + params
        else:
            query = f"""
                SELECT
                    TRIM(REGEXP_REPLACE(COALESCE(cp.credor, 'SEM CREDOR'), '^[0-9][0-9.\-/]+ ', '')) as credor,
                    0 as titulos_7d, 0 as valor_7d,
                    0 as titulos_15d, 0 as valor_15d,
                    0 as titulos_30d, 0 as valor_30d,
                    COUNT(DISTINCT SPLIT_PART(cp.lancamento, '/', 1)) as titulos_total,
                    COALESCE(SUM(cp.valor_liquido), 0) as valor_total
                FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE {where_clause}
                GROUP BY TRIM(REGEXP_REPLACE(COALESCE(cp.credor, 'SEM CREDOR'), '^[0-9][0-9.\-/]+ ', ''))
                ORDER BY valor_total DESC
            """
            all_params = params

        cursor.execute(query, all_params)
        rows = cursor.fetchall()

        fornecedores = []
        for row in rows:
            fornecedores.append({
                'credor': row['credor'],
                'titulos_7d': row['titulos_7d'],
                'valor_7d': decimal_to_float(row['valor_7d']),
                'titulos_15d': row['titulos_15d'],
                'valor_15d': decimal_to_float(row['valor_15d']),
                'titulos_30d': row['titulos_30d'],
                'valor_30d': decimal_to_float(row['valor_30d']),
                'titulos_total': row['titulos_total'],
                'valor_total': decimal_to_float(row['valor_total']),
            })

        return {
            'ref_date': str(ref_date) if ref_date else None,
            'fornecedores': fornecedores,
            'total_fornecedores': len(fornecedores),
        }

    finally:
        cursor.close()
        conn.close()

# ┌──────────────────────────────────────────────────────────────┐
# │ DOCUMENTAÇÃO: GET /api/contas-pagas-por-centro-custo         │
# ├──────────────────────────────────────────────────────────────┤
# │ FONTE: contas_pagas.valor_liquido, agrupado por CC           │
# │ CHAVE: cc.id_sienge_centrocusto + cc.nome_centrocusto        │
# │ PERÍODOS: 7d, 15d, 30d, total (baseado em dump_date)         │
# │ FILTROS AUTO: exclusões, origens, tipos_baixa, inter-empresa │
# │ USADO POR: Contas Pagas > visão por centro de custo          │
# │ REFERÊNCIA: valor_total aqui = Realizado no Painel Executivo │
# └──────────────────────────────────────────────────────────────┘
@app.get("/api/contas-pagas-por-centro-custo")
def get_contas_pagas_por_centro_custo(
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
    conta_corrente: Optional[str] = None,
    origem_titulo: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
):
    """Retorna contas pagas agrupadas por centro de custo com períodos 7d/15d/30d/total."""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT MAX(dump_date) as ultima FROM fulldump_log")
        ref_row = cursor.fetchone()
        ref_date = ref_row['ultima'] if ref_row else None

        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(
            exclusoes, cc_alias='cc', table_alias='cp',
            has_conta_corrente=True
        )
        conditions = list(excl_conds)
        params = list(excl_params)

        try:
            cfg_conn = get_config_db_connection()
            cfg_cursor = cfg_conn.cursor()
            try:
                cfg_cursor.execute(
                    "SELECT sigla FROM config_origens_exposicao_caixa WHERE incluir = %s OR paginas NOT LIKE %s",
                    (False, '%contas_pagas%')
                )
                origens_excluidas_cp = [r['sigla'].strip().upper() for r in cfg_cursor.fetchall() if r['sigla']]
                if origens_excluidas_cp:
                    oe_placeholders = ', '.join(['%s'] * len(origens_excluidas_cp))
                    conditions.append(f"TRIM(UPPER(cp.id_origem)) NOT IN ({oe_placeholders})")
                    params.extend(origens_excluidas_cp)

                cfg_cursor.execute(
                    "SELECT id_tipo_baixa FROM config_tipos_baixa_exposicao_caixa WHERE incluir = 1 AND paginas LIKE %s",
                    ('%contas_pagas%',)
                )
                tipos_baixa_config = [r['id_tipo_baixa'] for r in cfg_cursor.fetchall()]
            finally:
                cfg_cursor.close()
                cfg_conn.close()
        except Exception:
            tipos_baixa_config = []

        if tipos_baixa_config and not tipo_baixa:
            tb_placeholders = ', '.join(['%s'] * len(tipos_baixa_config))
            conditions.append(f"cp.id_tipo_baixa IN ({tb_placeholders})")
            params.extend(tipos_baixa_config)

        # Excluir transferências inter-empresa (credores que são nomes de empresas do grupo)
        try:
            cursor.execute("SELECT DISTINCT TRIM(nome_empresa) as nome FROM dim_centrocusto WHERE nome_empresa IS NOT NULL")
            empresa_names = [r['nome'] for r in cursor.fetchall() if r['nome']]
            if empresa_names:
                en_placeholders = ', '.join(['%s'] * len(empresa_names))
                conditions.append(f"TRIM(cp.credor) NOT IN ({en_placeholders})")
                params.extend(empresa_names)
        except Exception:
            pass

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"""cp.id_interno_empresa IN (
                    SELECT DISTINCT cp2.id_interno_empresa FROM contas_pagas cp2
                    JOIN dim_centrocusto cc2 ON cp2.id_interno_centro_custo = cc2.id_interno_centrocusto
                    WHERE cc2.id_sienge_empresa IN ({emp_ph})
                )""")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

        if credor:
            credores_list = parse_csv_str(credor)
            if len(credores_list) == 1:
                conditions.append("cp.credor ILIKE %s")
                params.append(f"%{credores_list[0]}%")
            elif len(credores_list) > 1:
                cr_conds = []
                for cr in credores_list:
                    cr_conds.append("cp.credor ILIKE %s")
                    params.append(f"%{cr}%")
                conditions.append(f"({' OR '.join(cr_conds)})")

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

        if conta_corrente:
            contas = [c.strip() for c in conta_corrente.split(',')]
            conta_placeholders = ', '.join(['%s'] * len(contas))
            conditions.append(f"cp.id_conta_corrente IN ({conta_placeholders})")
            params.extend(contas)

        if origem_titulo:
            siglas = [s.strip().upper() for s in origem_titulo.split(',') if s.strip()]
            if siglas:
                ot_placeholders = ', '.join(['%s'] * len(siglas))
                conditions.append(f"TRIM(UPPER(cp.id_origem)) IN ({ot_placeholders})")
                params.extend(siglas)

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM cp.data_pagamento) IN ({ano_placeholders})")
            params.extend(anos)

        if mes:
            meses_list = [int(m.strip()) for m in mes.split(',')]
            mes_placeholders = ', '.join(['%s'] * len(meses_list))
            conditions.append(f"EXTRACT(MONTH FROM cp.data_pagamento) IN ({mes_placeholders})")
            params.extend(meses_list)

        if data_inicio:
            conditions.append("(cp.data_pagamento + INTERVAL '1 day')::date >= %s")
            params.append(data_inicio)

        if data_fim:
            conditions.append("(cp.data_pagamento + INTERVAL '1 day')::date <= %s")
            params.append(data_fim)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query_params = []
        if ref_date:
            d7 = ref_date - __import__('datetime').timedelta(days=6)
            d15 = ref_date - __import__('datetime').timedelta(days=14)
            d30 = ref_date - __import__('datetime').timedelta(days=29)
            query_params = [d7, ref_date, d15, ref_date, d30, ref_date]

        if ref_date:
            query = f"""
                SELECT
                    cc.id_sienge_centrocusto as codigo_cc,
                    COALESCE(cc.nome_centrocusto, 'SEM CENTRO DE CUSTO') as nome_centrocusto,
                    COALESCE(SUM(CASE WHEN cp.data_pagamento >= %s AND cp.data_pagamento <= %s THEN cp.valor_liquido ELSE 0 END), 0) as valor_7d,
                    COALESCE(SUM(CASE WHEN cp.data_pagamento >= %s AND cp.data_pagamento <= %s THEN cp.valor_liquido ELSE 0 END), 0) as valor_15d,
                    COALESCE(SUM(CASE WHEN cp.data_pagamento >= %s AND cp.data_pagamento <= %s THEN cp.valor_liquido ELSE 0 END), 0) as valor_30d,
                    COALESCE(SUM(cp.valor_liquido), 0) as valor_total
                FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE {where_clause}
                GROUP BY cc.id_sienge_centrocusto, cc.nome_centrocusto
                ORDER BY valor_total DESC
            """
            all_params = query_params + params
        else:
            query = f"""
                SELECT
                    cc.id_sienge_centrocusto as codigo_cc,
                    COALESCE(cc.nome_centrocusto, 'SEM CENTRO DE CUSTO') as nome_centrocusto,
                    0 as valor_7d, 0 as valor_15d, 0 as valor_30d,
                    COALESCE(SUM(cp.valor_liquido), 0) as valor_total
                FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE {where_clause}
                GROUP BY cc.id_sienge_centrocusto, cc.nome_centrocusto
                ORDER BY valor_total DESC
            """
            all_params = params

        cursor.execute(query, all_params)
        rows = cursor.fetchall()

        centros_custo = []
        for row in rows:
            centros_custo.append({
                'codigo_cc': row['codigo_cc'],
                'nome_centrocusto': row['nome_centrocusto'],
                'valor_7d': decimal_to_float(row['valor_7d']),
                'valor_15d': decimal_to_float(row['valor_15d']),
                'valor_30d': decimal_to_float(row['valor_30d']),
                'valor_total': decimal_to_float(row['valor_total']),
            })

        return {
            'ref_date': str(ref_date) if ref_date else None,
            'centros_custo': centros_custo,
            'total_centros': len(centros_custo),
        }

    finally:
        cursor.close()
        conn.close()

@app.get("/api/contas-pagas-por-origem")
def get_contas_pagas_por_origem(
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
    conta_corrente: Optional[str] = None,
    origem_titulo: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
):
    """Retorna contas pagas agrupadas por origem (id_origem) com períodos 7d/15d/30d/total."""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT MAX(dump_date) as ultima FROM fulldump_log")
        ref_row = cursor.fetchone()
        ref_date = ref_row['ultima'] if ref_row else None

        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(
            exclusoes, cc_alias='cc', table_alias='cp',
            has_conta_corrente=True
        )
        conditions = list(excl_conds)
        params = list(excl_params)

        try:
            cfg_conn = get_config_db_connection()
            cfg_cursor = cfg_conn.cursor()
            try:
                cfg_cursor.execute(
                    "SELECT sigla FROM config_origens_exposicao_caixa WHERE incluir = %s OR paginas NOT LIKE %s",
                    (False, '%contas_pagas%')
                )
                origens_excluidas_cp = [r['sigla'].strip().upper() for r in cfg_cursor.fetchall() if r['sigla']]
                if origens_excluidas_cp:
                    oe_placeholders = ', '.join(['%s'] * len(origens_excluidas_cp))
                    conditions.append(f"TRIM(UPPER(cp.id_origem)) NOT IN ({oe_placeholders})")
                    params.extend(origens_excluidas_cp)

                cfg_cursor.execute(
                    "SELECT id_tipo_baixa FROM config_tipos_baixa_exposicao_caixa WHERE incluir = 1 AND paginas LIKE %s",
                    ('%contas_pagas%',)
                )
                tipos_baixa_config = [r['id_tipo_baixa'] for r in cfg_cursor.fetchall()]
            finally:
                cfg_cursor.close()
                cfg_conn.close()
        except Exception:
            tipos_baixa_config = []

        if tipos_baixa_config and not tipo_baixa:
            tb_placeholders = ', '.join(['%s'] * len(tipos_baixa_config))
            conditions.append(f"cp.id_tipo_baixa IN ({tb_placeholders})")
            params.extend(tipos_baixa_config)

        # Excluir transferências inter-empresa (credores que são nomes de empresas do grupo)
        try:
            cursor.execute("SELECT DISTINCT TRIM(nome_empresa) as nome FROM dim_centrocusto WHERE nome_empresa IS NOT NULL")
            empresa_names = [r['nome'] for r in cursor.fetchall() if r['nome']]
            if empresa_names:
                en_placeholders = ', '.join(['%s'] * len(empresa_names))
                conditions.append(f"TRIM(cp.credor) NOT IN ({en_placeholders})")
                params.extend(empresa_names)
        except Exception:
            pass

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"""cp.id_interno_empresa IN (
                    SELECT DISTINCT cp2.id_interno_empresa FROM contas_pagas cp2
                    JOIN dim_centrocusto cc2 ON cp2.id_interno_centro_custo = cc2.id_interno_centrocusto
                    WHERE cc2.id_sienge_empresa IN ({emp_ph})
                )""")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

        if credor:
            credores_list = parse_csv_str(credor)
            if len(credores_list) == 1:
                conditions.append("cp.credor ILIKE %s")
                params.append(f"%{credores_list[0]}%")
            elif len(credores_list) > 1:
                cr_conds = []
                for cr in credores_list:
                    cr_conds.append("cp.credor ILIKE %s")
                    params.append(f"%{cr}%")
                conditions.append(f"({' OR '.join(cr_conds)})")

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

        if conta_corrente:
            contas = [c.strip() for c in conta_corrente.split(',')]
            conta_placeholders = ', '.join(['%s'] * len(contas))
            conditions.append(f"cp.id_conta_corrente IN ({conta_placeholders})")
            params.extend(contas)

        if origem_titulo:
            siglas = [s.strip().upper() for s in origem_titulo.split(',') if s.strip()]
            if siglas:
                ot_placeholders = ', '.join(['%s'] * len(siglas))
                conditions.append(f"TRIM(UPPER(cp.id_origem)) IN ({ot_placeholders})")
                params.extend(siglas)

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM cp.data_pagamento) IN ({ano_placeholders})")
            params.extend(anos)

        if mes:
            meses_list = [int(m.strip()) for m in mes.split(',')]
            mes_placeholders = ', '.join(['%s'] * len(meses_list))
            conditions.append(f"EXTRACT(MONTH FROM cp.data_pagamento) IN ({mes_placeholders})")
            params.extend(meses_list)

        if data_inicio:
            conditions.append("(cp.data_pagamento + INTERVAL '1 day')::date >= %s")
            params.append(data_inicio)

        if data_fim:
            conditions.append("(cp.data_pagamento + INTERVAL '1 day')::date <= %s")
            params.append(data_fim)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        if ref_date:
            d7 = ref_date - __import__('datetime').timedelta(days=6)
            d15 = ref_date - __import__('datetime').timedelta(days=14)
            d30 = ref_date - __import__('datetime').timedelta(days=29)
            query_params = [d7, ref_date, d15, ref_date, d30, ref_date]

            query = f"""
                SELECT
                    TRIM(UPPER(COALESCE(cp.id_origem, 'SEM ORIGEM'))) as origem,
                    COALESCE(SUM(CASE WHEN cp.data_pagamento >= %s AND cp.data_pagamento <= %s THEN cp.valor_liquido ELSE 0 END), 0) as valor_7d,
                    COALESCE(SUM(CASE WHEN cp.data_pagamento >= %s AND cp.data_pagamento <= %s THEN cp.valor_liquido ELSE 0 END), 0) as valor_15d,
                    COALESCE(SUM(CASE WHEN cp.data_pagamento >= %s AND cp.data_pagamento <= %s THEN cp.valor_liquido ELSE 0 END), 0) as valor_30d,
                    COALESCE(SUM(cp.valor_liquido), 0) as valor_total
                FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE {where_clause}
                GROUP BY TRIM(UPPER(COALESCE(cp.id_origem, 'SEM ORIGEM')))
                ORDER BY valor_total DESC
            """
            all_params = query_params + params
        else:
            query = f"""
                SELECT
                    TRIM(UPPER(COALESCE(cp.id_origem, 'SEM ORIGEM'))) as origem,
                    0 as valor_7d, 0 as valor_15d, 0 as valor_30d,
                    COALESCE(SUM(cp.valor_liquido), 0) as valor_total
                FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE {where_clause}
                GROUP BY TRIM(UPPER(COALESCE(cp.id_origem, 'SEM ORIGEM')))
                ORDER BY valor_total DESC
            """
            all_params = params

        cursor.execute(query, all_params)
        rows = cursor.fetchall()

        origens = []
        for row in rows:
            origens.append({
                'origem': row['origem'],
                'valor_7d': decimal_to_float(row['valor_7d']),
                'valor_15d': decimal_to_float(row['valor_15d']),
                'valor_30d': decimal_to_float(row['valor_30d']),
                'valor_total': decimal_to_float(row['valor_total']),
            })

        return {
            'ref_date': str(ref_date) if ref_date else None,
            'origens': origens,
            'total_origens': len(origens),
        }

    finally:
        cursor.close()
        conn.close()

# ┌──────────────────────────────────────────────────────────────┐
# │ DOCUMENTAÇÃO: GET /api/estatisticas-contas-pagas             │
# ├──────────────────────────────────────────────────────────────┤
# │ FONTE: contas_pagas — count, sum, avg de valor_liquido       │
# │ FILTROS AUTO: exclusões, origens, tipos_baixa                │
# │ ATENÇÃO: aplica tipos_baixa da config → valores MENORES      │
# │   que /contas-pagas-por-centro-custo. Não usar para          │
# │   "Realizado" do Orçamento.                                  │
# │ USADO POR: Contas Pagas > cards de estatísticas              │
# └──────────────────────────────────────────────────────────────┘
@app.get("/api/estatisticas-contas-pagas")
def get_estatisticas_contas_pagas(
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
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
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)

        # Auto-excluir origens sem contas_pagas habilitado + ler tipos_baixa da config
        try:
            cfg_conn = get_config_db_connection()
            cfg_cursor = cfg_conn.cursor()
            try:
                cfg_cursor.execute(
                    "SELECT sigla FROM config_origens_exposicao_caixa WHERE incluir = %s OR paginas NOT LIKE %s",
                    (False, '%contas_pagas%')
                )
                origens_excluidas_cp = [r['sigla'].strip().upper() for r in cfg_cursor.fetchall() if r['sigla']]
                if origens_excluidas_cp:
                    oe_placeholders = ', '.join(['%s'] * len(origens_excluidas_cp))
                    conditions.append(f"TRIM(UPPER(cp.id_origem)) NOT IN ({oe_placeholders})")
                    params.extend(origens_excluidas_cp)

                # Ler tipos_baixa habilitados para contas_pagas da config
                cfg_cursor.execute(
                    "SELECT id_tipo_baixa FROM config_tipos_baixa_exposicao_caixa WHERE incluir = 1 AND paginas LIKE %s",
                    ('%contas_pagas%',)
                )
                tipos_baixa_config_stat = [r['id_tipo_baixa'] for r in cfg_cursor.fetchall()]
            finally:
                cfg_cursor.close()
                cfg_conn.close()
        except Exception:
            tipos_baixa_config_stat = []

        # Aplicar filtro de tipo_baixa da config (se não veio parâmetro manual)
        if tipos_baixa_config_stat and not tipo_baixa:
            tb_placeholders = ', '.join(['%s'] * len(tipos_baixa_config_stat))
            conditions.append(f"cp.id_tipo_baixa IN ({tb_placeholders})")
            params.extend(tipos_baixa_config_stat)

        # Excluir transferências inter-empresa (credores que são nomes de empresas do grupo)
        try:
            cursor.execute("SELECT DISTINCT TRIM(nome_empresa) as nome FROM dim_centrocusto WHERE nome_empresa IS NOT NULL")
            empresa_names_stat = [r['nome'] for r in cursor.fetchall() if r['nome']]
            if empresa_names_stat:
                en_placeholders = ', '.join(['%s'] * len(empresa_names_stat))
                conditions.append(f"TRIM(cp.credor) NOT IN ({en_placeholders})")
                params.extend(empresa_names_stat)
        except Exception:
            pass

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"""cp.id_interno_empresa IN (
                    SELECT DISTINCT cp2.id_interno_empresa FROM contas_pagas cp2
                    JOIN dim_centrocusto cc2 ON cp2.id_interno_centro_custo = cc2.id_interno_centrocusto
                    WHERE cc2.id_sienge_empresa IN ({emp_ph})
                )""")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

        if credor:
            credores_list = parse_csv_str(credor)
            if len(credores_list) == 1:
                conditions.append("cp.credor ILIKE %s")
                params.append(f"%{credores_list[0]}%")
            elif len(credores_list) > 1:
                cr_conds = []
                for cr in credores_list:
                    cr_conds.append("cp.credor ILIKE %s")
                    params.append(f"%{cr}%")
                conditions.append(f"({' OR '.join(cr_conds)})")

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

        # Salvar condições-base ANTES de ano/mês/data (para cards de período)
        conditions_base = list(conditions)
        params_base = list(params)

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
            conditions.append("(cp.data_pagamento + INTERVAL '1 day')::date >= %s")
            params.append(data_inicio)

        if data_fim:
            conditions.append("(cp.data_pagamento + INTERVAL '1 day')::date <= %s")
            params.append(data_fim)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        # Query 1: Totais com todos os filtros (ano, mês, data)
        query = f"""
            SELECT
                COUNT(*) as quantidade_titulos,
                COALESCE(SUM(cp.valor_liquido), 0) as valor_liquido_total,
                COALESCE(SUM(cp.valor_baixa), 0) as valor_baixa_total,
                COALESCE(SUM(cp.valor_acrescimo), 0) as valor_acrescimo_total,
                COALESCE(SUM(cp.valor_desconto), 0) as valor_desconto_total
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
        """

        cursor.execute(query, params)
        row = cursor.fetchone()

        # Query 2: Cards de período (ignora filtros de ano/mês/data)
        where_clause_base = " AND ".join(conditions_base) if conditions_base else "1=1"
        query_periodo = f"""
            SELECT
                COALESCE(SUM(CASE WHEN cp.data_pagamento >= CURRENT_DATE - INTERVAL '7 days' AND cp.data_pagamento < CURRENT_DATE THEN cp.valor_liquido ELSE 0 END), 0) as valor_7d,
                COALESCE(SUM(CASE WHEN cp.data_pagamento >= CURRENT_DATE - INTERVAL '15 days' AND cp.data_pagamento < CURRENT_DATE THEN cp.valor_liquido ELSE 0 END), 0) as valor_15d,
                COALESCE(SUM(CASE WHEN cp.data_pagamento >= CURRENT_DATE - INTERVAL '30 days' AND cp.data_pagamento < CURRENT_DATE THEN cp.valor_liquido ELSE 0 END), 0) as valor_30d
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause_base}
        """

        cursor.execute(query_periodo, params_base)
        row_periodo = cursor.fetchone()

        return {
            'quantidade_titulos': row['quantidade_titulos'],
            'valor_liquido': decimal_to_float(row['valor_liquido_total']),
            'valor_baixa': decimal_to_float(row['valor_baixa_total']),
            'valor_acrescimo': decimal_to_float(row['valor_acrescimo_total']),
            'valor_desconto': decimal_to_float(row['valor_desconto_total']),
            'valor_7d': decimal_to_float(row_periodo['valor_7d']),
            'valor_15d': decimal_to_float(row_periodo['valor_15d']),
            'valor_30d': decimal_to_float(row_periodo['valor_30d']),
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
            SELECT DISTINCT TRIM(REGEXP_REPLACE(COALESCE(credor, 'SEM CREDOR'), '^[0-9][0-9.\-/]+ ', '')) as credor
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
    """Retorna todas as empresas ativas (não excluídas nas configurações)"""
    exclusoes = get_exclusoes()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conditions = ["id_sienge_empresa IS NOT NULL", "nome_empresa IS NOT NULL"]
        params = []
        if exclusoes['empresas']:
            placeholders = ','.join(['%s'] * len(exclusoes['empresas']))
            conditions.append(f"id_sienge_empresa NOT IN ({placeholders})")
            params.extend(exclusoes['empresas'])
        where_clause = " AND ".join(conditions)
        cursor.execute(f"""
            SELECT DISTINCT id_sienge_empresa, nome_empresa
            FROM dim_centrocusto
            WHERE {where_clause}
            ORDER BY nome_empresa
        """, params)
        rows = cursor.fetchall()
        return [{'id': row['id_sienge_empresa'], 'nome': row['nome_empresa']} for row in rows]
    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/empresas-recebidas")
def get_empresas_recebidas():
    """Retorna todas as empresas ativas (não excluídas nas configurações) — mesma fonte que /filtros/empresas"""
    exclusoes = get_exclusoes()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conditions = ["id_sienge_empresa IS NOT NULL", "nome_empresa IS NOT NULL"]
        params = []
        if exclusoes['empresas']:
            placeholders = ','.join(['%s'] * len(exclusoes['empresas']))
            conditions.append(f"id_sienge_empresa NOT IN ({placeholders})")
            params.extend(exclusoes['empresas'])
        where_clause = " AND ".join(conditions)
        cursor.execute(f"""
            SELECT DISTINCT id_sienge_empresa, nome_empresa
            FROM dim_centrocusto
            WHERE {where_clause}
            ORDER BY nome_empresa
        """, params)
        rows = cursor.fetchall()
        return [{'id': row['id_sienge_empresa'], 'nome': row['nome_empresa']} for row in rows]
    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/centros-custo-recebidas")
def get_centros_custo_recebidas():
    """Retorna centros de custo ativos (não excluídos nas configurações) — mesma fonte que /filtros/centros-custo"""
    exclusoes = get_exclusoes()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conditions = ["id_interno_centrocusto IS NOT NULL"]
        params = []
        if exclusoes['centros_custo']:
            placeholders = ','.join(['%s'] * len(exclusoes['centros_custo']))
            conditions.append(f"id_interno_centrocusto NOT IN ({placeholders})")
            params.extend(exclusoes['centros_custo'])
        where_clause = " AND ".join(conditions)
        cursor.execute(f"""
            SELECT id_interno_centrocusto, nome_centrocusto, id_sienge_empresa, id_sienge_centrocusto
            FROM dim_centrocusto
            WHERE {where_clause}
            ORDER BY nome_centrocusto
        """, params)
        rows = cursor.fetchall()
        return [{'id': row['id_interno_centrocusto'], 'nome': row['nome_centrocusto'], 'id_empresa': row['id_sienge_empresa'], 'codigo': row['id_sienge_centrocusto']} for row in rows]
    finally:
        cursor.close()
        conn.close()

# ============ USUÁRIOS ONLINE ============

@app.post("/api/heartbeat")
def registrar_heartbeat(data: dict):
    """Registra heartbeat do usuário (chamado a cada 30s pelo frontend)"""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        # Criar tabela se não existir
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessoes_ativas (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    user_nome VARCHAR(255),
                    user_email VARCHAR(255),
                    user_permissao VARCHAR(50),
                    ultimo_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id)
                )
            """)
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass

        user_id = data.get('user_id')
        user_nome = data.get('user_nome', '')
        user_email = data.get('user_email', '')
        user_permissao = data.get('user_permissao', '')

        # Upsert: atualiza heartbeat se existe, insere se não
        cursor.execute("""
            INSERT INTO sessoes_ativas (user_id, user_nome, user_email, user_permissao, ultimo_heartbeat, login_at)
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id)
            DO UPDATE SET ultimo_heartbeat = CURRENT_TIMESTAMP, user_nome = %s, user_email = %s, user_permissao = %s
        """, (user_id, user_nome, user_email, user_permissao, user_nome, user_email, user_permissao))
        conn.commit()
        return {"success": True}
    except Exception as e:
        print(f"[ERRO] heartbeat: {e}")
        return {"success": False}
    finally:
        cursor.close()
        conn.close()

@app.get("/api/usuarios-online")
def get_usuarios_online():
    """Retorna usuários com heartbeat nos últimos 2 minutos"""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT user_id, user_nome, user_email, user_permissao, login_at, ultimo_heartbeat
            FROM sessoes_ativas
            WHERE ultimo_heartbeat > CURRENT_TIMESTAMP - INTERVAL '2 minutes'
            ORDER BY login_at ASC
        """)
        rows = cursor.fetchall()
        return {
            "online": [dict(r) for r in rows],
            "total_online": len(rows)
        }
    except Exception as e:
        print(f"[ERRO] usuarios-online: {e}")
        return {"online": [], "total_online": 0}
    finally:
        cursor.close()
        conn.close()

@app.delete("/api/heartbeat/{user_id}")
def remover_heartbeat(user_id: int):
    """Remove sessão ao fazer logout"""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM sessoes_ativas WHERE user_id = %s", (user_id,))
        conn.commit()
        return {"success": True}
    except Exception:
        return {"success": False}
    finally:
        cursor.close()
        conn.close()

# ============ SOLICITAÇÕES DE MELHORIAS ============

@app.get("/api/solicitacoes")
def listar_solicitacoes():
    """Lista todas as solicitações de melhorias"""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM solicitacoes_melhorias ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        print(f"[ERRO] listar_solicitacoes: {e}")
        return []
    finally:
        cursor.close()
        conn.close()

@app.post("/api/solicitacoes")
def criar_solicitacao(data: dict):
    """Cria uma nova solicitação de melhoria"""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        # Garantir que tabela existe
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS solicitacoes_melhorias (
                    id SERIAL PRIMARY KEY,
                    titulo VARCHAR(255) NOT NULL,
                    descricao TEXT NOT NULL,
                    secao VARCHAR(100) NOT NULL DEFAULT 'Geral',
                    prioridade VARCHAR(20) NOT NULL DEFAULT 'media',
                    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
                    usuario_nome VARCHAR(255),
                    usuario_email VARCHAR(255),
                    resposta_dev TEXT,
                    versao_implementada VARCHAR(20),
                    imagem TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()
        except Exception as create_err:
            print(f"[WARN] CREATE TABLE solicitacoes: {create_err}")
            try:
                conn.rollback()
            except Exception:
                pass

        imagem = data.get('imagem') or None
        try:
            cursor.execute(
                """INSERT INTO solicitacoes_melhorias (titulo, descricao, secao, prioridade, usuario_nome, usuario_email, imagem)
                VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (data.get('titulo', ''), data.get('descricao', ''), data.get('secao', 'Geral'),
                 data.get('prioridade', 'media'), data.get('usuario_nome', ''), data.get('usuario_email', ''), imagem)
            )
        except Exception as insert_err:
            print(f"[WARN] INSERT com imagem falhou: {insert_err}, tentando sem imagem...")
            conn.rollback()
            cursor.execute(
                """INSERT INTO solicitacoes_melhorias (titulo, descricao, secao, prioridade, usuario_nome, usuario_email)
                VALUES (%s, %s, %s, %s, %s, %s)""",
                (data.get('titulo', ''), data.get('descricao', ''), data.get('secao', 'Geral'),
                 data.get('prioridade', 'media'), data.get('usuario_nome', ''), data.get('usuario_email', ''))
            )
        conn.commit()
        return {"success": True}
    except Exception as e:
        import traceback
        print(f"[ERRO] criar_solicitacao: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.put("/api/solicitacoes/{id}")
def atualizar_solicitacao(id: int, data: dict):
    """Atualiza status/resposta de uma solicitação (admin)"""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        fields = []
        params = []
        for field in ['status', 'prioridade', 'resposta_dev', 'versao_implementada']:
            if field in data:
                fields.append(f"{field} = %s")
                params.append(data[field])
        if fields:
            fields.append("updated_at = CURRENT_TIMESTAMP")
            params.append(id)
            cursor.execute(f"UPDATE solicitacoes_melhorias SET {', '.join(fields)} WHERE id = %s", params)
            conn.commit()
        return {"success": True}
    except Exception as e:
        print(f"[ERRO] atualizar_solicitacao: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.delete("/api/solicitacoes/{id}")
def deletar_solicitacao(id: int):
    """Remove uma solicitação"""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM solicitacoes_melhorias WHERE id = %s", (id,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        print(f"[ERRO] deletar_solicitacao: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.get("/api/diagnostico/realizado-detalhado")
def diagnostico_realizado_detalhado():
    """Detalha o valor Realizado: por tipo de baixa e por centro de custo (top 15)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Total geral sem filtro
        cursor.execute("SELECT COALESCE(SUM(valor_liquido), 0) as total FROM contas_pagas")
        total_sem_filtro = float(cursor.fetchone()['total'])

        # Por tipo de baixa
        cursor.execute("""
            SELECT cp.id_tipo_baixa, tb.nome_tipo_baixa, tb.flag_sistema_uso,
                   COALESCE(SUM(cp.valor_liquido), 0) as total,
                   COUNT(*) as qtd
            FROM contas_pagas cp
            LEFT JOIN ecadtipobaixa tb ON cp.id_tipo_baixa = tb.id_tipo_baixa
            GROUP BY cp.id_tipo_baixa, tb.nome_tipo_baixa, tb.flag_sistema_uso
            ORDER BY total DESC
        """)
        por_tipo_baixa = [dict(r) for r in cursor.fetchall()]

        # Por centro de custo (top 15)
        cursor.execute("""
            SELECT cc.id_sienge_centrocusto, cc.nome_centrocusto,
                   COALESCE(SUM(cp.valor_liquido), 0) as total,
                   COUNT(*) as qtd
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            GROUP BY cc.id_sienge_centrocusto, cc.nome_centrocusto
            ORDER BY total DESC
            LIMIT 15
        """)
        por_centro_custo = [dict(r) for r in cursor.fetchall()]

        # Tipos de baixa configurados como incluídos
        tipos_config = []
        try:
            cfg_conn = get_config_db_connection()
            cfg_cursor = cfg_conn.cursor()
            cfg_cursor.execute("SELECT * FROM config_tipos_baixa_exposicao_caixa WHERE incluir = 1 AND paginas LIKE '%contas_pagas%'")
            tipos_config = [dict(r) for r in cfg_cursor.fetchall()]
            cfg_cursor.close()
            cfg_conn.close()
        except Exception:
            pass

        # Total filtrado (mesmo calculo do endpoint realizado-por-centro-custo)
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)
        if tipos_config:
            ids = [t['id_tipo_baixa'] for t in tipos_config]
            tb_ph = ', '.join(['%s'] * len(ids))
            conditions.append(f"cp.id_tipo_baixa IN ({tb_ph})")
            params.extend(ids)
        where_clause = (" AND " + " AND ".join(conditions)) if conditions else ""
        cursor.execute(f"""
            SELECT COALESCE(SUM(cp.valor_liquido), 0) as total
            FROM contas_pagas cp
            INNER JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE cp.id_interno_centro_custo IS NOT NULL {where_clause}
        """, tuple(params))
        total_com_filtro = float(cursor.fetchone()['total'])

        return {
            "total_sem_filtro": total_sem_filtro,
            "total_com_filtro": total_com_filtro,
            "diferenca": total_sem_filtro - total_com_filtro,
            "por_tipo_baixa": por_tipo_baixa,
            "por_centro_custo": por_centro_custo,
            "tipos_baixa_configurados": tipos_config,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"erro": str(e)}
    finally:
        cursor.close()
        conn.close()

@app.get("/api/diagnostico/cc-ids")
def diagnostico_cc_ids():
    """Mostra mapeamento id_interno vs id_sienge dos centros de custo"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id_interno_centrocusto, id_sienge_centrocusto, nome_centrocusto
            FROM dim_centrocusto
            WHERE nome_centrocusto ILIKE '%lake%' OR nome_centrocusto ILIKE '%buenos%'
            ORDER BY nome_centrocusto
        """)
        centros = [dict(r) for r in cursor.fetchall()]

        # Verificar quais id_interno_centro_custo existem em contas_recebidas para Lake
        cursor.execute("""
            SELECT DISTINCT cr.id_interno_centro_custo, cc.id_sienge_centrocusto, cc.nome_centrocusto
            FROM contas_recebidas cr
            LEFT JOIN dim_centrocusto cc ON cr.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE cc.nome_centrocusto ILIKE '%lake%'
            LIMIT 5
        """)
        recebidas_lake = [dict(r) for r in cursor.fetchall()]

        return {
            "centros_dim": centros,
            "recebidas_lake_sample": recebidas_lake,
        }
    except Exception as e:
        return {"erro": str(e)}
    finally:
        cursor.close()
        conn.close()

@app.get("/api/diagnostico/empresas-centros")
def get_empresas_centros():
    """Retorna todas as empresas com seus centros de custo aninhados (para diagnóstico)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                cc.id_sienge_empresa,
                cc.nome_empresa,
                cc.id_interno_centrocusto,
                cc.nome_centrocusto
            FROM dim_centrocusto cc
            WHERE cc.nome_empresa IS NOT NULL
            ORDER BY cc.nome_empresa, cc.nome_centrocusto
        """)
        rows = cursor.fetchall()
        empresas_map: dict = {}
        for r in rows:
            eid = r['id_sienge_empresa']
            if eid not in empresas_map:
                empresas_map[eid] = {
                    'id': eid,
                    'nome': r['nome_empresa'],
                    'centros': []
                }
            empresas_map[eid]['centros'].append({
                'id': r['id_interno_centrocusto'],
                'nome': r['nome_centrocusto']
            })
        return list(empresas_map.values())
    finally:
        cursor.close()
        conn.close()

@app.get("/api/diagnostico/titulo/{titulo_id}")
def diagnostico_titulo(titulo_id: int):
    """Busca um título em contas_a_pagar e contas_pagas para diagnóstico"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        resultados = {}
        # Buscar em contas_a_pagar
        cursor.execute("""
            SELECT cap.lancamento, cap.credor, cap.data_vencimento, cap.valor_total,
                   cap.id_interno_centro_custo, cap.id_interno_empresa,
                   cc.nome_centrocusto, cc.nome_empresa, cc.id_sienge_empresa
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE SPLIT_PART(cap.lancamento, '/', 1) = %s
        """, (str(titulo_id),))
        rows_cap = cursor.fetchall()
        resultados['contas_a_pagar'] = [dict(r) for r in rows_cap]

        # Buscar em contas_pagas
        cursor.execute("""
            SELECT cp.lancamento, cp.credor, cp.data_pagamento, cp.valor_liquido,
                   cp.id_interno_centro_custo, cp.id_interno_empresa,
                   cc.nome_centrocusto, cc.nome_empresa, cc.id_sienge_empresa
            FROM contas_pagas cp
            LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE SPLIT_PART(cp.lancamento, '/', 1) = %s
        """, (str(titulo_id),))
        rows_cp = cursor.fetchall()
        resultados['contas_pagas'] = [dict(r) for r in rows_cp]

        resultados['total_a_pagar'] = len(rows_cap)
        resultados['total_pagas'] = len(rows_cp)
        return resultados
    finally:
        cursor.close()
        conn.close()

@app.get("/api/diagnostico/exclusoes")
def diagnostico_exclusoes():
    """Retorna todas as exclusões configuradas atualmente"""
    exclusoes = get_exclusoes()
    return {
        'empresas_excluidas': exclusoes['empresas'],
        'centros_custo_excluidos': exclusoes['centros_custo'],
        'tipos_documento_excluidos': exclusoes['tipos_documento'],
        'contas_correntes_excluidas': exclusoes.get('contas_correntes', []),
    }

@app.get("/api/ultima-atualizacao")
def get_ultima_atualizacao():
    """Retorna a data da última carga de dados a partir de fulldump_log (dump_date)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT MAX(dump_date) as ultima FROM fulldump_log")
        row = cursor.fetchone()
        val = row['ultima'] if row else None
        return {"data": str(val) if val else None}
    except Exception as e:
        return {"data": None, "erro": str(e)}
    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/centros-custo")
def get_centros_custo():
    """Retorna centros de custo ativos (excluindo os marcados nas configurações)"""
    exclusoes = get_exclusoes()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conditions = ["id_interno_centrocusto IS NOT NULL"]
        params = []
        if exclusoes['centros_custo']:
            placeholders = ','.join(['%s'] * len(exclusoes['centros_custo']))
            conditions.append(f"id_interno_centrocusto NOT IN ({placeholders})")
            params.extend(exclusoes['centros_custo'])
        where_clause = " AND ".join(conditions)
        cursor.execute(f"""
            SELECT id_interno_centrocusto, nome_centrocusto, id_sienge_empresa, id_sienge_centrocusto
            FROM dim_centrocusto
            WHERE {where_clause}
            ORDER BY nome_centrocusto
        """, params)
        rows = cursor.fetchall()
        return [{'id': row['id_interno_centrocusto'], 'nome': row['nome_centrocusto'], 'id_empresa': row['id_sienge_empresa'], 'codigo': row['id_sienge_centrocusto']} for row in rows]
    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/tipos-documento")
def get_tipos_documento():
    """Retorna tipos de documento ativos (excluindo os marcados nas configurações)"""
    exclusoes = get_exclusoes()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conditions = []
        params = []
        if exclusoes['tipos_documento']:
            placeholders = ','.join(['%s'] * len(exclusoes['tipos_documento']))
            conditions.append(f"TRIM(id_documento) NOT IN ({placeholders})")
            params.extend(exclusoes['tipos_documento'])
        where_clause = (" WHERE " + " AND ".join(conditions)) if conditions else ""
        cursor.execute(f"""
            SELECT TRIM(id_documento) as id, TRIM(nome_documento) as nome
            FROM ecaddocumento
            {where_clause}
            ORDER BY id_documento
        """, params)
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

@app.get("/api/filtros/tipos-pagamento")
def get_tipos_pagamento():
    """Retorna lista de tipos de pagamento disponíveis (da tabela ecadtipopagamento)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT id_tipo_pagamento as id, nome_tipo_pagamento as nome
            FROM ecadtipopagamento
            ORDER BY id_tipo_pagamento
        """)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/planos-financeiros")
def get_planos_financeiros():
    """Retorna lista de planos financeiros disponíveis"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT id_plano_financeiro as id, nome_plano_financeiro as nome
            FROM ecadplanofin
            ORDER BY nome_plano_financeiro
        """)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

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
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
    ano: Optional[str] = None,
    origens_titulo: Optional[str] = None,
    tipos_baixa_exposicao: Optional[str] = None
):
    """Retorna estatísticas de contas pagas agrupadas por mês"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

        if credor:
            credores_list = parse_csv_str(credor)
            if len(credores_list) == 1:
                conditions.append("cp.credor ILIKE %s")
                params.append(f"%{credores_list[0]}%")
            elif len(credores_list) > 1:
                cr_conds = []
                for cr in credores_list:
                    cr_conds.append("cp.credor ILIKE %s")
                    params.append(f"%{cr}%")
                conditions.append(f"({' OR '.join(cr_conds)})")

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

        if origens_titulo:
            siglas = [s.strip().upper() for s in origens_titulo.split(',') if s.strip()]
            if siglas:
                ot_placeholders = ', '.join(['%s'] * len(siglas))
                conditions.append(f"TRIM(UPPER(cp.id_origem)) IN ({ot_placeholders})")
                params.extend(siglas)

        if tipos_baixa_exposicao:
            tb_ids = [int(t.strip()) for t in tipos_baixa_exposicao.split(',') if t.strip()]
            if tb_ids:
                tb_placeholders = ', '.join(['%s'] * len(tb_ids))
                conditions.append(f"cp.id_tipo_baixa IN ({tb_placeholders})")
                params.extend(tb_ids)

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
                COALESCE(SUM(CASE WHEN cp.id_tipo_baixa NOT IN (3, 5, 8, 12) THEN cp.valor_baixa ELSE 0 END), 0) as valor_total,
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

@app.get("/api/recebidas-por-mes")
def get_recebidas_por_mes(
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    ano: Optional[str] = None
):
    """Retorna totais de contas recebidas agrupados por mês"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cr', has_cc_column=False, has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cr.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ano_placeholders = ', '.join(['%s'] * len(anos))
            conditions.append(f"EXTRACT(YEAR FROM cr.data_recebimento) IN ({ano_placeholders})")
            params.extend(anos)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT
                TO_CHAR(cr.data_recebimento, 'YYYY-MM') as mes,
                EXTRACT(MONTH FROM cr.data_recebimento) as mes_num,
                COALESCE(SUM(cr.valor_liquido), 0) as valor_total,
                COUNT(*) as quantidade
            FROM contas_recebidas cr
            LEFT JOIN dim_centrocusto cc ON cr.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
            GROUP BY TO_CHAR(cr.data_recebimento, 'YYYY-MM'), EXTRACT(MONTH FROM cr.data_recebimento)
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
    centro_custo: Optional[str] = None,
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
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

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
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
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
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

        if credor:
            credores_list = parse_csv_str(credor)
            if len(credores_list) == 1:
                conditions.append("cp.credor ILIKE %s")
                params.append(f"%{credores_list[0]}%")
            elif len(credores_list) > 1:
                cr_conds = []
                for cr in credores_list:
                    cr_conds.append("cp.credor ILIKE %s")
                    params.append(f"%{cr}%")
                conditions.append(f"({' OR '.join(cr_conds)})")

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
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
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
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

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
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
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
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

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
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None
):
    """Retorna comparacao de pagamentos entre ano atual e anterior por mes"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

        if credor:
            credores_list = parse_csv_str(credor)
            if len(credores_list) == 1:
                conditions.append("cp.credor ILIKE %s")
                params.append(f"%{credores_list[0]}%")
            elif len(credores_list) > 1:
                cr_conds = []
                for cr in credores_list:
                    cr_conds.append("cp.credor ILIKE %s")
                    params.append(f"%{cr}%")
                conditions.append(f"({' OR '.join(cr_conds)})")

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
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    credor: Optional[str] = None,
    id_documento: Optional[str] = None,
    origem_dado: Optional[str] = None,
    tipo_baixa: Optional[str] = None
):
    """Retorna evolucao dos ultimos 12 meses com variacao percentual"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

        if credor:
            credores_list = parse_csv_str(credor)
            if len(credores_list) == 1:
                conditions.append("cp.credor ILIKE %s")
                params.append(f"%{credores_list[0]}%")
            elif len(credores_list) > 1:
                cr_conds = []
                for cr in credores_list:
                    cr_conds.append("cp.credor ILIKE %s")
                    params.append(f"%{cr}%")
                conditions.append(f"({' OR '.join(cr_conds)})")

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

# Inicialização da tabela de classificação de centros de custo
def init_centro_custo_classificacoes_table():
    """Inicializa a tabela de classificações de centros de custo no banco local"""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("DATABASE_URL não configurado - tabela de classificações não será criada")
        return
    
    try:
        conn = psycopg2.connect(database_url, cursor_factory=RealDictCursor)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS centro_custo_classificacoes (
                id SERIAL PRIMARY KEY,
                id_interno_centrocusto INTEGER NOT NULL UNIQUE,
                id_sienge_empresa INTEGER,
                nome_centrocusto VARCHAR(255),
                nome_empresa VARCHAR(255),
                classificacao VARCHAR(20) NOT NULL CHECK (classificacao IN ('ADM', 'OBRA')),
                observacao TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
        print("Tabela centro_custo_classificacoes criada/verificada com sucesso")
    except Exception as e:
        print(f"Erro ao inicializar tabela de classificações: {e}")
    finally:
        if 'cursor' in dir():
            cursor.close()
        if 'conn' in dir():
            conn.close()

init_centro_custo_classificacoes_table()

# Modelos Pydantic para Classificações de Centros de Custo
class ClassificacaoCentroCustoBase(BaseModel):
    id_interno_centrocusto: int
    id_sienge_empresa: Optional[int] = None
    nome_centrocusto: Optional[str] = None
    nome_empresa: Optional[str] = None
    classificacao: str  # 'ADM' ou 'OBRA'
    observacao: Optional[str] = None

class ClassificacaoCentroCustoCreate(ClassificacaoCentroCustoBase):
    pass

class ClassificacaoCentroCustoUpdate(BaseModel):
    classificacao: str
    observacao: Optional[str] = None

class ClassificacaoCentroCustoResponse(ClassificacaoCentroCustoBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

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

# Endpoints de Classificação de Centros de Custo

@app.get("/api/centros-custo/todos")
def get_todos_centros_custo(empresa: Optional[str] = None):
    """Retorna todos os centros de custo do banco externo com suas classificações"""
    conn = get_db_connection()  # Banco externo
    cursor = conn.cursor()
    
    try:
        conditions = []
        params = []
        
        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        query = f"""
            SELECT DISTINCT 
                cc.id_interno_centrocusto,
                cc.nome_centrocusto,
                cc.id_sienge_empresa,
                cc.nome_empresa
            FROM dim_centrocusto cc
            WHERE {where_clause}
            ORDER BY cc.nome_empresa, cc.nome_centrocusto
        """
        
        cursor.execute(query, params)
        centros_externos = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        # Buscar classificações do banco local
        local_conn = get_local_db_connection()
        local_cursor = local_conn.cursor()
        
        local_cursor.execute("SELECT * FROM centro_custo_classificacoes")
        classificacoes = {row['id_interno_centrocusto']: row for row in local_cursor.fetchall()}
        
        local_cursor.close()
        local_conn.close()
        
        # Combinar dados
        resultado = []
        for cc in centros_externos:
            id_cc = cc['id_interno_centrocusto']
            classif = classificacoes.get(id_cc)
            resultado.append({
                'id_interno_centrocusto': id_cc,
                'nome_centrocusto': cc['nome_centrocusto'],
                'id_sienge_empresa': cc['id_sienge_empresa'],
                'nome_empresa': cc['nome_empresa'],
                'classificacao': classif['classificacao'] if classif else None,
                'observacao': classif['observacao'] if classif else None,
                'id': classif['id'] if classif else None
            })
        
        return resultado
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/centros-custo/classificacoes")
def get_classificacoes_centros_custo():
    """Retorna todas as classificações salvas"""
    conn = get_local_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM centro_custo_classificacoes ORDER BY nome_empresa, nome_centrocusto")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        cursor.close()
        conn.close()

@app.post("/api/centros-custo/classificacoes")
def criar_classificacao_centro_custo(data: ClassificacaoCentroCustoCreate):
    """Cria ou atualiza uma classificação de centro de custo"""
    conn = get_local_db_connection()
    cursor = conn.cursor()
    
    try:
        # Upsert - insere ou atualiza se já existe
        cursor.execute("""
            INSERT INTO centro_custo_classificacoes 
                (id_interno_centrocusto, id_sienge_empresa, nome_centrocusto, nome_empresa, classificacao, observacao)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (id_interno_centrocusto) 
            DO UPDATE SET 
                classificacao = EXCLUDED.classificacao,
                observacao = EXCLUDED.observacao,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        """, (
            data.id_interno_centrocusto,
            data.id_sienge_empresa,
            data.nome_centrocusto,
            data.nome_empresa,
            data.classificacao,
            data.observacao
        ))
        
        result = cursor.fetchone()
        conn.commit()
        return dict(result)
        
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.put("/api/centros-custo/classificacoes/{id_interno_centrocusto}")
def atualizar_classificacao_centro_custo(id_interno_centrocusto: int, data: ClassificacaoCentroCustoUpdate):
    """Atualiza uma classificação existente"""
    conn = get_local_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            UPDATE centro_custo_classificacoes 
            SET classificacao = %s, observacao = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id_interno_centrocusto = %s
            RETURNING *
        """, (data.classificacao, data.observacao, id_interno_centrocusto))
        
        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Classificação não encontrada")
        
        conn.commit()
        return dict(result)
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.delete("/api/centros-custo/classificacoes/{id_interno_centrocusto}")
def remover_classificacao_centro_custo(id_interno_centrocusto: int):
    """Remove uma classificação"""
    conn = get_local_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            "DELETE FROM centro_custo_classificacoes WHERE id_interno_centrocusto = %s RETURNING id",
            (id_interno_centrocusto,)
        )
        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Classificação não encontrada")
        
        conn.commit()
        return {"message": "Classificação removida com sucesso"}
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

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

def _get_vence_hoje_range(hoje, feriados_set):
    """Retorna (data_inicio, data_fim) para o range de 'vence hoje'.
    Inclui dias anteriores consecutivos que foram feriados ou fins de semana."""
    data_inicio = hoje
    check = hoje - timedelta(days=1)
    while check.weekday() >= 5 or check in feriados_set:  # 5=sab, 6=dom
        data_inicio = check
        check = check - timedelta(days=1)
    if data_inicio == hoje:
        return None  # Só hoje, sem range
    return (data_inicio, hoje)

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

        # Buscar feriados para lógica de "vence hoje"
        try:
            config_conn = get_config_db_connection()
            config_cursor = config_conn.cursor()
            config_cursor.execute("SELECT data FROM config_feriados")
            feriados_set = {row['data'] if isinstance(row['data'], date) else datetime.strptime(str(row['data']), '%Y-%m-%d').date() for row in config_cursor.fetchall()}
            config_cursor.close()
            config_conn.close()
        except:
            feriados_set = set()

        # Aplica exclusões configuradas (mesmas usadas nas páginas de Atrasadas, A Pagar, etc.)
        exclusoes = get_exclusoes()
        excl_conds_cap, excl_params_cap = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)
        excl_conds_cp, excl_params_cp = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        cap_where_extra = (" AND " + " AND ".join(excl_conds_cap)) if excl_conds_cap else ""
        cp_where_extra = (" AND " + " AND ".join(excl_conds_cp)) if excl_conds_cp else ""

        # Se tiver documentos excluídos adicionais no KPI (além dos da config global), aplica também
        if documentos_excluidos:
            docs = [f"'{d.strip()}'" for d in documentos_excluidos.split(',') if d.strip()]
            if docs:
                filtro_previsao = f" AND TRIM(cap.id_documento) NOT IN ({', '.join(docs)})"
                filtro_previsao_pagas = f" AND TRIM(cp.id_documento) NOT IN ({', '.join(docs)})"
            else:
                filtro_previsao = ""
                filtro_previsao_pagas = ""
        else:
            # Tipos de previsão já são excluídos via config global (build_exclusion_conditions)
            filtro_previsao = ""
            filtro_previsao_pagas = ""

        if calculo_automatico == 'titulos_vencidos_qtd':
            cursor.execute(f"""
                SELECT COUNT(DISTINCT SPLIT_PART(cap.lancamento, '/', 1)) as valor FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cap.data_vencimento < %s{cap_where_extra}{filtro_previsao}
            """, [hoje] + excl_params_cap)
            result = cursor.fetchone()
            valor = result['valor'] if result else 0

        elif calculo_automatico == 'titulos_vencidos_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(cap.valor_total), 0) as valor FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cap.data_vencimento < %s{cap_where_extra}{filtro_previsao}
            """, [hoje] + excl_params_cap)
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0

        elif calculo_automatico == 'titulos_a_vencer_qtd':
            cursor.execute(f"""
                SELECT COUNT(DISTINCT SPLIT_PART(cap.lancamento, '/', 1)) as valor FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cap.data_vencimento >= %s{cap_where_extra}{filtro_previsao}
            """, [hoje] + excl_params_cap)
            result = cursor.fetchone()
            valor = result['valor'] if result else 0

        elif calculo_automatico == 'titulos_a_vencer_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(cap.valor_total), 0) as valor FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cap.data_vencimento >= %s{cap_where_extra}{filtro_previsao}
            """, [hoje] + excl_params_cap)
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0

        elif calculo_automatico == 'titulos_pagos_mes_qtd':
            cursor.execute(f"""
                SELECT COUNT(*) as valor FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE EXTRACT(MONTH FROM cp.data_pagamento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM cp.data_pagamento) = EXTRACT(YEAR FROM CURRENT_DATE)
                {cp_where_extra}{filtro_previsao_pagas}
            """, excl_params_cp)
            result = cursor.fetchone()
            valor = result['valor'] if result else 0

        elif calculo_automatico == 'titulos_pagos_mes_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(cp.valor_liquido), 0) as valor FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE EXTRACT(MONTH FROM cp.data_pagamento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM cp.data_pagamento) = EXTRACT(YEAR FROM CURRENT_DATE)
                {cp_where_extra}{filtro_previsao_pagas}
            """, excl_params_cp)
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0

        elif calculo_automatico == 'titulos_vencidos_2025_qtd':
            cursor.execute(f"""
                SELECT COUNT(DISTINCT SPLIT_PART(cap.lancamento, '/', 1)) as valor FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cap.data_vencimento < %s
                AND EXTRACT(YEAR FROM cap.data_vencimento) = 2025
                {cap_where_extra}{filtro_previsao}
            """, [hoje] + excl_params_cap)
            result = cursor.fetchone()
            valor = result['valor'] if result else 0

        elif calculo_automatico == 'titulos_vencidos_2025_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(cap.valor_total), 0) as valor FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cap.data_vencimento < %s
                AND EXTRACT(YEAR FROM cap.data_vencimento) = 2025
                {cap_where_extra}{filtro_previsao}
            """, [hoje] + excl_params_cap)
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0

        elif calculo_automatico == 'contas_a_pagar_hoje_qtd':
            # Inclui dias anteriores consecutivos que foram feriados ou fins de semana
            vence_hoje_range = _get_vence_hoje_range(hoje, feriados_set)
            if vence_hoje_range:
                hoje_cond = "cap.data_vencimento BETWEEN %s AND %s"
                hoje_params = [vence_hoje_range[0], vence_hoje_range[1]]
            else:
                hoje_cond = "cap.data_vencimento = %s"
                hoje_params = [hoje]
            cursor.execute(f"""
                SELECT COUNT(DISTINCT SPLIT_PART(cap.lancamento, '/', 1)) as valor FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE {hoje_cond}{cap_where_extra}{filtro_previsao}
            """, hoje_params + excl_params_cap)
            result = cursor.fetchone()
            valor = result['valor'] if result else 0

        elif calculo_automatico == 'contas_a_pagar_hoje_valor':
            vence_hoje_range = _get_vence_hoje_range(hoje, feriados_set)
            if vence_hoje_range:
                hoje_cond = "cap.data_vencimento BETWEEN %s AND %s"
                hoje_params = [vence_hoje_range[0], vence_hoje_range[1]]
            else:
                hoje_cond = "cap.data_vencimento = %s"
                hoje_params = [hoje]
            cursor.execute(f"""
                SELECT COALESCE(SUM(cap.valor_total), 0) as valor FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE {hoje_cond}{cap_where_extra}{filtro_previsao}
            """, hoje_params + excl_params_cap)
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0

        elif calculo_automatico == 'contas_a_pagar_7dias_qtd':
            cursor.execute(f"""
                SELECT COUNT(DISTINCT SPLIT_PART(cap.lancamento, '/', 1)) as valor FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cap.data_vencimento BETWEEN %s AND %s{cap_where_extra}{filtro_previsao}
            """, [hoje + timedelta(days=1), hoje + timedelta(days=7)] + excl_params_cap)
            result = cursor.fetchone()
            valor = result['valor'] if result else 0

        elif calculo_automatico == 'contas_a_pagar_7dias_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(cap.valor_total), 0) as valor FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE cap.data_vencimento BETWEEN %s AND %s{cap_where_extra}{filtro_previsao}
            """, [hoje + timedelta(days=1), hoje + timedelta(days=7)] + excl_params_cap)
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0

        elif calculo_automatico == 'contas_a_pagar_mes_qtd':
            cursor.execute(f"""
                SELECT COUNT(DISTINCT SPLIT_PART(cap.lancamento, '/', 1)) as valor FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE EXTRACT(MONTH FROM cap.data_vencimento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM cap.data_vencimento) = EXTRACT(YEAR FROM CURRENT_DATE)
                {cap_where_extra}{filtro_previsao}
            """, excl_params_cap)
            result = cursor.fetchone()
            valor = result['valor'] if result else 0

        elif calculo_automatico == 'contas_a_pagar_mes_valor':
            cursor.execute(f"""
                SELECT COALESCE(SUM(cap.valor_total), 0) as valor FROM contas_a_pagar cap
                LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE EXTRACT(MONTH FROM cap.data_vencimento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM cap.data_vencimento) = EXTRACT(YEAR FROM CURRENT_DATE)
                {cap_where_extra}{filtro_previsao}
            """, excl_params_cap)
            result = cursor.fetchone()
            valor = decimal_to_float(result['valor']) if result else 0

        elif calculo_automatico == 'ticket_medio_pagamentos_mes':
            cursor.execute(f"""
                SELECT COALESCE(AVG(cp.valor_liquido), 0) as valor FROM contas_pagas cp
                LEFT JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE EXTRACT(MONTH FROM cp.data_pagamento) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND EXTRACT(YEAR FROM cp.data_pagamento) = EXTRACT(YEAR FROM CURRENT_DATE)
                {cp_where_extra}{filtro_previsao_pagas}
            """, excl_params_cp)
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
                        (SELECT COALESCE(SUM(cap.valor_total), 0) FROM contas_a_pagar cap LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto WHERE cap.data_vencimento < CURRENT_DATE{cap_where_extra}{filtro_previsao}) as total_vencido,
                        (SELECT COALESCE(SUM(cap.valor_total), 0) FROM contas_a_pagar cap LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto WHERE 1=1{cap_where_extra}{filtro_previsao}) as total_aberto
                ) subq
            """, excl_params_cap + excl_params_cap)
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
        exclusoes = get_exclusoes()

        if status == "recebido":
            excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cr', has_cc_column=False, has_conta_corrente=True)
            # Adiciona exclusão de empresa via sienge ID (via JOIN correto)
            excl_empresa_cond = ""
            excl_empresa_params = []
            if exclusoes['empresas']:
                ph = ','.join(['%s'] * len(exclusoes['empresas']))
                excl_empresa_cond = f" AND (cc.id_sienge_empresa IS NULL OR cc.id_sienge_empresa NOT IN ({ph}))"
                excl_empresa_params = exclusoes['empresas']
            excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""
            query = f"""
                SELECT cr.cliente, cr.data_recebimento as data_vencimento, cr.valor_liquido as valor_total,
                       cr.titulo as lancamento, cr.id_documento,
                       cc.id_sienge_empresa AS id_interno_empresa,
                       cc.nome_empresa, cc.nome_centrocusto,
                       cc.id_sienge_centrocusto as codigo_centrocusto,
                       TRIM(cr.id_documento) as id_documento,
                       cr.titulo, cr.parcela as numero_parcela,
                       cr.data_recebimento
                FROM contas_recebidas cr
                LEFT JOIN dim_centrocusto cc ON cr.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE 1=1{excl_where}{excl_empresa_cond}
                ORDER BY cr.data_recebimento DESC
                LIMIT %s
            """
            cursor.execute(query, excl_params + excl_empresa_params + [limite])
        elif status == "a_receber":
            excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='car')
            excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""
            query = f"""
                WITH ultimo_incc_all AS (
                    SELECT id_indexador, valor_indexador, data_indexador,
                           ROW_NUMBER() OVER (PARTITION BY id_indexador ORDER BY data_indexador DESC) AS rn
                    FROM ecadindexhist
                ),
                ultimo_incc AS (
                    SELECT id_indexador, valor_indexador, data_indexador
                    FROM ultimo_incc_all
                    WHERE rn = 1
                )
                SELECT car.cliente, car.data_vencimento, car.valor_total,
                       car.lancamento, car.numero_documento, car.id_plano_financeiro,
                       cc.id_sienge_empresa as id_interno_empresa, car.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto,
                       cc.id_sienge_centrocusto as codigo_centrocusto,
                       TRIM(car.id_documento) as id_documento,
                       car.lancamento as titulo, car.numero_parcela,
                       CASE TRIM(car.tc)
                           WHEN 'AT' THEN 'Ato'
                           WHEN 'PM' THEN 'Parcelas Mensais'
                           WHEN 'PS' THEN 'Parcelas Semestrais'
                           WHEN 'FI' THEN 'Financiamento'
                           WHEN 'RE' THEN 'Resíduo'
                           WHEN 'PB' THEN 'Parcelas Balão'
                           WHEN 'PE' THEN 'Parcelas Especiais'
                           WHEN 'PI' THEN 'Parcelas Intermediárias'
                           WHEN 'CO' THEN 'Contrato'
                           WHEN 'CR' THEN 'Crédito'
                           ELSE TRIM(car.tc)
                       END as tipo_condicao,
                       CASE COALESCE(car.id_indexador, 0)
                           WHEN 0 THEN 'REAL'
                           WHEN 3 THEN 'INCC-M'
                           WHEN 4 THEN 'IGPM'
                           WHEN 5 THEN 'IPCA'
                           ELSE 'ID ' || COALESCE(car.id_indexador, 0)::TEXT
                       END as indexador,
                       CASE
                           WHEN car.id_indexador IS NOT NULL AND car.id_indexador > 0
                                AND idx_b.valor_indexador IS NOT NULL AND idx_b.valor_indexador > 0
                           THEN ROUND(car.valor_vencimento / idx_b.valor_indexador * ui.valor_indexador, 2)
                           ELSE COALESCE(car.valor_corrigido, car.valor_total)
                       END as saldo_atual
                FROM contas_a_receber car
                LEFT JOIN dim_centrocusto cc ON car.id_interno_centro_custo = cc.id_interno_centrocusto
                LEFT JOIN ultimo_incc ui ON ui.id_indexador = car.id_indexador
                LEFT JOIN ecadindexhist idx_b ON idx_b.id_indexador = car.id_indexador
                    AND idx_b.data_indexador = car.data_indexador
                WHERE car.data_vencimento >= %s{excl_where}
                ORDER BY car.data_vencimento ASC
                LIMIT %s
            """
            cursor.execute(query, [hoje] + excl_params + [limite])
        elif status == "em_atraso":
            excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='car')
            excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""
            query = f"""
                WITH ultimo_incc_all AS (
                    SELECT id_indexador, valor_indexador, data_indexador,
                           ROW_NUMBER() OVER (PARTITION BY id_indexador ORDER BY data_indexador DESC) AS rn
                    FROM ecadindexhist
                ),
                ultimo_incc AS (
                    SELECT id_indexador, valor_indexador, data_indexador
                    FROM ultimo_incc_all
                    WHERE rn = 1
                )
                SELECT car.cliente, car.data_vencimento, car.valor_total,
                       car.lancamento, car.numero_documento, car.id_plano_financeiro,
                       cc.id_sienge_empresa as id_interno_empresa, car.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto,
                       cc.id_sienge_centrocusto as codigo_centrocusto,
                       TRIM(car.id_documento) as id_documento,
                       car.lancamento as titulo, car.numero_parcela,
                       TRIM(car.tc) as tipo_condicao,
                       CASE COALESCE(car.id_indexador, 0)
                           WHEN 0 THEN 'REAL'
                           WHEN 3 THEN 'INCC-M'
                           WHEN 4 THEN 'IGPM'
                           WHEN 5 THEN 'IPCA'
                           ELSE 'ID ' || COALESCE(car.id_indexador, 0)::TEXT
                       END as indexador,
                       CASE
                           WHEN car.id_indexador IS NOT NULL AND car.id_indexador > 0
                                AND idx_b.valor_indexador IS NOT NULL AND idx_b.valor_indexador > 0
                           THEN ROUND(car.valor_vencimento / idx_b.valor_indexador * ui.valor_indexador, 2)
                           ELSE COALESCE(car.valor_corrigido, car.valor_total)
                       END as saldo_atual
                FROM contas_a_receber car
                LEFT JOIN dim_centrocusto cc ON car.id_interno_centro_custo = cc.id_interno_centrocusto
                LEFT JOIN contas_recebidas cr ON car.lancamento = cr.titulo::TEXT
                    AND car.numero_parcela::TEXT = cr.parcela::TEXT
                LEFT JOIN ultimo_incc ui ON ui.id_indexador = car.id_indexador
                LEFT JOIN ecadindexhist idx_b ON idx_b.id_indexador = car.id_indexador
                    AND idx_b.data_indexador = car.data_indexador
                WHERE car.data_vencimento < %s
                  AND cr.titulo IS NULL{excl_where}
                ORDER BY car.data_vencimento ASC
                LIMIT %s
            """
            cursor.execute(query, [hoje] + excl_params + [limite])
        else:
            excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='car')
            excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""
            query = f"""
                WITH ultimo_incc_all AS (
                    SELECT id_indexador, valor_indexador, data_indexador,
                           ROW_NUMBER() OVER (PARTITION BY id_indexador ORDER BY data_indexador DESC) AS rn
                    FROM ecadindexhist
                ),
                ultimo_incc AS (
                    SELECT id_indexador, valor_indexador, data_indexador
                    FROM ultimo_incc_all
                    WHERE rn = 1
                )
                SELECT car.cliente, car.data_vencimento, car.valor_total,
                       car.lancamento, car.numero_documento, car.id_plano_financeiro,
                       cc.id_sienge_empresa as id_interno_empresa, car.id_interno_centro_custo,
                       cc.nome_empresa, cc.nome_centrocusto,
                       cc.id_sienge_centrocusto as codigo_centrocusto,
                       TRIM(car.id_documento) as id_documento,
                       car.lancamento as titulo, car.numero_parcela,
                       CASE TRIM(car.tc)
                           WHEN 'AT' THEN 'Ato'
                           WHEN 'PM' THEN 'Parcelas Mensais'
                           WHEN 'PS' THEN 'Parcelas Semestrais'
                           WHEN 'FI' THEN 'Financiamento'
                           WHEN 'RE' THEN 'Resíduo'
                           WHEN 'PB' THEN 'Parcelas Balão'
                           WHEN 'PE' THEN 'Parcelas Especiais'
                           WHEN 'PI' THEN 'Parcelas Intermediárias'
                           WHEN 'CO' THEN 'Contrato'
                           WHEN 'CR' THEN 'Crédito'
                           ELSE TRIM(car.tc)
                       END as tipo_condicao,
                       CASE COALESCE(car.id_indexador, 0)
                           WHEN 0 THEN 'REAL'
                           WHEN 3 THEN 'INCC-M'
                           WHEN 4 THEN 'IGPM'
                           WHEN 5 THEN 'IPCA'
                           ELSE 'ID ' || COALESCE(car.id_indexador, 0)::TEXT
                       END as indexador,
                       CASE
                           WHEN car.id_indexador IS NOT NULL AND car.id_indexador > 0
                                AND idx_b.valor_indexador IS NOT NULL AND idx_b.valor_indexador > 0
                           THEN ROUND(car.valor_vencimento / idx_b.valor_indexador * ui.valor_indexador, 2)
                           ELSE COALESCE(car.valor_corrigido, car.valor_total)
                       END as saldo_atual
                FROM contas_a_receber car
                LEFT JOIN dim_centrocusto cc ON car.id_interno_centro_custo = cc.id_interno_centrocusto
                LEFT JOIN ultimo_incc ui ON ui.id_indexador = car.id_indexador
                LEFT JOIN ecadindexhist idx_b ON idx_b.id_indexador = car.id_indexador
                    AND idx_b.data_indexador = car.data_indexador
                WHERE 1=1{excl_where}
                ORDER BY car.data_vencimento DESC
                LIMIT %s
            """
            cursor.execute(query, excl_params + [limite])

        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/contas-recebidas-filtradas")
def get_contas_recebidas_filtradas(
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    cliente: Optional[str] = None,
    id_documento: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
    limite: int = 100
):
    """Retorna contas recebidas com filtros avançados.
    Faz JOIN com contas_a_receber para obter o centrocusto real de cada título.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        exclusoes = get_exclusoes()
        conditions = []
        params = []

        # Exclusão de empresas (JOIN direto cr→dim_centrocusto via id_interno_centro_custo)
        if exclusoes['empresas']:
            ph = ','.join(['%s'] * len(exclusoes['empresas']))
            conditions.append(f"(cc.id_sienge_empresa IS NULL OR cc.id_sienge_empresa NOT IN ({ph}))")
            params.extend(exclusoes['empresas'])

        # Exclusão de centros de custo (direto em cr.id_interno_centro_custo)
        if exclusoes['centros_custo']:
            ph = ','.join(['%s'] * len(exclusoes['centros_custo']))
            conditions.append(
                f"(cr.id_interno_centro_custo IS NULL OR cr.id_interno_centro_custo NOT IN ({ph}))"
            )
            params.extend(exclusoes['centros_custo'])

        # Exclusão de tipos de documento
        if exclusoes['tipos_documento']:
            ph = ','.join(['%s'] * len(exclusoes['tipos_documento']))
            conditions.append(f"TRIM(cr.id_documento) NOT IN ({ph})")
            params.extend(exclusoes['tipos_documento'])

        # Filtro de empresa via cc.id_sienge_empresa (JOIN direto funciona: LAGOA cc.id_sienge_empresa=3)
        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

        # Filtro de centro de custo (direto em cr.id_interno_centro_custo)
        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cr.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

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

        if tipo_baixa:
            tb_ids = [int(t.strip()) for t in tipo_baixa.split(',') if t.strip()]
            if tb_ids:
                tb_placeholders = ', '.join(['%s'] * len(tb_ids))
                conditions.append(f"cr.id_tipo_baixa IN ({tb_placeholders})")
                params.extend(tb_ids)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT
                cr.cliente,
                cr.data_recebimento,
                cr.valor_liquido as valor_total,
                cr.titulo as lancamento,
                cc.id_sienge_empresa AS id_interno_empresa,
                cc.nome_empresa,
                cr.id_interno_centro_custo,
                cc.nome_centrocusto,
                cc.id_sienge_centrocusto as codigo_centrocusto,
                TRIM(cr.id_documento) as id_documento,
                cr.parcela as numero_parcela,
                cr.id_tipo_baixa,
                TRIM(cr.tc) as tipo_condicao,
                COALESCE(car_doc.numero_documento, '') as numero_documento,
                cr.data_vencimento,
                COALESCE(cr.valor_acrescimo, 0) as valor_acrescimo,
                COALESCE(cr.valor_desconto, 0) as valor_desconto,
                COALESCE(cr.valor_baixa, 0) as valor_baixa,
                CASE
                    WHEN cr.data_vencimento IS NOT NULL AND cr.data_recebimento IS NOT NULL
                         AND cr.data_recebimento > cr.data_vencimento THEN 'ATRASO'
                    WHEN cr.data_vencimento IS NOT NULL AND cr.data_recebimento IS NOT NULL
                         AND cr.data_recebimento <= cr.data_vencimento THEN 'EM DIA'
                    ELSE NULL
                END as status_recebimento,
                CASE
                    WHEN cr.data_vencimento IS NOT NULL AND cr.data_recebimento IS NOT NULL
                    THEN (cr.data_recebimento::date - cr.data_vencimento::date)
                    ELSE NULL
                END as dias_atraso_recebimento
            FROM contas_recebidas cr
            LEFT JOIN dim_centrocusto cc ON cr.id_interno_centro_custo = cc.id_interno_centrocusto
            LEFT JOIN LATERAL (
                SELECT TRIM(car.numero_documento) as numero_documento
                FROM contas_a_receber car
                WHERE car.cliente = cr.cliente
                  AND SPLIT_PART(car.lancamento, '/', 1) = cr.titulo::TEXT
                LIMIT 1
            ) car_doc ON true
            WHERE {where_clause}
            ORDER BY cr.data_recebimento DESC, cr.cliente, cr.valor_liquido
            LIMIT %s
        """
        params.append(limite)

        print(f"[DEBUG recebidas-filtradas] centro_custo={centro_custo}, total_conditions={len(conditions)}")
        cursor.execute(query, params)
        rows = cursor.fetchall()
        print(f"[DEBUG recebidas-filtradas] retornou {len(rows)} rows")
        return [dict(row) for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/contas-recebidas-totais")
def get_contas_recebidas_totais(
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    cliente: Optional[str] = None,
    id_documento: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
):
    """Retorna total e quantidade de contas recebidas sem LIMIT (para estatísticas corretas)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        exclusoes = get_exclusoes()
        conditions = []
        params = []

        if exclusoes['empresas']:
            ph = ','.join(['%s'] * len(exclusoes['empresas']))
            conditions.append(f"(cc.id_sienge_empresa IS NULL OR cc.id_sienge_empresa NOT IN ({ph}))")
            params.extend(exclusoes['empresas'])

        if exclusoes['centros_custo']:
            ph = ','.join(['%s'] * len(exclusoes['centros_custo']))
            conditions.append(f"(cr.id_interno_centro_custo IS NULL OR cr.id_interno_centro_custo NOT IN ({ph}))")
            params.extend(exclusoes['centros_custo'])

        if exclusoes['tipos_documento']:
            ph = ','.join(['%s'] * len(exclusoes['tipos_documento']))
            conditions.append(f"TRIM(cr.id_documento) NOT IN ({ph})")
            params.extend(exclusoes['tipos_documento'])

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cr.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

        if cliente:
            conditions.append("cr.cliente ILIKE %s")
            params.append(f"%{cliente}%")

        if id_documento:
            docs = [doc.strip() for doc in id_documento.split(',')]
            doc_conditions = [f"TRIM(cr.id_documento) = %s" for doc in docs]
            params.extend(docs)
            conditions.append(f"({' OR '.join(doc_conditions)})")

        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            conditions.append(f"EXTRACT(YEAR FROM cr.data_recebimento) IN ({', '.join(['%s'] * len(anos))})")
            params.extend(anos)

        if mes:
            meses = [int(m.strip()) for m in mes.split(',')]
            conditions.append(f"EXTRACT(MONTH FROM cr.data_recebimento) IN ({', '.join(['%s'] * len(meses))})")
            params.extend(meses)

        if tipo_baixa:
            tb_ids = [int(t.strip()) for t in tipo_baixa.split(',') if t.strip()]
            if tb_ids:
                conditions.append(f"cr.id_tipo_baixa IN ({', '.join(['%s'] * len(tb_ids))})")
                params.extend(tb_ids)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        cursor.execute(f"""
            SELECT
                COUNT(*) as quantidade,
                COALESCE(SUM(cr.valor_liquido), 0) as total
            FROM contas_recebidas cr
            LEFT JOIN dim_centrocusto cc ON cr.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}
        """, params)
        row = cursor.fetchone()
        return {"total": float(row["total"]), "quantidade": int(row["quantidade"])}
    finally:
        cursor.close()
        conn.close()

@app.get("/api/estoque-unidades")
def get_estoque_unidades(centro_custo: Optional[str] = None):
    """Retorna estoque de unidades da tabela imovel_unidade agrupado por flag_comercial"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conditions = []
        params = []

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"iu.id_interno_centrocusto IN ({cc_ph})")
                params.extend(cc_ids)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT
                COALESCE(iu.flag_comercial, 'N/A') as flag_comercial,
                COUNT(*) as quantidade_unidades,
                COALESCE(SUM(iu.quantidade_indexador), 0) as valor_total
            FROM imovel_unidade iu
            WHERE {where_clause}
            GROUP BY iu.flag_comercial
            ORDER BY iu.flag_comercial
        """
        cursor.execute(query, params)
        rows = cursor.fetchall()

        flag_labels = {
            'D': 'Disponível',
            'R': 'Reserva Técnica',
            'P': 'Permuta',
            'M': 'Mútuo',
            'O': 'Proposta',
            'V': 'Vendido',
            'C': 'Vendido Pré-Contrato',
            'A': 'Reservada',
            'L': 'Locado',
            'T': 'Transferido',
            'E': 'Terceiros',
            'G': 'Gravame',
        }

        detalhes = []
        total_geral = 0
        qtd_geral = 0
        estoque_disponivel = 0
        qtd_disponivel = 0
        vgv_vendido = 0
        qtd_vendido = 0

        for row in rows:
            flag = row['flag_comercial']
            valor = float(row['valor_total'])
            qtd = int(row['quantidade_unidades'])
            detalhes.append({
                'flag': flag,
                'status': flag_labels.get(flag, flag),
                'quantidade': qtd,
                'valor': valor,
            })
            total_geral += valor
            qtd_geral += qtd
            if flag == 'D':
                estoque_disponivel = valor
                qtd_disponivel = qtd
            if flag == 'V':
                vgv_vendido = valor
                qtd_vendido = qtd

        return {
            'estoque_disponivel': estoque_disponivel,
            'qtd_disponivel': qtd_disponivel,
            'vgv_vendido': vgv_vendido,
            'qtd_vendido': qtd_vendido,
            'total_geral': total_geral,
            'qtd_geral': qtd_geral,
            'detalhes': detalhes,
        }
    finally:
        cursor.close()
        conn.close()


@app.get("/api/contas-receber-estatisticas")
def get_contas_receber_estatisticas(
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    id_documento: Optional[str] = None
):
    """Retorna estatísticas de contas a receber"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='car')
        conditions = list(excl_conds)
        params = list(excl_params)

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"car.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

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
            WITH ultimo_idx AS (
                SELECT id_indexador, valor_indexador,
                       ROW_NUMBER() OVER (PARTITION BY id_indexador ORDER BY data_indexador DESC) AS rn
                FROM ecadindexhist
            ),
            ultimo AS (
                SELECT id_indexador, valor_indexador FROM ultimo_idx WHERE rn = 1
            )
            SELECT
                COUNT(*) as quantidade_titulos,
                COALESCE(SUM(car.valor_total), 0) as valor_total,
                COALESCE(AVG(car.valor_total), 0) as valor_medio,
                COALESCE(SUM(
                    CASE
                        WHEN car.id_indexador IS NOT NULL AND car.id_indexador > 0
                             AND idx_b.valor_indexador IS NOT NULL AND idx_b.valor_indexador > 0
                        THEN ROUND(car.valor_vencimento / idx_b.valor_indexador * ui.valor_indexador, 2)
                        ELSE COALESCE(car.valor_corrigido, car.valor_total)
                    END
                ), 0) as valor_total_corrigido,
                COUNT(CASE WHEN car.data_vencimento < %s THEN 1 END) as quantidade_atrasados,
                COALESCE(SUM(CASE WHEN car.data_vencimento < %s THEN car.valor_total ELSE 0 END), 0) as valor_atrasados,
                COUNT(CASE WHEN car.data_vencimento = %s THEN 1 END) as quantidade_vence_hoje,
                COALESCE(SUM(CASE WHEN car.data_vencimento = %s THEN car.valor_total ELSE 0 END), 0) as valor_vence_hoje
            FROM contas_a_receber car
            LEFT JOIN dim_centrocusto cc ON car.id_interno_centro_custo = cc.id_interno_centrocusto
            LEFT JOIN ultimo ui ON ui.id_indexador = car.id_indexador
            LEFT JOIN ecadindexhist idx_b ON idx_b.id_indexador = car.id_indexador
                AND idx_b.data_indexador = car.data_indexador
            WHERE {where_clause}
        """
        params_with_dates = [hoje, hoje, hoje, hoje] + params

        cursor.execute(query, params_with_dates)
        row = cursor.fetchone()

        return {
            'quantidade_titulos': row['quantidade_titulos'],
            'valor_total': float(row['valor_total']),
            'valor_total_corrigido': float(row['valor_total_corrigido']),
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
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    id_documento: Optional[str] = None
):
    """Retorna estatísticas de contas recebidas.
    Faz JOIN com contas_a_receber para suportar filtro de centrocusto real.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        exclusoes = get_exclusoes()
        conditions = []
        params = []

        # Exclusão de empresas: COALESCE para cobrir registros sem match em contas_a_receber
        if exclusoes['empresas']:
            ph = ','.join(['%s'] * len(exclusoes['empresas']))
            conditions.append(f"(cc.id_sienge_empresa IS NULL OR cc.id_sienge_empresa NOT IN ({ph}))")
            params.extend(exclusoes['empresas'])

        # Exclusão de centros de custo (direto em cr.id_interno_centro_custo)
        if exclusoes['centros_custo']:
            ph = ','.join(['%s'] * len(exclusoes['centros_custo']))
            conditions.append(
                f"(cr.id_interno_centro_custo IS NULL OR cr.id_interno_centro_custo NOT IN ({ph}))"
            )
            params.extend(exclusoes['centros_custo'])

        # Exclusão de tipos de documento
        if exclusoes['tipos_documento']:
            ph = ','.join(['%s'] * len(exclusoes['tipos_documento']))
            conditions.append(f"TRIM(cr.id_documento) NOT IN ({ph})")
            params.extend(exclusoes['tipos_documento'])

        # Filtro empresa via cc.id_sienge_empresa (JOIN direto cr→dim_centrocusto)
        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cr.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

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
            LEFT JOIN dim_centrocusto cc ON cr.id_interno_centro_custo = cc.id_interno_centrocusto
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
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    id_documento: Optional[str] = None,
    limite: int = 15
):
    """Retorna contas a receber agrupadas por cliente"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='car')
        conditions = list(excl_conds)
        params = list(excl_params)

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"car.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)

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
    empresa: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    id_documento: Optional[str] = None,
    limite: int = 15
):
    """Retorna contas recebidas agrupadas por cliente"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cr', has_cc_column=False, has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)

        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)

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
            LEFT JOIN dim_centrocusto cc ON cr.id_interno_centro_custo = cc.id_interno_centrocusto
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

# ┌──────────────────────────────────────────────────────────────┐
# │ DOCUMENTAÇÃO: GET /api/extrato-cliente                       │
# ├──────────────────────────────────────────────────────────────┤
# │ FONTE: contas_a_receber + contas_recebidas + ecadindexhist   │
# │ CÁLCULO INCC: fator = indice_atual / indice_base             │
# │   valor_corrigido = valor_nominal × fator_correcao            │
# │   saldo = valor_corrigido - valor_recebido                   │
# │ TÍTULOS INCC MANUAL: config_titulos_incc_manual              │
# │ USADO POR: Extrato Cliente > tabela de parcelas              │
# └──────────────────────────────────────────────────────────────┘
@app.get("/api/extrato-cliente")
def get_extrato_cliente(cliente: str, titulo: Optional[str] = None):
    """Retorna extrato completo do cliente com histórico de parcelas"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Verificar se há títulos marcados para cálculo INCC manual
        titulos_incc_manual = set()
        try:
            cfg_conn = get_config_db_connection()
            cfg_cursor = cfg_conn.cursor()
            cfg_cursor.execute("SELECT titulo FROM config_titulos_incc_manual WHERE cliente = %s", (cliente,))
            titulos_incc_manual = {r['titulo'] for r in cfg_cursor.fetchall()}
            cfg_cursor.close()
            cfg_conn.close()
        except Exception:
            pass

        # Determinar se o cálculo INCC manual deve ser usado
        usar_incc_manual = False
        if titulo and titulo in titulos_incc_manual:
            usar_incc_manual = True
        elif not titulo and len(titulos_incc_manual) > 0:
            usar_incc_manual = True  # Se não filtrou título, usa manual se qualquer título estiver marcado

        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='car')
        conditions = ["car.cliente = %s"] + list(excl_conds)
        params_where = [cliente] + list(excl_params)

        if titulo:
            conditions.append("SPLIT_PART(car.lancamento, '/', 1) = %s")
            params_where.append(titulo)

        where_clause = " AND ".join(conditions)

        # Params para CTE recebidas: cliente + opcional titulo
        recebidas_params = [cliente]
        recebidas_filter = "cr.cliente = %s"
        if titulo:
            recebidas_filter += " AND cr.titulo::TEXT = %s"
            recebidas_params.append(titulo)

        params = recebidas_params + params_where

        # Fragmentos SQL condicionais baseados no modo de cálculo
        # rn=1 (último INCC) para modo padrão, rn=2 (penúltimo) para INCC manual
        rn_value = 2 if usar_incc_manual else 1

        # CTE sempre presente para cálculo dinâmico de A Receber
        cte_ultimo_incc = f"""
            WITH ultimo_incc_all AS (
                SELECT id_indexador, valor_indexador, data_indexador,
                       ROW_NUMBER() OVER (PARTITION BY id_indexador ORDER BY data_indexador DESC) AS rn
                FROM ecadindexhist
            ),
            ultimo_incc AS (
                SELECT id_indexador, valor_indexador, data_indexador
                FROM ultimo_incc_all
                WHERE rn = {rn_value}
            ),"""

        # A Receber: sempre calcula INCC dinamicamente (evita valor_corrigido desatualizado do banco)
        ar_valor_corrigido = """
                CASE
                    WHEN car.id_indexador IS NOT NULL AND car.id_indexador > 0
                         AND idx_b.valor_indexador IS NOT NULL AND idx_b.valor_indexador > 0
                    THEN ROUND(car.valor_vencimento / idx_b.valor_indexador * ui2.valor_indexador, 2)
                    ELSE COALESCE(car.valor_corrigido, car.valor_total)
                END as valor_corrigido,"""
        ar_joins = """
            LEFT JOIN ultimo_incc ui2
                ON ui2.id_indexador = car.id_indexador
            LEFT JOIN ecadindexhist idx_b
                ON idx_b.id_indexador = car.id_indexador
                AND idx_b.data_indexador = car.data_indexador"""

        # Recebidas: sempre usa LATERAL JOIN para detectar indexador e calcular INCC quando necessário
        # Heurística: se titulo tem indexador > 0 (INCC) E valor_baixa está próximo do valor_vencimento,
        # usa valor_vencimento como nominal e calcula correção INCC. Senão, usa valor_baixa (REAL).
        rec_valor_nominal = """
                    CASE
                        WHEN titulo_info.id_indexador > 0
                             AND titulo_info.valor_vencimento IS NOT NULL
                             AND SUM(cr.valor_baixa) >= titulo_info.valor_vencimento * 0.95
                             AND SUM(cr.valor_baixa) <= titulo_info.valor_vencimento * 1.05
                        THEN titulo_info.valor_vencimento
                        ELSE SUM(cr.valor_baixa)
                    END as valor_nominal,"""
        rec_valor_corrigido = """
                    CASE
                        WHEN titulo_info.id_indexador > 0
                             AND idx_base.valor_indexador IS NOT NULL AND idx_base.valor_indexador > 0
                             AND titulo_info.valor_vencimento IS NOT NULL
                             AND SUM(cr.valor_baixa) >= titulo_info.valor_vencimento * 0.95
                             AND SUM(cr.valor_baixa) <= titulo_info.valor_vencimento * 1.05
                        THEN ROUND(titulo_info.valor_vencimento / idx_base.valor_indexador * ui.valor_indexador, 2)
                        ELSE SUM(cr.valor_baixa)
                    END as valor_corrigido,"""
        rec_joins = """
                LEFT JOIN LATERAL (
                    SELECT car3.data_indexador, car3.id_indexador, car3.valor_vencimento
                    FROM contas_a_receber car3
                    WHERE car3.cliente = cr.cliente
                    AND SPLIT_PART(car3.lancamento, '/', 1) = cr.titulo::TEXT
                    LIMIT 1
                ) titulo_info ON TRUE
                LEFT JOIN ultimo_incc ui
                    ON ui.id_indexador = COALESCE(titulo_info.id_indexador, 3)
                LEFT JOIN ecadindexhist idx_base
                    ON idx_base.id_indexador = COALESCE(titulo_info.id_indexador, 3)
                    AND idx_base.data_indexador = COALESCE(titulo_info.data_indexador, cr.data_calculo)"""
        rec_group_extra = ", idx_base.valor_indexador, ui.valor_indexador, titulo_info.data_indexador, titulo_info.id_indexador, titulo_info.valor_vencimento"

        query = f"""
            {cte_ultimo_incc}
            recebidas_agrupadas AS (
                SELECT
                    cr.cliente,
                    cr.titulo::TEXT as titulo_num,
                    cr.parcela,
                    CASE cr.tc
                        WHEN 'AT' THEN 'Ato'
                        WHEN 'PM' THEN 'Parcelas Mensais'
                        WHEN 'PS' THEN 'Parcelas Semestrais'
                        WHEN 'FI' THEN 'Financiamento'
                        WHEN 'RE' THEN 'Resíduo'
                        WHEN 'PB' THEN 'Parcelas Balão'
                        WHEN 'PE' THEN 'Parcelas Especiais'
                        WHEN 'PI' THEN 'Parcelas Intermediárias'
                        ELSE cr.tc
                    END as tipo_condicao,
                    cr.data_vencimento,
                    {rec_valor_nominal}
                    {rec_valor_corrigido}
                    SUM(cr.valor_acrescimo) as acrescimo,
                    SUM(cr.valor_desconto) as desconto,
                    MAX(cr.data_recebimento) as data_baixa,
                    SUM(cr.valor_baixa) + SUM(cr.valor_acrescimo) - SUM(cr.valor_desconto) as valor_baixa,
                    cr.id_interno_empresa,
                    cr.id_interno_centro_custo,
                    CASE
                        WHEN titulo_info.id_indexador > 0
                             AND titulo_info.valor_vencimento IS NOT NULL
                             AND SUM(cr.valor_baixa) >= titulo_info.valor_vencimento * 0.95
                             AND SUM(cr.valor_baixa) <= titulo_info.valor_vencimento * 1.05
                        THEN titulo_info.id_indexador
                        ELSE 0
                    END as id_indexador,
                    MAX(cr.parcela_total) as parcela_total
                FROM contas_recebidas cr
                {rec_joins}
                WHERE {recebidas_filter}
                GROUP BY cr.cliente, cr.titulo, cr.parcela, cr.tc, cr.data_vencimento,
                         cr.id_interno_empresa, cr.id_interno_centro_custo{rec_group_extra}
            )
            SELECT
                r.cliente,
                r.titulo_num || '/' || r.parcela as titulo,
                r.parcela,
                r.parcela_total,
                r.tipo_condicao,
                r.data_vencimento,
                r.valor_nominal,
                r.valor_corrigido,
                0 as saldo_atual,
                r.acrescimo,
                r.desconto,
                r.data_baixa,
                r.valor_baixa,
                r.data_baixa - r.data_vencimento as dias_atraso,
                'Recebido' as status,
                CASE r.id_indexador
                    WHEN 0 THEN 'REAL'
                    WHEN 3 THEN 'INCC-M'
                    WHEN 4 THEN 'IGPM'
                    WHEN 5 THEN 'IPCA'
                    ELSE 'ID ' || r.id_indexador::TEXT
                END as indice,
                cc.nome_empresa as empresa,
                cc.nome_centrocusto as empreendimento,
                'CT' as documento
            FROM recebidas_agrupadas r
            LEFT JOIN dim_centrocusto cc ON r.id_interno_centro_custo = cc.id_interno_centrocusto

            UNION ALL

            SELECT
                car.cliente,
                car.lancamento as titulo,
                car.numero_parcela as parcela,
                COALESCE(
                    (SELECT MAX(cr2.parcela_total) FROM contas_recebidas cr2
                     WHERE cr2.cliente = car.cliente
                     AND cr2.titulo::TEXT = SPLIT_PART(car.lancamento, '/', 1)),
                    (SELECT COUNT(*) FROM contas_a_receber car2
                     WHERE car2.cliente = car.cliente
                     AND SPLIT_PART(car2.lancamento, '/', 1) = SPLIT_PART(car.lancamento, '/', 1))
                ) as parcela_total,
                CASE TRIM(car.tc)
                    WHEN 'AT' THEN 'Ato'
                    WHEN 'PM' THEN 'Parcelas Mensais'
                    WHEN 'PS' THEN 'Parcelas Semestrais'
                    WHEN 'FI' THEN 'Financiamento'
                    WHEN 'RE' THEN 'Resíduo'
                    WHEN 'PB' THEN 'Parcelas Balão'
                    WHEN 'PE' THEN 'Parcelas Especiais'
                    WHEN 'PI' THEN 'Parcelas Intermediárias'
                    WHEN 'CO' THEN 'Contrato'
                    WHEN 'CR' THEN 'Crédito'
                    ELSE TRIM(car.tc)
                END as tipo_condicao,
                car.data_vencimento,
                car.valor_vencimento as valor_nominal,
                {ar_valor_corrigido}
                CASE
                    WHEN car.id_indexador IS NOT NULL AND car.id_indexador > 0
                         AND idx_b.valor_indexador IS NOT NULL AND idx_b.valor_indexador > 0
                    THEN ROUND(car.valor_vencimento / idx_b.valor_indexador * ui2.valor_indexador, 2)
                    ELSE COALESCE(car.valor_corrigido, car.valor_total)
                END as saldo_atual,
                car.valor_acrescimo as acrescimo,
                0 as desconto,
                NULL::date as data_baixa,
                0 as valor_baixa,
                CASE
                    WHEN car.data_vencimento < CURRENT_DATE THEN CURRENT_DATE - car.data_vencimento
                    ELSE 0
                END as dias_atraso,
                CASE
                    WHEN car.data_vencimento < CURRENT_DATE THEN 'Atrasado'
                    ELSE 'A Receber'
                END as status,
                CASE COALESCE(car.id_indexador, 0)
                    WHEN 0 THEN 'REAL'
                    WHEN 3 THEN 'INCC-M'
                    WHEN 4 THEN 'IGPM'
                    WHEN 5 THEN 'IPCA'
                    ELSE 'ID ' || COALESCE(car.id_indexador, 0)::TEXT
                END as indice,
                cc.nome_empresa as empresa,
                cc.nome_centrocusto as empreendimento,
                TRIM(car.id_documento) as documento
            FROM contas_a_receber car
            {ar_joins}
            LEFT JOIN dim_centrocusto cc ON car.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE {where_clause}

            ORDER BY data_vencimento ASC
        """

        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        if not rows:
            return {"header": {}, "parcelas": [], "totais": {}}
        
        first_row = rows[0]
        header = {
            "cliente": first_row['cliente'],
            "empresa": first_row['empresa'] or '-',
            "empreendimento": first_row['empreendimento'] or '-',
            "documento": first_row['documento'] or '-',
        }
        
        parcelas = []
        total_nominal = 0
        total_correcao = 0
        total_corrigido = 0
        total_recebido = 0
        total_a_receber = 0
        total_atrasado = 0
        total_acrescimo = 0
        total_saldo_atual = 0

        for row in rows:
            valor_nominal = float(row['valor_nominal'] or 0)
            valor_corrigido = float(row['valor_corrigido'] or 0)
            saldo_atual = float(row['saldo_atual'] or 0)
            correcao_monetaria = round(valor_corrigido - valor_nominal, 2)
            valor_baixa = float(row['valor_baixa'] or 0)
            acrescimo = float(row['acrescimo'] or 0)
            desconto = float(row['desconto'] or 0)
            tipo_cond = row['tipo_condicao'] or '-'

            total_nominal += valor_nominal
            total_correcao += correcao_monetaria
            total_corrigido += valor_corrigido
            total_acrescimo += acrescimo
            total_saldo_atual += saldo_atual
            if row['data_baixa']:
                total_recebido += valor_baixa
            elif row['status'] == 'Atrasado':
                total_atrasado += valor_corrigido
            else:
                total_a_receber += valor_corrigido

            # Extrair número do título (ex: "2394/1" -> "2394")
            titulo_str = row['titulo'] or ''
            titulo_num = titulo_str.split('/')[0] if '/' in titulo_str else titulo_str
            indice_val = row['indice'] or 'REAL'

            parcelas.append({
                "titulo": row['titulo'],
                "parcela": row['parcela'],
                "_titulo_num": titulo_num,
                "_indice": indice_val,
                "_data_vencimento_raw": str(row['data_vencimento']) if row['data_vencimento'] else '',
                "tipo_condicao": tipo_cond,
                "data_vencimento": str(row['data_vencimento']) if row['data_vencimento'] else None,
                "valor_nominal": valor_nominal,
                "correcao_monetaria": correcao_monetaria,
                "valor_corrigido": valor_corrigido,
                "saldo_atual": saldo_atual,
                "acrescimo": acrescimo,
                "desconto": desconto,
                "data_baixa": str(row['data_baixa']) if row['data_baixa'] else None,
                "valor_baixa": valor_baixa,
                "dias_atraso": row['dias_atraso'] or 0,
                "status": row['status'],
                "indice": indice_val,
            })

        # Agrupar parcelas por título+índice e numerar sequencialmente (como Sienge)
        # Parcelas REAL são sempre 1/1 (cada uma é independente)
        from collections import defaultdict
        grupos = defaultdict(list)
        for p in parcelas:
            grupo_key = (p['_titulo_num'], p['_indice'])
            grupos[grupo_key].append(p)

        for grupo_key, grupo_parcelas in grupos.items():
            titulo_num, indice = grupo_key
            if indice == 'REAL':
                # REAL: cada parcela é independente = 1/1
                for p in grupo_parcelas:
                    p['parcela_display'] = "1/1"
            else:
                # INCC/IGPM/IPCA: numerar sequencialmente por data
                grupo_parcelas.sort(key=lambda x: x['_data_vencimento_raw'])
                total_grupo = len(grupo_parcelas)
                for i, p in enumerate(grupo_parcelas, 1):
                    p['parcela_display'] = f"{i}/{total_grupo}"

        # Limpar campos temporários
        for p in parcelas:
            del p['_titulo_num']
            del p['_indice']
            del p['_data_vencimento_raw']

        totais = {
            "total_nominal": total_nominal,
            "total_correcao": round(total_correcao, 2),
            "total_corrigido": total_corrigido,
            "total_original": total_corrigido,
            "total_recebido": total_recebido,
            "total_a_receber": total_a_receber,
            "total_atrasado": total_atrasado,
            "total_acrescimo": total_acrescimo,
            "total_saldo_atual": total_saldo_atual,
            "quantidade_parcelas": len(parcelas),
        }
        
        return {
            "header": header,
            "parcelas": parcelas,
            "totais": totais,
            "calculo_incc_manual": usar_incc_manual,
            "titulos_incc_manual": list(titulos_incc_manual),
        }

    finally:
        cursor.close()
        conn.close()

@app.get("/api/clientes-lista")
def get_clientes_lista():
    """Retorna lista de clientes únicos para seleção"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT DISTINCT cliente, COUNT(*) as total_titulos
            FROM contas_a_receber
            WHERE cliente IS NOT NULL AND cliente != ''
            GROUP BY cliente
            ORDER BY cliente
            LIMIT 500
        """)
        rows = cursor.fetchall()
        
        return [{"id": row['cliente'], "nome": row['cliente'], "total_titulos": row['total_titulos']} for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/titulos-cliente")
def get_titulos_cliente(cliente: str):
    """Retorna lista de títulos de um cliente específico"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT titulo_base, SUM(total_parcelas) as total_parcelas, SUM(valor_total) as valor_total
            FROM (
                SELECT
                    SPLIT_PART(lancamento, '/', 1) as titulo_base,
                    COUNT(*) as total_parcelas,
                    SUM(valor_total) as valor_total
                FROM contas_a_receber
                WHERE cliente = %s
                GROUP BY SPLIT_PART(lancamento, '/', 1)

                UNION ALL

                SELECT
                    titulo::TEXT as titulo_base,
                    COUNT(DISTINCT parcela) as total_parcelas,
                    SUM(valor_baixa) as valor_total
                FROM contas_recebidas
                WHERE cliente = %s
                GROUP BY titulo
            ) combined
            GROUP BY titulo_base
            ORDER BY titulo_base
        """, (cliente, cliente))
        rows = cursor.fetchall()

        return [{"id": row['titulo_base'], "nome": f"Título {row['titulo_base']} ({row['total_parcelas']} parcelas)", "valor_total": float(row['valor_total'] or 0)} for row in rows]

    finally:
        cursor.close()
        conn.close()

@app.get("/api/progress-titulos-cliente")
def get_progress_titulos_cliente(
    cliente: str,
    empresa: Optional[str] = None,
    ano: Optional[str] = None,
    mes: Optional[str] = None,
    tipo_baixa: Optional[str] = None,
):
    """Retorna progresso de recebimento por título de um cliente (parcelas recebidas vs total)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        exclusoes = get_exclusoes()

        # Condições para contas_a_receber (total de parcelas do contrato - sem filtro de data)
        car_conditions = ["car.cliente = %s"]
        car_params = [cliente]
        if exclusoes['empresas']:
            ph = ','.join(['%s'] * len(exclusoes['empresas']))
            car_conditions.append(f"cc.id_sienge_empresa NOT IN ({ph})")
            car_params.extend(exclusoes['empresas'])
        if exclusoes['centros_custo']:
            ph = ','.join(['%s'] * len(exclusoes['centros_custo']))
            car_conditions.append(f"car.id_interno_centro_custo NOT IN ({ph})")
            car_params.extend(exclusoes['centros_custo'])
        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                car_conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                car_params.extend(emp_ids)
        where_car = " AND ".join(car_conditions)

        # Condições para contas_recebidas (parcelas já recebidas - com filtros de período)
        cr_conditions = ["cr.cliente = %s"]
        cr_params = [cliente]
        if exclusoes['empresas']:
            ph = ','.join(['%s'] * len(exclusoes['empresas']))
            cr_conditions.append(f"(cc2.id_sienge_empresa IS NULL OR cc2.id_sienge_empresa NOT IN ({ph}))")
            cr_params.extend(exclusoes['empresas'])
        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                cr_conditions.append(f"cc2.id_sienge_empresa IN ({emp_ph})")
                cr_params.extend(emp_ids)
        if ano:
            anos = [int(a.strip()) for a in ano.split(',')]
            ph = ', '.join(['%s'] * len(anos))
            cr_conditions.append(f"EXTRACT(YEAR FROM cr.data_recebimento) IN ({ph})")
            cr_params.extend(anos)
        if mes:
            meses = [int(m.strip()) for m in mes.split(',')]
            ph = ', '.join(['%s'] * len(meses))
            cr_conditions.append(f"EXTRACT(MONTH FROM cr.data_recebimento) IN ({ph})")
            cr_params.extend(meses)
        if tipo_baixa:
            tb_ids = [int(t.strip()) for t in tipo_baixa.split(',') if t.strip()]
            if tb_ids:
                ph = ', '.join(['%s'] * len(tb_ids))
                cr_conditions.append(f"cr.id_tipo_baixa IN ({ph})")
                cr_params.extend(tb_ids)
        where_cr = " AND ".join(cr_conditions)

        query = f"""
            WITH totais_contrato AS (
                SELECT
                    SPLIT_PART(car.lancamento, '/', 1) AS titulo,
                    COUNT(*) AS total_parcelas,
                    COALESCE(SUM(car.valor_total), 0) AS valor_contrato,
                    TRIM(MAX(car.tc)) AS tipo_condicao_code
                FROM contas_a_receber car
                LEFT JOIN dim_centrocusto cc
                    ON car.id_interno_centro_custo = cc.id_interno_centrocusto
                WHERE {where_car}
                GROUP BY SPLIT_PART(car.lancamento, '/', 1)
            ),
            totais_recebidos AS (
                SELECT
                    cr.titulo::TEXT AS titulo,
                    COUNT(*) AS parcelas_recebidas,
                    COALESCE(SUM(cr.valor_liquido), 0) AS valor_recebido
                FROM contas_recebidas cr
                LEFT JOIN dim_centrocusto cc2
                    ON cr.id_interno_centro_custo = cc2.id_interno_centrocusto
                WHERE {where_cr}
                GROUP BY cr.titulo::TEXT
            )
            SELECT
                tc.titulo,
                tc.total_parcelas,
                COALESCE(tr.parcelas_recebidas, 0) AS parcelas_recebidas,
                tc.valor_contrato,
                COALESCE(tr.valor_recebido, 0) AS valor_recebido,
                tc.tipo_condicao_code,
                CASE TRIM(tc.tipo_condicao_code)
                    WHEN 'AT' THEN 'Ato'
                    WHEN 'PM' THEN 'Parcelas Mensais'
                    WHEN 'PS' THEN 'Parcelas Semestrais'
                    WHEN 'FI' THEN 'Financiamento'
                    WHEN 'RE' THEN 'Resíduo'
                    WHEN 'PB' THEN 'Parcelas Balão'
                    WHEN 'PE' THEN 'Parcelas Especiais'
                    WHEN 'PI' THEN 'Parcelas Intermediárias'
                    WHEN 'CO' THEN 'Contrato'
                    WHEN 'CR' THEN 'Crédito'
                    ELSE TRIM(tc.tipo_condicao_code)
                END AS tipo_condicao_desc
            FROM totais_contrato tc
            LEFT JOIN totais_recebidos tr ON tc.titulo = tr.titulo
            ORDER BY tc.titulo
        """

        all_params = car_params + cr_params
        cursor.execute(query, all_params)
        rows = cursor.fetchall()

        return [
            {
                "titulo": row["titulo"],
                "total_parcelas": int(row["total_parcelas"]),
                "parcelas_recebidas": int(row["parcelas_recebidas"]),
                "valor_contrato": float(row["valor_contrato"]),
                "valor_recebido": float(row["valor_recebido"]),
                "percentual": round(
                    int(row["parcelas_recebidas"]) / int(row["total_parcelas"]) * 100, 1
                ) if int(row["total_parcelas"]) > 0 else 0,
                "tipo_condicao": row["tipo_condicao_code"] or "-",
                "tipo_condicao_desc": row["tipo_condicao_desc"] or "-",
            }
            for row in rows
        ]

    except Exception as e:
        print(f"Erro ao buscar progress titulos: {e}")
        raise HTTPException(status_code=500, detail=str(e))
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
    empresa: Optional[str] = None,
    centro_custo: Optional[str] = None,
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
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)
        
        if empresa:
            emp_ids = parse_csv_int(empresa)
            if emp_ids:
                emp_ph = ', '.join(['%s'] * len(emp_ids))
                conditions.append(f"cc.id_sienge_empresa IN ({emp_ph})")
                params.extend(emp_ids)
        
        if centro_custo:
            cc_ids = parse_csv_int(centro_custo)
            if cc_ids:
                cc_ph = ', '.join(['%s'] * len(cc_ids))
                conditions.append(f"cp.id_interno_centro_custo IN ({cc_ph})")
                params.extend(cc_ids)
        
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

# ============ CONFIGURAÇÕES (Exclusões) ============

def init_configuracoes_tables():
    """Cria todas as tabelas de configuração no banco de configs (PostgreSQL ou SQLite)."""
    is_pg = _CONFIG_USE_POSTGRES
    # PostgreSQL usa SERIAL e TIMESTAMP; SQLite usa INTEGER e DATETIME
    serial = "SERIAL" if is_pg else "INTEGER"
    ts = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP" if is_pg else "DATETIME DEFAULT CURRENT_TIMESTAMP"
    bool_true = "true" if is_pg else "1"
    unique_conflict = "ON CONFLICT DO NOTHING" if is_pg else "OR IGNORE"

    try:
        conn = get_config_db_connection()
        cursor = conn.cursor()
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS config_empresas_excluidas (
                id {serial} PRIMARY KEY,
                id_sienge_empresa INTEGER NOT NULL UNIQUE,
                nome_empresa VARCHAR(255),
                created_at {ts}
            )
        """)
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS config_centros_custo_excluidos (
                id {serial} PRIMARY KEY,
                id_interno_centrocusto INTEGER NOT NULL UNIQUE,
                nome_centrocusto VARCHAR(255),
                created_at {ts}
            )
        """)
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS config_tipos_documento_excluidos (
                id {serial} PRIMARY KEY,
                id_documento VARCHAR(50) NOT NULL UNIQUE,
                nome_documento VARCHAR(255),
                created_at {ts}
            )
        """)
        # Insere tipos de previsão como excluídos por padrão (não representam contas reais)
        tipos_previsao = [
            ('PCT', 'PREVISÃO FINANCEIRA DE CONTR. DE MED.'),
            ('PPC', 'PREVISÃO FINANCEIRA DE PEDIDOS DE COMPRA'),
            ('PRC', 'PREVISÃO DE COMISSÃO'),
            ('PRDI', 'PREVISÃO DE DISTRATO'),
            ('PRV', 'PREVISÃO DE PAGAMENTO/RECEBIMENTO'),
        ]
        for id_doc, nome_doc in tipos_previsao:
            cursor.execute(
                "INSERT INTO config_tipos_documento_excluidos (id_documento, nome_documento) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (id_doc, nome_doc)
            )

        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS config_contas_correntes_excluidas (
                id {serial} PRIMARY KEY,
                id_conta_corrente VARCHAR(100) NOT NULL UNIQUE,
                nome_conta_corrente VARCHAR(255),
                created_at {ts}
            )
        """)
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS config_snapshot_horario (
                id {serial} PRIMARY KEY,
                horario VARCHAR(5) NOT NULL DEFAULT '07:00',
                ativo BOOLEAN NOT NULL DEFAULT {bool_true},
                updated_at {ts}
            )
        """)
        cursor.execute("SELECT COUNT(*) as cnt FROM config_snapshot_horario")
        row = cursor.fetchone()
        if row and int(row['cnt']) == 0:
            cursor.execute("INSERT INTO config_snapshot_horario (horario, ativo) VALUES ('07:00', 1)")
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS config_origens_exposicao_caixa (
                id {serial} PRIMARY KEY,
                id_origem_titulo INTEGER NOT NULL UNIQUE,
                sigla VARCHAR(10) NOT NULL,
                descricao VARCHAR(255),
                incluir BOOLEAN NOT NULL DEFAULT {bool_true},
                paginas TEXT NOT NULL DEFAULT 'exposicao_caixa',
                created_at {ts}
            )
        """)
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS config_tipos_baixa_exposicao_caixa (
                id {serial} PRIMARY KEY,
                id_tipo_baixa INTEGER NOT NULL UNIQUE,
                nome_tipo_baixa VARCHAR(255),
                flag_sistema_uso VARCHAR(5),
                incluir BOOLEAN NOT NULL DEFAULT {bool_true},
                paginas TEXT NOT NULL DEFAULT 'exposicao_caixa',
                created_at {ts}
            )
        """)
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS snapshots_cards_pagar (
                id {serial} PRIMARY KEY,
                data_snapshot DATE NOT NULL,
                faixa VARCHAR(20) NOT NULL,
                data_inicio DATE,
                data_fim DATE,
                valor_total NUMERIC(15,2) NOT NULL DEFAULT 0,
                quantidade_titulos INTEGER NOT NULL DEFAULT 0,
                quantidade_credores INTEGER NOT NULL DEFAULT 0,
                created_at {ts},
                UNIQUE(data_snapshot, faixa)
            )
        """)
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS config_titulos_incc_manual (
                id {serial} PRIMARY KEY,
                cliente VARCHAR(200) NOT NULL,
                titulo VARCHAR(50) NOT NULL,
                created_at {ts},
                UNIQUE(cliente, titulo)
            )
        """)
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS empreendimentos_config (
                id {serial} PRIMARY KEY,
                nome TEXT NOT NULL,
                codigo TEXT NOT NULL,
                centro_custo_id INTEGER,
                metragem REAL DEFAULT 0,
                fator REAL DEFAULT 1,
                vgv_mock REAL DEFAULT 0,
                status TEXT DEFAULT 'ativa',
                criado_por TEXT,
                atualizado_em TEXT
            )
        """)
        # Tabela cub_config para armazenar valor do CUB/RO atualizado
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS cub_config (
                id {serial} PRIMARY KEY,
                valor REAL NOT NULL,
                referencia TEXT,
                atualizado_em TEXT
            )
        """)
        cursor.execute("SELECT COUNT(*) as cnt FROM cub_config")
        row_cub = cursor.fetchone()
        if row_cub and int(row_cub['cnt']) == 0:
            cursor.execute(
                "INSERT INTO cub_config (valor, referencia, atualizado_em) VALUES (%s, %s, %s)",
                (2334.56, 'Fev/2026', datetime.now().isoformat())
            )
        # Seed empreendimentos_config if empty
        cursor.execute("SELECT COUNT(*) as cnt FROM empreendimentos_config")
        row_emp = cursor.fetchone()
        if row_emp and int(row_emp['cnt']) == 0:
            # centro_custo_id = id_sienge_centrocusto (código Sienge, não interno)
            seed_empreendimentos = [
                ('Lake Boulevard', 'LKB', 16, 25392.42, 1, 120000000, 'ativa'),
                ('Buenos Aires', 'BUA', 12, 18000, 1, 85000000, 'ativa'),
                ('Imperial Residence', 'IMP', 25, 12000, 1, 45000000, 'ativa'),
                ('BIE 3', 'BIE3', None, 8000, 1, 30000000, 'finalizada'),
                ('BIE 4', 'BIE4', 32, 5500, 1, 20000000, 'ativa'),
                ('Valenca', 'VAL', 40, 9000, 1, 12000000, 'ativa'),
                ('Lagunas Residencial Clube', 'LAG', 21, 7000, 1, 8000000, 'ativa'),
            ]
            for nome, codigo, cc_id, metragem, fator, vgv, status in seed_empreendimentos:
                cursor.execute(
                    "INSERT INTO empreendimentos_config (nome, codigo, centro_custo_id, metragem, fator, vgv_mock, status) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (nome, codigo, cc_id, metragem, fator, vgv, status)
                )
        # Tabelas de validacao de paginas
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS validacao_paginas (
                id {serial} PRIMARY KEY,
                page_id VARCHAR(50) NOT NULL UNIQUE,
                page_label VARCHAR(100) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'nao_validado',
                validated_by VARCHAR(100),
                validated_at TIMESTAMP,
                last_check_at TIMESTAMP,
                last_check_result VARCHAR(20),
                notes TEXT,
                created_at {ts}
            )
        """)
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS validacao_checkpoints (
                id {serial} PRIMARY KEY,
                page_id VARCHAR(50) NOT NULL,
                checkpoint_label VARCHAR(200) NOT NULL,
                endpoint VARCHAR(200) NOT NULL,
                query_params TEXT NOT NULL,
                expected_values TEXT NOT NULL,
                tolerance_pct REAL NOT NULL DEFAULT 0.0,
                last_check_at TIMESTAMP,
                last_actual_values TEXT,
                last_check_status VARCHAR(20),
                active INTEGER NOT NULL DEFAULT 1,
                created_at {ts}
            )
        """)
        # Seed validacao_paginas
        seed_pages = [
            ('dashboard', 'Dashboard'),
            ('contas-a-pagar', 'Contas a Pagar'),
            ('contas-pagas', 'Contas Pagas'),
            ('contas-atrasadas', 'Contas Atrasadas'),
            ('contas-a-receber', 'Contas a Receber'),
            ('contas-recebidas', 'Contas Recebidas'),
            ('recebimentos-atrasados', 'Inadimplencia'),
            ('painel-executivo', 'Painel Executivo'),
            ('exposicao-caixa', 'Exposicao de Caixa'),
            ('kpis', 'KPIs'),
        ]
        for page_id, page_label in seed_pages:
            cursor.execute(
                f"INSERT {unique_conflict} INTO validacao_paginas (page_id, page_label) VALUES (%s, %s)",
                (page_id, page_label)
            )
        conn.commit()
        backend = "PostgreSQL" if is_pg else f"SQLite ({CONFIG_SQLITE_PATH})"
        print(f"Tabelas de configurações criadas/verificadas em {backend}")
    except Exception as e:
        print(f"Erro ao inicializar tabelas de configurações: {e}")
    finally:
        cursor.close()
        conn.close()

def _ensure_config_tables_in_postgres():
    """Garante que as tabelas de config existam no PostgreSQL (não no SQLite).
    Cria as tabelas diretamente via psycopg2, sem depender de get_config_db_connection."""
    if not CONFIG_DB_URL:
        print("[STARTUP] CONFIG_DB_URL não definido, usando SQLite.")
        return
    max_retries = 5
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(CONFIG_DB_URL, cursor_factory=RealDictCursor)
            cursor = conn.cursor()

            # Cria TODAS as tabelas de config diretamente no PostgreSQL
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_empresas_excluidas (
                    id SERIAL PRIMARY KEY,
                    id_sienge_empresa INTEGER NOT NULL UNIQUE,
                    nome_empresa VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_centros_custo_excluidos (
                    id SERIAL PRIMARY KEY,
                    id_interno_centrocusto INTEGER NOT NULL UNIQUE,
                    nome_centrocusto VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_tipos_documento_excluidos (
                    id SERIAL PRIMARY KEY,
                    id_documento VARCHAR(50) NOT NULL UNIQUE,
                    nome_documento VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_contas_correntes_excluidas (
                    id SERIAL PRIMARY KEY,
                    id_conta_corrente VARCHAR(100) NOT NULL UNIQUE,
                    nome_conta_corrente VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_snapshot_horario (
                    id SERIAL PRIMARY KEY,
                    horario VARCHAR(5) NOT NULL DEFAULT '07:00',
                    ativo BOOLEAN NOT NULL DEFAULT true,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("SELECT COUNT(*) as cnt FROM config_snapshot_horario")
            row = cursor.fetchone()
            if row and int(row['cnt']) == 0:
                cursor.execute("INSERT INTO config_snapshot_horario (horario, ativo) VALUES ('07:00', true)")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_origens_exposicao_caixa (
                    id SERIAL PRIMARY KEY,
                    id_origem_titulo INTEGER NOT NULL UNIQUE,
                    sigla VARCHAR(10) NOT NULL,
                    descricao VARCHAR(255),
                    incluir BOOLEAN NOT NULL DEFAULT true,
                    paginas TEXT NOT NULL DEFAULT 'exposicao_caixa',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_tipos_baixa_exposicao_caixa (
                    id SERIAL PRIMARY KEY,
                    id_tipo_baixa INTEGER NOT NULL UNIQUE,
                    nome_tipo_baixa VARCHAR(255),
                    flag_sistema_uso VARCHAR(5),
                    incluir BOOLEAN NOT NULL DEFAULT true,
                    paginas TEXT NOT NULL DEFAULT 'exposicao_caixa',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS snapshots_cards_pagar (
                    id SERIAL PRIMARY KEY,
                    data_snapshot DATE NOT NULL,
                    faixa VARCHAR(20) NOT NULL,
                    data_inicio DATE,
                    data_fim DATE,
                    valor_total NUMERIC(15,2) NOT NULL DEFAULT 0,
                    quantidade_titulos INTEGER NOT NULL DEFAULT 0,
                    quantidade_credores INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(data_snapshot, faixa)
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS snapshots_titulos_pagar (
                    id SERIAL PRIMARY KEY,
                    data_snapshot DATE NOT NULL,
                    lancamento VARCHAR(50),
                    credor VARCHAR(200),
                    valor_total NUMERIC(15,2),
                    data_vencimento DATE,
                    data_cadastro DATE,
                    id_documento VARCHAR(10),
                    nome_centrocusto VARCHAR(200),
                    UNIQUE(data_snapshot, lancamento)
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_titulos_incc_manual (
                    id SERIAL PRIMARY KEY,
                    cliente VARCHAR(200) NOT NULL,
                    titulo VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(cliente, titulo)
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS empreendimentos_config (
                    id SERIAL PRIMARY KEY,
                    nome TEXT NOT NULL,
                    codigo TEXT NOT NULL,
                    centro_custo_id INTEGER,
                    metragem REAL DEFAULT 0,
                    fator REAL DEFAULT 1,
                    vgv_mock REAL DEFAULT 0,
                    status TEXT DEFAULT 'ativa',
                    criado_por TEXT,
                    atualizado_em TEXT
                )
            """)
            # Tabela cub_config
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS cub_config (
                    id SERIAL PRIMARY KEY,
                    valor REAL NOT NULL,
                    referencia TEXT,
                    atualizado_em TEXT
                )
            """)
            cursor.execute("SELECT COUNT(*) as cnt FROM cub_config")
            row_cub = cursor.fetchone()
            if row_cub and int(row_cub['cnt']) == 0:
                cursor.execute(
                    "INSERT INTO cub_config (valor, referencia, atualizado_em) VALUES (%s, %s, %s)",
                    (2334.56, 'Fev/2026', datetime.now().isoformat())
                )

            # Tabela config_feriados
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_feriados (
                    id SERIAL PRIMARY KEY,
                    data DATE NOT NULL UNIQUE,
                    descricao VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Seed feriados nacionais + Porto Velho/RO (2025 e 2026)
            cursor.execute("SELECT COUNT(*) as cnt FROM config_feriados")
            row_fer = cursor.fetchone()
            if row_fer and int(row_fer['cnt']) == 0:
                seed_feriados = [
                    # 2025 - Nacionais
                    ('2025-01-01', 'Confraternização Universal'),
                    ('2025-03-03', 'Carnaval'),
                    ('2025-03-04', 'Carnaval'),
                    ('2025-04-18', 'Sexta-feira Santa'),
                    ('2025-04-21', 'Tiradentes'),
                    ('2025-05-01', 'Dia do Trabalho'),
                    ('2025-06-19', 'Corpus Christi'),
                    ('2025-09-07', 'Independência do Brasil'),
                    ('2025-10-12', 'Nossa Senhora Aparecida'),
                    ('2025-11-02', 'Finados'),
                    ('2025-11-15', 'Proclamação da República'),
                    ('2025-11-20', 'Dia da Consciência Negra'),
                    ('2025-12-25', 'Natal'),
                    # 2025 - Porto Velho / Rondônia
                    ('2025-01-04', 'Criação do Estado de Rondônia'),
                    ('2025-10-02', 'Aniversário de Porto Velho'),
                    # 2026 - Nacionais
                    ('2026-01-01', 'Confraternização Universal'),
                    ('2026-02-16', 'Carnaval'),
                    ('2026-02-17', 'Carnaval'),
                    ('2026-04-03', 'Sexta-feira Santa'),
                    ('2026-04-21', 'Tiradentes'),
                    ('2026-05-01', 'Dia do Trabalho'),
                    ('2026-06-04', 'Corpus Christi'),
                    ('2026-09-07', 'Independência do Brasil'),
                    ('2026-10-12', 'Nossa Senhora Aparecida'),
                    ('2026-11-02', 'Finados'),
                    ('2026-11-15', 'Proclamação da República'),
                    ('2026-11-20', 'Dia da Consciência Negra'),
                    ('2026-12-25', 'Natal'),
                    # 2026 - Porto Velho / Rondônia
                    ('2026-01-04', 'Criação do Estado de Rondônia'),
                    ('2026-10-02', 'Aniversário de Porto Velho'),
                ]
                for dt, desc in seed_feriados:
                    cursor.execute(
                        "INSERT INTO config_feriados (data, descricao) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                        (dt, desc)
                    )

            cursor.execute("SELECT COUNT(*) as cnt FROM empreendimentos_config")
            row_emp = cursor.fetchone()
            if row_emp and int(row_emp['cnt']) == 0:
                # centro_custo_id = id_sienge_centrocusto (código Sienge, não interno)
                seed_empreendimentos = [
                    ('Lake Boulevard', 'LKB', 16, 25392.42, 1, 120000000, 'ativa'),
                    ('Buenos Aires', 'BUA', 12, 18000, 1, 85000000, 'ativa'),
                    ('Imperial Residence', 'IMP', 25, 12000, 1, 45000000, 'ativa'),
                    ('BIE 3', 'BIE3', None, 8000, 1, 30000000, 'finalizada'),
                    ('BIE 4', 'BIE4', 32, 5500, 1, 20000000, 'ativa'),
                    ('Valenca', 'VAL', 40, 9000, 1, 12000000, 'ativa'),
                    ('Lagunas Residencial Clube', 'LAG', 21, 7000, 1, 8000000, 'ativa'),
                ]
                for nome, codigo, cc_id, metragem, fator, vgv, status in seed_empreendimentos:
                    cursor.execute(
                        "INSERT INTO empreendimentos_config (nome, codigo, centro_custo_id, metragem, fator, vgv_mock, status) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (nome, codigo, cc_id, metragem, fator, vgv, status)
                    )

            # Insere tipos de previsão como excluídos por padrão
            tipos_previsao = [
                ('PCT', 'PREVISÃO FINANCEIRA DE CONTR. DE MED.'),
                ('PPC', 'PREVISÃO FINANCEIRA DE PEDIDOS DE COMPRA'),
                ('PRC', 'PREVISÃO DE COMISSÃO'),
                ('PRDI', 'PREVISÃO DE DISTRATO'),
                ('PRV', 'PREVISÃO DE PAGAMENTO/RECEBIMENTO'),
                ('EPCT', 'ESTIMATIVA DE PREVISÃO DE CONTRATO'),
            ]
            for id_doc, nome_doc in tipos_previsao:
                cursor.execute(
                    "INSERT INTO config_tipos_documento_excluidos (id_documento, nome_documento) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    (id_doc, nome_doc)
                )

            # Tabelas de validacao de paginas
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS validacao_paginas (
                    id SERIAL PRIMARY KEY,
                    page_id VARCHAR(50) NOT NULL UNIQUE,
                    page_label VARCHAR(100) NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'nao_validado',
                    validated_by VARCHAR(100),
                    validated_at TIMESTAMP,
                    last_check_at TIMESTAMP,
                    last_check_result VARCHAR(20),
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS validacao_checkpoints (
                    id SERIAL PRIMARY KEY,
                    page_id VARCHAR(50) NOT NULL,
                    checkpoint_label VARCHAR(200) NOT NULL,
                    endpoint VARCHAR(200) NOT NULL,
                    query_params TEXT NOT NULL,
                    expected_values TEXT NOT NULL,
                    tolerance_pct REAL NOT NULL DEFAULT 0.0,
                    last_check_at TIMESTAMP,
                    last_actual_values TEXT,
                    last_check_status VARCHAR(20),
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Seed validacao_paginas
            seed_pages = [
                ('dashboard', 'Dashboard'),
                ('contas-a-pagar', 'Contas a Pagar'),
                ('contas-pagas', 'Contas Pagas'),
                ('contas-atrasadas', 'Contas Atrasadas'),
                ('contas-a-receber', 'Contas a Receber'),
                ('contas-recebidas', 'Contas Recebidas'),
                ('recebimentos-atrasados', 'Inadimplencia'),
                ('painel-executivo', 'Painel Executivo'),
                ('exposicao-caixa', 'Exposicao de Caixa'),
                ('kpis', 'KPIs'),
            ]
            for page_id, page_label in seed_pages:
                cursor.execute(
                    "INSERT INTO validacao_paginas (page_id, page_label) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    (page_id, page_label)
                )

            # Tabela de sessões ativas (usuários online)
            cursor.execute(f"""
                CREATE TABLE IF NOT EXISTS sessoes_ativas (
                    id {serial} PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    user_nome VARCHAR(255),
                    user_email VARCHAR(255),
                    user_permissao VARCHAR(50),
                    ultimo_heartbeat {ts},
                    login_at {ts},
                    UNIQUE(user_id)
                )
            """)

            # Tabela de solicitações de melhorias
            cursor.execute(f"""
                CREATE TABLE IF NOT EXISTS solicitacoes_melhorias (
                    id {serial} PRIMARY KEY,
                    titulo VARCHAR(255) NOT NULL,
                    descricao TEXT NOT NULL,
                    secao VARCHAR(100) NOT NULL,
                    prioridade VARCHAR(20) NOT NULL DEFAULT 'media',
                    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
                    usuario_nome VARCHAR(255),
                    usuario_email VARCHAR(255),
                    resposta_dev TEXT,
                    versao_implementada VARCHAR(20),
                    imagem TEXT,
                    created_at {ts},
                    updated_at {ts}
                )
            """)

            # Migração: adicionar coluna imagem se não existir
            try:
                cursor.execute("ALTER TABLE solicitacoes_melhorias ADD COLUMN IF NOT EXISTS imagem TEXT")
            except Exception:
                pass

            conn.commit()
            cursor.close()
            conn.close()
            print(f"[STARTUP] Tabelas de config criadas/verificadas no PostgreSQL com sucesso!")
            return
        except Exception as e:
            print(f"[STARTUP] Tentativa {attempt + 1}/{max_retries} falhou: {e}")
            if attempt < max_retries - 1:
                import time
                time.sleep(2)
    print("[STARTUP] AVISO: Não foi possível criar tabelas de config no PostgreSQL após todas as tentativas!")

# Tenta criar na inicialização do módulo (pode falhar se PG não estiver pronto)
try:
    init_configuracoes_tables()
except Exception as e:
    print(f"[INIT] Erro ao criar tabelas de config (será tentado novamente no startup): {e}")

def get_exclusoes():
    """Retorna listas de IDs excluídos nas configurações. Retorna listas vazias em caso de erro."""
    try:
        conn = get_config_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT id_sienge_empresa FROM config_empresas_excluidas")
            empresas = [r['id_sienge_empresa'] for r in cursor.fetchall()]
            cursor.execute("SELECT id_interno_centrocusto FROM config_centros_custo_excluidos")
            centros = [r['id_interno_centrocusto'] for r in cursor.fetchall()]
            cursor.execute("SELECT id_documento FROM config_tipos_documento_excluidos")
            tipos_doc = [r['id_documento'] for r in cursor.fetchall()]
            cursor.execute("SELECT id_conta_corrente FROM config_contas_correntes_excluidas")
            contas_correntes = [r['id_conta_corrente'] for r in cursor.fetchall()]
            result = {'empresas': empresas, 'centros_custo': centros, 'tipos_documento': tipos_doc, 'contas_correntes': contas_correntes}
            print(f"[get_exclusoes] tipos_documento excluidos: {tipos_doc}")
            return result
        except Exception as e:
            print(f"[get_exclusoes] ERRO ao ler config: {e}")
            return {'empresas': [], 'centros_custo': [], 'tipos_documento': [], 'contas_correntes': []}
        finally:
            cursor.close()
            conn.close()
    except Exception as e:
        print(f"[get_exclusoes] ERRO ao conectar config DB: {e}")
        return {'empresas': [], 'centros_custo': [], 'tipos_documento': [], 'contas_correntes': []}

def build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', has_join=True, has_cc_column=True, has_doc_column=True, has_conta_corrente=False, exclude_paid=False):
    conditions = []
    params = []
    if exclusoes['empresas'] and has_join:
        placeholders = ','.join(['%s'] * len(exclusoes['empresas']))
        conditions.append(f"{cc_alias}.id_sienge_empresa NOT IN ({placeholders})")
        params.extend(exclusoes['empresas'])
    if exclusoes['centros_custo'] and has_cc_column:
        placeholders = ','.join(['%s'] * len(exclusoes['centros_custo']))
        conditions.append(f"{table_alias}.id_interno_centro_custo NOT IN ({placeholders})")
        params.extend(exclusoes['centros_custo'])
    if exclusoes['tipos_documento'] and has_doc_column:
        placeholders = ','.join(['%s'] * len(exclusoes['tipos_documento']))
        conditions.append(f"({table_alias}.id_documento IS NULL OR TRIM({table_alias}.id_documento) NOT IN ({placeholders}))")
        params.extend(exclusoes['tipos_documento'])
    if exclusoes.get('contas_correntes') and has_conta_corrente:
        placeholders = ','.join(['%s'] * len(exclusoes['contas_correntes']))
        conditions.append(f"{table_alias}.id_conta_corrente NOT IN ({placeholders})")
        params.extend(exclusoes['contas_correntes'])
    if exclude_paid:
        conditions.append(
            f"NOT EXISTS (SELECT 1 FROM contas_pagas cpg "
            f"WHERE SPLIT_PART(cpg.lancamento, '/', 1) = SPLIT_PART({table_alias}.lancamento, '/', 1) "
            f"AND CAST(NULLIF(SPLIT_PART(cpg.lancamento, '/', 2), '') AS INTEGER) = {table_alias}.numero_parcela)"
        )
    return conditions, params

@app.get("/api/debug/tipos-previsao")
def debug_tipos_previsao(admin: dict = Depends(require_admin)):
    """Lista todos tipos de documento que podem ser previsão"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT TRIM(id_documento) as id, TRIM(nome_documento) as nome
            FROM ecaddocumento
            WHERE LOWER(nome_documento) LIKE '%previs%'
               OR LOWER(nome_documento) LIKE '%estim%'
               OR TRIM(id_documento) LIKE 'P%'
               OR TRIM(id_documento) LIKE 'EP%'
            ORDER BY id_documento
        """)
        tipos = [dict(r) for r in cursor.fetchall()]

        # Também mostra quais estão excluídos
        exclusoes = get_exclusoes()
        return {
            "tipos_possiveis_previsao": tipos,
            "atualmente_excluidos": exclusoes['tipos_documento']
        }
    finally:
        cursor.close()
        conn.close()

@app.get("/api/debug/empresa-detalhe")
def debug_empresa_detalhe(empresa: str = "LAGOA", admin: dict = Depends(require_admin)):
    """Analisa títulos de uma empresa específica para identificar diferenças com PBI"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        exclusoes = get_exclusoes()
        excl_conds_com, excl_params_com = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)
        excl_where_com = (" AND " + " AND ".join(excl_conds_com)) if excl_conds_com else ""

        excl_conds_sem, excl_params_sem = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=False)
        excl_where_sem = (" AND " + " AND ".join(excl_conds_sem)) if excl_conds_sem else ""

        # Total COM filtro pagas (o que o dashboard mostra)
        cursor.execute(f"""
            SELECT COALESCE(SUM(cap.valor_total), 0) as total,
                   COUNT(*) as qtd,
                   COUNT(DISTINCT SPLIT_PART(cap.lancamento, '/', 1)) as titulos_unicos,
                   COUNT(DISTINCT cap.credor) as credores
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE UPPER(cc.nome_empresa) LIKE %s{excl_where_com}
        """, ['%' + empresa.upper() + '%'] + excl_params_com)
        com_filtro = cursor.fetchone()

        # Total SEM filtro pagas
        cursor.execute(f"""
            SELECT COALESCE(SUM(cap.valor_total), 0) as total,
                   COUNT(*) as qtd,
                   COUNT(DISTINCT SPLIT_PART(cap.lancamento, '/', 1)) as titulos_unicos,
                   COUNT(DISTINCT cap.credor) as credores
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE UPPER(cc.nome_empresa) LIKE %s{excl_where_sem}
        """, ['%' + empresa.upper() + '%'] + excl_params_sem)
        sem_filtro = cursor.fetchone()

        # Títulos desta empresa que existem em contas_pagas mas NÃO estão sendo filtrados
        # (match por lancamento exato funciona, mas match por titulo+parcela não)
        cursor.execute(f"""
            SELECT cap.lancamento, cap.numero_parcela, cap.valor_total, cap.credor,
                   cap.data_vencimento, TRIM(cap.id_documento) as id_documento,
                   TRIM(cap.id_origem) as id_origem,
                   cc.nome_centrocusto,
                   (SELECT cpg.lancamento FROM contas_pagas cpg
                    WHERE SPLIT_PART(cpg.lancamento, '/', 1) = SPLIT_PART(cap.lancamento, '/', 1)
                    LIMIT 1) as lancamento_pago_encontrado,
                   (SELECT cpg.lancamento FROM contas_pagas cpg
                    WHERE cpg.lancamento = cap.lancamento
                    LIMIT 1) as lancamento_exato_encontrado
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE UPPER(cc.nome_empresa) LIKE %s{excl_where_com}
            ORDER BY cap.valor_total DESC
            LIMIT 200
        """, ['%' + empresa.upper() + '%'] + excl_params_com)
        titulos_dashboard = [dict(r) for r in cursor.fetchall()]

        # Verificar títulos que passam pelo filtro COM pagas mas tem titulo base em contas_pagas
        cursor.execute(f"""
            SELECT cap.lancamento, cap.numero_parcela, cap.valor_total, cap.credor,
                   cap.data_vencimento, TRIM(cap.id_documento) as id_documento,
                   cc.nome_centrocusto
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE UPPER(cc.nome_empresa) LIKE %s{excl_where_sem}
              AND NOT EXISTS (
                  SELECT 1 FROM contas_pagas cpg
                  WHERE SPLIT_PART(cpg.lancamento, '/', 1) = SPLIT_PART(cap.lancamento, '/', 1)
                  AND CAST(NULLIF(SPLIT_PART(cpg.lancamento, '/', 2), '') AS INTEGER) = cap.numero_parcela
              )
              AND EXISTS (
                  SELECT 1 FROM contas_pagas cpg
                  WHERE cpg.lancamento = cap.lancamento
              )
            ORDER BY cap.valor_total DESC
        """, ['%' + empresa.upper() + '%'] + excl_params_sem)
        nao_filtrados = [dict(r) for r in cursor.fetchall()]

        # Checar se o CAST está falhando para algum registro
        cursor.execute(f"""
            SELECT cap.lancamento, cap.numero_parcela, cap.valor_total, cap.credor,
                   SPLIT_PART(cap.lancamento, '/', 2) as parcela_str,
                   cap.data_vencimento
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE UPPER(cc.nome_empresa) LIKE %s{excl_where_sem}
              AND EXISTS (SELECT 1 FROM contas_pagas cpg WHERE cpg.lancamento = cap.lancamento)
            ORDER BY cap.valor_total DESC
        """, ['%' + empresa.upper() + '%'] + excl_params_sem)
        com_lancamento_exato_em_pagas = [dict(r) for r in cursor.fetchall()]

        # Duplicatas: mesmo lancamento aparecendo mais de uma vez (usa tabela RAW, não a view deduplicada)
        cursor.execute(f"""
            SELECT cap.lancamento, cap.numero_parcela, COUNT(*) as vezes,
                   SUM(cap.valor_total) as soma_valores,
                   ARRAY_AGG(cap.valor_total ORDER BY cap.valor_total DESC) as valores,
                   ARRAY_AGG(DISTINCT cc.nome_centrocusto) as centros_custo,
                   MAX(cap.credor) as credor
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE UPPER(cc.nome_empresa) LIKE %s{excl_where_com}
            GROUP BY cap.lancamento, cap.numero_parcela
            HAVING COUNT(*) > 1
            ORDER BY SUM(cap.valor_total) DESC
        """, ['%' + empresa.upper() + '%'] + excl_params_com)
        duplicatas = [dict(r) for r in cursor.fetchall()]
        duplicatas_valor = sum(float(r['soma_valores']) - float(r['valores'][0]) for r in duplicatas) if duplicatas else 0
        duplicatas_info = {
            "descricao": "Lancamentos duplicados (mesmo lancamento+parcela aparece mais de 1 vez)",
            "quantidade": len(duplicatas),
            "valor_excedente": duplicatas_valor,
            "dados": duplicatas[:30]
        }

        # Breakdown por tipo de documento
        cursor.execute(f"""
            SELECT TRIM(cap.id_documento) as tipo_doc, COUNT(*) as qtd,
                   COALESCE(SUM(cap.valor_total), 0) as valor,
                   COUNT(DISTINCT SPLIT_PART(cap.lancamento, '/', 1)) as titulos
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE UPPER(cc.nome_empresa) LIKE %s{excl_where_com}
            GROUP BY TRIM(cap.id_documento)
            ORDER BY valor DESC
        """, ['%' + empresa.upper() + '%'] + excl_params_com)
        docs_info = [dict(r) for r in cursor.fetchall()]

        # Breakdown por centro de custo (para comparar com PBI)
        cursor.execute(f"""
            SELECT cc.nome_centrocusto,
                   COALESCE(SUM(cap.valor_total), 0) as valor,
                   COUNT(*) as parcelas,
                   COUNT(DISTINCT SPLIT_PART(cap.lancamento, '/', 1)) as titulos,
                   COUNT(DISTINCT cap.credor) as credores
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE UPPER(cc.nome_empresa) LIKE %s{excl_where_com}
            GROUP BY cc.nome_centrocusto
            ORDER BY valor DESC
        """, ['%' + empresa.upper() + '%'] + excl_params_com)
        por_cc = [dict(r) for r in cursor.fetchall()]

        return {
            "empresa_filtro": empresa,
            "com_filtro_pagas": {
                "valor": float(com_filtro['total']), "parcelas": com_filtro['qtd'],
                "titulos_unicos": com_filtro['titulos_unicos'], "credores": com_filtro['credores']
            },
            "sem_filtro_pagas": {
                "valor": float(sem_filtro['total']), "parcelas": sem_filtro['qtd'],
                "titulos_unicos": sem_filtro['titulos_unicos'], "credores": sem_filtro['credores']
            },
            "diferenca": float(sem_filtro['total']) - float(com_filtro['total']),
            "titulos_com_lancamento_exato_em_pagas": {
                "descricao": "Títulos que tem lancamento EXATO em contas_pagas (deviam ser excluidos pelo NOT EXISTS)",
                "quantidade": len(com_lancamento_exato_em_pagas),
                "valor": sum(float(r['valor_total']) for r in com_lancamento_exato_em_pagas),
                "amostra": com_lancamento_exato_em_pagas[:30]
            },
            "titulos_nao_filtrados_corretamente": {
                "descricao": "Títulos onde lancamento exato bate em pagas mas NOT EXISTS por titulo+parcela NAO exclui",
                "quantidade": len(nao_filtrados),
                "valor": sum(float(r['valor_total']) for r in nao_filtrados),
                "dados": nao_filtrados
            },
            "amostra_titulos_no_dashboard": titulos_dashboard[:30],
            "duplicatas": duplicatas_info,
            "por_id_documento": docs_info,
            "por_centro_custo": por_cc
        }
    finally:
        cursor.close()
        conn.close()

@app.get("/api/debug/diferenca-pbi")
def debug_diferenca_pbi(admin: dict = Depends(require_admin)):
    """Endpoint de debug para investigar diferença entre dashboard e Power BI no Total a Pagar"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)
        excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""

        # Total atual do dashboard (com NOT EXISTS por lancamento exato)
        cursor.execute(f"""
            SELECT COALESCE(SUM(cap.valor_total), 0) as total, COUNT(*) as qtd
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE 1=1{excl_where}
        """, excl_params)
        dashboard_total = cursor.fetchone()

        # Total SEM o filtro NOT EXISTS (para comparação)
        excl_conds_sem, excl_params_sem = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=False)
        excl_where_sem = (" AND " + " AND ".join(excl_conds_sem)) if excl_conds_sem else ""
        cursor.execute(f"""
            SELECT COALESCE(SUM(cap.valor_total), 0) as total, COUNT(*) as qtd
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE 1=1{excl_where_sem}
        """, excl_params_sem)
        sem_filtro = cursor.fetchone()

        # Títulos que NÃO batem por lancamento exato mas batem por titulo base (SPLIT_PART)
        cursor.execute(f"""
            SELECT cap.lancamento, cap.numero_parcela, cap.valor_total, cap.credor,
                   cap.data_vencimento, TRIM(cap.id_documento) as id_documento,
                   TRIM(cap.id_origem) as id_origem
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE NOT EXISTS (SELECT 1 FROM contas_pagas cpg WHERE cpg.lancamento = cap.lancamento)
              AND EXISTS (SELECT 1 FROM contas_pagas cpg WHERE SPLIT_PART(cpg.lancamento, '/', 1) = SPLIT_PART(cap.lancamento, '/', 1))
              {excl_where_sem.replace('1=1 AND ', '') if excl_where_sem else ''}
            ORDER BY cap.valor_total DESC
            LIMIT 50
        """, excl_params_sem)
        parciais = [dict(r) for r in cursor.fetchall()]

        # Soma dos parciais
        cursor.execute(f"""
            SELECT COALESCE(SUM(cap.valor_total), 0) as total, COUNT(*) as qtd
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE NOT EXISTS (SELECT 1 FROM contas_pagas cpg WHERE cpg.lancamento = cap.lancamento)
              AND EXISTS (SELECT 1 FROM contas_pagas cpg WHERE SPLIT_PART(cpg.lancamento, '/', 1) = SPLIT_PART(cap.lancamento, '/', 1))
              {excl_where_sem.replace('1=1 AND ', '') if excl_where_sem else ''}
        """, excl_params_sem)
        parciais_total = cursor.fetchone()

        return {
            "dashboard_total_com_filtro": {"valor": float(dashboard_total['total']), "qtd": dashboard_total['qtd']},
            "total_sem_filtro_pagas": {"valor": float(sem_filtro['total']), "qtd": sem_filtro['qtd']},
            "diferenca_filtro": float(sem_filtro['total']) - float(dashboard_total['total']),
            "titulos_parcialmente_pagos": {
                "descricao": "Títulos onde lancamento exato não bate mas titulo base (antes do /) existe em contas_pagas",
                "valor_total": float(parciais_total['total']),
                "quantidade": parciais_total['qtd'],
                "amostra": parciais[:20]
            }
        }
    finally:
        cursor.close()
        conn.close()

@app.get("/api/debug/exclusoes")
def debug_exclusoes(admin: dict = Depends(require_admin)):
    """Endpoint de debug para verificar exclusões ativas e qual banco de config está sendo usado"""
    exclusoes = get_exclusoes()
    # Testa conexão config e identifica o tipo
    config_db_type = "desconhecido"
    config_db_ok = False
    try:
        conn = get_config_db_connection()
        if hasattr(conn, '_conn'):  # SQLite wrapper
            config_db_type = f"SQLite ({CONFIG_SQLITE_PATH})"
        else:
            config_db_type = f"PostgreSQL"
        # Testa uma query simples
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM config_tipos_documento_excluidos")
        row = cursor.fetchone()
        config_db_ok = True
        total_in_table = row['cnt'] if row else 0
        cursor.close()
        conn.close()
    except Exception as e:
        config_db_type += f" (ERRO: {e})"
        total_in_table = -1

    return {
        "config_db_url_set": bool(CONFIG_DB_URL),
        "config_db_url_preview": (CONFIG_DB_URL[:40] + "...") if CONFIG_DB_URL else None,
        "config_use_postgres": _CONFIG_USE_POSTGRES,
        "config_db_type_actual": config_db_type,
        "config_db_ok": config_db_ok,
        "total_tipos_doc_na_tabela": total_in_table,
        "exclusoes": exclusoes,
        "total_tipos_documento": len(exclusoes['tipos_documento']),
        "total_empresas": len(exclusoes['empresas']),
        "total_centros_custo": len(exclusoes['centros_custo']),
        "total_contas_correntes": len(exclusoes['contas_correntes']),
    }

@app.get("/api/configuracoes")
def get_configuracoes():
    """Retorna todas as configurações de exclusão. Retorna listas vazias se as tabelas não existirem."""
    empty = {
        'empresas_excluidas': [], 'centros_custo_excluidos': [],
        'tipos_documento_excluidos': [], 'contas_correntes_excluidas': []
    }
    try:
        conn = get_config_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT id_sienge_empresa, nome_empresa FROM config_empresas_excluidas ORDER BY nome_empresa")
            empresas_excluidas = cursor.fetchall()
            cursor.execute("SELECT id_interno_centrocusto, nome_centrocusto FROM config_centros_custo_excluidos ORDER BY nome_centrocusto")
            centros_excluidos = cursor.fetchall()
            cursor.execute("SELECT id_documento, nome_documento FROM config_tipos_documento_excluidos ORDER BY nome_documento")
            tipos_doc_excluidos = cursor.fetchall()
            cursor.execute("SELECT id_conta_corrente, nome_conta_corrente FROM config_contas_correntes_excluidas ORDER BY nome_conta_corrente")
            contas_correntes_excluidas = cursor.fetchall()
            return {
                'empresas_excluidas': [dict(r) for r in empresas_excluidas],
                'centros_custo_excluidos': [dict(r) for r in centros_excluidos],
                'tipos_documento_excluidos': [dict(r) for r in tipos_doc_excluidos],
                'contas_correntes_excluidas': [dict(r) for r in contas_correntes_excluidas]
            }
        except Exception as e:
            print(f"Aviso: tabelas de config não encontradas ({e}). Retornando vazio.")
            return empty
        finally:
            cursor.close()
            conn.close()
    except Exception as e:
        print(f"Erro ao conectar para config: {e}")
        return empty

@app.post("/api/configuracoes/empresas")
def toggle_empresa_exclusao(data: dict):
    id_sienge_empresa = data.get('id_sienge_empresa')
    nome_empresa = data.get('nome_empresa', '')
    excluir = data.get('excluir', True)
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        if excluir:
            cursor.execute(
                "INSERT INTO config_empresas_excluidas (id_sienge_empresa, nome_empresa) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (id_sienge_empresa, nome_empresa)
            )
        else:
            cursor.execute("DELETE FROM config_empresas_excluidas WHERE id_sienge_empresa = %s", (id_sienge_empresa,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        print(f"[ERRO] toggle_empresa_exclusao: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao salvar configuração: {str(e)}")
    finally:
        cursor.close()
        conn.close()

@app.get("/api/feriados")
def get_feriados(ano: int = None):
    """Retorna lista de feriados cadastrados. Se ano informado, filtra por ano."""
    try:
        conn = get_config_db_connection()
        cursor = conn.cursor()
        try:
            if ano:
                cursor.execute("SELECT id, data, descricao FROM config_feriados WHERE EXTRACT(YEAR FROM data) = %s ORDER BY data", (ano,))
            else:
                cursor.execute("SELECT id, data, descricao FROM config_feriados ORDER BY data")
            feriados = cursor.fetchall()
            return [dict(r) for r in feriados]
        except Exception as e:
            print(f"[WARN] Tabela config_feriados não encontrada: {e}")
            return []
        finally:
            cursor.close()
            conn.close()
    except Exception as e:
        print(f"[ERRO] get_feriados: {e}")
        return []

@app.post("/api/feriados")
def add_feriado(data: dict):
    """Adiciona um feriado."""
    data_feriado = data.get('data')
    descricao = data.get('descricao', '')
    if not data_feriado or not descricao:
        raise HTTPException(status_code=400, detail="data e descricao são obrigatórios")
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO config_feriados (data, descricao) VALUES (%s, %s) ON CONFLICT (data) DO UPDATE SET descricao = %s",
            (data_feriado, descricao, descricao)
        )
        conn.commit()
        return {"success": True}
    except Exception as e:
        print(f"[ERRO] add_feriado: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao salvar feriado: {str(e)}")
    finally:
        cursor.close()
        conn.close()

@app.delete("/api/feriados/{feriado_id}")
def delete_feriado(feriado_id: int):
    """Remove um feriado."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM config_feriados WHERE id = %s", (feriado_id,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        print(f"[ERRO] delete_feriado: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao remover feriado: {str(e)}")
    finally:
        cursor.close()
        conn.close()

@app.get("/api/configuracoes/titulos-incc-manual")
def get_titulos_incc_manual(cliente: str):
    """Retorna lista de títulos marcados para cálculo INCC manual"""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT titulo FROM config_titulos_incc_manual WHERE cliente = %s", (cliente,))
        rows = cursor.fetchall()
        return {"titulos": [r['titulo'] for r in rows]}
    except Exception as e:
        print(f"[ERRO] get_titulos_incc_manual: {e}")
        return {"titulos": []}
    finally:
        cursor.close()
        conn.close()

@app.post("/api/configuracoes/titulos-incc-manual")
def toggle_titulo_incc_manual(data: dict):
    """Marca/desmarca um título para usar cálculo INCC manual"""
    cliente = data.get('cliente')
    titulo = data.get('titulo')
    manual = data.get('manual', True)
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        if manual:
            cursor.execute(
                "INSERT INTO config_titulos_incc_manual (cliente, titulo) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (cliente, titulo)
            )
        else:
            cursor.execute("DELETE FROM config_titulos_incc_manual WHERE cliente = %s AND titulo = %s", (cliente, titulo))
        conn.commit()
        return {"success": True}
    except Exception as e:
        print(f"[ERRO] toggle_titulo_incc_manual: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao salvar configuração: {str(e)}")
    finally:
        cursor.close()
        conn.close()

@app.post("/api/configuracoes/centros-custo")
def toggle_centro_custo_exclusao(data: dict):
    id_interno = data.get('id_interno_centrocusto')
    nome = data.get('nome_centrocusto', '')
    excluir = data.get('excluir', True)
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        if excluir:
            cursor.execute(
                "INSERT INTO config_centros_custo_excluidos (id_interno_centrocusto, nome_centrocusto) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (id_interno, nome)
            )
        else:
            cursor.execute("DELETE FROM config_centros_custo_excluidos WHERE id_interno_centrocusto = %s", (id_interno,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        print(f"[ERRO] toggle_centro_custo_exclusao: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao salvar configuração: {str(e)}")
    finally:
        cursor.close()
        conn.close()

@app.post("/api/configuracoes/tipos-documento")
def toggle_tipo_documento_exclusao(data: dict):
    id_documento = data.get('id_documento')
    nome_documento = data.get('nome_documento', '')
    excluir = data.get('excluir', True)
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        if excluir:
            cursor.execute(
                "INSERT INTO config_tipos_documento_excluidos (id_documento, nome_documento) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (id_documento, nome_documento)
            )
        else:
            cursor.execute("DELETE FROM config_tipos_documento_excluidos WHERE id_documento = %s", (id_documento,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        print(f"[ERRO] toggle_tipo_documento_exclusao: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao salvar configuração: {str(e)}")
    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/todas-empresas")
def get_todas_empresas():
    """Retorna TODAS as empresas (sem filtro de exclusões) — usado na página de Configurações."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT DISTINCT id_sienge_empresa, nome_empresa
            FROM dim_centrocusto
            WHERE id_sienge_empresa IS NOT NULL AND nome_empresa IS NOT NULL
            ORDER BY nome_empresa
        """)
        rows = cursor.fetchall()
        return [{'id': row['id_sienge_empresa'], 'nome': row['nome_empresa']} for row in rows]
    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/todos-centros-custo")
def get_todos_centros_custo():
    """Retorna TODOS os centros de custo (sem filtro de exclusões) — usado na página de Configurações."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id_interno_centrocusto, nome_centrocusto, id_sienge_empresa
            FROM dim_centrocusto
            WHERE id_interno_centrocusto IS NOT NULL AND nome_centrocusto IS NOT NULL
            ORDER BY nome_centrocusto
        """)
        rows = cursor.fetchall()
        return [{'id': row['id_interno_centrocusto'], 'nome': row['nome_centrocusto'], 'id_empresa': row['id_sienge_empresa']} for row in rows]
    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/todos-tipos-documento")
def get_todos_tipos_documento():
    """Retorna TODOS os tipos de documento (sem filtro de exclusões) — usado na página de Configurações."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT DISTINCT TRIM(id_documento) as id_documento, nome_documento
            FROM ecaddocumento
            WHERE id_documento IS NOT NULL AND TRIM(id_documento) != ''
            ORDER BY id_documento
        """)
        rows = cursor.fetchall()
        return [{'id': row['id_documento'], 'nome': row['nome_documento']} for row in rows]
    except Exception:
        return []
    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/todas-contas-correntes")
def get_todas_contas_correntes():
    """Retorna TODAS as contas correntes (sem filtro) — usado na página de Configurações."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT DISTINCT id_conta_corrente, nome_conta_corrente, id_interno_empresa
            FROM ecadcontacorrente
            WHERE id_conta_corrente IS NOT NULL
            ORDER BY nome_conta_corrente
        """)
        rows = cursor.fetchall()
        return [{"id": row['id_conta_corrente'], "nome": row['nome_conta_corrente'], "empresa_id": row['id_interno_empresa']} for row in rows]
    except Exception:
        return []
    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/origens-titulo")
def get_origens_titulo():
    """Retorna lista completa de origens de título da tabela ecadorigemtitulo."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id_origem_titulo, sigla, descricao
            FROM ecadorigemtitulo
            ORDER BY id_origem_titulo
        """)
        rows = cursor.fetchall()
        return [{"id": row['id_origem_titulo'], "sigla": row['sigla'].strip() if row['sigla'] else '', "descricao": row['descricao']} for row in rows]
    except Exception:
        return []
    finally:
        cursor.close()
        conn.close()

@app.get("/api/configuracoes/origens-exposicao")
def get_origens_exposicao():
    """Retorna a configuração de origens para Exposição de Caixa."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id_origem_titulo, sigla, descricao, incluir, paginas FROM config_origens_exposicao_caixa ORDER BY id_origem_titulo")
        rows = cursor.fetchall()
        return [{"id_origem_titulo": r['id_origem_titulo'], "sigla": r['sigla'], "descricao": r['descricao'], "incluir": bool(r['incluir']), "paginas": r['paginas']} for r in rows]
    except Exception:
        return []
    finally:
        cursor.close()
        conn.close()

@app.post("/api/configuracoes/origens-exposicao/toggle")
def toggle_origem_exposicao(data: dict):
    """Insere ou atualiza a configuração de uma origem para Exposição de Caixa."""
    id_origem_titulo = data.get('id_origem_titulo')
    sigla = data.get('sigla', '')
    descricao = data.get('descricao', '')
    incluir = data.get('incluir', True)
    paginas = data.get('paginas', 'exposicao_caixa')
    if not id_origem_titulo:
        raise HTTPException(status_code=400, detail="id_origem_titulo is required")
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        # Upsert
        cursor.execute("SELECT id FROM config_origens_exposicao_caixa WHERE id_origem_titulo = %s", (id_origem_titulo,))
        row = cursor.fetchone()
        if row:
            cursor.execute(
                "UPDATE config_origens_exposicao_caixa SET incluir = %s, paginas = %s WHERE id_origem_titulo = %s",
                (incluir, paginas, id_origem_titulo)
            )
        else:
            cursor.execute(
                "INSERT INTO config_origens_exposicao_caixa (id_origem_titulo, sigla, descricao, incluir, paginas) VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                (id_origem_titulo, sigla, descricao, incluir, paginas)
            )
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.get("/api/configuracoes/origens-exposicao-caixa-siglas")
def get_origens_exposicao_caixa_siglas():
    """Retorna as siglas das origens marcadas como incluir=true para exposicao_caixa.
    Retorna lista vazia se nenhuma configuração existir (sem filtro aplicado)."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) as cnt FROM config_origens_exposicao_caixa")
        row = cursor.fetchone()
        if not row or int(row['cnt']) == 0:
            return {"siglas": [], "configurado": False}
        cursor.execute(
            "SELECT sigla FROM config_origens_exposicao_caixa WHERE incluir = %s AND paginas LIKE %s",
            (True, '%exposicao_caixa%')
        )
        rows = cursor.fetchall()
        return {"siglas": [r['sigla'] for r in rows], "configurado": True}
    except Exception:
        return {"siglas": [], "configurado": False}
    finally:
        cursor.close()
        conn.close()

# ============ TIPOS DE BAIXA — Exposição de Caixa ============

@app.get("/api/filtros/tipos-baixa-completo")
def get_tipos_baixa_completo():
    """Retorna lista completa de tipos de baixa da tabela ecadtipobaixa."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id_tipo_baixa, nome_tipo_baixa, flag_sistema_uso, descricao_relatorio
            FROM ecadtipobaixa
            ORDER BY id_tipo_baixa
        """)
        rows = cursor.fetchall()
        return [{"id": row['id_tipo_baixa'], "nome": row['nome_tipo_baixa'], "flag": (row['flag_sistema_uso'] or '').strip(), "descricao": row['descricao_relatorio']} for row in rows]
    except Exception:
        return []
    finally:
        cursor.close()
        conn.close()

@app.get("/api/configuracoes/tipos-baixa-exposicao")
def get_tipos_baixa_exposicao():
    """Retorna a configuração de tipos de baixa para Exposição de Caixa."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id_tipo_baixa, nome_tipo_baixa, flag_sistema_uso, incluir, paginas FROM config_tipos_baixa_exposicao_caixa ORDER BY id_tipo_baixa")
        rows = cursor.fetchall()
        return [{"id_tipo_baixa": r['id_tipo_baixa'], "nome_tipo_baixa": r['nome_tipo_baixa'], "flag_sistema_uso": r['flag_sistema_uso'], "incluir": bool(r['incluir']), "paginas": r['paginas']} for r in rows]
    except Exception:
        return []
    finally:
        cursor.close()
        conn.close()

@app.post("/api/configuracoes/tipos-baixa-exposicao/toggle")
def toggle_tipo_baixa_exposicao(data: dict):
    """Insere ou atualiza a configuração de um tipo de baixa para Exposição de Caixa."""
    id_tipo_baixa = data.get('id_tipo_baixa')
    nome_tipo_baixa = data.get('nome_tipo_baixa', '')
    flag_sistema_uso = data.get('flag_sistema_uso', '')
    incluir = data.get('incluir', True)
    paginas = data.get('paginas', 'exposicao_caixa')
    if not id_tipo_baixa:
        raise HTTPException(status_code=400, detail="id_tipo_baixa is required")
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM config_tipos_baixa_exposicao_caixa WHERE id_tipo_baixa = %s", (id_tipo_baixa,))
        row = cursor.fetchone()
        if row:
            cursor.execute(
                "UPDATE config_tipos_baixa_exposicao_caixa SET incluir = %s, paginas = %s WHERE id_tipo_baixa = %s",
                (incluir, paginas, id_tipo_baixa)
            )
        else:
            cursor.execute(
                "INSERT INTO config_tipos_baixa_exposicao_caixa (id_tipo_baixa, nome_tipo_baixa, flag_sistema_uso, incluir, paginas) VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                (id_tipo_baixa, nome_tipo_baixa, flag_sistema_uso, incluir, paginas)
            )
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.post("/api/configuracoes/tipos-baixa-seed-contas-pagas")
def seed_tipos_baixa_contas_pagas():
    """Configura tipos de baixa para contas_pagas: inclui Pagamento(1) e Adiantamento(10)"""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        tipos = [
            (1, 'Pagamento', 'P', True, 'contas_pagas'),
            (10, 'Adiantamento', 'A', True, 'contas_pagas'),
        ]
        for t in tipos:
            cursor.execute("SELECT id FROM config_tipos_baixa_exposicao_caixa WHERE id_tipo_baixa = %s", (t[0],))
            row = cursor.fetchone()
            if row:
                cursor.execute(
                    "UPDATE config_tipos_baixa_exposicao_caixa SET incluir = %s, paginas = %s WHERE id_tipo_baixa = %s",
                    (True, t[4], t[0])
                )
            else:
                cursor.execute(
                    "INSERT INTO config_tipos_baixa_exposicao_caixa (id_tipo_baixa, nome_tipo_baixa, flag_sistema_uso, incluir, paginas) VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    t
                )
        conn.commit()
        return {"success": True, "configurados": ["1-Pagamento", "10-Adiantamento"]}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.get("/api/configuracoes/tipos-baixa-exposicao-caixa-ids")
def get_tipos_baixa_exposicao_caixa_ids():
    """Retorna os IDs dos tipos de baixa marcados como incluir=true para exposicao_caixa.
    Retorna lista vazia se nenhuma configuração existir (sem filtro aplicado)."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) as cnt FROM config_tipos_baixa_exposicao_caixa")
        row = cursor.fetchone()
        if not row or int(row['cnt']) == 0:
            return {"ids": [], "configurado": False}
        cursor.execute(
            "SELECT id_tipo_baixa FROM config_tipos_baixa_exposicao_caixa WHERE incluir = %s AND paginas LIKE %s",
            (True, '%exposicao_caixa%')
        )
        rows = cursor.fetchall()
        return {"ids": [r['id_tipo_baixa'] for r in rows], "configurado": True}
    except Exception:
        return {"ids": [], "configurado": False}
    finally:
        cursor.close()
        conn.close()

@app.get("/api/filtros/contas-correntes")
def get_filtro_contas_correntes():
    """Retorna contas correntes ativas (excluindo as marcadas nas configurações)"""
    exclusoes = get_exclusoes()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conditions = []
        params = []
        if exclusoes['contas_correntes']:
            placeholders = ','.join(['%s'] * len(exclusoes['contas_correntes']))
            conditions.append(f"id_conta_corrente NOT IN ({placeholders})")
            params.extend(exclusoes['contas_correntes'])
        if exclusoes['empresas']:
            placeholders = ','.join(['%s'] * len(exclusoes['empresas']))
            conditions.append(f"id_interno_empresa NOT IN ({placeholders})")
            params.extend(exclusoes['empresas'])
        where_clause = (" WHERE " + " AND ".join(conditions)) if conditions else ""
        cursor.execute(f"""
            SELECT DISTINCT id_conta_corrente, nome_conta_corrente, id_interno_empresa
            FROM ecadcontacorrente
            {where_clause}
            ORDER BY nome_conta_corrente
        """, params)
        rows = cursor.fetchall()
        return [{"id": row['id_conta_corrente'], "nome": row['nome_conta_corrente'], "empresa_id": row['id_interno_empresa']} for row in rows]
    finally:
        cursor.close()
        conn.close()

@app.post("/api/configuracoes/contas-correntes")
def toggle_conta_corrente_exclusao(data: dict):
    id_conta_corrente = data.get('id_conta_corrente')
    if not id_conta_corrente:
        return {"success": False, "error": "id_conta_corrente is required"}
    nome_conta_corrente = data.get('nome_conta_corrente', '')
    excluir = data.get('excluir', True)
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        if excluir:
            cursor.execute(
                "INSERT INTO config_contas_correntes_excluidas (id_conta_corrente, nome_conta_corrente) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (id_conta_corrente, nome_conta_corrente)
            )
        else:
            cursor.execute("DELETE FROM config_contas_correntes_excluidas WHERE id_conta_corrente = %s", (id_conta_corrente,))
        conn.commit()
        return {"success": True}
    finally:
        cursor.close()
        conn.close()

# ============ SNAPSHOTS CARDS A PAGAR ============

@app.post("/api/snapshots/cards-pagar")
def salvar_snapshot_cards_pagar(dados: dict):
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cards = dados.get('cards', [])
        if not cards:
            raise HTTPException(status_code=400, detail="Nenhum card fornecido")
        data_snapshot = dados.get('data_snapshot', datetime.now().strftime('%Y-%m-%d'))
        for card in cards:
            cursor.execute("""
                INSERT INTO snapshots_cards_pagar (data_snapshot, faixa, data_inicio, data_fim, valor_total, quantidade_titulos, quantidade_credores)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (data_snapshot, faixa) DO UPDATE SET
                    valor_total = EXCLUDED.valor_total,
                    quantidade_titulos = EXCLUDED.quantidade_titulos,
                    quantidade_credores = EXCLUDED.quantidade_credores,
                    data_inicio = EXCLUDED.data_inicio,
                    data_fim = EXCLUDED.data_fim,
                    created_at = CURRENT_TIMESTAMP
            """, (
                data_snapshot, card['faixa'], card.get('data_inicio'), card.get('data_fim'),
                card['valor_total'], card['quantidade_titulos'], card['quantidade_credores']
            ))
        conn.commit()
        return {"success": True, "message": f"Snapshot salvo para {data_snapshot}", "data_snapshot": data_snapshot}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.get("/api/snapshots/cards-pagar")
def listar_snapshots_cards_pagar():
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT data_snapshot, MIN(created_at) as created_at
            FROM snapshots_cards_pagar
            GROUP BY data_snapshot
            ORDER BY data_snapshot DESC
            LIMIT 30
        """)
        rows = cursor.fetchall()
        return [{'data_snapshot': r['data_snapshot'].strftime('%Y-%m-%d') if hasattr(r['data_snapshot'], 'strftime') else str(r['data_snapshot']), 'created_at': str(r['created_at'])} for r in rows]
    finally:
        cursor.close()
        conn.close()

@app.get("/api/snapshots/cards-pagar/{data}")
def get_snapshot_cards_pagar(data: str):
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT faixa, data_inicio, data_fim, valor_total, quantidade_titulos, quantidade_credores, data_snapshot
            FROM snapshots_cards_pagar
            WHERE data_snapshot = %s
            ORDER BY faixa
        """, (data,))
        rows = cursor.fetchall()
        if not rows:
            raise HTTPException(status_code=404, detail="Snapshot não encontrado")
        cards = {}
        for r in rows:
            cards[r['faixa']] = {
                'faixa': r['faixa'],
                'data_inicio': r['data_inicio'].strftime('%Y-%m-%d') if r['data_inicio'] else None,
                'data_fim': r['data_fim'].strftime('%Y-%m-%d') if r['data_fim'] else None,
                'valor_total': float(r['valor_total']),
                'quantidade_titulos': r['quantidade_titulos'],
                'quantidade_credores': r['quantidade_credores']
            }
        return {'data_snapshot': data, 'cards': cards}
    finally:
        cursor.close()
        conn.close()

# ============ SNAPSHOT DETALHADO (TÍTULOS INDIVIDUAIS) ============

@app.post("/api/snapshots/titulos-pagar")
def salvar_snapshot_titulos(dados: dict):
    """Salva títulos individuais de um snapshot"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        data_snapshot = dados.get('data_snapshot')
        titulos = dados.get('titulos', [])
        # Limpa títulos anteriores do mesmo dia
        cursor.execute("DELETE FROM snapshots_titulos_pagar WHERE data_snapshot = %s", (data_snapshot,))
        for t in titulos:
            cursor.execute("""
                INSERT INTO snapshots_titulos_pagar (data_snapshot, lancamento, credor, valor_total, data_vencimento, data_cadastro, id_documento, nome_centrocusto)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (data_snapshot, lancamento) DO UPDATE SET
                    credor = EXCLUDED.credor, valor_total = EXCLUDED.valor_total,
                    data_vencimento = EXCLUDED.data_vencimento, data_cadastro = EXCLUDED.data_cadastro,
                    id_documento = EXCLUDED.id_documento, nome_centrocusto = EXCLUDED.nome_centrocusto
            """, (data_snapshot, t.get('lancamento'), t.get('credor'), t.get('valor_total'),
                  t.get('data_vencimento'), t.get('data_cadastro'), t.get('id_documento'), t.get('nome_centrocusto')))
        conn.commit()
        return {"success": True, "titulos_salvos": len(titulos)}
    finally:
        cursor.close()
        conn.close()


@app.get("/api/snapshots/titulos-pagar/{data}")
def get_snapshot_titulos(data: str):
    """Retorna títulos individuais de um snapshot"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT lancamento, credor, valor_total, data_vencimento, data_cadastro, id_documento, nome_centrocusto
            FROM snapshots_titulos_pagar WHERE data_snapshot = %s ORDER BY data_vencimento
        """, (data,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        cursor.close()
        conn.close()


@app.get("/api/snapshots/comparar/{data}")
def comparar_snapshot(data: str):
    """Compara snapshot salvo com dados atuais"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Busca títulos do snapshot
        cursor.execute("""
            SELECT lancamento, credor, valor_total, data_vencimento, data_cadastro, id_documento, nome_centrocusto
            FROM snapshots_titulos_pagar WHERE data_snapshot = %s
        """, (data,))
        snap_rows = cursor.fetchall()
        snap_map = {r['lancamento']: dict(r) for r in snap_rows if r['lancamento']}

        # Busca títulos atuais
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)
        excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""
        cursor.execute(f"""
            SELECT cap.lancamento, cap.credor, cap.valor_total, cap.data_vencimento, cap.data_cadastro,
                   TRIM(cap.id_documento) as id_documento, cc.nome_centrocusto
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE 1=1{excl_where}
        """, excl_params)
        atual_rows = cursor.fetchall()
        atual_map = {r['lancamento']: dict(r) for r in atual_rows if r['lancamento']}

        adicionados = []
        removidos = []
        alterados = []

        for lanc, atual in atual_map.items():
            if lanc not in snap_map:
                adicionados.append(atual)
            else:
                snap = snap_map[lanc]
                if abs(float(atual.get('valor_total') or 0) - float(snap.get('valor_total') or 0)) > 0.01:
                    alterados.append({**atual, 'valor_anterior': float(snap.get('valor_total') or 0)})

        for lanc, snap in snap_map.items():
            if lanc not in atual_map:
                removidos.append(snap)

        return {
            'data_snapshot': data,
            'adicionados': adicionados,
            'removidos': removidos,
            'alterados': alterados,
            'resumo': {
                'qtd_adicionados': len(adicionados),
                'valor_adicionados': sum(float(a.get('valor_total') or 0) for a in adicionados),
                'qtd_removidos': len(removidos),
                'valor_removidos': sum(float(r.get('valor_total') or 0) for r in removidos),
                'qtd_alterados': len(alterados),
            }
        }
    finally:
        cursor.close()
        conn.close()


# ============ SNAPSHOT SCHEDULE CONFIG ============

@app.get("/api/configuracoes/snapshot-horario")
def get_snapshot_horario():
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT horario, ativo, updated_at FROM config_snapshot_horario ORDER BY id LIMIT 1")
        row = cursor.fetchone()
        if not row:
            return {'horario': '07:00', 'ativo': True}
        return {'horario': row['horario'], 'ativo': bool(row['ativo']), 'updated_at': str(row['updated_at'])}
    finally:
        cursor.close()
        conn.close()

@app.post("/api/configuracoes/snapshot-horario")
def set_snapshot_horario(dados: dict):
    horario = dados.get('horario', '07:00')
    ativo = dados.get('ativo', True)
    import re
    if not re.match(r'^\d{2}:\d{2}$', horario):
        raise HTTPException(status_code=400, detail="Formato de horario invalido. Use HH:MM")
    try:
        h, m = map(int, horario.split(':'))
        if h < 0 or h > 23 or m < 0 or m > 59:
            raise ValueError()
    except:
        raise HTTPException(status_code=400, detail="Horario invalido. Use valores entre 00:00 e 23:59")
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM config_snapshot_horario ORDER BY id LIMIT 1")
        row = cursor.fetchone()
        if row:
            cursor.execute(
                "UPDATE config_snapshot_horario SET horario = %s, ativo = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                (horario, ativo, row['id'])
            )
        else:
            cursor.execute("INSERT INTO config_snapshot_horario (horario, ativo) VALUES (%s, %s)", (horario, ativo))
        conn.commit()
        return {"success": True, "horario": horario, "ativo": ativo}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

# ============ AUTO-SNAPSHOT BACKGROUND THREAD ============

def _get_snapshot_config():
    try:
        conn = get_config_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT horario, ativo FROM config_snapshot_horario ORDER BY id LIMIT 1")
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        if row:
            return {'horario': row['horario'], 'ativo': bool(row['ativo'])}
        return {'horario': '07:00', 'ativo': True}
    except Exception as e:
        print(f"Erro ao ler config snapshot: {e}")
        return None

def _snapshot_already_exists_today():
    try:
        conn = get_config_db_connection()
        cursor = conn.cursor()
        hoje = (datetime.utcnow() - timedelta(hours=3)).strftime('%Y-%m-%d')
        cursor.execute("SELECT COUNT(*) as cnt FROM snapshots_cards_pagar WHERE data_snapshot = %s", (hoje,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return row['cnt'] > 0
    except Exception as e:
        print(f"Erro ao verificar snapshot: {e}")
        return True

def _calcular_e_salvar_snapshot_auto():
    try:
        print("Auto-snapshot: Calculando valores dos cards...")
        hoje = (datetime.utcnow() - timedelta(hours=3)).date()
        amanha = hoje + timedelta(days=1)
        fim7 = hoje + timedelta(days=7)
        fim15 = hoje + timedelta(days=15)
        fim30 = hoje + timedelta(days=30)

        exclusoes = get_exclusoes()

        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cap', exclude_paid=True)
        excl_where = (" AND " + " AND ".join(excl_conds)) if excl_conds else ""

        conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
        cursor = conn.cursor()
        query = f"""
            SELECT cap.lancamento, cap.credor, cap.data_vencimento, cap.valor_total,
                   cap.data_cadastro, cap.id_documento, cc.nome_centrocusto
            FROM contas_a_pagar cap
            LEFT JOIN dim_centrocusto cc ON cap.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE cap.data_vencimento >= %s{excl_where}
            ORDER BY cap.data_vencimento ASC
        """
        cursor.execute(query, [hoje] + excl_params)
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        total_valor = 0
        total_titulos = 0
        credores_total = set()
        hoje_valor = 0
        hoje_titulos = 0
        credores_hoje = set()
        d7_valor = 0
        d7_titulos = 0
        credores_7 = set()
        d15_valor = 0
        d15_titulos = 0
        credores_15 = set()
        d30_valor = 0
        d30_titulos = 0
        credores_30 = set()

        for r in rows:
            venc = r['data_vencimento']
            if isinstance(venc, str):
                venc = datetime.strptime(venc.split('T')[0], '%Y-%m-%d').date()
            valor = float(r['valor_total'] or 0)
            credor = r['credor']

            total_valor += valor
            total_titulos += 1
            credores_total.add(credor)

            diff = (venc - hoje).days
            if diff == 0:
                hoje_valor += valor
                hoje_titulos += 1
                credores_hoje.add(credor)
            if 1 <= diff <= 7:
                d7_valor += valor
                d7_titulos += 1
                credores_7.add(credor)
            if 1 <= diff <= 15:
                d15_valor += valor
                d15_titulos += 1
                credores_15.add(credor)
            if 1 <= diff <= 30:
                d30_valor += valor
                d30_titulos += 1
                credores_30.add(credor)

        cards = [
            {'faixa': 'total', 'data_inicio': None, 'data_fim': None, 'valor_total': total_valor, 'quantidade_titulos': total_titulos, 'quantidade_credores': len(credores_total)},
            {'faixa': 'hoje', 'data_inicio': hoje.isoformat(), 'data_fim': hoje.isoformat(), 'valor_total': hoje_valor, 'quantidade_titulos': hoje_titulos, 'quantidade_credores': len(credores_hoje)},
            {'faixa': '7dias', 'data_inicio': amanha.isoformat(), 'data_fim': fim7.isoformat(), 'valor_total': d7_valor, 'quantidade_titulos': d7_titulos, 'quantidade_credores': len(credores_7)},
            {'faixa': '15dias', 'data_inicio': amanha.isoformat(), 'data_fim': fim15.isoformat(), 'valor_total': d15_valor, 'quantidade_titulos': d15_titulos, 'quantidade_credores': len(credores_15)},
            {'faixa': '30dias', 'data_inicio': amanha.isoformat(), 'data_fim': fim30.isoformat(), 'valor_total': d30_valor, 'quantidade_titulos': d30_titulos, 'quantidade_credores': len(credores_30)},
        ]

        sconn = get_db_connection()
        scursor = sconn.cursor()
        data_snapshot = hoje.isoformat()
        for card in cards:
            scursor.execute("""
                INSERT INTO snapshots_cards_pagar (data_snapshot, faixa, data_inicio, data_fim, valor_total, quantidade_titulos, quantidade_credores)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (data_snapshot, faixa)
                DO UPDATE SET valor_total = EXCLUDED.valor_total,
                              quantidade_titulos = EXCLUDED.quantidade_titulos,
                              quantidade_credores = EXCLUDED.quantidade_credores,
                              data_inicio = EXCLUDED.data_inicio,
                              data_fim = EXCLUDED.data_fim
            """, (
                data_snapshot,
                card['faixa'],
                card.get('data_inicio'),
                card.get('data_fim'),
                card['valor_total'],
                card['quantidade_titulos'],
                card['quantidade_credores']
            ))
        sconn.commit()
        scursor.close()
        sconn.close()
        print(f"Auto-snapshot: Cards salvos para {data_snapshot}")

        # Salvar títulos individuais
        try:
            tconn = get_db_connection()
            tcursor = tconn.cursor()
            tcursor.execute("DELETE FROM snapshots_titulos_pagar WHERE data_snapshot = %s", (data_snapshot,))
            for r in rows:
                venc = r['data_vencimento']
                if isinstance(venc, str):
                    venc = venc.split('T')[0]
                elif hasattr(venc, 'isoformat'):
                    venc = venc.isoformat()
                dcad = r.get('data_cadastro')
                if dcad and isinstance(dcad, str):
                    dcad = dcad.split('T')[0]
                elif dcad and hasattr(dcad, 'isoformat'):
                    dcad = dcad.isoformat()
                tcursor.execute("""
                    INSERT INTO snapshots_titulos_pagar (data_snapshot, lancamento, credor, valor_total, data_vencimento, data_cadastro, id_documento, nome_centrocusto)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (data_snapshot, lancamento) DO UPDATE SET
                        valor_total = EXCLUDED.valor_total,
                        credor = EXCLUDED.credor,
                        data_vencimento = EXCLUDED.data_vencimento
                """, (
                    data_snapshot,
                    r.get('lancamento'),
                    r.get('credor'),
                    float(r.get('valor_total') or 0),
                    venc,
                    dcad,
                    str(r.get('id_documento') or ''),
                    r.get('nome_centrocusto') or ''
                ))
            tconn.commit()
            tcursor.close()
            tconn.close()
            print(f"Auto-snapshot: {len(rows)} títulos individuais salvos para {data_snapshot}")
        except Exception as te:
            print(f"Auto-snapshot: Erro ao salvar títulos individuais: {te}")

        print(f"Auto-snapshot: Snapshot completo salvo com sucesso para {data_snapshot}")
    except Exception as e:
        print(f"Auto-snapshot: Erro ao salvar snapshot: {e}")

def _auto_snapshot_loop():
    time.sleep(10)
    print("Auto-snapshot: Thread iniciada")
    snapshot_salvo_hoje = None

    # Ao iniciar: se o snapshot de hoje estiver faltando, salva agora
    # (resolve o caso de o backend ter sido fechado antes do horário configurado)
    try:
        config_startup = _get_snapshot_config()
        if config_startup and config_startup['ativo']:
            if not _snapshot_already_exists_today():
                hoje_startup = (datetime.utcnow() - timedelta(hours=3)).strftime('%Y-%m-%d')
                print(f"Auto-snapshot: Snapshot de {hoje_startup} nao encontrado. Salvando ao iniciar...")
                _calcular_e_salvar_snapshot_auto()
                # Também salva snapshot dos KPIs automáticos
                try:
                    criar_snapshot_diario()
                    print("Auto-snapshot: Snapshot de KPIs de startup salvo com sucesso.")
                except Exception as e:
                    print(f"Auto-snapshot: Erro ao salvar snapshot de KPIs no startup: {e}")
                snapshot_salvo_hoje = hoje_startup
                print("Auto-snapshot: Snapshot de startup salvo com sucesso.")
    except Exception as e:
        print(f"Auto-snapshot: Erro no snapshot de startup: {e}")

    while True:
        try:
            config = _get_snapshot_config()
            if not config or not config['ativo']:
                time.sleep(300)
                continue

            agora = datetime.utcnow() - timedelta(hours=3)
            hoje_str = agora.strftime('%Y-%m-%d')

            if snapshot_salvo_hoje == hoje_str:
                time.sleep(300)
                continue

            hora_config = config['horario']
            try:
                hora_alvo, minuto_alvo = map(int, hora_config.split(':'))
            except:
                hora_alvo, minuto_alvo = 7, 0

            hora_atual = agora.hour
            minuto_atual = agora.minute
            minutos_agora = hora_atual * 60 + minuto_atual
            minutos_alvo = hora_alvo * 60 + minuto_alvo

            if minutos_agora >= minutos_alvo:
                if not _snapshot_already_exists_today():
                    _calcular_e_salvar_snapshot_auto()
                    # Também salva snapshot dos KPIs automáticos
                    try:
                        criar_snapshot_diario()
                        print("Auto-snapshot: Snapshot de KPIs salvo com sucesso.")
                    except Exception as e:
                        print(f"Auto-snapshot: Erro ao salvar snapshot de KPIs: {e}")
                snapshot_salvo_hoje = hoje_str

            time.sleep(300)
        except Exception as e:
            print(f"Auto-snapshot: Erro no loop: {e}")
            time.sleep(300)

# ============ EMPREENDIMENTOS CONFIG (Orcamentos) ============

@app.get("/api/configuracoes/empreendimentos")
def get_empreendimentos_config():
    """Lista todos os empreendimentos configurados.
    centro_custo_id = id_sienge_centrocusto (código Sienge).
    centro_custo_id_interno = id_interno_centrocusto (para filtros internos)."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, nome, codigo, centro_custo_id, metragem, fator, vgv_mock, status, criado_por, atualizado_em FROM empreendimentos_config ORDER BY id")
        rows = cursor.fetchall()
        emps = [dict(r) for r in rows]

        # Busca mapeamento Sienge → Interno do banco de dados financeiro
        sienge_ids = [e['centro_custo_id'] for e in emps if e.get('centro_custo_id')]
        sienge_to_interno = {}
        if sienge_ids:
            try:
                pg_conn = get_db_connection()
                pg_cursor = pg_conn.cursor()
                placeholders = ','.join(['%s'] * len(sienge_ids))
                pg_cursor.execute(
                    f"SELECT id_sienge_centrocusto, id_interno_centrocusto FROM dim_centrocusto WHERE id_sienge_centrocusto IN ({placeholders})",
                    sienge_ids
                )
                for r in pg_cursor.fetchall():
                    sienge_to_interno[r['id_sienge_centrocusto']] = r['id_interno_centrocusto']
                pg_cursor.close()
                pg_conn.close()
            except Exception as e:
                print(f"[WARN] Não foi possível mapear Sienge→Interno: {e}")

        for emp in emps:
            cc_sienge = emp.get('centro_custo_id')
            emp['centro_custo_id_interno'] = sienge_to_interno.get(cc_sienge) if cc_sienge else None

        return emps
    except Exception as e:
        print(f"[ERRO] get_empreendimentos_config: {e}")
        return []
    finally:
        cursor.close()
        conn.close()

@app.put("/api/configuracoes/empreendimentos/{emp_id}")
def update_empreendimento_config(emp_id: int, data: dict):
    """Atualiza um empreendimento (metragem, fator, status, vgv_mock, nome, codigo, centro_custo_id)."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        fields = []
        params = []
        for key in ['nome', 'codigo', 'centro_custo_id', 'metragem', 'fator', 'vgv_mock', 'status']:
            if key in data:
                fields.append(f"{key} = %s")
                params.append(data[key])
        if not fields:
            return {"success": False, "detail": "Nenhum campo para atualizar"}
        fields.append("atualizado_em = %s")
        params.append(datetime.now().isoformat())
        params.append(emp_id)
        sql = f"UPDATE empreendimentos_config SET {', '.join(fields)} WHERE id = %s"
        cursor.execute(sql, tuple(params))
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        print(f"[ERRO] update_empreendimento_config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.post("/api/configuracoes/empreendimentos")
def create_empreendimento_config(data: dict):
    """Cria um novo empreendimento."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO empreendimentos_config (nome, codigo, centro_custo_id, metragem, fator, vgv_mock, status, criado_por, atualizado_em) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                data.get('nome', ''),
                data.get('codigo', ''),
                data.get('centro_custo_id'),
                data.get('metragem', 0),
                data.get('fator', 1),
                data.get('vgv_mock', 0),
                data.get('status', 'ativa'),
                data.get('criado_por'),
                datetime.now().isoformat(),
            )
        )
        conn.commit()
        # Return the created record
        cursor.execute("SELECT id, nome, codigo, centro_custo_id, metragem, fator, vgv_mock, status, criado_por, atualizado_em FROM empreendimentos_config ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        return dict(row) if row else {"success": True}
    except Exception as e:
        conn.rollback()
        print(f"[ERRO] create_empreendimento_config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.delete("/api/configuracoes/empreendimentos/{emp_id}")
def delete_empreendimento_config(emp_id: int):
    """Remove um empreendimento."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM empreendimentos_config WHERE id = %s", (emp_id,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        print(f"[ERRO] delete_empreendimento_config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

# ============ REALIZADO POR CENTRO DE CUSTO (para aba Orçamento) ============
# ┌──────────────────────────────────────────────────────────────┐
# │ DOCUMENTAÇÃO: GET /api/realizado-por-centro-custo            │
# ├──────────────────────────────────────────────────────────────┤
# │ FONTE: contas_pagas.valor_liquido                            │
# │ CHAVE: id_sienge_centrocusto (código Sienge, NÃO id interno)│
# │ FILTROS (mesmos da página Contas Pagas):                     │
# │   1. Exclusões gerais (empresas, CCs, docs, contas)          │
# │   2. Origens excluídas (config_origens_exposicao_caixa)      │
# │   3. Tipos baixa permitidos (config_tipos_baixa_exposicao)   │
# │   4. Transferências inter-empresa (credor ≠ nome_empresa)    │
# │ USADO POR: Painel Executivo > Aba Orçamento > col Realizado  │
# │ DEVE BATER COM: Contas Pagas > Líquido Total (mesmo CC)      │
# │ MAPEAMENTO: empreendimentos_config.centro_custo_id =         │
# │   id_sienge_centrocusto (NÃO id_interno_centrocusto)         │
# └──────────────────────────────────────────────────────────────┘

@app.get("/api/realizado-por-centro-custo")
def get_realizado_por_centro_custo():
    """Retorna o total pago (valor_liquido) agrupado por centro de custo (chave = id_sienge).
    Aplica os mesmos filtros da página Contas Pagas (exclusões, origens, tipos_baixa, inter-empresa)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        exclusoes = get_exclusoes()
        excl_conds, excl_params = build_exclusion_conditions(exclusoes, cc_alias='cc', table_alias='cp', has_conta_corrente=True)
        conditions = list(excl_conds)
        params = list(excl_params)

        # Filtros de origens e tipos_baixa da config (mesmo da página Contas Pagas)
        try:
            cfg_conn = get_config_db_connection()
            cfg_cursor = cfg_conn.cursor()
            try:
                cfg_cursor.execute(
                    "SELECT sigla FROM config_origens_exposicao_caixa WHERE incluir = %s OR paginas NOT LIKE %s",
                    (False, '%contas_pagas%')
                )
                origens_excluidas = [r['sigla'].strip().upper() for r in cfg_cursor.fetchall() if r['sigla']]
                if origens_excluidas:
                    oe_ph = ', '.join(['%s'] * len(origens_excluidas))
                    conditions.append(f"TRIM(UPPER(cp.id_origem)) NOT IN ({oe_ph})")
                    params.extend(origens_excluidas)

                cfg_cursor.execute(
                    "SELECT id_tipo_baixa FROM config_tipos_baixa_exposicao_caixa WHERE incluir = 1 AND paginas LIKE %s",
                    ('%contas_pagas%',)
                )
                tipos_baixa_config = [r['id_tipo_baixa'] for r in cfg_cursor.fetchall()]
                if tipos_baixa_config:
                    tb_ph = ', '.join(['%s'] * len(tipos_baixa_config))
                    conditions.append(f"cp.id_tipo_baixa IN ({tb_ph})")
                    params.extend(tipos_baixa_config)
            finally:
                cfg_cursor.close()
                cfg_conn.close()
        except Exception:
            pass

        # Excluir transferências inter-empresa
        try:
            cursor.execute("SELECT DISTINCT TRIM(nome_empresa) as nome FROM dim_centrocusto WHERE nome_empresa IS NOT NULL")
            empresa_names = [r['nome'] for r in cursor.fetchall() if r['nome']]
            if empresa_names:
                en_ph = ', '.join(['%s'] * len(empresa_names))
                conditions.append(f"TRIM(cp.credor) NOT IN ({en_ph})")
                params.extend(empresa_names)
        except Exception:
            pass

        where_clause = (" AND " + " AND ".join(conditions)) if conditions else ""

        cursor.execute(f"""
            SELECT
                cc.id_sienge_centrocusto as sienge_id,
                COALESCE(SUM(cp.valor_liquido), 0) as valor_liquido,
                COUNT(*) as quantidade_titulos
            FROM contas_pagas cp
            INNER JOIN dim_centrocusto cc ON cp.id_interno_centro_custo = cc.id_interno_centrocusto
            WHERE cp.id_interno_centro_custo IS NOT NULL {where_clause}
            GROUP BY cc.id_sienge_centrocusto
        """, tuple(params))
        rows = cursor.fetchall()
        return {str(r['sienge_id']): {"valor_liquido": float(r['valor_liquido']), "quantidade_titulos": int(r['quantidade_titulos'])} for r in rows}
    except Exception as e:
        print(f"[ERRO] get_realizado_por_centro_custo: {e}")
        return {}
    finally:
        cursor.close()
        conn.close()

# ============ DOCUMENTAÇÃO DO SISTEMA ============

@app.get("/api/documentacao/fluxo-dados")
def get_documentacao_fluxo_dados():
    """Retorna a documentação estruturada do sistema: fluxo de dados, endpoints e glossário."""
    return {
        "paginas": [
            {
                "nome": "Dashboard (Página Inicial)",
                "icone": "home",
                "valores": [
                    {
                        "nome": "Total Pago",
                        "fonte": "SUM(contas_pagas.valor_liquido)",
                        "endpoint": "GET /api/metricas",
                        "filtros": ["Exclusões gerais (empresas, CCs, docs)"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Soma de todos os valores líquidos pagos, considerando exclusões configuradas."
                    },
                    {
                        "nome": "Total A Pagar",
                        "fonte": "SUM(contas_a_pagar.valor_total)",
                        "endpoint": "GET /api/metricas",
                        "filtros": ["Exclusões gerais"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Soma de todos os títulos pendentes de pagamento."
                    },
                    {
                        "nome": "Total Em Atraso",
                        "fonte": "SUM(contas_a_pagar.valor_total) WHERE vencimento < hoje",
                        "endpoint": "GET /api/metricas",
                        "filtros": ["Exclusões gerais"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Soma dos títulos com data de vencimento anterior à data atual."
                    },
                    {
                        "nome": "Total Recebido",
                        "fonte": "SUM(contas_recebidas.valor_liquido)",
                        "endpoint": "GET /api/metricas-receber",
                        "filtros": ["Exclusões gerais"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Soma de todos os valores recebidos."
                    },
                    {
                        "nome": "Total A Receber",
                        "fonte": "SUM(contas_a_receber.valor_total)",
                        "endpoint": "GET /api/metricas-receber",
                        "filtros": ["Exclusões gerais"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Soma de todos os títulos pendentes de recebimento."
                    }
                ]
            },
            {
                "nome": "Contas Pagas",
                "icone": "check-circle",
                "valores": [
                    {
                        "nome": "Líquido Total (por Centro de Custo)",
                        "fonte": "SUM(contas_pagas.valor_liquido) GROUP BY centro_custo",
                        "endpoint": "GET /api/contas-pagas-por-centro-custo",
                        "filtros": ["Exclusões gerais", "Origens (config_origens_exposicao_caixa)", "Tipos de baixa (config_tipos_baixa_exposicao_caixa)", "Transferências inter-empresa"],
                        "referencia_cruzada": "Deve bater com Realizado no Painel Executivo > Orçamento",
                        "arquivo": "main.py",
                        "descricao": "Valor líquido total pago agrupado por centro de custo. Aplica 4 camadas de filtros automáticos da configuração."
                    },
                    {
                        "nome": "Líquido Total (por Fornecedor)",
                        "fonte": "SUM(contas_pagas.valor_liquido) GROUP BY credor",
                        "endpoint": "GET /api/contas-pagas-por-fornecedor",
                        "filtros": ["Exclusões gerais", "Origens", "Tipos de baixa", "Inter-empresa"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Valor líquido agrupado por fornecedor. Nomes são normalizados (remove prefixo CPF/CNPJ)."
                    },
                    {
                        "nome": "Qtd Títulos",
                        "fonte": "COUNT(DISTINCT SPLIT_PART(lancamento, '/', 1))",
                        "endpoint": "GET /api/contas-pagas-por-fornecedor",
                        "filtros": ["Mesmos do Líquido Total"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Quantidade de títulos únicos. Lançamentos rateados (ex: 8302/1, 8302/2) contam como 1 título."
                    }
                ]
            },
            {
                "nome": "Contas a Pagar",
                "icone": "clock",
                "valores": [
                    {
                        "nome": "Total A Pagar",
                        "fonte": "SUM(contas_a_pagar.valor_total)",
                        "endpoint": "GET /api/metricas",
                        "filtros": ["Exclusões gerais"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Soma de todos os títulos pendentes de pagamento."
                    }
                ]
            },
            {
                "nome": "Contas Atrasadas",
                "icone": "alert-triangle",
                "valores": [
                    {
                        "nome": "Total Em Atraso",
                        "fonte": "SUM(contas_a_pagar.valor_total) WHERE vencimento < hoje",
                        "endpoint": "GET /api/contas (status=em_atraso)",
                        "filtros": ["Exclusões gerais"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Títulos com data de vencimento anterior à data atual. Agrupável por credor, empresa ou CC."
                    }
                ]
            },
            {
                "nome": "Contas a Receber",
                "icone": "arrow-down-circle",
                "valores": [
                    {
                        "nome": "Total A Receber",
                        "fonte": "SUM(contas_a_receber.valor_total)",
                        "endpoint": "GET /api/contas-receber-estatisticas",
                        "filtros": ["Exclusões gerais"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Soma de todos os títulos a receber pendentes."
                    }
                ]
            },
            {
                "nome": "Contas Recebidas",
                "icone": "check-square",
                "valores": [
                    {
                        "nome": "Líquido Total Recebido",
                        "fonte": "SUM(contas_recebidas.valor_liquido)",
                        "endpoint": "GET /api/contas-recebidas-totais",
                        "filtros": ["Exclusões gerais"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Soma líquida de todos os valores já recebidos."
                    }
                ]
            },
            {
                "nome": "Inadimplência (Recebimentos Atrasados)",
                "icone": "alert-circle",
                "valores": [
                    {
                        "nome": "Total Inadimplente",
                        "fonte": "SUM(contas_a_receber.valor_total) WHERE vencimento < hoje",
                        "endpoint": "GET /api/contas-receber (status=atrasado)",
                        "filtros": ["Exclusões gerais"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Títulos a receber com vencimento passado. Inclui faixas de atraso: 1-7d, 8-15d, 16-30d, 31-60d, 61-90d, +90d."
                    }
                ]
            },
            {
                "nome": "Extrato Cliente",
                "icone": "file-text",
                "valores": [
                    {
                        "nome": "Valor Nominal",
                        "fonte": "contas_a_receber.valor_nominal (parcela)",
                        "endpoint": "GET /api/extrato-cliente",
                        "filtros": [],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Valor original da parcela sem correção monetária."
                    },
                    {
                        "nome": "Correção Monetária (INCC)",
                        "fonte": "ecadindexhist → fator = índice_atual / índice_base",
                        "endpoint": "GET /api/extrato-cliente",
                        "filtros": [],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Correção monetária pelo índice INCC. Títulos marcados como 'INCC manual' usam cálculo alternativo da config."
                    },
                    {
                        "nome": "Valor Corrigido",
                        "fonte": "valor_nominal × fator_correção",
                        "endpoint": "GET /api/extrato-cliente",
                        "filtros": [],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Valor nominal atualizado pela correção monetária INCC."
                    },
                    {
                        "nome": "Saldo",
                        "fonte": "valor_corrigido - valor_recebido",
                        "endpoint": "GET /api/extrato-cliente",
                        "filtros": [],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Diferença entre o valor corrigido e o que já foi recebido. Representa o que ainda falta pagar."
                    }
                ]
            },
            {
                "nome": "Painel Executivo > Aba Orçamento",
                "icone": "bar-chart-2",
                "valores": [
                    {
                        "nome": "Realizado",
                        "fonte": "SUM(contas_pagas.valor_liquido) GROUP BY id_sienge_centrocusto",
                        "endpoint": "GET /api/realizado-por-centro-custo",
                        "filtros": ["Exclusões gerais (empresas, CCs, docs, contas)", "Origens excluídas (config_origens_exposicao_caixa)", "Tipos baixa permitidos (config_tipos_baixa_exposicao_caixa)", "Transferências inter-empresa (credor ≠ nome empresa)"],
                        "referencia_cruzada": "Deve bater exatamente com o Líquido Total da página Contas Pagas para o mesmo centro de custo",
                        "arquivo": "main.py",
                        "descricao": "Total efetivamente pago por centro de custo. Usa código Sienge (não ID interno). Mapeado via empreendimentos_config.centro_custo_id."
                    },
                    {
                        "nome": "Orçamento",
                        "fonte": "CUB × Fator × M²",
                        "endpoint": "GET /api/configuracoes/cub + GET /api/configuracoes/empreendimentos",
                        "filtros": [],
                        "referencia_cruzada": "Configurado em Configurações > Orçamentos",
                        "arquivo": "frontend/src/services/api.ts",
                        "descricao": "CUB/RO (Custo Unitário Básico) multiplicado pelo fator do empreendimento e pela metragem (m²). Calculado no frontend."
                    },
                    {
                        "nome": "À Realizar",
                        "fonte": "MAX(0, Orçamento - Realizado)",
                        "endpoint": "Calculado no frontend",
                        "filtros": [],
                        "referencia_cruzada": None,
                        "arquivo": "frontend/src/services/api.ts",
                        "descricao": "Diferença entre o orçamento previsto e o que já foi realizado. Mínimo de zero."
                    },
                    {
                        "nome": "% Realizado",
                        "fonte": "(Realizado / Orçamento) × 100",
                        "endpoint": "Calculado no frontend",
                        "filtros": [],
                        "referencia_cruzada": None,
                        "arquivo": "frontend/src/services/api.ts",
                        "descricao": "Percentual de execução do orçamento. Se orçamento for zero, retorna 0%."
                    }
                ]
            },
            {
                "nome": "Exposição de Caixa",
                "icone": "trending-up",
                "valores": [
                    {
                        "nome": "Recebido (mês)",
                        "fonte": "SUM(contas_recebidas.valor_liquido) por mês",
                        "endpoint": "GET /api/exposicao-caixa",
                        "filtros": ["Origens (config WHERE incluir=true AND paginas LIKE '%exposicao%')", "Tipos baixa (config WHERE incluir=1 AND paginas LIKE '%exposicao%')"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Total recebido em cada mês, filtrado pelas origens e tipos de baixa configurados para exposição."
                    },
                    {
                        "nome": "Pago (mês)",
                        "fonte": "SUM(contas_pagas.valor_liquido) por mês",
                        "endpoint": "GET /api/exposicao-caixa",
                        "filtros": ["Mesmos filtros de origens e tipos de baixa"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Total pago em cada mês."
                    },
                    {
                        "nome": "Saldo Acumulado",
                        "fonte": "Σ(Recebido - Pago) acumulado mês a mês",
                        "endpoint": "GET /api/exposicao-caixa",
                        "filtros": [],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Soma acumulada da diferença entre recebimentos e pagamentos ao longo dos meses."
                    }
                ]
            },
            {
                "nome": "KPIs",
                "icone": "activity",
                "valores": [
                    {
                        "nome": "Valor do KPI",
                        "fonte": "Depende do cálculo automático configurado (ex: total_pago_mes, total_a_pagar)",
                        "endpoint": "GET /api/kpis-variacao-diaria",
                        "filtros": ["Depende do tipo de cálculo"],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "KPIs podem usar cálculos automáticos (total_pago_mes, total_a_pagar, etc.) ou valores manuais registrados diariamente."
                    },
                    {
                        "nome": "Variação Diária",
                        "fonte": "valor_hoje - valor_ontem",
                        "endpoint": "GET /api/kpis-variacao-diaria",
                        "filtros": [],
                        "referencia_cruzada": None,
                        "arquivo": "main.py",
                        "descricao": "Diferença entre o valor do KPI hoje e o valor de ontem. Registrado via snapshots diários."
                    }
                ]
            }
        ],
        "endpoints_resumo": [
            {"area": "Dashboard", "rota": "GET /api/metricas", "descricao": "Cards: total pago, a pagar, em atraso", "tabelas": "contas_pagas, contas_a_pagar"},
            {"area": "Dashboard", "rota": "GET /api/metricas-receber", "descricao": "Cards: recebido, a receber, atrasados", "tabelas": "contas_a_receber, contas_recebidas"},
            {"area": "Dashboard", "rota": "GET /api/grafico-mensal", "descricao": "Evolução mensal (12 meses)", "tabelas": "contas_pagas, contas_a_pagar"},
            {"area": "Dashboard", "rota": "GET /api/grafico-categoria", "descricao": "Despesas por plano financeiro", "tabelas": "contas_pagas"},
            {"area": "Contas Pagas", "rota": "GET /api/contas-pagas-filtradas", "descricao": "Lista detalhada com filtros múltiplos", "tabelas": "contas_pagas, dim_centrocusto", "filtros_auto": "exclusões, origens, tipos_baixa, inter-empresa"},
            {"area": "Contas Pagas", "rota": "GET /api/contas-pagas-por-fornecedor", "descricao": "Agrupado por credor (nomes normalizados)", "tabelas": "contas_pagas, dim_centrocusto", "filtros_auto": "exclusões, origens, tipos_baixa, inter-empresa"},
            {"area": "Contas Pagas", "rota": "GET /api/contas-pagas-por-centro-custo", "descricao": "Agrupado por CC (7d/15d/30d/total)", "tabelas": "contas_pagas, dim_centrocusto", "filtros_auto": "exclusões, origens, tipos_baixa, inter-empresa"},
            {"area": "Contas Pagas", "rota": "GET /api/estatisticas-contas-pagas", "descricao": "Estatísticas gerais (count, sum, avg)", "tabelas": "contas_pagas", "filtros_auto": "exclusões, origens, tipos_baixa"},
            {"area": "Contas Pagas", "rota": "GET /api/top-credores", "descricao": "Top N credores por volume", "tabelas": "contas_pagas, dim_credores"},
            {"area": "Contas a Receber", "rota": "GET /api/contas-receber", "descricao": "Lista contas a receber", "tabelas": "contas_a_receber, dim_centrocusto"},
            {"area": "Contas a Receber", "rota": "GET /api/contas-recebidas-filtradas", "descricao": "Contas recebidas com filtros", "tabelas": "contas_recebidas, dim_centrocusto"},
            {"area": "Contas a Receber", "rota": "GET /api/extrato-cliente", "descricao": "Extrato completo do cliente (INCC)", "tabelas": "contas_a_receber, contas_recebidas, ecadindexhist"},
            {"area": "Painel Executivo", "rota": "GET /api/realizado-por-centro-custo", "descricao": "Realizado por CC (chave: Sienge ID)", "tabelas": "contas_pagas, dim_centrocusto", "filtros_auto": "exclusões, origens, tipos_baixa, inter-empresa"},
            {"area": "Painel Executivo", "rota": "GET /api/configuracoes/cub", "descricao": "Valor CUB/RO", "tabelas": "cub_config"},
            {"area": "Painel Executivo", "rota": "GET /api/configuracoes/empreendimentos", "descricao": "Lista empreendimentos (fator, m², CC)", "tabelas": "empreendimentos_config"},
            {"area": "Exposição", "rota": "GET /api/exposicao-caixa", "descricao": "Recebido vs Pago mensal", "tabelas": "contas_pagas, contas_recebidas"},
            {"area": "KPIs", "rota": "GET /api/kpis-variacao-diaria", "descricao": "Todos os KPIs com variação", "tabelas": "kpis, kpi_historico"},
            {"area": "Configurações", "rota": "GET /api/configuracoes", "descricao": "Todas as exclusões ativas", "tabelas": "config_*"},
            {"area": "Filtros", "rota": "GET /api/filtros/empresas", "descricao": "Dropdown de empresas ativas", "tabelas": "dim_centrocusto"},
            {"area": "Filtros", "rota": "GET /api/filtros/centros-custo", "descricao": "Dropdown de CCs ativos", "tabelas": "dim_centrocusto"},
        ],
        "glossario": [
            {"termo": "CUB/RO", "definicao": "Custo Unitário Básico da Construção Civil do estado de Rondônia. Índice mensal publicado pelo SINDUSCON que representa o custo por metro quadrado de construção. Usado para calcular o orçamento dos empreendimentos."},
            {"termo": "Valor Líquido", "definicao": "Valor efetivamente pago ou recebido após descontos, juros, multas e abatimentos. É a coluna 'valor_liquido' nas tabelas contas_pagas e contas_recebidas."},
            {"termo": "Centro de Custo", "definicao": "Obra ou departamento ao qual um gasto está vinculado. Cada centro de custo tem um ID interno (usado pelo banco) e um ID Sienge (código no sistema Sienge). No Orçamento, usamos o ID Sienge."},
            {"termo": "ID Sienge vs ID Interno", "definicao": "O Sienge atribui um código próprio (id_sienge_centrocusto) a cada centro de custo. O banco de dados interno tem outro ID (id_interno_centrocusto). Exemplo: Lake Boulevard = Sienge 16, Interno 19. O sistema de Orçamento usa o ID Sienge."},
            {"termo": "Tipo de Baixa", "definicao": "Forma como um título foi liquidado. Exemplos: 1=Normal, 5=Devolução, 10=Estorno, etc. Configurável por página em Configurações > Tipos de Baixa."},
            {"termo": "Origem (id_origem)", "definicao": "Módulo do Sienge de onde veio o título. AC=Contas a Pagar, CP=Compras, BC=Banco Central, CF=Contas Financeiras, etc. Configurável por página em Configurações > Origens."},
            {"termo": "Lançamento", "definicao": "Identificador do título no Sienge. Títulos rateados têm sufixo /1, /2, etc. (ex: 8302/1, 8302/2). Na contagem de títulos, rateados são agrupados."},
            {"termo": "Transferência Inter-empresa", "definicao": "Pagamento onde o credor é outra empresa do próprio grupo Biesek. Estas são automaticamente excluídas das listagens de Contas Pagas para não inflar os valores."},
            {"termo": "INCC", "definicao": "Índice Nacional de Custo da Construção. Usado para corrigir monetariamente parcelas de recebíveis no Extrato do Cliente. Fator = índice_atual / índice_base."},
            {"termo": "Exclusões Gerais", "definicao": "Empresas, centros de custo, tipos de documento e contas correntes marcados como 'excluídos' em Configurações. Afetam TODAS as páginas do sistema."},
            {"termo": "Fator (Orçamento)", "definicao": "Multiplicador aplicado ao CUB para cada empreendimento. Representa a complexidade/padrão da obra. Fator 1.0 = padrão CUB. Editável em Configurações > Orçamentos."},
            {"termo": "Snapshot", "definicao": "Fotografia diária dos valores dos cards de Contas a Pagar. Permite comparar a posição de hoje com a de dias anteriores para detectar alterações."},
            {"termo": "Exposição de Caixa", "definicao": "Diferença acumulada entre recebimentos e pagamentos ao longo do tempo. Mostra o fluxo de caixa do empreendimento."},
            {"termo": "VGV", "definicao": "Valor Geral de Vendas. Soma do preço de todas as unidades de um empreendimento imobiliário."}
        ]
    }


# ============ CUB CONFIG ============

@app.get("/api/configuracoes/cub")
def get_cub_config():
    """Retorna o valor atual do CUB/RO."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT valor, referencia, atualizado_em FROM cub_config ORDER BY id LIMIT 1")
        row = cursor.fetchone()
        if row:
            return dict(row)
        return {"valor": 2334.56, "referencia": "Fev/2026", "atualizado_em": None}
    except Exception as e:
        print(f"[ERRO] get_cub_config: {e}")
        return {"valor": 2334.56, "referencia": "Fev/2026", "atualizado_em": None}
    finally:
        cursor.close()
        conn.close()

@app.put("/api/configuracoes/cub")
def update_cub_config(data: dict):
    """Atualiza o valor do CUB/RO."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        valor = data.get('valor', 2334.56)
        referencia = data.get('referencia', '')
        cursor.execute("SELECT COUNT(*) as cnt FROM cub_config")
        row = cursor.fetchone()
        if row and int(row['cnt']) > 0:
            cursor.execute(
                "UPDATE cub_config SET valor = %s, referencia = %s, atualizado_em = %s WHERE id = (SELECT MIN(id) FROM cub_config)",
                (valor, referencia, datetime.now().isoformat())
            )
        else:
            cursor.execute(
                "INSERT INTO cub_config (valor, referencia, atualizado_em) VALUES (%s, %s, %s)",
                (valor, referencia, datetime.now().isoformat())
            )
        conn.commit()
        return {"success": True, "valor": valor, "referencia": referencia}
    except Exception as e:
        conn.rollback()
        print(f"[ERRO] update_cub_config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

# ============ VALIDACAO DE PAGINAS ============

# Mapeamento de endpoints validaveis por pagina
PAGE_ENDPOINTS = {
    'dashboard': ['/api/metricas'],
    'contas-a-pagar': ['/api/metricas', '/api/contas'],
    'contas-pagas': ['/api/estatisticas-contas-pagas', '/api/contas-pagas-filtradas'],
    'contas-atrasadas': ['/api/metricas'],
    'contas-a-receber': ['/api/contas-receber-estatisticas', '/api/metricas-receber'],
    'contas-recebidas': ['/api/contas-recebidas-totais'],
    'recebimentos-atrasados': ['/api/contas-receber-estatisticas'],
    'painel-executivo': ['/api/realizado-por-centro-custo'],
    'exposicao-caixa': ['/api/estatisticas-contas-pagas', '/api/contas-receber-estatisticas'],
    'kpis': ['/api/metricas'],
}

# Mapeamento endpoint -> funcao Python
ENDPOINT_FUNCTIONS = {
    '/api/metricas': get_metricas,
    '/api/contas': get_contas,
    '/api/estatisticas-contas-pagas': get_estatisticas_contas_pagas,
    '/api/contas-pagas-filtradas': get_contas_pagas_filtradas,
    '/api/contas-receber-estatisticas': get_contas_receber_estatisticas,
    '/api/contas-recebidas-totais': get_contas_recebidas_totais,
    '/api/metricas-receber': get_metricas_receber,
    '/api/realizado-por-centro-custo': get_realizado_por_centro_custo,
}

def _run_checkpoint(checkpoint: dict) -> dict:
    """Executa um checkpoint e compara valores esperados vs reais."""
    import json as _json
    endpoint = checkpoint['endpoint']
    func = ENDPOINT_FUNCTIONS.get(endpoint)
    if not func:
        return {'status': 'error', 'message': f'Endpoint {endpoint} nao mapeado'}
    try:
        params = _json.loads(checkpoint['query_params']) if checkpoint['query_params'] else {}
        result = func(**params)
        # Converter resultado para dict se necessario
        if hasattr(result, '__dict__'):
            actual = result.__dict__ if not hasattr(result, 'dict') else result.dict()
        elif isinstance(result, dict):
            actual = result
        elif isinstance(result, list):
            actual = {'items': result, 'count': len(result)}
        else:
            actual = {'value': result}

        expected = _json.loads(checkpoint['expected_values'])
        tolerance = float(checkpoint.get('tolerance_pct', 0) or 0)

        diffs = {}
        all_pass = True
        for key, exp_val in expected.items():
            act_val = actual.get(key)
            if act_val is None:
                diffs[key] = {'expected': exp_val, 'actual': None, 'status': 'missing'}
                all_pass = False
                continue
            try:
                exp_num = float(exp_val)
                act_num = float(act_val)
                divisor = max(abs(exp_num), 1)
                diff_pct = abs(act_num - exp_num) / divisor
                if diff_pct > tolerance:
                    diffs[key] = {'expected': exp_num, 'actual': act_num, 'diff_pct': round(diff_pct * 100, 4), 'status': 'fail'}
                    all_pass = False
                else:
                    diffs[key] = {'expected': exp_num, 'actual': act_num, 'status': 'pass'}
            except (ValueError, TypeError):
                if str(exp_val) != str(act_val):
                    diffs[key] = {'expected': exp_val, 'actual': act_val, 'status': 'fail'}
                    all_pass = False
                else:
                    diffs[key] = {'expected': exp_val, 'actual': act_val, 'status': 'pass'}

        return {
            'status': 'pass' if all_pass else 'fail',
            'expected': expected,
            'actual': {k: actual.get(k) for k in expected},
            'diffs': diffs
        }
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


@app.get("/api/validacao/paginas")
def get_validacao_paginas(current_user: dict = Depends(get_current_user)):
    """Lista todas as paginas com seu status de validacao."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM validacao_paginas ORDER BY page_label")
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        cursor.close()
        conn.close()


@app.post("/api/validacao/paginas/{page_id}/validar")
def validar_pagina(page_id: str, body: dict = None, admin: dict = Depends(require_admin)):
    """Marca uma pagina como validada (admin only)."""
    import json as _json
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        notes = (body or {}).get('notes', '')
        cursor.execute(
            "UPDATE validacao_paginas SET status = %s, validated_by = %s, validated_at = %s, notes = %s WHERE page_id = %s",
            ('validado', admin.get('email', ''), datetime.now().isoformat(), notes, page_id)
        )
        conn.commit()
        return {"ok": True, "page_id": page_id, "status": "validado"}
    finally:
        cursor.close()
        conn.close()


@app.get("/api/validacao/checkpoints/{page_id}")
def get_validacao_checkpoints(page_id: str, admin: dict = Depends(require_admin)):
    """Lista checkpoints de uma pagina."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM validacao_checkpoints WHERE page_id = %s ORDER BY id", (page_id,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        cursor.close()
        conn.close()


@app.post("/api/validacao/checkpoints")
def criar_validacao_checkpoint(body: dict, admin: dict = Depends(require_admin)):
    """Cria um novo checkpoint."""
    import json as _json
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """INSERT INTO validacao_checkpoints
               (page_id, checkpoint_label, endpoint, query_params, expected_values, tolerance_pct)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                body['page_id'],
                body['checkpoint_label'],
                body['endpoint'],
                _json.dumps(body.get('query_params', {})),
                _json.dumps(body.get('expected_values', {})),
                float(body.get('tolerance_pct', 0))
            )
        )
        conn.commit()
        return {"ok": True, "id": cursor.lastrowid}
    finally:
        cursor.close()
        conn.close()


@app.delete("/api/validacao/checkpoints/{checkpoint_id}")
def deletar_validacao_checkpoint(checkpoint_id: int, admin: dict = Depends(require_admin)):
    """Remove um checkpoint."""
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM validacao_checkpoints WHERE id = %s", (checkpoint_id,))
        conn.commit()
        return {"ok": True}
    finally:
        cursor.close()
        conn.close()


@app.post("/api/validacao/verificar")
def verificar_validacao(body: dict = None, admin: dict = Depends(require_admin)):
    """Executa todos os checkpoints ativos e atualiza status."""
    import json as _json
    page_id_filter = (body or {}).get('page_id')
    conn = get_config_db_connection()
    cursor = conn.cursor()
    try:
        if page_id_filter:
            cursor.execute("SELECT * FROM validacao_checkpoints WHERE active = 1 AND page_id = %s", (page_id_filter,))
        else:
            cursor.execute("SELECT * FROM validacao_checkpoints WHERE active = 1")
        checkpoints = [dict(r) for r in cursor.fetchall()]

        results = []
        page_results = {}  # page_id -> all_pass

        for cp in checkpoints:
            result = _run_checkpoint(cp)
            now = datetime.now().isoformat()
            cursor.execute(
                "UPDATE validacao_checkpoints SET last_check_at = %s, last_actual_values = %s, last_check_status = %s WHERE id = %s",
                (now, _json.dumps(result.get('actual', {})), result['status'], cp['id'])
            )
            results.append({
                'checkpoint_id': cp['id'],
                'page_id': cp['page_id'],
                'label': cp['checkpoint_label'],
                **result
            })
            if cp['page_id'] not in page_results:
                page_results[cp['page_id']] = True
            if result['status'] != 'pass':
                page_results[cp['page_id']] = False

        # Atualizar status das paginas
        now = datetime.now().isoformat()
        for pid, all_pass in page_results.items():
            new_status = 'validado' if all_pass else 'drift'
            check_result = 'ok' if all_pass else 'drift'
            cursor.execute(
                "UPDATE validacao_paginas SET last_check_at = %s, last_check_result = %s, status = %s WHERE page_id = %s AND status != 'nao_validado'",
                (now, check_result, new_status, pid)
            )

        conn.commit()

        passed = sum(1 for r in results if r['status'] == 'pass')
        failed = sum(1 for r in results if r['status'] == 'fail')
        errors = sum(1 for r in results if r['status'] == 'error')

        return {
            'total': len(results),
            'passed': passed,
            'failed': failed,
            'errors': errors,
            'details': results
        }
    finally:
        cursor.close()
        conn.close()


@app.get("/api/validacao/endpoints-disponiveis")
def get_endpoints_disponiveis(admin: dict = Depends(require_admin)):
    """Retorna mapeamento de endpoints disponiveis por pagina."""
    return PAGE_ENDPOINTS


_auto_snapshot_thread = threading.Thread(target=_auto_snapshot_loop, daemon=True)
_auto_snapshot_thread.start()

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
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
