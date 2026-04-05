# ECBIESEK-CONSTRUTORA - Dashboard Financeiro

## Projeto
Dashboard financeiro React 18 + TypeScript + Tailwind CSS (frontend) com FastAPI + PostgreSQL (backend). Deploy automático via Railway ao push para main.

## Regras
- Sempre fazer commit + push após mudanças (deploy é automático via Railway)
- Idioma do código: português (nomes de variáveis, comentários, commits)

## Release / Versionamento

### Arquivo de changelog
`dashboard-financeirozip-main/dashboard-financeiro/frontend/public/changelog.json`

### Como fazer um release com changelog

Ao finalizar alterações e o usuário pedir para commitar/fazer release, siga este processo:

1. **Analisar os commits** desde a última versão com `git log`
2. **Incrementar a versão** no `changelog.json` (campo `versao_atual`) e no `package.json`
   - Patch (1.1.0 → 1.1.1): correções de bugs
   - Minor (1.1.0 → 1.2.0): novas funcionalidades
   - Major (1.1.0 → 2.0.0): mudanças grandes/breaking
3. **Adicionar nova entrada** no início do array `historico` do `changelog.json` com:
   - `versao`: nova versão
   - `data`: data de hoje (YYYY-MM-DD)
   - `titulo`: "Novidades da Versao X.Y.Z"
   - `secoes`: agrupar mudanças por área, usando linguagem acessível ao usuário final
4. **Seções disponíveis** (usar conforme aplicável):
   - `"titulo": "Contas a Pagar", "icone": "wallet"`
   - `"titulo": "Contas Pagas", "icone": "wallet"`
   - `"titulo": "Contas Atrasadas", "icone": "alert"`
   - `"titulo": "Contas a Receber", "icone": "download"`
   - `"titulo": "Contas Recebidas", "icone": "download"`
   - `"titulo": "Inadimplencia", "icone": "alert"`
   - `"titulo": "Dashboard", "icone": "settings"`
   - `"titulo": "KPIs", "icone": "settings"`
   - `"titulo": "Geral", "icone": "settings"`
5. **Escrever itens em linguagem acessível** - o usuário final não é técnico. Exemplos:
   - BOM: "Novo filtro por Titulo para buscar contas especificas"
   - RUIM: "Adicionado state filtroTitulo com MultiSelectDropdown"
6. **Commit** com mensagem: `release: vX.Y.Z - breve descricao`
7. **Push** para main

### Estrutura do changelog.json
```json
{
  "versao_atual": "X.Y.Z",
  "historico": [
    {
      "versao": "X.Y.Z",
      "data": "YYYY-MM-DD",
      "titulo": "Novidades da Versao X.Y.Z",
      "secoes": [
        {
          "titulo": "Nome da Secao",
          "icone": "wallet|alert|download|settings",
          "itens": [
            "Descricao acessivel da mudanca 1",
            "Descricao acessivel da mudanca 2"
          ]
        }
      ]
    }
  ]
}
```
