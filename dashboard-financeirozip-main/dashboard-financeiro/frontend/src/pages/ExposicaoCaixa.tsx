import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { apiService } from '../services/api';
import { criarPDFBase, adicionarResumoCards, adicionarTabela, finalizarPDF, gerarNomeArquivo, formatCurrencyPDF } from '../utils/pdfExport';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';

interface Linha {
  periodo: string;   // "Jan/25"
  mesKey: string;    // "2025-01"
  recebido: number;
  pago: number;
}

interface CentroCusto {
  id: number;
  nome: string;
}

interface MesData {
  mes: string;      // "YYYY-MM"
  mes_nome: string;
  valor: number;
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const fmtNum = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

function gerarMeses(inicio: string, fim: string): string[] {
  const meses: string[] = [];
  const [iniAno, iniMes] = inicio.split('-').map(Number);
  const [fimAno, fimMes] = fim.split('-').map(Number);
  let ano = iniAno, mes = iniMes;
  while (ano < fimAno || (ano === fimAno && mes <= fimMes)) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return meses;
}

function mesKeyToLabel(mesKey: string): string {
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const [ano, mes] = mesKey.split('-').map(Number);
  return `${nomes[mes - 1]}/${String(ano).slice(2)}`;
}

// Tooltip customizado para o gráfico
const TooltipGrafico = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg p-4 min-w-[220px]">
      <p className="font-bold text-gray-700 dark:text-slate-300 mb-2 text-sm">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm mb-1">
          <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600 dark:text-slate-400 flex-1">{entry.name}</span>
          <span className="font-semibold" style={{ color: entry.color }}>
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

// Dropdown pesquisável de centro de custo
const SelectPesquisavel = ({
  centros,
  valor,
  onChange,
}: {
  centros: CentroCusto[];
  valor: number | null;
  onChange: (id: number | null) => void;
}) => {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtrados = useMemo(() => {
    const t = busca.toLowerCase();
    return [{ id: 0, nome: 'Todos os centros de custo' }, ...centros].filter(c =>
      c.nome.toLowerCase().includes(t)
    );
  }, [centros, busca]);

  const nomeAtual = valor === null
    ? 'Todos os centros de custo'
    : centros.find(c => c.id === valor)?.nome ?? 'Todos os centros de custo';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
        setBusca('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-slate-800"
      >
        <span className="truncate text-gray-700 dark:text-slate-300">{nomeAtual}</span>
        <svg className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {aberto && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-slate-700/50">
            <input
              autoFocus
              type="text"
              placeholder="Pesquisar..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full border border-gray-200 dark:border-slate-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtrados.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-4">Nenhum resultado</p>
            ) : filtrados.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id === 0 ? null : c.id); setAberto(false); setBusca(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${(c.id === 0 ? null : c.id) === valor ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700 dark:text-slate-300'
                  }`}
              >
                {c.nome}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Formata valores no eixo Y do gráfico
const formatarEixoY = (valor: number) => {
  if (Math.abs(valor) >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)}M`;
  if (Math.abs(valor) >= 1_000) return `R$ ${(valor / 1_000).toFixed(0)}K`;
  return `R$ ${valor}`;
};

export const ExposicaoCaixa: React.FC = () => {
  const [aba, setAba] = useState<'tabela' | 'comparativo' | 'grafico'>('tabela');
  const [taxaMensal, setTaxaMensal] = useState(1.5);
  const [tipoCusto, setTipoCusto] = useState<'simples' | 'composto'>('simples');
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([]);
  const [centroCustoId, setCentroCustoId] = useState<number | null>(null);
  const [dataInicio, setDataInicio] = useState('2025-01');
  const [dataFim, setDataFim] = useState('2026-12');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  // Origens configuradas (vindas da página de Configurações)
  const [origensSiglas, setOrigensSiglas] = useState<string[]>([]);
  const [origensConfigurado, setOrigensConfigurado] = useState(false);

  // Tipos de Baixa configurados
  const [tiposBaixaIds, setTiposBaixaIds] = useState<number[]>([]);
  const [tiposBaixaConfigurado, setTiposBaixaConfigurado] = useState(false);

  // Filtros independentes para o gráfico
  const [grafCentroCustoId, setGrafCentroCustoId] = useState<number | null>(null);
  const [grafDataInicio, setGrafDataInicio] = useState('2023-01');
  const [grafDataFim, setGrafDataFim] = useState('2026-12');
  const [grafLinhas, setGrafLinhas] = useState<Linha[]>([]);
  const [grafLoading, setGrafLoading] = useState(false);
  const [grafErro, setGrafErro] = useState('');

  // Carrega centros de custo e origens configuradas
  useEffect(() => {
    axios.get('/api/filtros/centros-custo')
      .then(r => setCentrosCusto(r.data))
      .catch(() => setErro('Erro ao carregar centros de custo'));

    apiService.getOrigensExposicaoCaixaSiglas()
      .then(r => { setOrigensSiglas(r.siglas); setOrigensConfigurado(r.configurado); })
      .catch(() => { /* sem config = sem filtro */ });

    apiService.getTiposBaixaExposicaoCaixaIds()
      .then(r => { setTiposBaixaIds(r.ids); setTiposBaixaConfigurado(r.configurado); })
      .catch(() => { /* sem config = sem filtro */ });
  }, []);

  const fetchLinhas = useCallback(async (
    centroCusto: number | null,
    inicio: string,
    fim: string,
    setLoad: (v: boolean) => void,
    setErr: (v: string) => void,
    setData: (v: Linha[]) => void,
  ) => {
    setLoad(true);
    setErr('');
    try {
      const anoInicio = inicio.split('-')[0];
      const anoFim = fim.split('-')[0];
      const anos = Array.from(
        new Set([...Array.from({ length: Number(anoFim) - Number(anoInicio) + 1 }, (_, i) => String(Number(anoInicio) + i))])
      ).join(',');

      const params: Record<string, string> = { ano: anos };
      if (centroCusto) params.centro_custo = String(centroCusto);
      if (origensConfigurado && origensSiglas.length > 0) {
        params.origens_titulo = origensSiglas.join(',');
      }
      if (tiposBaixaConfigurado && tiposBaixaIds.length > 0) {
        params.tipos_baixa_exposicao = tiposBaixaIds.join(',');
      }

      const [resPago, resRecebido] = await Promise.all([
        axios.get('/api/estatisticas-por-mes', { params }),
        axios.get('/api/recebidas-por-mes', { params }),
      ]);

      const pagoPorMes: Record<string, number> = {};
      (resPago.data as MesData[]).forEach(d => { pagoPorMes[d.mes] = d.valor; });

      const recebidoPorMes: Record<string, number> = {};
      (resRecebido.data as MesData[]).forEach(d => { recebidoPorMes[d.mes] = d.valor; });

      const meses = gerarMeses(inicio, fim);
      const novas: Linha[] = meses.map(mesKey => ({
        periodo: mesKeyToLabel(mesKey),
        mesKey,
        recebido: recebidoPorMes[mesKey] ?? 0,
        pago: pagoPorMes[mesKey] ?? 0,
      }));

      setData(novas);
    } catch {
      setErr('Erro ao carregar dados do servidor.');
    } finally {
      setLoad(false);
    }
  }, []);

  // Carrega tabela
  const carregarDados = useCallback(() => {
    fetchLinhas(centroCustoId, dataInicio, dataFim, setLoading, setErro, setLinhas);
  }, [centroCustoId, dataInicio, dataFim, fetchLinhas, origensSiglas, origensConfigurado, tiposBaixaIds, tiposBaixaConfigurado]);

  // Carrega gráfico
  const carregarGrafico = useCallback(() => {
    fetchLinhas(grafCentroCustoId, grafDataInicio, grafDataFim, setGrafLoading, setGrafErro, setGrafLinhas);
  }, [grafCentroCustoId, grafDataInicio, grafDataFim, fetchLinhas, origensSiglas, origensConfigurado, tiposBaixaIds, tiposBaixaConfigurado]);

  // Calcula linha a linha (tabela)
  const calculado = useMemo(() => {
    let acumulado = 0;
    let jurosAcumulados = 0;

    return linhas.map((l) => {
      const resultadoMensal = l.recebido - l.pago;
      acumulado += resultadoMensal;
      const exposicaoNegativa = Math.min(0, acumulado);

      let custoMensalSimples = 0;
      let custoMensalComposto = 0;

      if (exposicaoNegativa < 0) {
        // Cálculo Simples Mensal
        custoMensalSimples = Math.abs(exposicaoNegativa) * (taxaMensal / 100);

        // Cálculo Composto
        const baseLancamento = Math.abs(exposicaoNegativa) + jurosAcumulados;
        custoMensalComposto = baseLancamento * (taxaMensal / 100);
        jurosAcumulados += custoMensalComposto;
      } else {
        jurosAcumulados = 0; // zera quando a exposição volta a ser positiva
      }

      return {
        resultadoMensal,
        acumulado,
        exposicaoNegativa,
        custoMensalSimples,
        custoMensalComposto,
        custoCompostoAcumulado: jurosAcumulados,
        exposicaoAjustada: exposicaoNegativa < 0 ? Math.abs(exposicaoNegativa) + (jurosAcumulados - custoMensalComposto) : 0,
      };
    });
  }, [linhas, taxaMensal]);

  const totais = useMemo(() => {
    const totalRecebido = linhas.reduce((s, l) => s + l.recebido, 0);
    const totalPago = linhas.reduce((s, l) => s + l.pago, 0);
    const totalCustoSimples = calculado.reduce((s, c) => s + c.custoMensalSimples, 0);
    const totalCustoComposto = calculado.reduce((s, c) => s + c.custoMensalComposto, 0);
    const totalCusto = tipoCusto === 'simples' ? totalCustoSimples : totalCustoComposto;
    const resultadoFinal = totalRecebido - totalPago;
    const picoExposicao = calculado.length ? Math.min(...calculado.map(c => c.exposicaoNegativa)) : 0;
    const picoExposicaoAjustada = calculado.length ? Math.max(...calculado.map(c => c.exposicaoAjustada)) : 0;
    const mesesNegativos = calculado.filter(c => c.exposicaoNegativa < 0).length;
    const idxZero = calculado.findIndex((c, i) => i > 0 && c.exposicaoNegativa === 0 && calculado[i - 1].exposicaoNegativa < 0);
    return { totalRecebido, totalPago, totalCusto, totalCustoSimples, totalCustoComposto, resultadoFinal, picoExposicao, picoExposicaoAjustada, mesesNegativos, mesZero: idxZero >= 0 ? idxZero + 1 : null };
  }, [linhas, calculado, tipoCusto]);

  const exportarPDF = () => {
    if (linhas.length === 0) return;
    const { doc, pageWidth, margin, dataGeracao } = criarPDFBase('Exposição de Caixa', `Período: ${dataInicio} a ${dataFim} | Taxa: ${taxaMensal}% (${tipoCusto})`);
    let y = 34;

    const cc = centrosCusto.find(c => c.id === centroCustoId);
    if (cc) {
      y = 34;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text(`Centro de Custo: ${cc.nome}`, margin, y);
      y += 6;
    }

    y = adicionarResumoCards(doc, [
      { label: 'Total Recebido', valor: totais.totalRecebido, cor: [22, 163, 74] },
      { label: 'Total Pago', valor: totais.totalPago, cor: [239, 68, 68] },
      { label: 'Resultado', valor: totais.resultadoFinal, cor: totais.resultadoFinal >= 0 ? [59, 130, 246] : [239, 68, 68] },
      { label: 'Custo Financeiro', valor: totais.totalCusto, cor: [139, 92, 246] },
      { label: 'Pico Exposição', valor: Math.abs(totais.picoExposicao), cor: [249, 115, 22] },
    ], y, pageWidth, margin);

    const custoKey = tipoCusto === 'simples' ? 'custoMensalSimples' : 'custoMensalComposto';
    adicionarTabela(doc, {
      head: [['#', 'Período', 'Recebido', 'Pago', 'Resultado', 'Acumulado', 'Exposição Neg.', `Custo Fin. (${tipoCusto})`]],
      body: linhas.map((l, i) => [
        String(i + 1), l.periodo,
        `R$ ${formatCurrencyPDF(l.recebido)}`, `R$ ${formatCurrencyPDF(l.pago)}`,
        `R$ ${formatCurrencyPDF(calculado[i].resultadoMensal)}`,
        `R$ ${formatCurrencyPDF(calculado[i].acumulado)}`,
        calculado[i].exposicaoNegativa < 0 ? `R$ ${formatCurrencyPDF(Math.abs(calculado[i].exposicaoNegativa))}` : '-',
        calculado[i][custoKey] > 0 ? `R$ ${formatCurrencyPDF(calculado[i][custoKey])}` : '-',
      ]),
      foot: [['', 'TOTAIS',
        `R$ ${formatCurrencyPDF(totais.totalRecebido)}`, `R$ ${formatCurrencyPDF(totais.totalPago)}`,
        `R$ ${formatCurrencyPDF(totais.resultadoFinal)}`, '', '',
        `R$ ${formatCurrencyPDF(totais.totalCusto)}`,
      ]],
      columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
      didParseCell: (data: any) => {
        if (data.section === 'body') {
          if (data.column.index === 4) {
            const val = calculado[data.row.index]?.resultadoMensal;
            if (val !== undefined && val < 0) data.cell.styles.textColor = [220, 38, 38];
            else if (val !== undefined && val > 0) data.cell.styles.textColor = [22, 163, 74];
          }
          if (data.column.index === 5) {
            const val = calculado[data.row.index]?.acumulado;
            if (val !== undefined && val < 0) data.cell.styles.textColor = [220, 38, 38];
            else if (val !== undefined && val > 0) data.cell.styles.textColor = [22, 163, 74];
          }
          if (data.column.index === 6) {
            const raw = data.cell.raw;
            if (raw !== '-') data.cell.styles.textColor = [249, 115, 22];
          }
        }
      },
    }, y, margin);

    finalizarPDF(doc, gerarNomeArquivo('exposicao_caixa'), dataGeracao);
  };

  // Dados acumulados para o gráfico
  const dadosGrafico = useMemo(() => {
    let pagAcum = 0, recAcum = 0;
    return grafLinhas.map(l => {
      pagAcum += l.pago;
      recAcum += l.recebido;
      const exposAcum = pagAcum - recAcum; // exposição = pago > recebido
      return {
        periodo: l.periodo,
        'Pago Acumulado': pagAcum,
        'Recebido Acumulado': recAcum,
        'Exposição Acumulada': exposAcum > 0 ? exposAcum : 0,
      };
    });
  }, [grafLinhas]);

  const centroCustoNome = centrosCusto.find(c => c.id === centroCustoId)?.nome ?? 'Todos os centros de custo';
  const corRes = (v: number) => v >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold';

  return (
    <div className="p-6 space-y-5">

      {/* Cabeçalho */}
      <div className="bg-blue-900 text-white rounded-xl px-6 py-4 shadow-lg">
        <h2 className="text-xl font-bold tracking-wide uppercase">
          Exposição de Caixa — Custo de Oportunidade
        </h2>
        <p className="text-blue-200 text-sm mt-1">{centroCustoNome}</p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setAba('tabela')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${aba === 'tabela'
              ? 'bg-white dark:bg-slate-800 text-blue-700 shadow-sm'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300'
            }`}
        >
          Tabela
        </button>
        <button
          onClick={() => setAba('comparativo')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${aba === 'comparativo'
              ? 'bg-white dark:bg-slate-800 text-blue-700 shadow-sm'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300'
            }`}
        >
          Comparativo
        </button>
        <button
          onClick={() => setAba('grafico')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${aba === 'grafico'
              ? 'bg-white dark:bg-slate-800 text-blue-700 shadow-sm'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300'
            }`}
        >
          Gráfico
        </button>
      </div>

      {/* ==================== ABA TABELA ==================== */}
      {aba === 'tabela' && (
        <>
          {/* Filtros */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-4">Filtros e Premissas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Centro de Custo</label>
                <SelectPesquisavel
                  centros={centrosCusto}
                  valor={centroCustoId}
                  onChange={setCentroCustoId}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Período Início</label>
                <input type="month" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Período Fim</label>
                <input type="month" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-700 mb-1">Taxa Mensal (%)</label>
                <div className="flex items-center gap-2">
                  <input type="number" step="0.01" value={taxaMensal}
                    onChange={e => setTaxaMensal(parseFloat(e.target.value) || 0)}
                    className="w-24 border-2 border-amber-400 rounded-lg px-3 py-2 text-sm font-bold bg-yellow-50 focus:outline-none"
                  />
                  <span className="text-amber-700 font-semibold text-sm">% a.m.</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Modo do Custo</label>
                <div className="flex bg-gray-100 rounded-lg p-1 w-fit border border-gray-200 dark:border-slate-700">
                  <button
                    onClick={() => setTipoCusto('simples')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tipoCusto === 'simples'
                        ? 'bg-white dark:bg-slate-800 shadow-sm text-purple-700'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300'
                      }`}
                  >
                    Simples
                  </button>
                  <button
                    onClick={() => setTipoCusto('composto')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tipoCusto === 'composto'
                        ? 'bg-white dark:bg-slate-800 shadow-sm text-purple-700'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300'
                      }`}
                  >
                    Composto
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button onClick={exportarPDF} disabled={linhas.length === 0}
                className="bg-red-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                Exportar PDF
              </button>
              <button onClick={carregarDados} disabled={loading}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
                {loading ? (
                  <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> Carregando...</>
                ) : (
                  <><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Carregar Dados Reais</>
                )}
              </button>
              {erro && <span className="text-red-600 dark:text-red-400 text-sm">{erro}</span>}
              {origensConfigurado && (
                <span className={`text-xs px-2 py-1 rounded border ${origensSiglas.length > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-700 dark:text-red-400'}`}>
                  {origensSiglas.length > 0 ? `Origens: ${origensSiglas.join(', ')}` : 'Sem origens ativas'}
                </span>
              )}
              {tiposBaixaConfigurado && (
                <span className={`text-xs px-2 py-1 rounded border ${tiposBaixaIds.length > 0 ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-700 dark:text-red-400'}`}>
                  {tiposBaixaIds.length > 0 ? `Tipos baixa: ${tiposBaixaIds.join(', ')}` : 'Sem tipos de baixa ativos'}
                </span>
              )}
            </div>

            <p className="mt-3 text-xs text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-900 rounded-lg px-3 py-2">
              <strong>Regra:</strong> Quando o acumulado é negativo, a empresa financia as obras com capital próprio.
              <br />
              <strong className="text-purple-600 mt-1 inline-block">Simples: </strong> Reverte e isola apenas o custo do mês atual <span className="opacity-70">( |Exposição| × Taxa )</span>
              <br />
              <strong className="text-purple-600">Composto: </strong> Soma os custos continuamente como se fosse uma dívida real <span className="opacity-70">( (|Exposição| + Juros Anteriores) × Taxa )</span>. Mês a mês, exibe o Custo Acumulado.
            </p>
          </div>

          {/* Resumo Executivo */}
          {linhas.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-xs text-green-600 font-semibold uppercase mb-1">Total Recebido</p>
                <p className="text-base font-bold text-green-700">{fmt(totais.totalRecebido)}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-xs text-red-600 dark:text-red-400 font-semibold uppercase mb-1">Total Pago</p>
                <p className="text-base font-bold text-red-700 dark:text-red-400">{fmt(totais.totalPago)}</p>
              </div>
              <div className={`${totais.resultadoFinal >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 dark:bg-red-900/20 border-red-200'} border rounded-xl p-4 text-center`}>
                <p className={`text-xs font-semibold uppercase mb-1 ${totais.resultadoFinal >= 0 ? 'text-blue-600' : 'text-red-600 dark:text-red-400'}`}>Resultado Final</p>
                <p className={`text-base font-bold ${totais.resultadoFinal >= 0 ? 'text-blue-700' : 'text-red-700 dark:text-red-400'}`}>{fmt(totais.resultadoFinal)}</p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                <p className="text-xs text-purple-600 font-semibold uppercase mb-1">Custo de Oportunidade</p>
                <p className="text-base font-bold text-purple-700">{fmt(totais.totalCusto)}</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                <p className="text-xs text-orange-600 font-semibold uppercase mb-1">Pico Exposição Negativa</p>
                <p className="text-base font-bold text-orange-700">({fmt(Math.abs(totais.picoExposicao))})</p>
              </div>
              <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold uppercase mb-1">Meses em Exposição</p>
                <p className="text-2xl font-bold text-gray-700 dark:text-slate-300">{totais.mesesNegativos}</p>
                <p className="text-xs text-gray-400">{totais.mesZero ? `Equilíbrio: mês ${totais.mesZero}` : 'Nunca positivo'}</p>
              </div>
            </div>
          )}

          {/* Tabela */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider">
                Fluxo de Caixa Mensal
                {linhas.length > 0 && <span className="ml-2 text-gray-400 font-normal text-xs">({linhas.length} meses)</span>}
              </h3>
            </div>

            {linhas.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                <svg className="h-12 w-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">Selecione os filtros e clique em <strong>Carregar Dados Reais</strong></p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-blue-900 text-white text-xs">
                      <th className="px-3 py-3 text-center w-8">#</th>
                      <th className="px-3 py-3 text-left">Período</th>
                      <th className="px-3 py-3 text-right bg-green-800">Recebido no Mês (R$)</th>
                      <th className="px-3 py-3 text-right bg-red-900">Pago no Mês (R$)</th>
                      <th className="px-3 py-3 text-right">Resultado Mensal</th>
                      <th className="px-3 py-3 text-right">Resultado Acumulado</th>
                      <th className="px-3 py-3 text-right bg-orange-800">Exposição Negativa</th>
                      <th className="px-3 py-3 text-right bg-purple-900 w-44 leading-tight">
                        {tipoCusto === 'simples' ? 'Custo de Oportunidade\n(Simples Mensal)' : 'Custo de Oportunidade\n(Composto Acumulado)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((linha, i) => {
                      const c = calculado[i];
                      const zebra = i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50 dark:bg-slate-900';
                      return (
                        <tr key={linha.mesKey} className={`${zebra} hover:bg-blue-50 transition-colors`}>
                          <td className="px-3 py-2 text-center text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-700 dark:text-slate-300">{linha.periodo}</td>
                          <td className="px-3 py-2 bg-green-50 text-right text-sm">
                            {fmtNum(linha.recebido)}
                          </td>
                          <td className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-right text-sm">
                            {fmtNum(linha.pago)}
                          </td>
                          <td className={`px-3 py-2 text-right ${corRes(c.resultadoMensal)}`}>
                            {c.resultadoMensal >= 0 ? fmtNum(c.resultadoMensal) : `(${fmtNum(Math.abs(c.resultadoMensal))})`}
                          </td>
                          <td className={`px-3 py-2 text-right ${corRes(c.acumulado)}`}>
                            {c.acumulado >= 0 ? fmtNum(c.acumulado) : `(${fmtNum(Math.abs(c.acumulado))})`}
                          </td>
                          <td className="px-3 py-2 text-right bg-orange-50">
                            {c.exposicaoNegativa < 0
                              ? <span className="text-orange-700 font-semibold">({fmtNum(Math.abs(c.exposicaoNegativa))})</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right bg-purple-50">
                            {tipoCusto === 'simples' ? (
                              c.custoMensalSimples > 0
                                ? <span className="text-purple-700 font-semibold">{fmtNum(Math.round(c.custoMensalSimples))}</span>
                                : <span className="text-gray-300">—</span>
                            ) : (
                              c.custoCompostoAcumulado > 0
                                ? <span className="text-purple-700 font-semibold">{fmtNum(Math.round(c.custoCompostoAcumulado))}</span>
                                : <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-900 text-white font-bold text-sm">
                      <td colSpan={2} className="px-3 py-3 text-right text-xs uppercase tracking-wider">TOTAIS</td>
                      <td className="px-3 py-3 text-right bg-green-800">{fmtNum(totais.totalRecebido)}</td>
                      <td className="px-3 py-3 text-right bg-red-900">{fmtNum(totais.totalPago)}</td>
                      <td className="px-3 py-3 text-right">{totais.resultadoFinal >= 0 ? fmtNum(totais.resultadoFinal) : `(${fmtNum(Math.abs(totais.resultadoFinal))})`}</td>
                      <td className="px-3 py-3 text-right"></td>
                      <td className="px-3 py-3 text-right bg-orange-800">({fmtNum(Math.abs(totais.picoExposicao))})</td>
                      <td className="px-3 py-3 text-right bg-purple-900">{fmtNum(Math.round(totais.totalCusto))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ==================== ABA COMPARATIVO ==================== */}
      {aba === 'comparativo' && (
        <>
          {/* Filtros (mesmos da aba Tabela) */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-4">Filtros e Premissas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Centro de Custo</label>
                <SelectPesquisavel centros={centrosCusto} valor={centroCustoId} onChange={setCentroCustoId} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Período Início</label>
                <input type="month" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Período Fim</label>
                <input type="month" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-amber-700 mb-1">Taxa Mensal (%)</label>
                <div className="flex items-center gap-2">
                  <input type="number" step="0.01" value={taxaMensal}
                    onChange={e => setTaxaMensal(parseFloat(e.target.value) || 0)}
                    className="w-24 border-2 border-amber-400 rounded-lg px-3 py-2 text-sm font-bold bg-yellow-50 focus:outline-none" />
                  <span className="text-amber-700 font-semibold text-sm">% a.m.</span>
                </div>
              </div>
              <div className="flex items-end">
                <button onClick={carregarDados} disabled={loading}
                  className="w-full bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {loading
                    ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> Carregando...</>
                    : <><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Carregar Dados Reais</>
                  }
                </button>
              </div>
            </div>
            {erro && <p className="mt-2 text-red-600 dark:text-red-400 text-sm">{erro}</p>}
          </div>

          {linhas.length > 0 && (
            <>
              {/* Resumo Executivo Comparativo */}
              <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-4">
                  Resumo Executivo — Comparativo Simples vs Composto
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                    <p className="text-xs text-green-600 font-semibold uppercase mb-1">Total Recebido</p>
                    <p className="text-sm font-bold text-green-700">{fmt(totais.totalRecebido)}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl p-3 text-center">
                    <p className="text-xs text-red-600 dark:text-red-400 font-semibold uppercase mb-1">Total Pago</p>
                    <p className="text-sm font-bold text-red-700 dark:text-red-400">{fmt(totais.totalPago)}</p>
                  </div>
                  <div className={`${totais.resultadoFinal >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 dark:bg-red-900/20 border-red-200'} border rounded-xl p-3 text-center`}>
                    <p className={`text-xs font-semibold uppercase mb-1 ${totais.resultadoFinal >= 0 ? 'text-blue-600' : 'text-red-600 dark:text-red-400'}`}>Resultado Final</p>
                    <p className={`text-sm font-bold ${totais.resultadoFinal >= 0 ? 'text-blue-700' : 'text-red-700 dark:text-red-400'}`}>
                      {totais.resultadoFinal >= 0 ? fmt(totais.resultadoFinal) : `(${fmt(Math.abs(totais.resultadoFinal))})`}
                    </p>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
                    <p className="text-xs text-orange-600 font-semibold uppercase mb-1">Pico Exposição Negativa</p>
                    <p className="text-sm font-bold text-orange-700">({fmt(Math.abs(totais.picoExposicao))})</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
                    <p className="text-xs text-indigo-600 font-semibold uppercase mb-1">Pico Exposição Ajustada</p>
                    <p className="text-sm font-bold text-indigo-700">({fmt(totais.picoExposicaoAjustada)})</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold uppercase mb-1">Meses em Exposição</p>
                    <p className="text-xl font-bold text-gray-700 dark:text-slate-300">{totais.mesesNegativos}</p>
                    <p className="text-xs text-gray-400">{totais.mesZero ? `Equilíbrio: mês ${totais.mesZero}` : 'Nunca positivo'}</p>
                  </div>
                </div>

                {/* Bloco Simples vs Composto */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-pink-50 border border-pink-300 rounded-xl p-4">
                    <p className="text-xs font-bold text-pink-700 uppercase mb-1">Custo de Oportunidade SIMPLES Total</p>
                    <p className="text-2xl font-bold text-pink-800">{fmt(totais.totalCustoSimples)}</p>
                    <p className="text-xs text-pink-500 mt-1">Soma dos custos mensais isolados ( |Exposição| × {taxaMensal}% )</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-400 rounded-xl p-4">
                    <p className="text-xs font-bold text-orange-700 uppercase mb-1">Custo de Oportunidade COMPOSTO Total</p>
                    <p className="text-2xl font-bold text-orange-800">{fmt(totais.totalCustoComposto)}</p>
                    <p className="text-xs text-orange-500 mt-1">Juros sobre juros acumulados ( (|Exposição| + Juros Ant.) × {taxaMensal}% )</p>
                  </div>
                </div>

                {totais.totalCustoSimples > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-slate-400 font-medium">Diferença (Composto − Simples)</span>
                      <span className="text-sm font-bold text-gray-800 dark:text-slate-200">{fmt(totais.totalCustoComposto - totais.totalCustoSimples)}</span>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-slate-400 font-medium">Impacto % do Composto sobre o Simples</span>
                      <span className="text-sm font-bold text-gray-800 dark:text-slate-200">
                        {((totais.totalCustoComposto - totais.totalCustoSimples) / totais.totalCustoSimples * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Tabela Comparativa Completa */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-900">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider">
                    Memória de Cálculo — Simples vs Composto
                    <span className="ml-2 text-gray-400 font-normal text-xs">({linhas.length} meses · taxa {taxaMensal}% a.m.)</span>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-white text-center" style={{ fontSize: '10px' }}>
                        <th className="bg-blue-900 px-2 py-2 w-6">#</th>
                        <th className="bg-blue-900 px-2 py-2 text-left">Período</th>
                        <th className="bg-green-800 px-2 py-2">Recebido no Mês</th>
                        <th className="bg-red-900 px-2 py-2">Pago no Mês</th>
                        <th className="bg-blue-900 px-2 py-2">Resultado Mensal</th>
                        <th className="bg-blue-900 px-2 py-2">Resultado Acumulado</th>
                        <th className="bg-orange-700 px-2 py-2">Exposição Negativa</th>
                        <th className="bg-pink-700 px-2 py-2">Custo Simples Mensal</th>
                        <th className="bg-indigo-700 px-2 py-2">Exposição Ajustada (Composta)</th>
                        <th className="bg-purple-800 px-2 py-2">Custo Composto Mensal</th>
                        <th className="bg-purple-900 px-2 py-2">Custo Composto Acumulado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((linha, i) => {
                        const c = calculado[i];
                        const zebra = i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50 dark:bg-slate-900';
                        return (
                          <tr key={linha.mesKey} className={`${zebra} hover:bg-blue-50 transition-colors`}>
                            <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                            <td className="px-2 py-1.5 font-medium text-gray-700 dark:text-slate-300">{linha.periodo}</td>
                            <td className="px-2 py-1.5 bg-green-50 text-right text-green-700">{fmtNum(linha.recebido)}</td>
                            <td className="px-2 py-1.5 bg-red-50 dark:bg-red-900/20 text-right text-red-700 dark:text-red-400">{fmtNum(linha.pago)}</td>
                            <td className={`px-2 py-1.5 text-right ${corRes(c.resultadoMensal)}`}>
                              {c.resultadoMensal >= 0 ? fmtNum(c.resultadoMensal) : `(${fmtNum(Math.abs(c.resultadoMensal))})`}
                            </td>
                            <td className={`px-2 py-1.5 text-right ${corRes(c.acumulado)}`}>
                              {c.acumulado >= 0 ? fmtNum(c.acumulado) : `(${fmtNum(Math.abs(c.acumulado))})`}
                            </td>
                            <td className="px-2 py-1.5 bg-orange-50 text-right">
                              {c.exposicaoNegativa < 0
                                ? <span className="text-orange-700 font-semibold">({fmtNum(Math.abs(c.exposicaoNegativa))})</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-2 py-1.5 bg-pink-50 text-right">
                              {c.custoMensalSimples > 0
                                ? <span className="text-pink-700 font-semibold">{fmtNum(Math.round(c.custoMensalSimples))}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-2 py-1.5 bg-indigo-50 text-right">
                              {c.exposicaoAjustada > 0
                                ? <span className="text-indigo-700 font-semibold">({fmtNum(Math.round(c.exposicaoAjustada))})</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-2 py-1.5 bg-purple-50 text-right">
                              {c.custoMensalComposto > 0
                                ? <span className="text-purple-700 font-semibold">{fmtNum(Math.round(c.custoMensalComposto))}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-2 py-1.5 bg-purple-50 text-right">
                              {c.custoCompostoAcumulado > 0
                                ? <span className="text-purple-900 font-bold">{fmtNum(Math.round(c.custoCompostoAcumulado))}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold text-xs text-white">
                        <td colSpan={2} className="bg-blue-900 px-2 py-2 text-right text-xs uppercase tracking-wider">TOTAIS</td>
                        <td className="bg-green-800 px-2 py-2 text-right">{fmtNum(totais.totalRecebido)}</td>
                        <td className="bg-red-900 px-2 py-2 text-right">{fmtNum(totais.totalPago)}</td>
                        <td className="bg-blue-900 px-2 py-2 text-right">
                          {totais.resultadoFinal >= 0 ? fmtNum(totais.resultadoFinal) : `(${fmtNum(Math.abs(totais.resultadoFinal))})`}
                        </td>
                        <td className="bg-blue-900 px-2 py-2" />
                        <td className="bg-orange-700 px-2 py-2 text-right">({fmtNum(Math.abs(totais.picoExposicao))})</td>
                        <td className="bg-pink-700 px-2 py-2 text-right">{fmtNum(Math.round(totais.totalCustoSimples))}</td>
                        <td className="bg-indigo-700 px-2 py-2 text-right">({fmtNum(Math.round(totais.picoExposicaoAjustada))})</td>
                        <td className="bg-purple-800 px-2 py-2 text-right">{fmtNum(Math.round(totais.totalCustoComposto))}</td>
                        <td className="bg-purple-900 px-2 py-2 text-right">{fmtNum(Math.round(totais.totalCustoComposto))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}

          {linhas.length === 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 py-20 text-center text-gray-400">
              <svg className="h-12 w-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">Selecione os filtros e clique em <strong>Carregar Dados Reais</strong></p>
            </div>
          )}
        </>
      )}

      {/* ==================== ABA GRÁFICO ==================== */}
      {aba === 'grafico' && (
        <>
          {/* Filtros do gráfico */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-4">Filtros do Gráfico</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Centro de Custo</label>
                <SelectPesquisavel
                  centros={centrosCusto}
                  valor={grafCentroCustoId}
                  onChange={setGrafCentroCustoId}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Período Início (AAAA-MM)</label>
                <input type="month" value={grafDataInicio} onChange={e => setGrafDataInicio(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Período Fim (AAAA-MM)</label>
                <input type="month" value={grafDataFim} onChange={e => setGrafDataFim(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div className="flex items-end">
                <button onClick={carregarGrafico} disabled={grafLoading}
                  className="w-full bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {grafLoading ? (
                    <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> Carregando...</>
                  ) : (
                    <><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Carregar Gráfico</>
                  )}
                </button>
              </div>
            </div>
            {grafErro && <p className="mt-2 text-red-600 dark:text-red-400 text-sm">{grafErro}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {origensConfigurado && (
                <span className={`text-xs px-2 py-1 rounded border ${origensSiglas.length > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-700 dark:text-red-400'}`}>
                  {origensSiglas.length > 0 ? `Origens: ${origensSiglas.join(', ')}` : 'Sem origens ativas'}
                </span>
              )}
              {tiposBaixaConfigurado && (
                <span className={`text-xs px-2 py-1 rounded border ${tiposBaixaIds.length > 0 ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-700 dark:text-red-400'}`}>
                  {tiposBaixaIds.length > 0 ? `Tipos baixa: ${tiposBaixaIds.join(', ')}` : 'Sem tipos de baixa ativos'}
                </span>
              )}
            </div>
          </div>

          {/* Cards de resumo do gráfico */}
          {dadosGrafico.length > 0 && (() => {
            const ult = dadosGrafico[dadosGrafico.length - 1];
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-4 h-4 rounded-full bg-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-red-600 dark:text-red-400 font-semibold uppercase">Pago Acumulado</p>
                    <p className="text-lg font-bold text-red-700 dark:text-red-400">{fmt(ult['Pago Acumulado'])}</p>
                    <p className="text-xs text-red-400">até {ult.periodo}</p>
                  </div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-4 h-4 rounded-full bg-green-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-green-600 font-semibold uppercase">Recebido Acumulado</p>
                    <p className="text-lg font-bold text-green-700">{fmt(ult['Recebido Acumulado'])}</p>
                    <p className="text-xs text-green-400">até {ult.periodo}</p>
                  </div>
                </div>
                <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-4 h-4 rounded-full bg-cyan-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-cyan-600 font-semibold uppercase">Exposição Acumulada</p>
                    <p className="text-lg font-bold text-cyan-700">{fmt(ult['Exposição Acumulada'])}</p>
                    <p className="text-xs text-cyan-400">diferença acumulada até {ult.periodo}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Gráfico */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
            {dadosGrafico.length === 0 ? (
              <div className="py-24 text-center text-gray-400">
                <svg className="h-16 w-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                <p className="text-sm font-medium">Selecione os filtros e clique em <strong>Carregar Gráfico</strong></p>
                <p className="text-xs mt-1 text-gray-300">O gráfico exibirá os valores acumulados de Pago, Recebido e Exposição de Caixa</p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300">
                    Pago Acumulado, Recebido Acumulado e Exposição Acumulada por Período
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {grafLinhas[0]?.periodo} → {grafLinhas[grafLinhas.length - 1]?.periodo}
                    {grafCentroCustoId ? ` · ${centrosCusto.find(c => c.id === grafCentroCustoId)?.nome}` : ' · Todos os centros de custo'}
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={440}>
                  <LineChart data={dadosGrafico} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="periodo"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      interval={Math.max(0, Math.floor(dadosGrafico.length / 20) - 1)}
                      angle={-35}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      tickFormatter={formatarEixoY}
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      width={90}
                    />
                    <Tooltip content={<TooltipGrafico />} />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Pago Acumulado"
                      stroke="#f87171"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Recebido Acumulado"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Exposição Acumulada"
                      stroke="#22d3ee"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
