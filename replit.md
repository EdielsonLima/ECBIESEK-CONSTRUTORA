# Dashboard Financeiro - Construtora

## Overview

A financial dashboard web application for managing both accounts payable (contas a pagar) and accounts receivable (contas a receber) for a construction company. The system provides visualization of financial data through interactive charts, tables, and KPI tracking. Users can view paid/received accounts, pending payments/receivables, overdue accounts, and track key performance indicators with historical data.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5 (dev server runs on port 5000)
- **Styling**: Tailwind CSS with custom primary color palette
- **Charts**: Recharts library for data visualization (bar charts, line charts, pie charts)
- **HTTP Client**: Axios for API communication
- **State Management**: React useState hooks (component-level state only)

The frontend follows a component-based architecture:
- **Reusable UI components**: `MetricCard`, `ContasTable`, `CategoryChart`, `MonthlyChart`, `SearchableSelect`, `Sidebar`
- **Page components**: `Dashboard`, `ContasAPagar`, `ContasPagas`, `ContasAtrasadas`, `ContasAReceber`, `ContasRecebidas`, `ContasReceberAtrasadas`, `KPIs`
- **Centralized API layer**: `services/api.ts` handles all backend communication
- **Type definitions**: `types/index.ts` provides TypeScript interfaces

### Navigation Structure
The Sidebar has two expandable menu sections:
- **Contas a Pagar**: A Pagar, Pagas, Atrasadas
- **Contas a Receber**: A Receber, Recebidas, Atrasadas, Extrato Cliente

Additionally, standalone menu items:
- **KPIs**: Key performance indicators management
- **Centros de Custo**: Cost center classification (ADM/OBRA)
- **Configurações**: Settings for excluding companies, cost centers, document types, and bank accounts from calculations

### Page Features (Updated December 2025)
All six account pages (Contas a Pagar + Contas a Receber) share a consistent structure:
- **Statistics cards**: 4 key metrics displayed at top of page
- **Dual tabs**: "Dados" (data table) and "Analises" (charts/analysis)
- **Filtering**: Empresa, Centro de Custo (payables only), Ano, Mes (multi-select), and Tipo Documento (multi-select) dropdowns
- **Sortable columns**: Click on table headers to sort by that column (ascending/descending)
- **Charts**: Recharts-powered visualizations including bar charts

**Contas a Pagar**:
- ContasPagas: Pareto analysis with 80% concentration summary, creditor ranking
- ContasAPagar: Vencimento distribution, due today/overdue tracking, creditor analysis
- ContasAtrasadas: Atraso by faixa (days overdue), critical accounts (+30 days) summary panel

**Contas a Receber**:
- ContasRecebidas: Pareto analysis with 80% concentration summary, client ranking
- ContasAReceber: Vencimento distribution, due today/overdue tracking, client analysis
- ContasReceberAtrasadas: Atraso by faixa (days overdue), critical accounts (+30 days) summary panel

**Configurações** (Settings):
- Manage exclusion/inclusion of companies, cost centers, document types, and bank accounts
- Four separate tabs for Empresas, Centros de Custo, Tipos de Documento, and Contas Correntes
- Toggle switches to include/exclude items from all calculations and displays
- Changes persist to the database immediately

### Backend Architecture
- **Framework**: FastAPI (Python)
- **Server**: Uvicorn ASGI server (runs on port 8000)
- **Database Driver**: psycopg2-binary for PostgreSQL connections
- **Validation**: Pydantic models for request/response validation
- **CORS**: Enabled for all origins (development configuration)
- **Authentication**: JWT-based with bcrypt password hashing

### Authentication System (Added December 2025)
- **JWT Tokens**: Access tokens with 24-hour expiration
- **Password Security**: bcrypt hashing for secure storage
- **User Table**: `usuarios` in Replit PostgreSQL with email, nome, senha_hash
- **Login Page**: React component with login/register toggle
- **Protected Routes**: KPI and target management endpoints require authentication
- **Token Storage**: localStorage for access_token and user data

### API Structure
All endpoints are prefixed with `/api`:
- Dashboard metrics and charts
- Accounts listing with status filters (paid, pending, overdue)
- Monthly and category-based aggregations
- Upcoming due dates
- KPIs CRUD operations with history tracking
- Filter options (companies, cost centers, document types)
- Configuration management endpoints:
  - `GET /api/configuracoes`: Get all exclusion configurations
  - `POST /api/configuracoes/empresas`: Toggle company inclusion/exclusion
  - `POST /api/configuracoes/centros-custo`: Toggle cost center inclusion/exclusion
  - `POST /api/configuracoes/tipos-documento`: Toggle document type inclusion/exclusion

### API Proxy Configuration
Vite dev server proxies `/api` requests to the FastAPI backend at `http://localhost:8000`, enabling seamless frontend-backend communication during development.

### Database Schema
PostgreSQL database with tables for accounts payable and receivable:

**Contas a Pagar Tables**:
- `contas_a_pagar`: Main accounts payable table with fields for credor, valor, data_vencimento, data_pagamento, status
- `contas_pagas`: Paid accounts with historical payment data

**Contas a Receber Tables**:
- `contas_a_receber`: Pending receivables with cliente, valor_total, data_vencimento, id_documento
- `contas_recebidas`: Received payments with cliente, valor_total, valor_liquido, data_recebimento

**KPI Tables (Replit PostgreSQL - auto-created on startup)**:
- `kpis`: KPI definitions with descricao, categoria, indice, meta, tipo_meta, unidade, calculo_automatico, documentos_excluidos
- `kpis_historico`: Historical daily snapshots of KPI values with kpi_id, valor, data_registro

The KPI system supports:
- Manual and automatic KPIs (linked to system calculations like "Títulos Vencidos")
- Daily variation tracking (today vs yesterday)
- Historical comparison with trend indicators
- Snapshot creation for recording current values

**Configuration Tables (Replit PostgreSQL - auto-created on startup)**:
- `config_empresas_excluidas`: Stores `id_sienge_empresa` (int, unique) of excluded companies
- `config_centros_custo_excluidos`: Stores `id_interno_centrocusto` (int, unique) of excluded cost centers
- `config_tipos_documento_excluidos`: Stores `id_documento` (varchar, unique) of excluded document types
- `config_contas_correntes_excluidas`: Stores `id_conta_corrente` (varchar, unique) of excluded bank accounts

The configuration system supports:
- Centralizing all exclusion rules in one place
- Toggling items between included and excluded states
- Immediate persistence to database
- Automatic filtering applied to all data queries and calculations

**Snapshot/Audit Tables (Replit PostgreSQL - auto-created on startup)**:
- `snapshots_cards_pagar`: Stores daily snapshots of the 5 Contas a Pagar summary cards
  - Fields: `id` (serial), `data_snapshot` (date), `faixa` (varchar: total/hoje/7dias/15dias/30dias), `data_inicio` (date), `data_fim` (date), `valor_total` (numeric), `quantidade_titulos` (int), `quantidade_credores` (int), `created_at` (timestamp)
  - UNIQUE constraint on (data_snapshot, faixa) - upserts on same-day saves

The snapshot system supports:
- Saving current card values with their fixed date ranges for audit purposes
- Comparing current values against any previous snapshot to detect changes
- Visual indicators on cards showing value differences (increase in yellow, decrease in green)
- Use case: verify if new titles were added to a period that was previously checked

Snapshot API endpoints:
- `POST /api/snapshots/cards-pagar`: Save snapshot of all 5 cards (upserts for same day)
- `GET /api/snapshots/cards-pagar`: List available snapshot dates (last 30)
- `GET /api/snapshots/cards-pagar/{data}`: Get specific snapshot data by date

## External Dependencies

### Database
- **PostgreSQL**: External hosted database at `8iv70o.easypanel.host:42128`
- Database credentials are hardcoded in Python files (should be moved to environment variables for production)

### Python Packages
- `fastapi`: Web framework
- `uvicorn`: ASGI server
- `psycopg2-binary`: PostgreSQL adapter
- `pydantic`: Data validation
- `python-multipart`: Form data handling

### Node.js Packages
- `react`, `react-dom`: UI library
- `recharts`: Charting library
- `axios`: HTTP client
- `tailwindcss`: CSS framework
- `vite`: Build tool
- `typescript`: Type checking

### Development Workflow
1. Backend: Run `python main.py` from `backend/` directory (starts on port 8000)
2. Frontend: Run `npm run dev` from `frontend/` directory (starts on port 5000)
3. Access application at `http://localhost:5000`