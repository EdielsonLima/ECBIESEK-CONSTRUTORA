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

# Diagnóstico: testa import do main.py e exibe traceback completo se falhar
echo "[diag] Testando import do main.py..."
python -c "
import sys, traceback
try:
    import main
    app = getattr(main, 'app', None)
    if app is None:
        print('[diag] ERRO: app nao encontrado no modulo main')
    else:
        print('[diag] Import OK, app =', app)
except Exception as e:
    print('[diag] FALHA NO IMPORT:', e)
    traceback.print_exc()
    sys.exit(1)
" || { echo '[diag] Import falhou - abortando'; exit 1; }

echo "[diag] Iniciando uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
