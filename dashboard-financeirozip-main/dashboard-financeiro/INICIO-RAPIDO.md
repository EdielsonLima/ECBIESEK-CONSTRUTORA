# 🚀 Guia Rápido de Início

## Para começar AGORA em 5 minutos:

### 1️⃣ Backend (Terminal 1)

```bash
cd dashboard-financeiro/backend
python -m venv venv

# Windows:
venv\Scripts\activate

# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
python main.py
```

✅ Backend rodando em: http://localhost:8000


### 2️⃣ Frontend (Terminal 2 - NOVO)

```bash
cd dashboard-financeiro/frontend
npm install
npm run dev
```

✅ Frontend rodando em: http://localhost:3000


### 3️⃣ Acesse o Dashboard

Abra seu navegador em: **http://localhost:3000**


## 🎯 Estrutura Esperada da Tabela

Sua tabela `contas_a_pagar` deve ter estas colunas principais:

- `id` - Identificador único
- `descricao` - Descrição da conta
- `valor` - Valor da conta (numeric/decimal)
- `data_vencimento` - Data de vencimento
- `data_pagamento` - Data do pagamento (null se não pago)
- `fornecedor` - Nome do fornecedor
- `categoria` - Categoria da despesa
- `status` - Status da conta

## ⚙️ Se sua tabela for diferente:

1. Execute no PostgreSQL:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'contas_a_pagar';
```

2. Me envie a estrutura e ajusto o código para você!


## 📊 Quer dados de teste?

```bash
cd backend
python popular_banco.py
```

Isso vai inserir 100 contas de exemplo no banco.


## ❌ Problemas?

### Backend não conecta:
- Verifique se PostgreSQL está rodando
- Confirme credenciais em `backend/main.py`

### Frontend não carrega:
- Backend deve estar rodando em http://localhost:8000
- Verifique console do navegador (F12)

### Erro ao instalar:
```bash
# Frontend
cd frontend
rm -rf node_modules package-lock.json
npm install

# Backend
cd backend
rm -rf venv
python -m venv venv
source venv/bin/activate  # ou venv\Scripts\activate no Windows
pip install -r requirements.txt
```


## 📧 Precisa de ajuda?

Me mande:
1. Estrutura da sua tabela
2. Print do erro
3. Qual parte não funcionou
