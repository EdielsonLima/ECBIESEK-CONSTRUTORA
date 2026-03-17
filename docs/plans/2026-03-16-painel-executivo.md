# Painel Executivo — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Criar a tela "Painel Executivo" com 8 indicadores macro e grafico de exposicao de caixa acumulado, usando dados mock onde nao houver endpoint.

**Architecture:** Nova pagina React (PainelExecutivo.tsx) seguindo os padroes existentes — MetricCard para cards, Recharts para graficos, SearchableSelect para filtro de empreendimento. Dados mock realistas baseados no Lake Boulevard. Roteamento via state em App.tsx.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Recharts, Lucide-react

---

### Task 1: Adicionar tipos em types/index.ts

**Files:**
- Modify: `dashboard-financeirozip-main/dashboard-financeiro/frontend/src/types/index.ts`

**Step 1: Adicionar interfaces do Painel Executivo ao final do arquivo**

```typescript
export interface PainelExecutivoData {
  vgv: number;
  realizado: number;
  orcamento_total: number;
  saldo_a_realizar: number;
  valor_empreendimento: number;
  saldo_acumulado: number;
  exposicao_simples: number;
  exposicao_composta: number;
}

export interface ExposicaoMensal {
  periodo: string;
  mes_key: string;
  recebido: number;
  pago: number;
  saldo_acumulado: number;
}

export interface EmpreendimentoOption {
  id: number;
  nome: string;
  codigo: string;
}
```

**Step 2: Commit**

```bash
git add dashboard-financeirozip-main/dashboard-financeiro/frontend/src/types/index.ts
git commit -m "feat(PainelExecutivo): adiciona interfaces TypeScript"
```

---

### Task 2: Adicionar metodos de API com dados mock

**Files:**
- Modify: `dashboard-financeirozip-main/dashboard-financeiro/frontend/src/services/api.ts`

**Step 1: Importar novos tipos**

No import existente de `'../types'`, adicionar: `PainelExecutivoData, ExposicaoMensal, EmpreendimentoOption`

**Step 2: Adicionar metodos ao apiService (antes do fechamento do objeto)**

```typescript
  // === Painel Executivo ===

  getEmpreendimentos: async (): Promise<EmpreendimentoOption[]> => {
    // TODO: substituir por endpoint real quando disponivel
    return [
      { id: 0, nome: 'Consolidado', codigo: 'ALL' },
      { id: 1, nome: 'Lake Boulevard', codigo: 'LKB' },
      { id: 2, nome: 'Buenos Aires', codigo: 'BUA' },
      { id: 3, nome: 'Imperial Residence', codigo: 'IMP' },
      { id: 4, nome: 'BIE 3', codigo: 'BIE3' },
      { id: 5, nome: 'BIE 4', codigo: 'BIE4' },
      { id: 6, nome: 'Valenca', codigo: 'VAL' },
      { id: 7, nome: 'Lagunas Residencial Clube', codigo: 'LAG' },
    ];
  },

  getPainelExecutivo: async (empreendimentoId: number): Promise<PainelExecutivoData> => {
    // TODO: substituir por endpoint real quando disponivel
    // Dados mock baseados na reuniao 2026-03-16 (referencia Lake Boulevard)
    const mockPorEmpreendimento: Record<number, PainelExecutivoData> = {
      0: { // Consolidado
        vgv: 320000000,
        realizado: 112000000,
        orcamento_total: 158000000,
        saldo_a_realizar: 46000000,
        valor_empreendimento: 274000000,
        saldo_acumulado: 35000000,
        exposicao_simples: 35000000,
        exposicao_composta: 42000000,
      },
      1: { // Lake Boulevard
        vgv: 120000000,
        realizado: 43000000,
        orcamento_total: 58000000,
        saldo_a_realizar: 15000000,
        valor_empreendimento: 105000000,
        saldo_acumulado: 12000000,
        exposicao_simples: 12000000,
        exposicao_composta: 14500000,
      },
      2: { // Buenos Aires
        vgv: 85000000,
        realizado: 31000000,
        orcamento_total: 42000000,
        saldo_a_realizar: 11000000,
        valor_empreendimento: 74000000,
        saldo_acumulado: 9000000,
        exposicao_simples: 9000000,
        exposicao_composta: 10800000,
      },
      3: { // Imperial Residence
        vgv: 45000000,
        realizado: 18000000,
        orcamento_total: 28000000,
        saldo_a_realizar: 10000000,
        valor_empreendimento: 35000000,
        saldo_acumulado: 7000000,
        exposicao_simples: 7000000,
        exposicao_composta: 8200000,
      },
      4: { // BIE 3
        vgv: 30000000,
        realizado: 10000000,
        orcamento_total: 15000000,
        saldo_a_realizar: 5000000,
        valor_empreendimento: 25000000,
        saldo_acumulado: 3500000,
        exposicao_simples: 3500000,
        exposicao_composta: 4200000,
      },
      5: { // BIE 4
        vgv: 20000000,
        realizado: 5000000,
        orcamento_total: 8000000,
        saldo_a_realizar: 3000000,
        valor_empreendimento: 17000000,
        saldo_acumulado: 2000000,
        exposicao_simples: 2000000,
        exposicao_composta: 2400000,
      },
      6: { // Valenca
        vgv: 12000000,
        realizado: 3000000,
        orcamento_total: 5000000,
        saldo_a_realizar: 2000000,
        valor_empreendimento: 10000000,
        saldo_acumulado: 1000000,
        exposicao_simples: 1000000,
        exposicao_composta: 1200000,
      },
      7: { // Lagunas
        vgv: 8000000,
        realizado: 2000000,
        orcamento_total: 2000000,
        saldo_a_realizar: 0,
        valor_empreendimento: 8000000,
        saldo_acumulado: 500000,
        exposicao_simples: 500000,
        exposicao_composta: 600000,
      },
    };
    return mockPorEmpreendimento[empreendimentoId] ?? mockPorEmpreendimento[0];
  },

  getExposicaoExecutivo: async (empreendimentoId: number): Promise<ExposicaoMensal[]> => {
    // TODO: substituir por endpoint real quando disponivel
    // Serie mensal mock: mar/2023 a mar/2026 (36 meses)
    const meses = [
      'Mar/23','Abr/23','Mai/23','Jun/23','Jul/23','Ago/23','Set/23','Out/23','Nov/23','Dez/23',
      'Jan/24','Fev/24','Mar/24','Abr/24','Mai/24','Jun/24','Jul/24','Ago/24','Set/24','Out/24','Nov/24','Dez/24',
      'Jan/25','Fev/25','Mar/25','Abr/25','Mai/25','Jun/25','Jul/25','Ago/25','Set/25','Out/25','Nov/25','Dez/25',
      'Jan/26','Fev/26','Mar/26',
    ];
    const keys = [
      '2023-03','2023-04','2023-05','2023-06','2023-07','2023-08','2023-09','2023-10','2023-11','2023-12',
      '2024-01','2024-02','2024-03','2024-04','2024-05','2024-06','2024-07','2024-08','2024-09','2024-10','2024-11','2024-12',
      '2025-01','2025-02','2025-03','2025-04','2025-05','2025-06','2025-07','2025-08','2025-09','2025-10','2025-11','2025-12',
      '2026-01','2026-02','2026-03',
    ];
    const fator = empreendimentoId === 0 ? 2.8 : empreendimentoId === 1 ? 1.0 : 0.7;
    let acumulado = 0;
    return meses.map((m, i) => {
      const base_rec = (800000 + Math.sin(i * 0.5) * 400000 + i * 30000) * fator;
      const base_pag = (600000 + Math.cos(i * 0.3) * 300000 + i * 25000) * fator;
      const recebido = Math.round(base_rec);
      const pago = Math.round(base_pag);
      acumulado += recebido - pago;
      return {
        periodo: m,
        mes_key: keys[i],
        recebido,
        pago,
        saldo_acumulado: acumulado,
      };
    });
  },
```

**Step 3: Commit**

```bash
git add dashboard-financeirozip-main/dashboard-financeiro/frontend/src/services/api.ts
git commit -m "feat(PainelExecutivo): adiciona metodos API com dados mock"
```

---

### Task 3: Criar pagina PainelExecutivo.tsx

**Files:**
- Create: `dashboard-financeirozip-main/dashboard-financeiro/frontend/src/pages/PainelExecutivo.tsx`

**Step 1: Criar o componente completo**

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/api';
import { PainelExecutivoData, ExposicaoMensal, EmpreendimentoOption } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DollarSign, CheckCircle, FileText, Clock, Building2, Wallet, TrendingDown, Calculator } from 'lucide-react';
import { criarPDFBase, adicionarResumoCards, finalizarPDF, gerarNomeArquivo, formatCurrencyPDF } from '../utils/pdfExport';

interface PainelExecutivoProps {
  onNavigate?: (page: string) => void;
}

const formatCurrency = (value: number): string => {
  if (Math.abs(value) >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1).replace('.', ',')}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}K`;
  }
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
};

const formatCurrencyFull = (value: number): string => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatCurrencyFull(entry.value)}
        </p>
      ))}
    </div>
  );
};

export const PainelExecutivo: React.FC<PainelExecutivoProps> = ({ onNavigate }) => {
  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoOption[]>([]);
  const [empreendimentoId, setEmpreendimentoId] = useState<number>(0);
  const [data, setData] = useState<PainelExecutivoData | null>(null);
  const [exposicao, setExposicao] = useState<ExposicaoMensal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    apiService.getEmpreendimentos().then(setEmpreendimentos).catch(() => {});
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [painelData, exposicaoData] = await Promise.all([
          apiService.getPainelExecutivo(empreendimentoId),
          apiService.getExposicaoExecutivo(empreendimentoId),
        ]);
        setData(painelData);
        setExposicao(exposicaoData);
      } catch (err) {
        setError('Erro ao carregar dados do painel executivo.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [empreendimentoId]);

  const empreendimentoNome = empreendimentos.find(e => e.id === empreendimentoId)?.nome ?? 'Consolidado';

  const filteredEmpreendimentos = empreendimentos.filter(e =>
    e.nome.toLowerCase().includes(dropdownSearch.toLowerCase()) ||
    e.codigo.toLowerCase().includes(dropdownSearch.toLowerCase())
  );

  const handleExportPDF = () => {
    if (!data) return;
    const { doc, pageWidth, margin, y: startY, dataGeracao } = criarPDFBase(
      'Painel Executivo',
      `Empreendimento: ${empreendimentoNome}`
    );
    let y = startY;
    y = adicionarResumoCards(doc, [
      { label: 'VGV', valor: data.vgv, cor: [59, 130, 246] },
      { label: 'Realizado', valor: data.realizado, cor: [34, 197, 94] },
      { label: 'Orcamento Total', valor: data.orcamento_total, cor: [100, 116, 139] },
      { label: 'Saldo a Realizar', valor: data.saldo_a_realizar, cor: [249, 115, 22] },
      { label: 'Valor Empreendimento', valor: data.valor_empreendimento, cor: [99, 102, 241] },
      { label: 'Saldo Acumulado', valor: data.saldo_acumulado, cor: [168, 85, 247] },
      { label: 'Exposicao Simples', valor: data.exposicao_simples, cor: [239, 68, 68] },
      { label: 'Exposicao Composta', valor: data.exposicao_composta, cor: [244, 63, 94] },
    ], y, pageWidth, margin);
    finalizarPDF(doc, gerarNomeArquivo('painel_executivo', empreendimentoNome), dataGeracao);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Carregando painel executivo...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    { title: 'VGV', value: formatCurrency(data.vgv), subtitle: 'Estoque + Vendas', icon: <DollarSign className="h-6 w-6" />, color: 'blue' as const, borderColor: 'border-blue-100', iconBg: 'bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-200' },
    { title: 'Realizado', value: formatCurrency(data.realizado), subtitle: 'Total Pago', icon: <CheckCircle className="h-6 w-6" />, color: 'green' as const, borderColor: 'border-green-100', iconBg: 'bg-gradient-to-br from-green-400 to-green-600 shadow-green-200' },
    { title: 'Orcamento Total', value: formatCurrency(data.orcamento_total), subtitle: 'Custo Previsto', icon: <FileText className="h-6 w-6" />, color: 'blue' as const, borderColor: 'border-slate-100', iconBg: 'bg-gradient-to-br from-slate-400 to-slate-600 shadow-slate-200' },
    { title: 'Saldo a Realizar', value: formatCurrency(data.saldo_a_realizar), subtitle: 'Orcamento - Realizado', icon: <Clock className="h-6 w-6" />, color: 'blue' as const, borderColor: 'border-orange-100', iconBg: 'bg-gradient-to-br from-orange-400 to-orange-600 shadow-orange-200' },
    { title: 'Valor do Empreendimento', value: formatCurrency(data.valor_empreendimento), subtitle: 'VGV - Saldo a Realizar', icon: <Building2 className="h-6 w-6" />, color: 'blue' as const, borderColor: 'border-indigo-100', iconBg: 'bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-indigo-200' },
    { title: 'Saldo Acumulado', value: formatCurrency(data.saldo_acumulado), subtitle: 'Capital Aportado', icon: <Wallet className="h-6 w-6" />, color: 'blue' as const, borderColor: 'border-purple-100', iconBg: 'bg-gradient-to-br from-purple-400 to-purple-600 shadow-purple-200' },
    { title: 'Exposicao Simples', value: formatCurrency(data.exposicao_simples), subtitle: 'Capital Investido', icon: <TrendingDown className="h-6 w-6" />, color: 'red' as const, borderColor: 'border-red-100', iconBg: 'bg-gradient-to-br from-red-400 to-red-600 shadow-red-200' },
    { title: 'Exposicao Composta', value: formatCurrency(data.exposicao_composta), subtitle: 'Com Custo Oportunidade', icon: <Calculator className="h-6 w-6" />, color: 'red' as const, borderColor: 'border-rose-100', iconBg: 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-200' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header com filtro */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">Visao consolidada do empreendimento</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Dropdown Empreendimento */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors min-w-[220px]"
            >
              <Building2 className="h-4 w-4 text-blue-500" />
              <span className="flex-1 text-left">{empreendimentoNome}</span>
              <svg className={`h-4 w-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="p-2">
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={dropdownSearch}
                    onChange={(e) => setDropdownSearch(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredEmpreendimentos.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => { setEmpreendimentoId(emp.id); setDropdownOpen(false); setDropdownSearch(''); }}
                      className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                        emp.id === empreendimentoId
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-xs text-gray-400 w-8">{emp.codigo}</span>
                      <span>{emp.nome}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Botao PDF */}
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 shadow-sm transition-colors"
            title="Exportar PDF"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* Badge dados mock */}
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
        <svg className="h-4 w-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-amber-700">
          <span className="font-semibold">Dados ilustrativos</span> — VGV, Orcamento e Saldo a Realizar usam dados mock. Aguardando endpoints do backend.
        </p>
      </div>

      {/* Cards - 8 indicadores em grid 4x2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, idx) => (
          <div
            key={idx}
            className={`rounded-2xl border ${card.borderColor} bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg`}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider truncate">{card.title}</p>
                <p className="mt-2 text-3xl font-extrabold text-gray-900">{card.value}</p>
                <p className="mt-1 text-sm font-medium text-gray-400">{card.subtitle}</p>
              </div>
              <div className={`rounded-xl p-3 shadow-lg ${card.iconBg} text-white flex-shrink-0 ml-3`}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Grafico Exposicao de Caixa Acumulado */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Exposicao de Caixa</h3>
            <p className="text-sm text-gray-500 mt-0.5">Fluxo acumulado mes a mes — {empreendimentoNome}</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={exposicao} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="periodo"
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickLine={false}
              interval={2}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickLine={false}
              tickFormatter={(v: number) => `${(v / 1000000).toFixed(1)}M`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              height={36}
              formatter={(value: string) => <span className="text-sm text-gray-600">{value}</span>}
            />
            <Line
              type="monotone"
              dataKey="recebido"
              name="Recebido"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="pago"
              name="Pago"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="saldo_acumulado"
              name="Saldo Acumulado"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 6 }}
              strokeDasharray="5 5"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
```

**Step 2: Commit**

```bash
git add dashboard-financeirozip-main/dashboard-financeiro/frontend/src/pages/PainelExecutivo.tsx
git commit -m "feat(PainelExecutivo): cria pagina com 8 cards e grafico de exposicao"
```

---

### Task 4: Registrar rota no App.tsx

**Files:**
- Modify: `dashboard-financeirozip-main/dashboard-financeiro/frontend/src/App.tsx`

**Step 1: Adicionar import (apos a linha 14, import ExposicaoCaixa)**

```typescript
import { PainelExecutivo } from './pages/PainelExecutivo';
```

**Step 2: Adicionar case no renderPage() (antes de `case 'exposicao-caixa':`, ~linha 118)**

```typescript
      case 'painel-executivo':
        return <PainelExecutivo onNavigate={setCurrentPage} />;
```

**Step 3: Adicionar titulo no header (apos linha 159, exposicao-caixa)**

```typescript
                {currentPage === 'painel-executivo' && 'Painel Executivo'}
```

**Step 4: Commit**

```bash
git add dashboard-financeirozip-main/dashboard-financeiro/frontend/src/App.tsx
git commit -m "feat(PainelExecutivo): registra rota e header no App.tsx"
```

---

### Task 5: Adicionar item no menu Sidebar.tsx

**Files:**
- Modify: `dashboard-financeirozip-main/dashboard-financeiro/frontend/src/components/Sidebar.tsx`

**Step 1: Adicionar item "Painel Executivo" no array de items do grupo Financeiro, como primeiro item (antes de 'dashboard', ~linha 71)**

Inserir antes do item `{ id: 'dashboard', ... }`:

```typescript
        {
          id: 'painel-executivo',
          label: 'Painel Executivo',
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          ),
        },
```

**Step 2: Commit**

```bash
git add dashboard-financeirozip-main/dashboard-financeiro/frontend/src/components/Sidebar.tsx
git commit -m "feat(PainelExecutivo): adiciona item no menu Financeiro da Sidebar"
```

---

### Task 6: Verificar build e testar

**Step 1: Executar build TypeScript para verificar erros**

```bash
cd dashboard-financeirozip-main/dashboard-financeiro/frontend && npx tsc --noEmit
```

Expected: sem erros de tipo

**Step 2: Se houver erros, corrigir e comitar**

**Step 3: Commit final se houve correcoes**

```bash
git add -A
git commit -m "fix(PainelExecutivo): corrige erros de build"
```
