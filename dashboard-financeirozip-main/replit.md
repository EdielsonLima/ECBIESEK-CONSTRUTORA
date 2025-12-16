# Dashboard Financeiro - Construtora

## Overview

A financial dashboard web application for managing accounts payable (contas a pagar) for a construction company. The system provides visualization of financial data through interactive charts, tables, and metrics cards. It tracks paid accounts, pending payments, and overdue accounts with filtering capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS with custom color palette
- **Charts**: Recharts library for data visualization (bar charts, line charts)
- **HTTP Client**: Axios for API communication
- **State Management**: React useState hooks (no external state library)

The frontend uses a component-based architecture with:
- Reusable UI components (`MetricCard`, `ContasTable`, `CategoryChart`, `MonthlyChart`, `SearchableSelect`, `Sidebar`)
- Page components for different views (`Dashboard`, `ContasAPagar`, `ContasPagas`, `ContasAtrasadas`, `KPIs`)
- Centralized API service layer (`services/api.ts`)
- TypeScript interfaces for type safety (`types/index.ts`)

### Backend Architecture
- **Framework**: FastAPI (Python)
- **Server**: Uvicorn ASGI server
- **Database Driver**: psycopg2-binary for PostgreSQL
- **Validation**: Pydantic models for request/response validation
- **CORS**: Enabled for cross-origin requests

The backend exposes REST API endpoints under `/api` prefix with routes for:
- Dashboard metrics
- Accounts listing with status filters
- Monthly and category-based chart data
- Upcoming due dates
- Filtered paid accounts queries
- KPIs CRUD operations (GET, POST, PUT, DELETE /api/kpis)
- KPI history tracking (/api/kpis/{id}/historico)
- KPI value registration (/api/kpis/{id}/registrar-valor)
- KPIs summary with goal comparison (/api/kpis-resumo)

### API Proxy Configuration
The Vite dev server proxies `/api` requests to the backend at `http://localhost:8000`, enabling frontend development on port 5000 while backend runs on port 8000.

### Database Schema
Uses a `contas_a_pagar` table with columns:
- `id` (SERIAL PRIMARY KEY)
- `descricao` (TEXT)
- `fornecedor` (VARCHAR 255)
- `categoria` (VARCHAR 100)
- `valor` (NUMERIC 12,2)
- `data_vencimento` (DATE)
- `data_pagamento` (DATE, nullable)
- `status` (VARCHAR 50)
- `observacoes` (TEXT)
- `created_at`, `updated_at` (TIMESTAMP)

Additional table `contas_pagas` exists for paid accounts tracking.

### KPIs Database (Local Replit PostgreSQL)
The KPIs system uses the local Replit PostgreSQL database (DATABASE_URL) with two tables:

**`kpis`** - Main KPI table:
- `id` (SERIAL PRIMARY KEY)
- `descricao` (VARCHAR 255) - Description
- `categoria` (VARCHAR 100) - Category
- `indice` (VARCHAR 50) - Index/Code
- `formula` (TEXT) - Calculation formula
- `meta` (NUMERIC 12,2) - Target value
- `tipo_meta` (VARCHAR 20) - Target type ('maior', 'menor', 'igual')
- `unidade` (VARCHAR 20) - Unit (%, R$, days)
- `ativo` (BOOLEAN) - Active status
- `calculo_automatico` (VARCHAR 50) - Automatic calculation identifier (nullable)
- `documentos_excluidos` (TEXT) - Comma-separated list of document types to exclude from calculations (nullable)
- `created_at`, `updated_at` (TIMESTAMP)

**`kpis_historico`** - Historical values:
- `id` (SERIAL PRIMARY KEY)
- `kpi_id` (INTEGER, FK to kpis)
- `valor` (NUMERIC 12,2) - Value
- `data_registro` (DATE) - Registration date
- `created_at` (TIMESTAMP)

### KPIs Automatic Calculations
KPIs can be configured with automatic calculations that compute values in real-time from the database. Available calculations:
- `titulos_vencidos_qtd` - Count of overdue accounts
- `titulos_vencidos_valor` - Total value of overdue accounts
- `titulos_vencidos_2025_qtd` - Count of overdue accounts from 2025
- `titulos_vencidos_2025_valor` - Total value of overdue accounts from 2025
- `titulos_a_vencer_qtd` - Count of accounts to become due
- `titulos_a_vencer_valor` - Total value of accounts to become due
- `titulos_pagos_mes_qtd` - Count of accounts paid this month
- `titulos_pagos_mes_valor` - Total value of accounts paid this month
- `contas_a_pagar_hoje_qtd` - Count of accounts due today
- `contas_a_pagar_hoje_valor` - Total value of accounts due today
- `contas_a_pagar_7dias_qtd` - Count of accounts due in next 7 days
- `contas_a_pagar_7dias_valor` - Total value of accounts due in next 7 days
- `contas_a_pagar_mes_qtd` - Count of accounts due this month
- `contas_a_pagar_mes_valor` - Total value of accounts due this month
- `ticket_medio_pagamentos_mes` - Average payment value this month
- `percentual_inadimplencia` - Percentage of overdue accounts (overdue value / total value * 100)

### Document Exclusion Per KPI
Each KPI with automatic calculation can have a custom list of document types to exclude from the calculation. The user can select which document types to exclude via checkbox interface in the KPI registration form. If no documents are selected, no documents are excluded from the calculation.

Available document types for exclusion can be retrieved from `/api/tipos-documento-kpi` endpoint.

The `/api/calculos-disponiveis` endpoint returns the list of available calculations.
When a KPI has `calculo_automatico` set, the `/api/kpis-resumo` endpoint calculates its value automatically using the `documentos_excluidos` field to filter results.

### Filtros de Contas Pagas
A página de Contas Pagas oferece filtros avançados para reconciliação de dados com o Sienge:

**Tipo de Baixa (tipo_baixa):**
- Tipo 1: Pagamento (usado pelo Sienge para relatórios padrão)
- Tipo 3: Cancelamento
- Tipo 5: Substituição
- Tipo 8: Abatimento de Adiantamento
- Tipo 10: Adiantamento
- Tipo 11: Por Bens
- Tipo 12: Outros
- Tipo 22: Estorno

**Recomendação para reconciliação com Sienge:** Use Tipo 1 (Pagamento) para obter valores compatíveis com os relatórios padrão do Sienge.

### Mapeamento de Empresas
O sistema usa `id_sienge_empresa` da tabela `dim_centrocusto` para garantir compatibilidade com os IDs do Sienge:

| ID Sistema | ID Sienge | Empresa |
|------------|-----------|---------|
| 1 | 1 | Empreendimentos e Construções Biesek Ltda |
| 8 | 3 | LAGOA CLUBE RESORT SPE LTDA |
| 4 | 4 | Aquática Engenharia Civil Eireli |
| 5 | 5 | Bie Empreendimentos Ltda |
| 9 | 6 | ECBIESEK 06 EMPREENDIMENTO IMOBILIARIO SPE LTDA |
| 7 | 7 | RESIDENCIAL PARINTINS SPE LTDA |
| 10 | 8 | ECBIESEK 07 EMPREENDIMENTO IMOBILIARIO SPE LTDA |
| 11 | 9 | LAGUNAS RESIDENCIAL CLUBE SPE LTDA |
| 12 | 10 | ECBIESEK 08 EMPREENDIMENTO IMOBILIARIO SPE LTDA |
| 13 | 11 | ECBIESEK 09 EMPREENDIMENTO IMOBILIARIO SPE LTDA |
| 14 | 12 | RESIDENCIAL VALENÇA SPE LTDA |
| 15 | 13 | WALE INCORPORADORA IMOBILIARIA LTDA |
| 17 | 14 | LUZ ASSESSORIA EM NEGÓCIOS IMOBILIÁRIOS LTDA |

## External Dependencies

### Database
- **PostgreSQL**: External hosted database at `8iv70o.easypanel.host:42128`
- Database name: `ecbiesek`
- Connection uses psycopg2 with RealDictCursor for dictionary-style results

### Frontend Dependencies
- React 18.2.0
- TypeScript 5.3.3
- Tailwind CSS 3.4.0
- Recharts 2.10.3
- Axios 1.6.2
- Vite 5.0.8

### Backend Dependencies
- FastAPI 0.109.0
- Uvicorn 0.27.0
- psycopg2-binary 2.9.9
- Pydantic 2.5.3

### Development Ports
- Frontend: `http://localhost:5000` (Vite dev server)
- Backend: `http://localhost:8000` (FastAPI/Uvicorn)