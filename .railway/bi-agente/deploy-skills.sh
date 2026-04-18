#!/usr/bin/env bash
# Deploy da skill bi-agente do staging local para o volume /opt/data do container bi-agente no Railway.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGING="$ROOT/skills-staging/bi-agente"
REMOTE_DIR="/opt/data/skills/productivity/bi-agente"

if [[ ! -d "$STAGING" ]]; then
    echo "ERRO: $STAGING nao existe." >&2
    exit 1
fi

echo "[1/3] Linkando Railway (service bi-agente)..."
cd "$ROOT"
railway service bi-agente 2>/dev/null || {
    echo "ERRO: rode 'railway link --project <id>' primeiro." >&2
    exit 1
}

echo "[2/3] Criando diretorios remotos..."
for sub in knowledge tools examples; do
    railway ssh "mkdir -p $REMOTE_DIR/$sub"
done

echo "[3/3] Transferindo arquivos..."
cd "$STAGING"
find . -type f \( -name "*.md" -o -name "*.py" \) ! -path "./tests/*" ! -path "./__pycache__/*" | while read -r arq; do
    rel="${arq#./}"
    echo "  -> $rel"
    cat "$arq" | railway ssh "cat > $REMOTE_DIR/$rel"
done

echo "[verify] Listando remoto:"
railway ssh "find $REMOTE_DIR -type f | sort"

echo
echo "Deploy concluido. Reinicie o gateway para carregar a skill:"
echo "  railway redeploy --yes"
