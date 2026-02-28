import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { apiService } from '../services/api';
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
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4 min-w-[220px]">
      <p className="font-bold text-gray-700 mb-2 text-sm">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm mb-1">
          <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600 flex-1">{entry.name}</span>
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
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
      >
        <span className="truncate text-gray-700">{nomeAtual}</span>
        <svg className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {aberto && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              placeholder="Pesquisar..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                  (c.id === 0 ? null : c.id) === valor ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700'
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
  const [aba, setAba] = useState<'tabela' | 'grafico'>('tabela');
  const [taxaMensal, setTaxaMensal] = useState(1.5);
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
    return linhas.map((l) => {
      const resultadoMensal = l.recebido - l.pago;
      acumulado += resultadoMensal;
      const exposicaoNegativa = Math.min(0, acumulado);
      const custoOportunidade = Math.abs(exposicaoNegativa) * (taxaMensal / 100);
      return { resultadoMensal, acumulado, exposicaoNegativa, custoOportunidade };
    });
  }, [linhas, taxaMensal]);

  const totais = useMemo(() => {
    const totalRecebido = linhas.reduce((s, l) => s + l.recebido, 0);
    const totalPago = linhas.reduce((s, l) => s + l.pago, 0);
    const totalCusto = calculado.reduce((s, c) => s + c.custoOportunidade, 0);
    const resultadoFinal = totalRecebido - totalPago;
    const picoExposicao = calculado.length ? Math.min(...calculado.map(c => c.exposicaoNegativa)) : 0;
    const mesesNegativos = calculado.filter(c => c.exposicaoNegativa < 0).length;
    const idxZero = calculado.findIndex((c, i) => i > 0 && c.exposicaoNegativa === 0 && calculado[i - 1].exposicaoNegativa < 0);
    return { totalRecebido, totalPago, totalCusto, resultadoFinal, picoExposicao, mesesNegativos, mesZero: idxZero >= 0 ? idxZero + 1 : null };
  }, [linhas, calculado]);

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
  const corRes = (v: number) => v >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold';

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
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            aba === 'tabela'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Tabela
        </button>
        <button
          onClick={() => setAba('grafico')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            aba === 'grafico'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Gráfico
        </button>
      </div>

      {/* ==================== ABA TABELA ==================== */}
      {aba === 'tabela' && (
        <>
          {/* Filtros */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Filtros e Premissas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Centro de Custo</label>
                <SelectPesquisavel
                  centros={centrosCusto}
                  valor={centroCustoId}
                  onChange={setCentroCustoId}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Período Início (AAAA-MM)</label>
                <input type="month" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Período Fim (AAAA-MM)</label>
                <input type="month" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-700 mb-1">Taxa Mensal de Oportunidade (%)</label>
                <div className="flex items-center gap-2">
                  <input type="number" step="0.01" value={taxaMensal}
                    onChange={e => setTaxaMensal(parseFloat(e.target.value) || 0)}
                    className="w-28 border-2 border-amber-400 rounded-lg px-3 py-2 text-sm font-bold bg-yellow-50 focus:outline-none"
                  />
                  <span className="text-amber-700 font-semibold text-sm">% a.m.</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button onClick={carregarDados} disabled={loading}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
                {loading ? (
                  <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Carregando...</>
                ) : (
                  <><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Carregar Dados Reais</>
                )}
              </button>
              {erro && <span className="text-red-600 text-sm">{erro}</span>}
              {origensConfigurado && (
                <span className={`text-xs px-2 py-1 rounded border ${origensSiglas.length > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  {origensSiglas.length > 0 ? `Origens: ${origensSiglas.join(', ')}` : 'Sem origens ativas'}
                </span>
              )}
              {tiposBaixaConfigurado && (
                <span className={`text-xs px-2 py-1 rounded border ${tiposBaixaIds.length > 0 ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  {tiposBaixaIds.length > 0 ? `Tipos baixa: ${tiposBaixaIds.join(', ')}` : 'Sem tipos de baixa ativos'}
                </span>
              )}
            </div>

            <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              <strong>Regra:</strong> Custo de Oportunidade = |Exposição Negativa Acumulada| × Taxa Mensal.
              Quando o acumulado (Recebido − Pago) é negativo, a empresa financia as obras com capital próprio que poderia estar rendendo juros.
            </p>
          </div>

          {/* Resumo Executivo */}
          {linhas.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-xs text-green-600 font-semibold uppercase mb-1">Total Recebido</p>
                <p className="text-base font-bold text-green-700">{fmt(totais.totalRecebido)}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-xs text-red-600 font-semibold uppercase mb-1">Total Pago</p>
                <p className="text-base font-bold text-red-700">{fmt(totais.totalPago)}</p>
              </div>
              <div className={`${totais.resultadoFinal >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'} border rounded-xl p-4 text-center`}>
                <p className={`text-xs font-semibold uppercase mb-1 ${totais.resultadoFinal >= 0 ? 'text-blue-600' : 'text-red-600'}`}>Resultado Final</p>
                <p className={`text-base font-bold ${totais.resultadoFinal >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmt(totais.resultadoFinal)}</p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                <p className="text-xs text-purple-600 font-semibold uppercase mb-1">Custo de Oportunidade</p>
                <p className="text-base font-bold text-purple-700">{fmt(totais.totalCusto)}</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                <p className="text-xs text-orange-600 font-semibold uppercase mb-1">Pico Exposição Negativa</p>
                <p className="text-base font-bold text-orange-700">({fmt(Math.abs(totais.picoExposicao))})</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Meses em Exposição</p>
                <p className="text-2xl font-bold text-gray-700">{totais.mesesNegativos}</p>
                <p className="text-xs text-gray-400">{totais.mesZero ? `Equilíbrio: mês ${totais.mesZero}` : 'Nunca positivo'}</p>
              </div>
            </div>
          )}

          {/* Tabela */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
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
                      <th className="px-3 py-3 text-right bg-purple-900">Custo de Oportunidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((linha, i) => {
                      const c = calculado[i];
                      const zebra = i % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                      return (
                        <tr key={linha.mesKey} className={`${zebra} hover:bg-blue-50 transition-colors`}>
                          <td className="px-3 py-2 text-center text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-700">{linha.periodo}</td>
                          <td className="px-3 py-2 bg-green-50 text-right text-sm">
                            {fmtNum(linha.recebido)}
                          </td>
                          <td className="px-3 py-2 bg-red-50 text-right text-sm">
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
                            {c.custoOportunidade > 0
                              ? <span className="text-purple-700 font-semibold">{fmtNum(Math.round(c.custoOportunidade))}</span>
                              : <span className="text-gray-300">—</span>}
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

      {/* ==================== ABA GRÁFICO ==================== */}
      {aba === 'grafico' && (
        <>
          {/* Filtros do gráfico */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Filtros do Gráfico</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Centro de Custo</label>
                <SelectPesquisavel
                  centros={centrosCusto}
                  valor={grafCentroCustoId}
                  onChange={setGrafCentroCustoId}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Período Início (AAAA-MM)</label>
                <input type="month" value={grafDataInicio} onChange={e => setGrafDataInicio(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Período Fim (AAAA-MM)</label>
                <input type="month" value={grafDataFim} onChange={e => setGrafDataFim(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div className="flex items-end">
                <button onClick={carregarGrafico} disabled={grafLoading}
                  className="w-full bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {grafLoading ? (
                    <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Carregando...</>
                  ) : (
                    <><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Carregar Gráfico</>
                  )}
                </button>
              </div>
            </div>
            {grafErro && <p className="mt-2 text-red-600 text-sm">{grafErro}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {origensConfigurado && (
                <span className={`text-xs px-2 py-1 rounded border ${origensSiglas.length > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  {origensSiglas.length > 0 ? `Origens: ${origensSiglas.join(', ')}` : 'Sem origens ativas'}
                </span>
              )}
              {tiposBaixaConfigurado && (
                <span className={`text-xs px-2 py-1 rounded border ${tiposBaixaIds.length > 0 ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
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
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-4 h-4 rounded-full bg-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-red-600 font-semibold uppercase">Pago Acumulado</p>
                    <p className="text-lg font-bold text-red-700">{fmt(ult['Pago Acumulado'])}</p>
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
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
                  <h3 className="text-sm font-bold text-gray-700">
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
