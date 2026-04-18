# ── Stage 1: Build do frontend ──────────────────────────────
FROM node:20-alpine AS frontend-build
ARG VITE_DISABLE_AUTH=false
ENV VITE_DISABLE_AUTH=$VITE_DISABLE_AUTH
WORKDIR /app/frontend
COPY dashboard-financeirozip-main/dashboard-financeiro/frontend/package*.json ./
RUN npm install
COPY dashboard-financeirozip-main/dashboard-financeiro/frontend/ ./
RUN npm run build

# ── Stage 2: Backend Python ──────────────────────────────────
FROM python:3.11-slim
WORKDIR /app/backend

COPY dashboard-financeirozip-main/dashboard-financeiro/backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY dashboard-financeirozip-main/dashboard-financeiro/backend/ ./
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
