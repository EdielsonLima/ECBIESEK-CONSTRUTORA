import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { KPI, KPICreate, KPIResumo, KPIHistorico, CalculoDisponivel, TipoDocumento } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

type TabType = 'cadastro' | 'acompanhamento' | 'historico';

export const KPIs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('cadastro');
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [resumo, setResumo] = useState<KPIResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingKPI, setEditingKPI] = useState<KPI | null>(null);
  const [selectedKPIId, setSelectedKPIId] = useState<number | null>(null);
  const [historico, setHistorico] = useState<KPIHistorico[]>([]);
  const [novoValor, setNovoValor] = useState('');
  const [dataValor, setDataValor] = useState(new Date().toISOString().split('T')[0]);
  const [calculosDisponiveis, setCalculosDisponiveis] = useState<CalculoDisponivel[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumento[]>([]);
  const [selectedDocumentos, setSelectedDocumentos] = useState<string[]>([]);
  
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
      } else if (activeTab === 'acompanhamento') {
        const data = await apiService.getKPIsResumo();
        setResumo(data);
      } else if (activeTab === 'historico') {
        const data = await apiService.getKPIs(true);
        setKpis(data);
        if (data.length > 0 && !selectedKPIId) {
          setSelectedKPIId(data[0].id);
          loadHistorico(data[0].id);
        } else if (selectedKPIId) {
          loadHistorico(selectedKPIId);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
    setLoading(false);
  };

  const loadHistorico = async (kpiId: number) => {
    try {
      const data = await apiService.getKPIHistorico(kpiId, 60);
      setHistorico(data.reverse());
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    }
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

  const handleRegistrarValor = async () => {
    if (!selectedKPIId || !novoValor) return;
    try {
      await apiService.registrarValorKPI(selectedKPIId, parseFloat(novoValor), dataValor);
      setNovoValor('');
      loadHistorico(selectedKPIId);
    } catch (error) {
      console.error('Erro ao registrar valor:', error);
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

  const formatNumber = (value: number | undefined) => {
    if (value === undefined || value === null) return '-';
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getStatusColor = (status?: string) => {
    if (status === 'ok') return 'text-green-600 bg-green-100';
    if (status === 'atencao') return 'text-red-600 bg-red-100';
    return 'text-gray-600 bg-gray-100';
  };

  const tabs = [
    { id: 'cadastro' as TabType, label: 'Cadastro' },
    { id: 'acompanhamento' as TabType, label: 'Acompanhamento' },
    { id: 'historico' as TabType, label: 'Histórico' }
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        </div>
      ) : (
        <>
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
                        placeholder="Ex: Financeiro, Operacional"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Índice/Código</label>
                      <input
                        type="text"
                        value={formData.indice}
                        onChange={(e) => setFormData({ ...formData, indice: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                        placeholder="Ex: KPI-001"
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
                        placeholder="Ex: %, R$, dias"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Fórmula/Descrição do Cálculo</label>
                      <textarea
                        value={formData.formula}
                        onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                        rows={2}
                        placeholder="Ex: (Receita - Custo) / Receita * 100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Cálculo Automático</label>
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
                        Se selecionado, o valor do KPI será calculado automaticamente em tempo real.
                      </p>
                    </div>
                    {formData.calculo_automatico && tiposDocumento.length > 0 && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Tipos de Documento a Excluir</label>
                        <div className="mt-2 flex flex-wrap gap-2">
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
                        <p className="mt-1 text-xs text-gray-500">
                          Selecione os tipos de documento que devem ser excluídos do cálculo deste KPI.
                        </p>
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
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Descrição</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Categoria</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Meta</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Unidade</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {kpis.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                          Nenhum KPI cadastrado. Clique em "Novo KPI" para começar.
                        </td>
                      </tr>
                    ) : (
                      kpis.map((kpi) => (
                        <tr key={kpi.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{kpi.descricao}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{kpi.categoria || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatNumber(kpi.meta)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{kpi.unidade || '-'}</td>
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

          {activeTab === 'acompanhamento' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Acompanhamento de KPIs</h2>
              
              {resumo.length === 0 ? (
                <div className="rounded-lg bg-white p-8 text-center shadow">
                  <p className="text-gray-500">Nenhum KPI ativo para acompanhamento.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...resumo].sort((a, b) => {
                    const extractNumber = (indice: string | undefined) => {
                      if (!indice) return 9999;
                      const match = indice.match(/\d+/);
                      return match ? parseInt(match[0]) : 9999;
                    };
                    return extractNumber(a.indice) - extractNumber(b.indice);
                  }).map((kpi) => (
                    <div key={kpi.id} className="rounded-lg bg-white p-6 shadow">
                      <div className="flex items-start justify-between mb-2">
                        {kpi.indice && (
                          <span className="bg-blue-600 text-white text-xs font-bold rounded px-2 py-1">
                            {kpi.indice}
                          </span>
                        )}
                        {kpi.status_meta && (
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusColor(kpi.status_meta)}`}>
                            {kpi.status_meta === 'ok' ? 'OK' : 'Atenção'}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">{kpi.categoria || 'Geral'}</p>
                        <h3 className="mt-1 text-lg font-semibold text-gray-900">{kpi.descricao}</h3>
                      </div>
                      <div className="mt-4">
                        <div className="flex items-end gap-2">
                          <span className="text-3xl font-bold text-gray-900">
                            {kpi.ultimo_valor !== undefined ? formatNumber(kpi.ultimo_valor) : '-'}
                          </span>
                          {kpi.unidade && <span className="text-gray-500">{kpi.unidade}</span>}
                        </div>
                        {kpi.meta !== undefined && (
                          <p className="mt-2 text-sm text-gray-500">
                            Meta: {formatNumber(kpi.meta)} {kpi.unidade}
                            {kpi.tipo_meta && (
                              <span className="ml-1 text-xs">
                                ({kpi.tipo_meta === 'maior' ? 'quanto maior, melhor' : kpi.tipo_meta === 'menor' ? 'quanto menor, melhor' : 'igual'})
                              </span>
                            )}
                          </p>
                        )}
                        {kpi.ultima_atualizacao && (
                          <p className="mt-1 text-xs text-gray-400">
                            Atualizado em: {new Date(kpi.ultima_atualizacao).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'historico' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-xl font-semibold text-gray-900">Histórico de KPIs</h2>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Selecionar KPI:</label>
                  <select
                    value={selectedKPIId || ''}
                    onChange={(e) => {
                      const id = parseInt(e.target.value);
                      setSelectedKPIId(id);
                      loadHistorico(id);
                    }}
                    className="rounded-lg border border-gray-300 px-3 py-2"
                  >
                    {kpis.map((kpi) => (
                      <option key={kpi.id} value={kpi.id}>{kpi.descricao}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedKPIId && (
                <>
                  <div className="rounded-lg bg-white p-4 shadow">
                    <h3 className="mb-4 text-lg font-medium">Registrar Novo Valor</h3>
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700">Data</label>
                        <input
                          type="date"
                          value={dataValor}
                          onChange={(e) => setDataValor(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700">Valor</label>
                        <input
                          type="number"
                          step="0.01"
                          value={novoValor}
                          onChange={(e) => setNovoValor(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                          placeholder="Digite o valor"
                        />
                      </div>
                      <button
                        onClick={handleRegistrarValor}
                        disabled={!novoValor}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Registrar
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white p-6 shadow">
                    <h3 className="mb-4 text-lg font-medium">Evolução do KPI</h3>
                    {historico.length === 0 ? (
                      <p className="py-8 text-center text-gray-500">Nenhum histórico registrado para este KPI.</p>
                    ) : (
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={historico}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              dataKey="data_registro" 
                              tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            />
                            <YAxis />
                            <Tooltip 
                              labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
                              formatter={(value: number) => [formatNumber(value), 'Valor']}
                            />
                            {kpis.find(k => k.id === selectedKPIId)?.meta && (
                              <ReferenceLine 
                                y={kpis.find(k => k.id === selectedKPIId)?.meta} 
                                stroke="#ef4444" 
                                strokeDasharray="5 5" 
                                label={{ value: 'Meta', position: 'right', fill: '#ef4444' }}
                              />
                            )}
                            <Line 
                              type="monotone" 
                              dataKey="valor" 
                              stroke="#3b82f6" 
                              strokeWidth={2}
                              dot={{ fill: '#3b82f6' }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg bg-white shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Data</th>
                          <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {historico.slice().reverse().map((item) => (
                          <tr key={item.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {new Date(item.data_registro).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                              {formatNumber(item.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
