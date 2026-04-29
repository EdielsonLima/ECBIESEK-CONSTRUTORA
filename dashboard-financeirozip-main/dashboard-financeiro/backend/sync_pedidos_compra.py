"""ETL de Pedidos de Compra do Sienge.

Sincroniza os endpoints REST do Sienge para o PostgreSQL local:
  GET  /purchase-orders                                       -> tabela pedidos_compra (header)
  GET  /purchase-orders/{id}/items                            -> tabela pedidos_compra_itens (lazy)
  GET  /purchase-orders/{id}/items/{n}/delivery-schedules     -> tabela pedidos_compra_entregas (lazy)
  PUT  /purchase-orders/{id}/authorize                        -> autoriza pedido

Usa o mesmo DB principal (DB_CONFIG) onde ja vivem dim_centrocusto, contas_a_pagar etc.
"""
import asyncio
import base64
import os
from datetime import datetime, timedelta
from typing import Any, Optional

import httpx
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values

# ----- Config Sienge (mesma usada em main.py) -----
SIENGE_API_URL = "https://api.sienge.com.br/biesek/public/api/v1"
SIENGE_USERNAME = "biesek-dtconsultorias"
SIENGE_PASSWORD = "W8LWWpo170P3LPpJDD42RL456fEvudEE"

DB_CONFIG = {
    'host': os.environ.get('DB_HOST') or 'localhost',
    'port': int(os.environ.get('DB_PORT') or 5432),
    'database': os.environ.get('DB_NAME') or 'ecbiesek',
    'user': os.environ.get('DB_USER') or '',
    'password': os.environ.get('DB_PASSWORD') or '',
}

# Banco gravavel (mesmo usado por _ensure_config_tables_in_postgres em main.py)
CONFIG_DB_URL = os.environ.get('CONFIG_DB_URL') or os.environ.get('DATABASE_URL')

_lock_sync = asyncio.Lock()
_TTL_ITENS_ABERTOS_SEG = 2 * 3600  # 2h


def _conn_data():
    """Conexao read-only ao banco principal (Sienge replica) — para dim_centrocusto/ecadcredor."""
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)


def _conn():
    """Conexao gravavel para nossas tabelas pedidos_compra*. Usa CONFIG_DB_URL se disponivel,
    senao cai pro DB_CONFIG (mesmo padrao de main.py)."""
    if CONFIG_DB_URL:
        return psycopg2.connect(CONFIG_DB_URL, cursor_factory=RealDictCursor)
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)


def _auth_header() -> dict:
    creds = base64.b64encode(f"{SIENGE_USERNAME}:{SIENGE_PASSWORD}".encode()).decode()
    return {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}


# ===================== MIGRATIONS =====================

def ensure_tables() -> None:
    """Cria/garante as 4 tabelas. Idempotente: usa ALTER TABLE ADD COLUMN IF NOT EXISTS
    para repor colunas faltantes em tabelas que possam ter sido criadas parcialmente."""

    # 1) Cria tabelas com PK mínima (CREATE TABLE IF NOT EXISTS é idempotente, mas só
    # cria a tabela se não existir — não adiciona colunas faltantes em tabela existente)
    create_sql = """
    CREATE TABLE IF NOT EXISTS dim_fornecedores (id_fornecedor BIGINT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS pedidos_compra (id_pedido BIGINT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS pedidos_compra_itens (
        id_pedido BIGINT, numero_item INT, PRIMARY KEY (id_pedido, numero_item)
    );
    CREATE TABLE IF NOT EXISTS pedidos_compra_entregas (
        id_pedido BIGINT, numero_item INT, numero_cronograma INT,
        PRIMARY KEY (id_pedido, numero_item, numero_cronograma)
    );
    """

    # 2) Garante todas as colunas de cada tabela
    alters = [
        # dim_fornecedores
        "ALTER TABLE dim_fornecedores ADD COLUMN IF NOT EXISTS nome TEXT",
        "ALTER TABLE dim_fornecedores ADD COLUMN IF NOT EXISTS cnpj TEXT",
        "ALTER TABLE dim_fornecedores ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE",
        "ALTER TABLE dim_fornecedores ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT NOW()",
        # pedidos_compra
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS numero_pedido TEXT",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS id_fornecedor BIGINT",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS nome_fornecedor TEXT",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS id_empresa INT",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS id_obra INT",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS id_centro_custo INT",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS nome_centro_custo TEXT",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS data_pedido DATE",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS data_envio DATE",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS data_autorizacao TIMESTAMPTZ",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS status TEXT",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS autorizado BOOLEAN",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS reprovado BOOLEAN",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS entrega_atrasada BOOLEAN",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS valor_total NUMERIC(14,2)",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS valor_desconto NUMERIC(14,2)",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS valor_acrescimo NUMERIC(14,2)",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS valor_frete NUMERIC(14,2)",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS id_comprador TEXT",
        # Migracao: se foi criada como INT antes, converte para TEXT
        "ALTER TABLE pedidos_compra ALTER COLUMN id_comprador TYPE TEXT USING id_comprador::TEXT",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS notas_internas TEXT",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS id_forecast_bill BIGINT",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS forecast_document_id TEXT",
        "ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS sincronizado_em TIMESTAMPTZ DEFAULT NOW()",
        # pedidos_compra_itens
        "ALTER TABLE pedidos_compra_itens ADD COLUMN IF NOT EXISTS codigo_recurso TEXT",
        "ALTER TABLE pedidos_compra_itens ADD COLUMN IF NOT EXISTS descricao_recurso TEXT",
        "ALTER TABLE pedidos_compra_itens ADD COLUMN IF NOT EXISTS quantidade NUMERIC(14,4)",
        "ALTER TABLE pedidos_compra_itens ADD COLUMN IF NOT EXISTS preco_unitario NUMERIC(14,4)",
        "ALTER TABLE pedidos_compra_itens ADD COLUMN IF NOT EXISTS preco_liquido NUMERIC(14,2)",
        "ALTER TABLE pedidos_compra_itens ADD COLUMN IF NOT EXISTS desconto NUMERIC(14,2)",
        "ALTER TABLE pedidos_compra_itens ADD COLUMN IF NOT EXISTS acrescimo_pct NUMERIC(8,4)",
        "ALTER TABLE pedidos_compra_itens ADD COLUMN IF NOT EXISTS icms_pct NUMERIC(8,4)",
        "ALTER TABLE pedidos_compra_itens ADD COLUMN IF NOT EXISTS ipi_pct NUMERIC(8,4)",
        "ALTER TABLE pedidos_compra_itens ADD COLUMN IF NOT EXISTS iss_pct NUMERIC(8,4)",
        "ALTER TABLE pedidos_compra_itens ADD COLUMN IF NOT EXISTS sincronizado_em TIMESTAMPTZ DEFAULT NOW()",
        # pedidos_compra_entregas
        "ALTER TABLE pedidos_compra_entregas ADD COLUMN IF NOT EXISTS data_prevista DATE",
        "ALTER TABLE pedidos_compra_entregas ADD COLUMN IF NOT EXISTS quantidade_prevista NUMERIC(14,4)",
        "ALTER TABLE pedidos_compra_entregas ADD COLUMN IF NOT EXISTS quantidade_entregue NUMERIC(14,4)",
        "ALTER TABLE pedidos_compra_entregas ADD COLUMN IF NOT EXISTS quantidade_aberta NUMERIC(14,4)",
        "ALTER TABLE pedidos_compra_entregas ADD COLUMN IF NOT EXISTS sincronizado_em TIMESTAMPTZ DEFAULT NOW()",
    ]

    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_pedidos_compra_status ON pedidos_compra(status)",
        "CREATE INDEX IF NOT EXISTS idx_pedidos_compra_data ON pedidos_compra(data_pedido)",
        "CREATE INDEX IF NOT EXISTS idx_pedidos_compra_cc ON pedidos_compra(id_centro_custo)",
        "CREATE INDEX IF NOT EXISTS idx_pedidos_compra_fornecedor ON pedidos_compra(id_fornecedor)",
        "CREATE INDEX IF NOT EXISTS idx_pedido_entrega_data ON pedidos_compra_entregas(data_prevista)",
    ]

    conn = _conn()
    conn.autocommit = True  # cada statement em transação independente
    erros: list[str] = []
    try:
        cur = conn.cursor()
        try:
            cur.execute(create_sql)
        except Exception as e:
            erros.append(f"CREATE: {e}")
        for stmt in alters:
            try:
                cur.execute(stmt)
            except Exception as e:
                erros.append(f"{stmt[:60]}... -> {e}")
        for stmt in indexes:
            try:
                cur.execute(stmt)
            except Exception as e:
                erros.append(f"INDEX: {e}")
        cur.close()
        if erros:
            print(f"[pedidos-compra] Migration com {len(erros)} erro(s):")
            for e in erros:
                print(f"  -> {e}")
        else:
            print("[pedidos-compra] Tabelas + colunas garantidas no PostgreSQL.")
    finally:
        conn.close()


def rebuild_tabelas() -> dict:
    """DROP + recria as tabelas do zero (destructive — apaga dados sincronizados).
    Util quando a migration deixou as tabelas em estado inconsistente."""
    conn = _conn()
    conn.autocommit = True
    cur = conn.cursor()
    try:
        cur.execute("DROP TABLE IF EXISTS pedidos_compra_entregas CASCADE")
        cur.execute("DROP TABLE IF EXISTS pedidos_compra_itens CASCADE")
        cur.execute("DROP TABLE IF EXISTS pedidos_compra CASCADE")
        cur.execute("DROP TABLE IF EXISTS dim_fornecedores CASCADE")
    finally:
        cur.close()
        conn.close()
    ensure_tables()
    return {"ok": True, "mensagem": "Tabelas recriadas do zero"}


# ===================== HELPERS =====================

def _to_date(v: Optional[str]):
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace('Z', '+00:00')).date()
    except Exception:
        return None


def _to_dt(v: Optional[str]):
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace('Z', '+00:00'))
    except Exception:
        return None


# ===================== SYNC PEDIDOS (HEADER) =====================

async def _fetch_purchase_orders(start_date: str, end_date: str) -> list[dict]:
    """Pagina /purchase-orders entre startDate e endDate. Limit 200 por pagina."""
    todos: list[dict] = []
    offset = 0
    limit = 200
    async with httpx.AsyncClient(timeout=120.0) as client:
        while True:
            resp = await client.get(
                f"{SIENGE_API_URL}/purchase-orders",
                params={"startDate": start_date, "endDate": end_date, "limit": limit, "offset": offset},
                headers=_auth_header(),
            )
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", []) if isinstance(data, dict) else (data or [])
            if not isinstance(results, list) or not results:
                break
            todos.extend(results)
            if len(results) < limit:
                break
            offset += limit
    return todos


def _enriquecer_centros_custo(pedidos: list[dict], conn) -> dict[int, dict]:
    """Mapeia id_sienge_centrocusto -> {id_interno, nome} via dim_centrocusto."""
    cc_ids = {p.get("costCenterId") for p in pedidos if p.get("costCenterId")}
    if not cc_ids:
        return {}
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT id_sienge_centrocusto, id_interno_centrocusto, nome_centrocusto "
            "FROM dim_centrocusto WHERE id_sienge_centrocusto = ANY(%s)",
            (list(cc_ids),),
        )
        return {r["id_sienge_centrocusto"]: {
            "id_interno": r["id_interno_centrocusto"],
            "nome": r["nome_centrocusto"],
        } for r in cur.fetchall()}
    finally:
        cur.close()


def _enriquecer_fornecedores(pedidos: list[dict], conn) -> dict[int, str]:
    """Tenta mapear supplierId -> nome via tabela ecadcredor (se existir)."""
    sup_ids = {p.get("supplierId") for p in pedidos if p.get("supplierId")}
    if not sup_ids:
        return {}
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT id_credor, nome_credor FROM ecadcredor WHERE id_credor = ANY(%s)",
            (list(sup_ids),),
        )
        return {r["id_credor"]: r["nome_credor"] for r in cur.fetchall()}
    except Exception:
        # tabela pode nao existir ou ter outro nome
        return {}
    finally:
        cur.close()


def _upsert_pedidos(pedidos: list[dict], cc_map: dict, forn_map: dict, conn) -> tuple[int, int]:
    """UPSERT em pedidos_compra. Retorna (novos, atualizados)."""
    if not pedidos:
        return 0, 0
    rows = []
    for p in pedidos:
        cc_id = p.get("costCenterId")
        cc_info = cc_map.get(cc_id, {}) if cc_id else {}
        sid = p.get("supplierId")
        rows.append((
            p.get("id"),
            p.get("formattedPurchaseOrderId"),
            sid,
            forn_map.get(sid),
            p.get("companyId"),
            p.get("buildingId"),
            cc_info.get("id_interno"),
            cc_info.get("nome"),
            _to_date(p.get("date")),
            _to_date(p.get("sentDate")),
            _to_dt(p.get("authorizedAt")),
            p.get("status"),
            bool(p.get("authorized")),
            bool(p.get("disapproved")),
            bool(p.get("deliveryLate")),
            p.get("totalAmount"),
            p.get("discount"),
            p.get("increase"),
            p.get("totalFreight"),
            p.get("buyerId"),
            p.get("internalNotes"),
            p.get("forecastBillId"),
            (p.get("forecastDocumentId") or "").strip() or None,
        ))

    sql = """
    INSERT INTO pedidos_compra (
        id_pedido, numero_pedido, id_fornecedor, nome_fornecedor, id_empresa,
        id_obra, id_centro_custo, nome_centro_custo, data_pedido, data_envio,
        data_autorizacao, status, autorizado, reprovado, entrega_atrasada,
        valor_total, valor_desconto, valor_acrescimo, valor_frete, id_comprador,
        notas_internas, id_forecast_bill, forecast_document_id, sincronizado_em
    ) VALUES %s
    ON CONFLICT (id_pedido) DO UPDATE SET
        numero_pedido        = EXCLUDED.numero_pedido,
        id_fornecedor        = EXCLUDED.id_fornecedor,
        nome_fornecedor      = COALESCE(EXCLUDED.nome_fornecedor, pedidos_compra.nome_fornecedor),
        id_empresa           = EXCLUDED.id_empresa,
        id_obra              = EXCLUDED.id_obra,
        id_centro_custo      = EXCLUDED.id_centro_custo,
        nome_centro_custo    = EXCLUDED.nome_centro_custo,
        data_pedido          = EXCLUDED.data_pedido,
        data_envio           = EXCLUDED.data_envio,
        data_autorizacao     = EXCLUDED.data_autorizacao,
        status               = EXCLUDED.status,
        autorizado           = EXCLUDED.autorizado,
        reprovado            = EXCLUDED.reprovado,
        entrega_atrasada     = EXCLUDED.entrega_atrasada,
        valor_total          = EXCLUDED.valor_total,
        valor_desconto       = EXCLUDED.valor_desconto,
        valor_acrescimo      = EXCLUDED.valor_acrescimo,
        valor_frete          = EXCLUDED.valor_frete,
        id_comprador         = EXCLUDED.id_comprador,
        notas_internas       = EXCLUDED.notas_internas,
        id_forecast_bill     = COALESCE(EXCLUDED.id_forecast_bill, pedidos_compra.id_forecast_bill),
        forecast_document_id = COALESCE(EXCLUDED.forecast_document_id, pedidos_compra.forecast_document_id),
        sincronizado_em      = NOW()
    RETURNING (xmax = 0) AS inserido
    """
    cur = conn.cursor()
    try:
        valores_template = "(" + ",".join(["%s"] * 23) + ", NOW())"
        execute_values(cur, sql, rows, template=valores_template)
        resultados = cur.fetchall()
        novos = sum(1 for r in resultados if r["inserido"])
        atualizados = len(resultados) - novos
        conn.commit()
        return novos, atualizados
    finally:
        cur.close()


async def sincronizar_pedidos_compra(periodo_dias: int = 90, force_full: bool = False) -> dict:
    """Sync incremental dos pedidos. Retorna {novos, atualizados, total, duracao_segundos}."""
    async with _lock_sync:
        inicio = datetime.now()

        if force_full:
            start_date = "2020-01-01"
        else:
            start_date = (datetime.now() - timedelta(days=periodo_dias)).strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")

        print(f"[pedidos-compra] Sync: {start_date} -> {end_date}")
        pedidos = await _fetch_purchase_orders(start_date, end_date)
        print(f"[pedidos-compra] Sienge retornou {len(pedidos)} pedidos")

        # Enriquecimento usa banco read-only (Sienge replica)
        cc_map = {}
        forn_map = {}
        try:
            conn_data = _conn_data()
            try:
                cc_map = _enriquecer_centros_custo(pedidos, conn_data)
                forn_map = _enriquecer_fornecedores(pedidos, conn_data)
            finally:
                conn_data.close()
        except Exception as e:
            print(f"[pedidos-compra] Falha ao enriquecer CC/Fornecedor (segue sem nomes): {e}")

        # UPSERT usa banco gravavel
        conn = _conn()
        try:
            novos, atualizados = _upsert_pedidos(pedidos, cc_map, forn_map, conn)
        finally:
            conn.close()

        # Pre-carrega itens + cronograma de entregas dos pedidos abertos.
        # Inclui TODOS os PENDING/PARTIALLY_DELIVERED do banco (nao so os do Sienge nesta sync),
        # para garantir que pedidos parciais antigos tambem atualizem o cronograma.
        c = _conn()
        try:
            cur = c.cursor()
            cur.execute("""
                SELECT id_pedido, status FROM pedidos_compra
                WHERE status IN ('PENDING', 'PARTIALLY_DELIVERED')
                ORDER BY data_pedido DESC NULLS LAST
                LIMIT 300
            """)
            abertos_db = [(r["id_pedido"], r["status"]) for r in cur.fetchall()]
            cur.close()
        finally:
            c.close()

        cronogramas_carregados = 0
        pedidos_pre_carregados = 0
        for id_pedido, _status in abertos_db:
            try:
                qtd_itens = await sincronizar_itens_pedido(id_pedido)
                pedidos_pre_carregados += 1
                if qtd_itens > 0:
                    c = _conn()
                    try:
                        cur = c.cursor()
                        cur.execute(
                            "SELECT numero_item FROM pedidos_compra_itens WHERE id_pedido = %s",
                            (id_pedido,),
                        )
                        nums = [r["numero_item"] for r in cur.fetchall()]
                        cur.close()
                    finally:
                        c.close()
                    for n in nums:
                        try:
                            await sincronizar_entregas_item(id_pedido, n)
                            cronogramas_carregados += 1
                        except Exception as e:
                            print(f"[pedidos-compra] entrega {id_pedido}/{n}: {e}")
            except Exception as e:
                print(f"[pedidos-compra] pre-load {id_pedido}: {e}")

        duracao = (datetime.now() - inicio).total_seconds()
        return {
            "novos": novos,
            "atualizados": atualizados,
            "total": len(pedidos),
            "abertos_pre_carregados": pedidos_pre_carregados,
            "cronogramas_carregados": cronogramas_carregados,
            "duracao_segundos": round(duracao, 2),
            "periodo": {"inicio": start_date, "fim": end_date},
        }


# ===================== SYNC ITENS / ENTREGAS (lazy) =====================

async def sincronizar_itens_pedido(id_pedido: int) -> int:
    """Busca itens de um pedido no Sienge e UPSERT. Retorna qtd de itens."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(
            f"{SIENGE_API_URL}/purchase-orders/{id_pedido}/items",
            headers=_auth_header(),
        )
        resp.raise_for_status()
        data = resp.json()
        itens = data.get("results", []) if isinstance(data, dict) else (data or [])

    if not itens:
        return 0

    rows = [(
        id_pedido,
        it.get("itemNumber"),
        it.get("resourceCode"),
        it.get("resourceDescription"),
        it.get("quantity"),
        it.get("unitPrice"),
        it.get("netPrice"),
        it.get("discount"),
        it.get("increasePercentage"),
        it.get("icmsTaxPercentage"),
        it.get("ipiTaxPercentage"),
        it.get("issTaxPercentage"),
    ) for it in itens]

    sql = """
    INSERT INTO pedidos_compra_itens (
        id_pedido, numero_item, codigo_recurso, descricao_recurso, quantidade,
        preco_unitario, preco_liquido, desconto, acrescimo_pct, icms_pct, ipi_pct, iss_pct, sincronizado_em
    ) VALUES %s
    ON CONFLICT (id_pedido, numero_item) DO UPDATE SET
        codigo_recurso    = EXCLUDED.codigo_recurso,
        descricao_recurso = EXCLUDED.descricao_recurso,
        quantidade        = EXCLUDED.quantidade,
        preco_unitario    = EXCLUDED.preco_unitario,
        preco_liquido     = EXCLUDED.preco_liquido,
        desconto          = EXCLUDED.desconto,
        acrescimo_pct     = EXCLUDED.acrescimo_pct,
        icms_pct          = EXCLUDED.icms_pct,
        ipi_pct           = EXCLUDED.ipi_pct,
        iss_pct           = EXCLUDED.iss_pct,
        sincronizado_em   = NOW()
    """
    template = "(" + ",".join(["%s"] * 12) + ", NOW())"
    conn = _conn()
    try:
        cur = conn.cursor()
        execute_values(cur, sql, rows, template=template)
        conn.commit()
        cur.close()
    finally:
        conn.close()
    return len(itens)


async def sincronizar_entregas_item(id_pedido: int, numero_item: int) -> int:
    """Busca cronograma de entregas de um item. Retorna qtd de cronogramas."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(
            f"{SIENGE_API_URL}/purchase-orders/{id_pedido}/items/{numero_item}/delivery-schedules",
            headers=_auth_header(),
        )
        resp.raise_for_status()
        data = resp.json()
        entregas = data.get("results", []) if isinstance(data, dict) else (data or [])

    if not entregas:
        return 0

    rows = [(
        id_pedido,
        numero_item,
        e.get("deliveryScheduleNumber"),
        _to_date(e.get("sheduledDate") or e.get("scheduledDate")),
        e.get("sheduledQuantity") or e.get("scheduledQuantity"),
        e.get("deliveredQuantity"),
        e.get("openQuantity"),
    ) for e in entregas]

    sql = """
    INSERT INTO pedidos_compra_entregas (
        id_pedido, numero_item, numero_cronograma, data_prevista,
        quantidade_prevista, quantidade_entregue, quantidade_aberta, sincronizado_em
    ) VALUES %s
    ON CONFLICT (id_pedido, numero_item, numero_cronograma) DO UPDATE SET
        data_prevista       = EXCLUDED.data_prevista,
        quantidade_prevista = EXCLUDED.quantidade_prevista,
        quantidade_entregue = EXCLUDED.quantidade_entregue,
        quantidade_aberta   = EXCLUDED.quantidade_aberta,
        sincronizado_em     = NOW()
    """
    template = "(" + ",".join(["%s"] * 7) + ", NOW())"
    conn = _conn()
    try:
        cur = conn.cursor()
        execute_values(cur, sql, rows, template=template)
        conn.commit()
        cur.close()
    finally:
        conn.close()
    return len(entregas)


def _itens_precisam_sync(id_pedido: int, status: str | None) -> bool:
    """Decide se itens devem ser refetched do Sienge. FULLY_DELIVERED = cache eterno."""
    conn = _conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT MAX(sincronizado_em) AS ultimo FROM pedidos_compra_itens WHERE id_pedido = %s",
            (id_pedido,),
        )
        row = cur.fetchone()
        cur.close()
    finally:
        conn.close()

    if not row or row["ultimo"] is None:
        return True
    if (status or "").upper() == "FULLY_DELIVERED":
        return False
    idade = (datetime.now(row["ultimo"].tzinfo) - row["ultimo"]).total_seconds()
    return idade > _TTL_ITENS_ABERTOS_SEG


async def garantir_itens_pedido(id_pedido: int, status: str | None) -> None:
    """Sincroniza itens se cache estiver vazio ou expirado."""
    if _itens_precisam_sync(id_pedido, status):
        try:
            await sincronizar_itens_pedido(id_pedido)
        except Exception as e:
            print(f"[pedidos-compra] Falha ao sincronizar itens {id_pedido}: {e}")


# ===================== AUTORIZAR =====================

async def autorizar_pedido_no_sienge(id_pedido: int) -> bool:
    """PUT /purchase-orders/{id}/authorize. Atualiza coluna autorizado=true se ok."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.put(
            f"{SIENGE_API_URL}/purchase-orders/{id_pedido}/authorize",
            headers=_auth_header(),
        )
        if resp.status_code not in (200, 204):
            raise RuntimeError(f"Sienge retornou {resp.status_code}: {resp.text[:300]}")

    conn = _conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE pedidos_compra SET autorizado = TRUE, data_autorizacao = NOW(), sincronizado_em = NOW() "
            "WHERE id_pedido = %s",
            (id_pedido,),
        )
        conn.commit()
        cur.close()
    finally:
        conn.close()
    return True
