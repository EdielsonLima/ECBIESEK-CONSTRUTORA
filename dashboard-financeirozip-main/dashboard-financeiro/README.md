# Dashboard Financeiro - Construtora

Aplicação web moderna para visualização e gestão de contas a pagar com gráficos interativos e tabelas responsivas.

## 🚀 Tecnologias Utilizadas

### Backend
- **FastAPI** - Framework web moderno e rápido
- **PostgreSQL** - Banco de dados relacional
- **Psycopg2** - Driver PostgreSQL para Python
- **Uvicorn** - Servidor ASGI

### Frontend
- **React 18** - Biblioteca JavaScript para interfaces
- **TypeScript** - Superset tipado do JavaScript
- **Tailwind CSS** - Framework CSS utilitário
- **Recharts** - Biblioteca de gráficos para React
- **Axios** - Cliente HTTP
- **Vite** - Build tool moderna

## 📋 Pré-requisitos

- Python 3.8+
- Node.js 18+
- PostgreSQL (já configurado com a tabela contas_a_pagar)

## 🔧 Instalação

### 1. Clone ou baixe o projeto

```bash
cd dashboard-financeiro
```

### 2. Configurar e rodar o Backend

```bash
# Entrar na pasta do backend
cd backend

# Criar ambiente virtual Python
python -m venv venv

# Ativar ambiente virtual
# No Windows:
venv\Scripts\activate
# No Linux/Mac:
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Rodar o servidor
python main.py
```

O backend estará disponível em: **http://localhost:8000**

Documentação automática da API: **http://localhost:8000/docs**

### 3. Configurar e rodar o Frontend

Abra um novo terminal:

```bash
# Entrar na pasta do frontend
cd frontend

# Instalar dependências
npm install

# Rodar o servidor de desenvolvimento
npm run dev
```

O frontend estará disponível em: **http://localhost:3000**

## 📊 Funcionalidades

### Dashboard Principal
- **Cards de Métricas**: Visualização rápida de contas pagas, a pagar e em atraso
- **Gráfico de Evolução Mensal**: Linha temporal mostrando a evolução das contas nos últimos 6 meses
- **Gráfico por Categoria**: Visualização das despesas agrupadas por categoria
- **Tabela de Contas em Atraso**: Lista das contas vencidas
- **Tabela de Próximos Vencimentos**: Contas que vencem nos próximos 30 dias

### API Endpoints Disponíveis

- `GET /api/metricas` - Retorna métricas principais (totais e quantidades)
- `GET /api/contas?status={status}&limite={n}` - Lista de contas com filtro
- `GET /api/grafico-mensal` - Dados para gráfico de evolução mensal
- `GET /api/grafico-categoria` - Dados para gráfico por categoria
- `GET /api/proximos-vencimentos?dias={n}` - Contas que vencem nos próximos N dias

## 🎨 Estrutura da Tabela PostgreSQL

A aplicação espera que a tabela `contas_a_pagar` tenha (no mínimo) as seguintes colunas:

```sql
- id (integer, primary key)
- descricao (text ou varchar)
- valor (numeric ou decimal)
- data_vencimento (date)
- data_pagamento (date, nullable)
- status (varchar)
- fornecedor (varchar, nullable)
- categoria (varchar, nullable)
- observacoes (text, nullable)
```

**Nota**: Se sua tabela tiver uma estrutura diferente, você precisará ajustar as queries no arquivo `backend/main.py`.

## 🔄 Como verificar a estrutura da sua tabela

Execute no PostgreSQL:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'contas_a_pagar';
```

## 🛠️ Customização

### Ajustar conexão do banco de dados

Edite as credenciais em `backend/main.py`:

```python
DB_CONFIG = {
    'host': 'seu_host',
    'port': sua_porta,
    'database': 'seu_banco',
    'user': 'seu_usuario',
    'password': 'sua_senha'
}
```

### Modificar porta do backend

Em `backend/main.py`, altere a última linha:

```python
uvicorn.run(app, host="0.0.0.0", port=8000)  # Altere a porta aqui
```

### Modificar porta do frontend

Em `frontend/vite.config.ts`, altere:

```typescript
server: {
    port: 3000,  // Altere a porta aqui
}
```

## 🎯 Próximos Passos Sugeridos

1. **Adicionar filtros avançados** (por data, fornecedor, categoria)
2. **Implementar paginação** nas tabelas
3. **Adicionar gráfico de pizza** para distribuição de categorias
4. **Exportar relatórios** em PDF ou Excel
5. **Sistema de alertas** para vencimentos próximos
6. **Dashboard para contas a receber** (quando estiver pronto)
7. **Autenticação e controle de acesso**
8. **Modo escuro**

## 📱 Responsividade

A aplicação é totalmente responsiva e funciona em:
- 💻 Desktop
- 📱 Tablets
- 📱 Smartphones

## 🐛 Resolução de Problemas

### Backend não conecta ao banco

- Verifique se o PostgreSQL está rodando
- Confirme as credenciais de acesso
- Teste a conexão manualmente

### Frontend não carrega dados

- Certifique-se de que o backend está rodando em http://localhost:8000
- Verifique o console do navegador para erros
- Confirme que não há problemas de CORS

### Erro ao instalar dependências

```bash
# Limpar cache do npm
npm cache clean --force

# Reinstalar
rm -rf node_modules package-lock.json
npm install
```

## 📝 Licença

Este projeto foi desenvolvido para uso interno da construtora.

## 👨‍💻 Suporte

Para dúvidas ou problemas, entre em contato com a equipe de TI.
