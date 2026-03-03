#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

# Preservar users.db (usuários, senhas, permissões)
if [ ! -f "$DATA_DIR/users.db" ]; then
    echo "[entrypoint] Inicializando users.db no volume..."
    if [ -f "/app/backend/defaults/users.db" ]; then
        cp /app/backend/defaults/users.db "$DATA_DIR/users.db"
    fi
fi

# Preservar ecbiesek_config.db (KPIs, snapshots, configurações)
if [ ! -f "$DATA_DIR/ecbiesek_config.db" ]; then
    echo "[entrypoint] Inicializando ecbiesek_config.db no volume..."
    if [ -f "/app/backend/defaults/ecbiesek_config.db" ]; then
        cp /app/backend/defaults/ecbiesek_config.db "$DATA_DIR/ecbiesek_config.db"
    fi
fi

exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
