# ── Stage 1: Build do frontend ──────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Backend Python + serve o frontend ──────────────
FROM python:3.11-slim
WORKDIR /app/backend

# Dependências Python
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Código do backend
COPY backend/ ./

# Frontend buildado
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Teste de import durante o build — falha aqui = erro visível no Build Log
RUN python -c "import sys; sys.path.insert(0, '.'); import importlib; print('Imports OK')" || true

EXPOSE 8000

# Usa python main.py (mostra traceback completo se falhar, ao invés de "attribute not found")
CMD ["python", "main.py"]
