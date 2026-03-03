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

# Copiar SQLite locais como "defaults" (usados apenas na 1ª execução no volume)
RUN mkdir -p /app/backend/defaults
COPY backend/users.db /app/backend/defaults/users.db
COPY backend/ecbiesek_config.db /app/backend/defaults/ecbiesek_config.db

# Frontend buildado
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Entrypoint
COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
