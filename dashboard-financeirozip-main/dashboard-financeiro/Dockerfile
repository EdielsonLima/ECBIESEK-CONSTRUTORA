# ── Stage 1: Build do frontend ──────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Backend Python + serve o frontend ──────────────
# CACHE BUST: 2026-03-03-v3
FROM python:3.11-slim
WORKDIR /app/backend

# Dependências Python
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Código do backend
COPY backend/ ./

# Frontend buildado
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

EXPOSE 8000

# python main.py mostra traceback completo se falhar
CMD ["python", "main.py"]
