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
- **Contas a Receber**: A Receber, Recebidas, Atrasadas

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

### Backend Architecture
- **Framework**: FastAPI (Python)
- **Server**: Uvicorn ASGI server (runs on port 8000)
- **Database Driver**: psycopg2-binary for PostgreSQL connections
- **Validation**: Pydantic models for request/response validation
- **CORS**: Enabled for all origins (development configuration)

### API Structure
All endpoints are prefixed with `/api`:
- Dashboard metrics and charts
- Accounts listing with status filters (paid, pending, overdue)
- Monthly and category-based aggregations
- Upcoming due dates
- KPIs CRUD operations with history tracking
- Filter options (companies, cost centers, document types)

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

Additional tables for KPIs and related tracking functionality.

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