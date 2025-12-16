import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { KPI, KPICreate, KPIVariacaoDiaria, KPIHistoricoVariacaoResponse, CalculoDisponivel, TipoDocumento } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

type TabType = 'monitoramento' | 'cadastro' | 'historico';

const TrendUpIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const TrendDownIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
  </svg>
);

const TrendNeutralIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

export const KPIs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('monitoramento');
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [variacaoDiaria, setVariacaoDiaria] = useState<KPIVariacaoDiaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingKPI, setEditingKPI] = useState<KPI | null>(null);
  const [selectedKPIId, setSelectedKPIId] = useState<number | null>(null);
  const [historicoVariacao, setHistoricoVariacao] = useState<KPIHistoricoVariacaoResponse | null>(null);
  const [calculosDisponiveis, setCalculosDisponiveis] = useState<CalculoDisponivel[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumento[]>([]);
  const [selectedDocumentos, setSelectedDocumentos] = useState<string[]>([]);
  const [salvandoSnapshot, setSalvandoSnapshot] = useState(false);
  const [snapshotMensagem, setSnapshotMensagem] = useState<string | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');
  
  const [formData, setFormData] = useState<KPICreate>({
    descricao: '',
    categoria: '',
    indice: '',
    formula: '',
    meta: undefined,
    tipo_meta: 'maior',
    unidade: '',
    ativo: true,
    calculo_automatico: undefined,
    documentos_excluidos: undefined
  });

  useEffect(() => {
    loadCalculosDisponiveis();
    loadTiposDocumento();
  }, []);

  const loadTiposDocumento = async () => {
    try {
      const data = await apiService.getTiposDocumentoKPI();
      setTiposDocumento(data);
    } catch (error) {
      console.error('Erro ao carregar tipos de documento:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadCalculosDisponiveis = async () => {
    try {
      const data = await apiService.getCalculosDisponiveis();
      setCalculosDisponiveis(data);
    } catch (error) {
      console.error('Erro ao carregar cálculos disponíveis:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'cadastro') {
        const data = await apiService.getKPIs();
        setKpis(data);
      } else if (activeTab === 'monitoramento') {
        const data = await apiService.getKPIsVariacaoDiaria();
        setVariacaoDiaria(data);
      } else if (activeTab === 'historico') {
        const data = await apiService.getKPIs(true);
        setKpis(data);
        if (data.length > 0 && !selectedKPIId) {
          setSelectedKPIId(data[0].id);
          loadHistoricoVariacao(data[0].id);
        } else if (selectedKPIId) {
          loadHistoricoVariacao(selectedKPIId);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
    setLoading(false);
  };

  const loadHistoricoVariacao = async (kpiId: number) => {
    try {
      const data = await apiService.getKPIHistoricoVariacao(kpiId, 60);
      setHistoricoVariacao(data);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    }
  };

  const handleSalvarSnapshot = async () => {
    setSalvandoSnapshot(true);
    setSnapshotMensagem(null);
    try {
      const result = await apiService.criarSnapshotDiario();
      setSnapshotMensagem(`Snapshot salvo! ${result.registros_criados} novos, ${result.registros_atualizados} atualizados.`);
      loadData();
    } catch (error) {
      setSnapshotMensagem('Erro ao salvar snapshot.');
      console.error('Erro ao salvar snapshot:', error);
    }
    setSalvandoSnapshot(false);
    setTimeout(() => setSnapshotMensagem(null), 5000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSend = {
        ...formData,
        documentos_excluidos: formData.calculo_automatico 
          ? (selectedDocumentos.length > 0 ? selectedDocumentos.join(',') : '') 
          : ''
      };
      if (editingKPI) {
        await apiService.updateKPI(editingKPI.id, dataToSend);
      } else {
        await apiService.createKPI(dataToSend);
      }
      resetForm();
      loadData();
    } catch (error) {
      console.error('Erro ao salvar KPI:', error);
    }
  };

  const handleEdit = (kpi: KPI) => {
    setEditingKPI(kpi);
    setFormData({
      descricao: kpi.descricao,
      categoria: kpi.categoria || '',
      indice: kpi.indice || '',
      formula: kpi.formula || '',
      meta: kpi.meta,
      tipo_meta: kpi.tipo_meta || 'maior',
      unidade: kpi.unidade || '',
      ativo: kpi.ativo,
      calculo_automatico: kpi.calculo_automatico || '',
      documentos_excluidos: kpi.documentos_excluidos || ''
    });
    setSelectedDocumentos(kpi.documentos_excluidos ? kpi.documentos_excluidos.split(',') : []);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Tem certeza que deseja excluir este KPI?')) {
      try {
        await apiService.deleteKPI(id);
        loadData();
      } catch (error) {
        console.error('Erro ao excluir KPI:', error);
      }
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingKPI(null);
    setSelectedDocumentos([]);
    setFormData({
      descricao: '',
      categoria: '',
      indice: '',
      formula: '',
      meta: undefined,
      tipo_meta: 'maior',
      unidade: '',
      ativo: true,
      calculo_automatico: undefined,
      documentos_excluidos: undefined
    });
  };

  const formatNumber = (value: number | undefined, unidade?: string) => {
    if (value === undefined || value === null) return '-';
    if (unidade === 'R$') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    }
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatVariacao = (value: number | undefined, unidade?: string) => {
    if (value === undefined || value === null) return '-';
    const prefix = value > 0 ? '+' : '';
    if (unidade === 'R$') {
      return `${prefix}${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}`;
    }
    return `${prefix}${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getTendenciaIcon = (tendencia?: string, tipo_meta?: string) => {
    if (!tendencia) return null;
    
    const isPositive = tendencia === 'subindo';
    const isNegative = tendencia === 'descendo';
    
    let colorClass = 'text-gray-500';
    if (tipo_meta === 'maior') {
      colorClass = isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-gray-500';
    } else if (tipo_meta === 'menor') {
      colorClass = isNegative ? 'text-green-500' : isPositive ? 'text-red-500' : 'text-gray-500';
    }

    return (
      <span className={colorClass}>
        {isPositive ? <TrendUpIcon /> : isNegative ? <TrendDownIcon /> : <TrendNeutralIcon />}
      </span>
    );
  };

  const getVariacaoColor = (variacao?: number, tipo_meta?: string) => {
    if (variacao === undefined || variacao === null) return 'text-gray-600';
    if (tipo_meta === 'maior') {
      return variacao > 0 ? 'text-green-600' : variacao < 0 ? 'text-red-600' : 'text-gray-600';
    } else if (tipo_meta === 'menor') {
      return variacao < 0 ? 'text-green-600' : variacao > 0 ? 'text-red-600' : 'text-gray-600';
    }
    return 'text-gray-600';
  };

  const getStatusColor = (status?: string) => {
    if (status === 'ok') return 'text-green-600 bg-green-100';
    if (status === 'atencao') return 'text-red-600 bg-red-100';
    return 'text-gray-600 bg-gray-100';
  };

  const categorias = [...new Set(variacaoDiaria.map(k => k.categoria || 'Geral'))].sort();

  const kpisFiltrados = filtroCategoria
    ? variacaoDiaria.filter(k => (k.categoria || 'Geral') === filtroCategoria)
    : variacaoDiaria;

  const kpisOrdenados = [...kpisFiltrados].sort((a, b) => {
    const extractNumber = (indice: string | undefined) => {
      if (!indice) return 9999;
      const match = indice.match(/\d+/);
      return match ? parseInt(match[0]) : 9999;
    };
    return extractNumber(a.indice) - extractNumber(b.indice);
  });

  const tabs = [
    { id: 'monitoramento' as TabType, label: 'Monitoramento' },
    { id: 'cadastro' as TabType, label: 'Cadastro' },
    { id: 'historico' as TabType, label: 'Histórico' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="border-b border-gray-200 flex-1">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        </div>
      ) : (
        <>
          {activeTab === 'monitoramento' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Monitoramento de KPIs</h2>
                  <p className="text-sm text-gray-500 mt-1">Acompanhe a variação diária dos seus indicadores</p>
                </div>
                <div className="flex items-center gap-4">
                  <select
                    value={filtroCategoria}
                    onChange={(e) => setFiltroCategoria(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Todas as Categorias</option>
                    {categorias.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleSalvarSnapshot}
                    disabled={salvandoSnapshot}
                    className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <RefreshIcon />
                    {salvandoSnapshot ? 'Salvando...' : 'Salvar Snapshot'}
                  </button>
                </div>
              </div>

              {snapshotMensagem && (
                <div className={`rounded-lg px-4 py-3 ${snapshotMensagem.includes('Erro') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {snapshotMensagem}
                </div>
              )}

              {kpisOrdenados.length === 0 ? (
                <div className="rounded-lg bg-white p-8 text-center shadow">
                  <p className="text-gray-500">Nenhum KPI ativo para monitoramento.</p>
                  <p className="text-sm text-gray-400 mt-2">Cadastre KPIs na aba "Cadastro" para começar.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {kpisOrdenados.map((kpi) => (
                    <div 
                      key={kpi.id} 
                      className="rounded-lg bg-white p-5 shadow hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => {
                        setSelectedKPIId(kpi.id);
                        setActiveTab('historico');
                        loadHistoricoVariacao(kpi.id);
                      }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {kpi.indice && (
                            <span className="bg-blue-600 text-white text-xs font-bold rounded px-2 py-1">
                              {kpi.indice}
                            </span>
                          )}
                          {kpi.calculo_automatico && (
                            <span className="bg-purple-100 text-purple-700 text-xs font-medium rounded px-2 py-1">
                              Auto
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {getTendenciaIcon(kpi.tendencia, kpi.tipo_meta)}
                          {kpi.status_meta && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusColor(kpi.status_meta)}`}>
                              {kpi.status_meta === 'ok' ? 'OK' : '!'}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{kpi.categoria || 'Geral'}</p>
                      <h3 className="mt-1 text-sm font-semibold text-gray-900 line-clamp-2">{kpi.descricao}</h3>
                      
                      <div className="mt-4">
                        <div className="flex items-end gap-2">
                          <span className="text-2xl font-bold text-gray-900">
                            {kpi.valor_hoje !== undefined ? formatNumber(kpi.valor_hoje, kpi.unidade) : '-'}
                          </span>
                          {kpi.unidade && kpi.unidade !== 'R$' && (
                            <span className="text-gray-500 text-sm mb-0.5">{kpi.unidade}</span>
                          )}
                        </div>
                        
                        {kpi.valor_ontem !== undefined && kpi.variacao_absoluta !== undefined && (
                          <div className="mt-2 flex items-center gap-3">
                            <span className={`text-sm font-medium ${getVariacaoColor(kpi.variacao_absoluta, kpi.tipo_meta)}`}>
                              {formatVariacao(kpi.variacao_absoluta, kpi.unidade)}
                            </span>
                            {kpi.variacao_percentual !== undefined && kpi.variacao_percentual !== null && (
                              <span className={`text-xs ${getVariacaoColor(kpi.variacao_percentual, kpi.tipo_meta)}`}>
                                ({kpi.variacao_percentual > 0 ? '+' : ''}{kpi.variacao_percentual.toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        )}
                        
                        {kpi.valor_ontem !== undefined && (
                          <p className="mt-1 text-xs text-gray-400">
                            Ontem: {formatNumber(kpi.valor_ontem, kpi.unidade)}
                          </p>
                        )}

                        {kpi.meta !== undefined && (
                          <p className="mt-2 text-xs text-gray-500">
                            Meta: {formatNumber(kpi.meta, kpi.unidade)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'cadastro' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">KPIs Cadastrados</h2>
                <button
                  onClick={() => setShowForm(true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  Novo KPI
                </button>
              </div>

              {showForm && (
                <div className="rounded-lg bg-white p-6 shadow">
                  <h3 className="mb-4 text-lg font-medium">
                    {editingKPI ? 'Editar KPI' : 'Novo KPI'}
                  </h3>
                  <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Descrição *</label>
                      <input
                        type="text"
                        required
                        value={formData.descricao}
                        onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Categoria</label>
                      <input
                        type="text"
                        value={formData.categoria}
                        onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                        placeholder="Ex: A Pagar, A Receber, Bancário"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Índice/Código</label>
                      <input
                        type="text"
                        value={formData.indice}
                        onChange={(e) => setFormData({ ...formData, indice: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                        placeholder="Ex: 1, 2, 3..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Meta</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.meta || ''}
                        onChange={(e) => setFormData({ ...formData, meta: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Tipo de Meta</label>
                      <select
                        value={formData.tipo_meta}
                        onChange={(e) => setFormData({ ...formData, tipo_meta: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                      >
                        <option value="maior">Quanto maior, melhor</option>
                        <option value="menor">Quanto menor, melhor</option>
                        <option value="igual">Deve ser igual à meta</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Unidade</label>
                      <input
                        type="text"
                        value={formData.unidade}
                        onChange={(e) => setFormData({ ...formData, unidade: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                        placeholder="Ex: %, R$, Qtd., dias"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Fórmula/Descrição do Cálculo</label>
                      <textarea
                        value={formData.formula}
                        onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                        rows={2}
                        placeholder="Descrição de como o KPI é calculado"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Vincular a Cálculo Automático</label>
                      <select
                        value={formData.calculo_automatico || ''}
                        onChange={(e) => {
                          const selectedValue = e.target.value;
                          const calculo = calculosDisponiveis.find(c => c.id === selectedValue);
                          setFormData({ 
                            ...formData, 
                            calculo_automatico: selectedValue ? selectedValue : undefined,
                            unidade: calculo ? calculo.unidade : formData.unidade
                          });
                        }}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                      >
                        <option value="">Nenhum (valor manual)</option>
                        {calculosDisponiveis.map((calculo) => (
                          <option key={calculo.id} value={calculo.id}>
                            {calculo.nome} ({calculo.unidade})
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        Se selecionado, o valor será calculado automaticamente com base nos dados do sistema.
                      </p>
                    </div>
                    {formData.calculo_automatico && tiposDocumento.length > 0 && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Tipos de Documento a Excluir</label>
                        <div className="mt-2 flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                          {tiposDocumento.map((tipo) => (
                            <label
                              key={tipo.id}
                              className={`inline-flex items-center px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                                selectedDocumentos.includes(tipo.id)
                                  ? 'bg-blue-100 border-blue-500 text-blue-700'
                                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedDocumentos.includes(tipo.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedDocumentos([...selectedDocumentos, tipo.id]);
                                  } else {
                                    setSelectedDocumentos(selectedDocumentos.filter(d => d !== tipo.id));
                                  }
                                }}
                                className="sr-only"
                              />
                              <span className="text-sm">{tipo.id} - {tipo.nome}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="ativo"
                        checked={formData.ativo}
                        onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <label htmlFor="ativo" className="ml-2 text-sm text-gray-700">KPI Ativo</label>
                    </div>
                    <div className="md:col-span-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={resetForm}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                      >
                        {editingKPI ? 'Salvar' : 'Cadastrar'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="rounded-lg bg-white shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Índice</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Descrição</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Categoria</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Cálculo</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Meta</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {kpis.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                          Nenhum KPI cadastrado. Clique em "Novo KPI" para começar.
                        </td>
                      </tr>
                    ) : (
                      kpis.map((kpi) => (
                        <tr key={kpi.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">{kpi.indice || '-'}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{kpi.descricao}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{kpi.categoria || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {kpi.calculo_automatico ? (
                              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs">Automático</span>
                            ) : (
                              <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">Manual</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatNumber(kpi.meta, kpi.unidade)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold ${kpi.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                              {kpi.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                            <button
                              onClick={() => handleEdit(kpi)}
                              className="text-blue-600 hover:text-blue-900 mr-3"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(kpi.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'historico' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-xl font-semibold text-gray-900">Histórico de Variações</h2>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Selecionar KPI:</label>
                  <select
                    value={selectedKPIId || ''}
                    onChange={(e) => {
                      const id = parseInt(e.target.value);
                      setSelectedKPIId(id);
                      loadHistoricoVariacao(id);
                    }}
                    className="rounded-lg border border-gray-300 px-3 py-2"
                  >
                    {kpis.map((kpi) => (
                      <option key={kpi.id} value={kpi.id}>
                        {kpi.indice ? `${kpi.indice} - ` : ''}{kpi.descricao}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {historicoVariacao && (
                <div className="space-y-6">
                  <div className="rounded-lg bg-white p-6 shadow">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{historicoVariacao.kpi.descricao}</h3>
                        <p className="text-sm text-gray-500">{historicoVariacao.kpi.categoria || 'Geral'}</p>
                      </div>
                      {historicoVariacao.kpi.meta && (
                        <div className="text-right">
                          <p className="text-sm text-gray-500">Meta</p>
                          <p className="text-lg font-semibold text-blue-600">
                            {formatNumber(historicoVariacao.kpi.meta, historicoVariacao.kpi.unidade)}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historicoVariacao.historico}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="data" 
                            tickFormatter={(value) => {
                              const date = new Date(value);
                              return `${date.getDate()}/${date.getMonth() + 1}`;
                            }}
                          />
                          <YAxis />
                          <Tooltip 
                            labelFormatter={(value) => {
                              const date = new Date(value);
                              return date.toLocaleDateString('pt-BR');
                            }}
                            formatter={(value: number, name: string) => {
                              if (name === 'valor') {
                                return [formatNumber(value, historicoVariacao.kpi.unidade), 'Valor'];
                              }
                              return [value, name];
                            }}
                          />
                          {historicoVariacao.kpi.meta && (
                            <ReferenceLine 
                              y={historicoVariacao.kpi.meta} 
                              stroke="#3B82F6" 
                              strokeDasharray="5 5"
                              label={{ value: 'Meta', position: 'right' }}
                            />
                          )}
                          <Line 
                            type="monotone" 
                            dataKey="valor" 
                            stroke="#2563EB" 
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white shadow overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900">Tabela de Variações</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Data</th>
                            <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Valor</th>
                            <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Variação</th>
                            <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">%</th>
                            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Tendência</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {[...historicoVariacao.historico].reverse().map((item, index) => (
                            <tr key={index}>
                              <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                                {new Date(item.data).toLocaleDateString('pt-BR')}
                              </td>
                              <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                                {formatNumber(item.valor, historicoVariacao.kpi.unidade)}
                              </td>
                              <td className={`px-6 py-3 whitespace-nowrap text-sm text-right font-medium ${
                                item.variacao_absoluta !== undefined ? getVariacaoColor(item.variacao_absoluta) : ''
                              }`}>
                                {item.variacao_absoluta !== undefined ? formatVariacao(item.variacao_absoluta, historicoVariacao.kpi.unidade) : '-'}
                              </td>
                              <td className={`px-6 py-3 whitespace-nowrap text-sm text-right ${
                                item.variacao_percentual !== undefined ? getVariacaoColor(item.variacao_percentual) : ''
                              }`}>
                                {item.variacao_percentual !== undefined && item.variacao_percentual !== null ? `${item.variacao_percentual > 0 ? '+' : ''}${item.variacao_percentual.toFixed(2)}%` : '-'}
                              </td>
                              <td className="px-6 py-3 whitespace-nowrap text-center">
                                {getTendenciaIcon(item.tendencia)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
