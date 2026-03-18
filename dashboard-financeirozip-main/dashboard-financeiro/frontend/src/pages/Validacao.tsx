import React, { useState, useEffect, useCallback } from 'react';
import { validacaoService } from '../services/api';
import { ValidationBadge } from '../components/ValidationBadge';

interface Pagina {
  id: number;
  page_id: string;
  page_label: string;
  status: string;
  validated_by: string | null;
  validated_at: string | null;
  last_check_at: string | null;
  last_check_result: string | null;
  notes: string | null;
}

interface Checkpoint {
  id: number;
  page_id: string;
  checkpoint_label: string;
  endpoint: string;
  query_params: string;
  expected_values: string;
  tolerance_pct: number;
  last_check_at: string | null;
  last_actual_values: string | null;
  last_check_status: string | null;
}

interface VerificacaoResult {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  details: Array<{
    checkpoint_id: number;
    page_id: string;
    label: string;
    status: string;
    expected?: Record<string, unknown>;
    actual?: Record<string, unknown>;
    diffs?: Record<string, { expected: unknown; actual: unknown; status: string; diff_pct?: number }>;
    message?: string;
  }>;
}

const formatDate = (d: string | null) => {
  if (!d) return '-';
  try {
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return d;
  }
};

export const Validacao: React.FC = () => {
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [endpointsDisponiveis, setEndpointsDisponiveis] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [verificando, setVerificando] = useState(false);
  const [verificacaoResult, setVerificacaoResult] = useState<VerificacaoResult | null>(null);

  // Form state para novo checkpoint
  const [novoEndpoint, setNovoEndpoint] = useState('');
  const [novoLabel, setNovoLabel] = useState('');
  const [novoParams, setNovoParams] = useState('');
  const [novoTolerance, setNovoTolerance] = useState('0');
  const [capturedValues, setCapturedValues] = useState<Record<string, unknown> | null>(null);
  const [capturando, setCapturando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadPaginas = useCallback(async () => {
    try {
      const data = await validacaoService.getPaginas();
      setPaginas(data);
    } catch (err) {
      console.error('Erro ao carregar paginas:', err);
    }
  }, []);

  const loadEndpoints = useCallback(async () => {
    try {
      const data = await validacaoService.getEndpointsDisponiveis();
      setEndpointsDisponiveis(data);
    } catch (err) {
      console.error('Erro ao carregar endpoints:', err);
    }
  }, []);

  const loadCheckpoints = useCallback(async (pageId: string) => {
    try {
      const data = await validacaoService.getCheckpoints(pageId);
      setCheckpoints(data);
    } catch (err) {
      console.error('Erro ao carregar checkpoints:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadPaginas(), loadEndpoints()]);
      setLoading(false);
    };
    init();
  }, [loadPaginas, loadEndpoints]);

  useEffect(() => {
    if (selectedPage) {
      loadCheckpoints(selectedPage);
    }
  }, [selectedPage, loadCheckpoints]);

  const handleValidar = async (pageId: string) => {
    try {
      await validacaoService.validarPagina(pageId);
      await loadPaginas();
    } catch (err) {
      console.error('Erro ao validar:', err);
    }
  };

  const handleVerificarTodos = async () => {
    setVerificando(true);
    setVerificacaoResult(null);
    try {
      const result = await validacaoService.verificar();
      setVerificacaoResult(result);
      await loadPaginas();
      if (selectedPage) await loadCheckpoints(selectedPage);
    } catch (err) {
      console.error('Erro ao verificar:', err);
    } finally {
      setVerificando(false);
    }
  };

  const handleVerificarPagina = async (pageId: string) => {
    setVerificando(true);
    try {
      const result = await validacaoService.verificar(pageId);
      setVerificacaoResult(result);
      await loadPaginas();
      if (selectedPage) await loadCheckpoints(selectedPage);
    } catch (err) {
      console.error('Erro ao verificar:', err);
    } finally {
      setVerificando(false);
    }
  };

  const handleCapturar = async () => {
    if (!novoEndpoint) return;
    setCapturando(true);
    setCapturedValues(null);
    try {
      let params: Record<string, string> = {};
      if (novoParams.trim()) {
        params = JSON.parse(novoParams);
      }
      const data = await validacaoService.capturarValores(novoEndpoint, params);
      // Flatten: se for objeto, usar direto; se for lista, extrair contagem
      if (Array.isArray(data)) {
        setCapturedValues({ count: data.length });
      } else if (typeof data === 'object' && data !== null) {
        // Filtrar apenas campos numericos para facilitar a validacao
        const numericFields: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data)) {
          if (typeof v === 'number') {
            numericFields[k] = v;
          }
        }
        setCapturedValues(Object.keys(numericFields).length > 0 ? numericFields : data);
      } else {
        setCapturedValues({ value: data });
      }
    } catch (err) {
      console.error('Erro ao capturar:', err);
      alert('Erro ao capturar valores. Verifique o endpoint e parametros.');
    } finally {
      setCapturando(false);
    }
  };

  const handleSalvarCheckpoint = async () => {
    if (!selectedPage || !novoEndpoint || !novoLabel || !capturedValues) return;
    setSalvando(true);
    try {
      let params: Record<string, string> = {};
      if (novoParams.trim()) {
        params = JSON.parse(novoParams);
      }
      await validacaoService.criarCheckpoint({
        page_id: selectedPage,
        checkpoint_label: novoLabel,
        endpoint: novoEndpoint,
        query_params: params,
        expected_values: capturedValues,
        tolerance_pct: parseFloat(novoTolerance) || 0,
      });
      await loadCheckpoints(selectedPage);
      // Reset form
      setNovoLabel('');
      setNovoParams('');
      setCapturedValues(null);
      setShowForm(false);
    } catch (err) {
      console.error('Erro ao salvar:', err);
      alert('Erro ao salvar checkpoint.');
    } finally {
      setSalvando(false);
    }
  };

  const handleDeletarCheckpoint = async (id: number) => {
    if (!confirm('Remover este checkpoint?')) return;
    try {
      await validacaoService.deletarCheckpoint(id);
      if (selectedPage) await loadCheckpoints(selectedPage);
    } catch (err) {
      console.error('Erro ao deletar:', err);
    }
  };

  const formatValue = (v: unknown): string => {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'number') return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return String(v);
  };

  const parseJsonSafe = (s: string | null): Record<string, unknown> | null => {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const selectedPageData = paginas.find(p => p.page_id === selectedPage);
  const availableEndpoints = selectedPage ? (endpointsDisponiveis[selectedPage] || []) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Validacao de Dados</h2>
          <p className="text-sm text-gray-500 mt-1">Gerencie checkpoints e verifique integridade dos dados por pagina</p>
        </div>
        <button
          onClick={handleVerificarTodos}
          disabled={verificando}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {verificando ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          Verificar Todos
        </button>
      </div>

      {/* Resultado da verificacao */}
      {verificacaoResult && (
        <div className={`rounded-lg p-4 border ${verificacaoResult.failed > 0 || verificacaoResult.errors > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center gap-4 mb-3">
            <h3 className="font-semibold text-gray-900">Resultado da Verificacao</h3>
            <div className="flex gap-3 text-sm">
              <span className="text-green-700 font-medium">{verificacaoResult.passed} passaram</span>
              {verificacaoResult.failed > 0 && <span className="text-red-700 font-medium">{verificacaoResult.failed} falharam</span>}
              {verificacaoResult.errors > 0 && <span className="text-orange-700 font-medium">{verificacaoResult.errors} erros</span>}
            </div>
          </div>
          {verificacaoResult.details.filter(d => d.status !== 'pass').length > 0 && (
            <div className="space-y-2">
              {verificacaoResult.details.filter(d => d.status !== 'pass').map((d, i) => (
                <div key={i} className="bg-white rounded p-3 border border-red-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${d.status === 'fail' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {d.status === 'fail' ? 'DRIFT' : 'ERRO'}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{d.label}</span>
                    <span className="text-xs text-gray-500">({d.page_id})</span>
                  </div>
                  {d.message && <p className="text-xs text-red-600">{d.message}</p>}
                  {d.diffs && (
                    <div className="mt-2 space-y-1">
                      {Object.entries(d.diffs).filter(([, v]) => v.status !== 'pass').map(([key, val]) => (
                        <div key={key} className="text-xs text-gray-700">
                          <span className="font-mono font-medium">{key}</span>: esperado <span className="font-semibold text-blue-600">{formatValue(val.expected)}</span> / atual <span className="font-semibold text-red-600">{formatValue(val.actual)}</span>
                          {val.diff_pct !== undefined && <span className="text-gray-500 ml-1">({val.diff_pct}% diff)</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setVerificacaoResult(null)} className="mt-2 text-xs text-gray-500 hover:underline">Fechar</button>
        </div>
      )}

      {/* Tabela de paginas */}
      <div className="rounded-lg bg-white shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Pagina</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Validado por</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Data</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Ultima verificacao</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginas.map((p) => (
              <tr
                key={p.page_id}
                className={`hover:bg-gray-50 cursor-pointer ${selectedPage === p.page_id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                onClick={() => setSelectedPage(selectedPage === p.page_id ? null : p.page_id)}
              >
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{p.page_label}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <ValidationBadge status={p.status} size="md" />
                    <span className={`text-xs font-medium ${p.status === 'validado' ? 'text-green-700' : p.status === 'drift' ? 'text-yellow-700' : 'text-gray-400'}`}>
                      {p.status === 'validado' ? 'Validado' : p.status === 'drift' ? 'Drift' : 'Pendente'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-3 text-sm text-gray-500">{p.validated_by || '-'}</td>
                <td className="px-6 py-3 text-sm text-gray-500">{formatDate(p.validated_at)}</td>
                <td className="px-6 py-3 text-sm">
                  {p.last_check_at ? (
                    <span className={p.last_check_result === 'ok' ? 'text-green-600' : p.last_check_result === 'drift' ? 'text-yellow-600' : 'text-gray-500'}>
                      {formatDate(p.last_check_at)} - {p.last_check_result === 'ok' ? 'OK' : p.last_check_result === 'drift' ? 'Drift' : p.last_check_result || '-'}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-6 py-3 text-right">
                  <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleValidar(p.page_id)}
                      className="rounded px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                      title="Marcar como validado"
                    >
                      Validar
                    </button>
                    <button
                      onClick={() => handleVerificarPagina(p.page_id)}
                      disabled={verificando}
                      className="rounded px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 transition-colors"
                      title="Verificar checkpoints"
                    >
                      Verificar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Checkpoints da pagina selecionada */}
      {selectedPage && selectedPageData && (
        <div className="rounded-lg bg-white shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-gray-900">Checkpoints: {selectedPageData.page_label}</h3>
              <ValidationBadge status={selectedPageData.status} size="md" />
            </div>
            <button
              onClick={() => { setShowForm(!showForm); setCapturedValues(null); }}
              className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showForm ? "M6 18L18 6M6 6l12 12" : "M12 4v16m8-8H4"} />
              </svg>
              {showForm ? 'Fechar' : 'Novo Checkpoint'}
            </button>
          </div>

          {/* Formulario novo checkpoint */}
          {showForm && (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-4">
              <h4 className="text-sm font-bold text-blue-900">Novo Checkpoint</h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome do checkpoint</label>
                  <input
                    type="text"
                    value={novoLabel}
                    onChange={e => setNovoLabel(e.target.value)}
                    placeholder="Ex: Contas Pagas - Jan/2025 - Total"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Endpoint</label>
                  <select
                    value={novoEndpoint}
                    onChange={e => setNovoEndpoint(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Selecione...</option>
                    {availableEndpoints.map(ep => (
                      <option key={ep} value={ep}>{ep}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Parametros (JSON)</label>
                  <textarea
                    value={novoParams}
                    onChange={e => setNovoParams(e.target.value)}
                    placeholder='{"ano": "2025", "mes": "1", "empresa": "2"}'
                    rows={3}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tolerancia (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={novoTolerance}
                    onChange={e => setNovoTolerance(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">0 = match exato. 0.01 = tolera 1% de variacao.</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleCapturar}
                  disabled={!novoEndpoint || capturando}
                  className="flex items-center gap-2 rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  {capturando ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  )}
                  Capturar Valores Atuais
                </button>

                {capturedValues && (
                  <button
                    onClick={handleSalvarCheckpoint}
                    disabled={!novoLabel || salvando}
                    className="flex items-center gap-2 rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {salvando ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    Salvar como Checkpoint
                  </button>
                )}
              </div>

              {/* Valores capturados */}
              {capturedValues && (
                <div className="rounded border border-green-200 bg-green-50 p-3">
                  <h5 className="text-xs font-bold text-green-800 mb-2">Valores capturados (serao salvos como esperados):</h5>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(capturedValues).map(([key, val]) => (
                      <div key={key} className="bg-white rounded px-2 py-1 border border-green-100">
                        <span className="text-[10px] text-gray-500 font-mono">{key}</span>
                        <p className="text-sm font-semibold text-gray-900">{formatValue(val)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lista de checkpoints */}
          {checkpoints.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <svg className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">Nenhum checkpoint criado para esta pagina</p>
              <p className="text-xs mt-1">Clique em "Novo Checkpoint" para adicionar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {checkpoints.map((cp) => {
                const expected = parseJsonSafe(cp.expected_values);
                const actual = parseJsonSafe(cp.last_actual_values);
                const params = parseJsonSafe(cp.query_params);
                return (
                  <div key={cp.id} className={`rounded-lg border p-4 ${cp.last_check_status === 'pass' ? 'border-green-200 bg-green-50/50' : cp.last_check_status === 'fail' ? 'border-red-200 bg-red-50/50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        {cp.last_check_status && (
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${cp.last_check_status === 'pass' ? 'bg-green-100 text-green-700' : cp.last_check_status === 'fail' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            {cp.last_check_status === 'pass' ? 'PASS' : cp.last_check_status === 'fail' ? 'FAIL' : 'ERROR'}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-gray-900">{cp.checkpoint_label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 font-mono">{cp.endpoint}</span>
                        <button
                          onClick={() => handleDeletarCheckpoint(cp.id)}
                          className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                          title="Remover checkpoint"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Parametros */}
                    {params && Object.keys(params).length > 0 && (
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {Object.entries(params).map(([k, v]) => (
                          <span key={k} className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono">
                            <span className="text-gray-500">{k}:</span>
                            <span className="font-semibold text-gray-700">{String(v)}</span>
                          </span>
                        ))}
                        {cp.tolerance_pct > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px]">
                            tolerancia: {cp.tolerance_pct}%
                          </span>
                        )}
                      </div>
                    )}

                    {/* Valores esperados vs reais */}
                    {expected && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                        {Object.entries(expected).map(([key, expVal]) => {
                          const actVal = actual ? actual[key] : undefined;
                          const isMatch = actVal !== undefined && String(expVal) === String(actVal);
                          return (
                            <div key={key} className="bg-white rounded px-2 py-1.5 border border-gray-100">
                              <span className="text-[10px] text-gray-500 font-mono block">{key}</span>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-xs font-semibold text-blue-700">{formatValue(expVal)}</span>
                                {actVal !== undefined && (
                                  <>
                                    <span className="text-[10px] text-gray-400">{'\u2192'}</span>
                                    <span className={`text-xs font-semibold ${isMatch ? 'text-green-600' : 'text-red-600'}`}>{formatValue(actVal)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {cp.last_check_at && (
                      <p className="text-[10px] text-gray-400 mt-2">Ultima verificacao: {formatDate(cp.last_check_at)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
