import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { SearchableSelect } from '../components/SearchableSelect';
import { EmpresaOption } from '../types';

interface CentroCustoItem {
  id_interno_centrocusto: number;
  nome_centrocusto: string;
  id_sienge_empresa: number;
  nome_empresa: string;
  classificacao: string | null;
  observacao: string | null;
  id: number | null;
}

export function ClassificacaoCentroCusto() {
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoItem[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<number | null>(null);
  const [filtroClassificacao, setFiltroClassificacao] = useState<string>('todos');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    carregarEmpresas();
  }, []);

  useEffect(() => {
    carregarCentrosCusto();
  }, [filtroEmpresa]);

  const carregarEmpresas = async () => {
    try {
      const data = await apiService.getEmpresas();
      setEmpresas(data);
    } catch (err) {
      console.error('Erro ao carregar empresas:', err);
    }
  };

  const carregarCentrosCusto = async () => {
    setLoading(true);
    try {
      const data = await apiService.getTodosCentrosCusto(filtroEmpresa || undefined);
      setCentrosCusto(data);
    } catch (err) {
      console.error('Erro ao carregar centros de custo:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClassificacaoChange = async (item: CentroCustoItem, novaClassificacao: string) => {
    setSalvando(item.id_interno_centrocusto);
    try {
      await apiService.salvarClassificacaoCentroCusto({
        id_interno_centrocusto: item.id_interno_centrocusto,
        id_sienge_empresa: item.id_sienge_empresa,
        nome_centrocusto: item.nome_centrocusto,
        nome_empresa: item.nome_empresa,
        classificacao: novaClassificacao,
      });
      
      setCentrosCusto(prev => 
        prev.map(cc => 
          cc.id_interno_centrocusto === item.id_interno_centrocusto 
            ? { ...cc, classificacao: novaClassificacao }
            : cc
        )
      );
    } catch (err) {
      console.error('Erro ao salvar classificação:', err);
      alert('Erro ao salvar classificação');
    } finally {
      setSalvando(null);
    }
  };

  const handleRemoverClassificacao = async (item: CentroCustoItem) => {
    if (!item.classificacao) return;
    
    setSalvando(item.id_interno_centrocusto);
    try {
      await apiService.removerClassificacaoCentroCusto(item.id_interno_centrocusto);
      
      setCentrosCusto(prev => 
        prev.map(cc => 
          cc.id_interno_centrocusto === item.id_interno_centrocusto 
            ? { ...cc, classificacao: null, id: null }
            : cc
        )
      );
    } catch (err) {
      console.error('Erro ao remover classificação:', err);
    } finally {
      setSalvando(null);
    }
  };

  const centrosFiltrados = centrosCusto.filter(cc => {
    if (filtroClassificacao === 'ADM' && cc.classificacao !== 'ADM') return false;
    if (filtroClassificacao === 'OBRA' && cc.classificacao !== 'OBRA') return false;
    if (filtroClassificacao === 'nao_classificado' && cc.classificacao !== null) return false;
    
    if (busca) {
      const termo = busca.toLowerCase();
      return cc.nome_centrocusto?.toLowerCase().includes(termo) || 
             cc.nome_empresa?.toLowerCase().includes(termo);
    }
    
    return true;
  });

  const estatisticas = {
    total: centrosCusto.length,
    adm: centrosCusto.filter(cc => cc.classificacao === 'ADM').length,
    obra: centrosCusto.filter(cc => cc.classificacao === 'OBRA').length,
    naoClassificado: centrosCusto.filter(cc => !cc.classificacao).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Classificação de Centros de Custo</h1>
          <p className="text-gray-600 dark:text-slate-400">Classifique os centros de custo como ADM (Administrativo) ou OBRA</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-500 dark:text-slate-400">Total</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{estatisticas.total}</div>
        </div>
        <div className="bg-blue-50 rounded-lg shadow p-4">
          <div className="text-sm text-blue-600">ADM</div>
          <div className="text-2xl font-bold text-blue-700">{estatisticas.adm}</div>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4">
          <div className="text-sm text-green-600">OBRA</div>
          <div className="text-2xl font-bold text-green-700">{estatisticas.obra}</div>
        </div>
        <div className="bg-gray-50 dark:bg-slate-900 rounded-lg shadow p-4">
          <div className="text-sm text-gray-500 dark:text-slate-400">Não Classificado</div>
          <div className="text-2xl font-bold text-gray-700 dark:text-slate-300">{estatisticas.naoClassificado}</div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SearchableSelect
            options={empresas}
            value={filtroEmpresa ?? undefined}
            onChange={(value) => setFiltroEmpresa(value as number | null)}
            label="Empresa"
            placeholder="Todas as empresas..."
            emptyText="Todas"
          />
          
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Classificação</label>
            <select
              value={filtroClassificacao}
              onChange={(e) => setFiltroClassificacao(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="todos">Todos</option>
              <option value="ADM">ADM</option>
              <option value="OBRA">OBRA</option>
              <option value="nao_classificado">Não Classificado</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Buscar</label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome do centro de custo ou empresa..."
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-slate-400">Carregando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 dark:bg-slate-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Centro de Custo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Empresa
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Classificação
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200">
                {centrosFiltrados.map((cc) => (
                  <tr key={cc.id_interno_centrocusto} className="hover:bg-gray-50 dark:bg-slate-900">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-slate-100">{cc.nome_centrocusto}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">ID: {cc.id_interno_centrocusto}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-slate-100">{cc.nome_empresa}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {salvando === cc.id_interno_centrocusto ? (
                        <span className="text-gray-400">Salvando...</span>
                      ) : (
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleClassificacaoChange(cc, 'ADM')}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              cc.classificacao === 'ADM'
                                ? 'bg-blue-600 text-white'
                                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            }`}
                          >
                            ADM
                          </button>
                          <button
                            onClick={() => handleClassificacaoChange(cc, 'OBRA')}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              cc.classificacao === 'OBRA'
                                ? 'bg-green-600 text-white'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                            }`}
                          >
                            OBRA
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {cc.classificacao && (
                        <button
                          onClick={() => handleRemoverClassificacao(cc)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 text-sm"
                          disabled={salvando === cc.id_interno_centrocusto}
                        >
                          Limpar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {centrosFiltrados.length === 0 && (
              <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                Nenhum centro de custo encontrado com os filtros selecionados
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
