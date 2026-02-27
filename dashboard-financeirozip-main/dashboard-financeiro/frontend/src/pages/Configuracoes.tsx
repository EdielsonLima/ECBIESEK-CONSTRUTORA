import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';

interface EmpresaItem {
  id: number;
  nome: string;
  excluida: boolean;
}

interface CentroCustoItem {
  id: number;
  nome: string;
  excluido: boolean;
}

interface TipoDocumentoItem {
  id: string;
  nome: string;
  excluido: boolean;
}

interface ContaCorrenteItem {
  id: string;
  nome: string;
  empresa_id: number;
  excluida: boolean;
}

export const Configuracoes: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<'empresas' | 'centros' | 'documentos' | 'contas_correntes' | 'snapshots'>('empresas');
  const [empresas, setEmpresas] = useState<EmpresaItem[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoItem[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumentoItem[]>([]);
  const [contasCorrente, setContasCorrente] = useState<ContaCorrenteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [snapshotHorario, setSnapshotHorario] = useState('07:00');
  const [snapshotAtivo, setSnapshotAtivo] = useState(true);
  const [snapshotSalvando, setSnapshotSalvando] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);
  const [snapshotsDisponiveis, setSnapshotsDisponiveis] = useState<Array<{ data_snapshot: string; created_at: string }>>([]);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [configData, empresasData, centrosData, tiposDocData, contasCorrenteData, snapshotConfig, snapshotsList] = await Promise.all([
        apiService.getConfiguracoes(),
        apiService.getEmpresas(),
        apiService.getCentrosCusto(),
        apiService.getTiposDocumento(),
        apiService.getContasCorrente(),
        apiService.getSnapshotHorario(),
        apiService.listarSnapshotsCardsPagar(),
      ]);
      setSnapshotHorario(snapshotConfig.horario || '07:00');
      setSnapshotAtivo(snapshotConfig.ativo);
      setSnapshotsDisponiveis(snapshotsList);

      const empresasExcluidas = new Set(
        (configData.empresas_excluidas || []).map((e: any) => e.id_sienge_empresa)
      );
      const centrosExcluidos = new Set(
        (configData.centros_custo_excluidos || []).map((c: any) => c.id_interno_centrocusto)
      );
      const tiposExcluidos = new Set(
        (configData.tipos_documento_excluidos || []).map((t: any) => t.id_documento)
      );
      const contasExcluidas = new Set(
        (configData.contas_correntes_excluidas || []).map((cc: any) => cc.id_conta_corrente)
      );

      setEmpresas(
        empresasData.map((e: any) => ({
          id: e.id,
          nome: e.nome,
          excluida: empresasExcluidas.has(e.id),
        }))
      );

      setCentrosCusto(
        centrosData.map((c: any) => ({
          id: c.id,
          nome: c.nome,
          excluido: centrosExcluidos.has(c.id),
        }))
      );

      setTiposDocumento(
        tiposDocData.map((t: any) => ({
          id: t.id,
          nome: t.nome,
          excluido: tiposExcluidos.has(t.id),
        }))
      );

      setContasCorrente(
        contasCorrenteData.map((cc: any) => ({
          id: cc.id,
          nome: cc.nome,
          empresa_id: cc.empresa_id,
          excluida: contasExcluidas.has(cc.id),
        }))
      );
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleEmpresa = async (empresa: EmpresaItem) => {
    const key = `empresa-${empresa.id}`;
    setSalvando(key);
    try {
      await apiService.toggleEmpresa({
        id_sienge_empresa: empresa.id,
        nome_empresa: empresa.nome,
        excluir: !empresa.excluida,
      });
      setEmpresas(prev =>
        prev.map(e => (e.id === empresa.id ? { ...e, excluida: !e.excluida } : e))
      );
    } catch (error) {
      console.error('Erro ao alterar empresa:', error);
    } finally {
      setSalvando(null);
    }
  };

  const toggleCentro = async (centro: CentroCustoItem) => {
    const key = `centro-${centro.id}`;
    setSalvando(key);
    try {
      await apiService.toggleCentroCusto({
        id_interno_centrocusto: centro.id,
        nome_centrocusto: centro.nome,
        excluir: !centro.excluido,
      });
      setCentrosCusto(prev =>
        prev.map(c => (c.id === centro.id ? { ...c, excluido: !c.excluido } : c))
      );
    } catch (error) {
      console.error('Erro ao alterar centro de custo:', error);
    } finally {
      setSalvando(null);
    }
  };

  const toggleTipoDoc = async (tipo: TipoDocumentoItem) => {
    const key = `tipo-${tipo.id}`;
    setSalvando(key);
    try {
      await apiService.toggleTipoDocumento({
        id_documento: tipo.id,
        nome_documento: tipo.nome,
        excluir: !tipo.excluido,
      });
      setTiposDocumento(prev =>
        prev.map(t => (t.id === tipo.id ? { ...t, excluido: !t.excluido } : t))
      );
    } catch (error) {
      console.error('Erro ao alterar tipo de documento:', error);
    } finally {
      setSalvando(null);
    }
  };

  const toggleContaCorrente = async (conta: ContaCorrenteItem) => {
    const key = `conta-${conta.id}`;
    setSalvando(key);
    try {
      await apiService.toggleContaCorrente({
        id_conta_corrente: conta.id,
        nome_conta_corrente: conta.nome,
        excluir: !conta.excluida,
      });
      setContasCorrente(prev =>
        prev.map(c => (c.id === conta.id ? { ...c, excluida: !c.excluida } : c))
      );
    } catch (error) {
      console.error('Erro ao alterar conta corrente:', error);
    } finally {
      setSalvando(null);
    }
  };

  const salvarSnapshotConfig = async () => {
    setSnapshotSalvando(true);
    setSnapshotMsg(null);
    try {
      await apiService.setSnapshotHorario({ horario: snapshotHorario, ativo: snapshotAtivo });
      setSnapshotMsg('Configuracao salva com sucesso!');
      setTimeout(() => setSnapshotMsg(null), 3000);
    } catch (error) {
      console.error('Erro ao salvar configuracao de snapshot:', error);
      setSnapshotMsg('Erro ao salvar configuracao');
    } finally {
      setSnapshotSalvando(false);
    }
  };

  const filtrarPorBusca = (nome: string) => {
    if (!busca) return true;
    return nome.toLowerCase().includes(busca.toLowerCase());
  };

  const renderToggle = (ativo: boolean, loading: boolean) => (
    <div
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
        ativo ? 'bg-green-500' : 'bg-gray-300'
      } ${loading ? 'opacity-50' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          ativo ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Carregando configuracoes...</span>
      </div>
    );
  }

  const empresasFiltradas = empresas.filter(e => filtrarPorBusca(e.nome));
  const centrosFiltrados = centrosCusto.filter(c => filtrarPorBusca(c.nome));
  const tiposFiltrados = tiposDocumento.filter(t => filtrarPorBusca(t.nome));
  const contasFiltradas = contasCorrente.filter(c => filtrarPorBusca(c.nome));

  const totalExcluidas = empresas.filter(e => e.excluida).length;
  const totalCentrosExcluidos = centrosCusto.filter(c => c.excluido).length;
  const totalTiposExcluidos = tiposDocumento.filter(t => t.excluido).length;
  const totalContasExcluidas = contasCorrente.filter(c => c.excluida).length;

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Configuracoes</h2>
        <p className="mt-1 text-sm text-gray-600">
          Gerencie quais empresas, centros de custo, tipos de documento e contas correntes participam dos calculos
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setAbaAtiva('empresas'); setBusca(''); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            abaAtiva === 'empresas'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          Empresas
          {totalExcluidas > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
              {totalExcluidas} excluida(s)
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setAbaAtiva('centros'); setBusca(''); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            abaAtiva === 'centros'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          Centros de Custo
          {totalCentrosExcluidos > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
              {totalCentrosExcluidos} excluido(s)
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setAbaAtiva('documentos'); setBusca(''); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            abaAtiva === 'documentos'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          Tipos de Documento
          {totalTiposExcluidos > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
              {totalTiposExcluidos} excluido(s)
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setAbaAtiva('contas_correntes'); setBusca(''); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            abaAtiva === 'contas_correntes'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          Contas Correntes
          {totalContasExcluidas > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
              {totalContasExcluidas} excluida(s)
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setAbaAtiva('snapshots'); setBusca(''); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            abaAtiva === 'snapshots'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          Snapshots
          {snapshotAtivo && (
            <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
              {snapshotHorario}
            </span>
          )}
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar..."
          className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="rounded-lg bg-white shadow">
        {abaAtiva === 'empresas' && (
          <div className="divide-y divide-gray-200">
            <div className="bg-blue-50 px-6 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {empresas.length} empresa(s) | {empresas.length - totalExcluidas} ativa(s) | {totalExcluidas} excluida(s)
                </span>
              </div>
            </div>
            {empresasFiltradas.map(empresa => (
              <div
                key={empresa.id}
                className={`flex items-center justify-between px-6 py-4 hover:bg-gray-50 ${
                  empresa.excluida ? 'bg-red-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${empresa.excluida ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {empresa.nome}
                  </span>
                  <span className="text-xs text-gray-400">ID: {empresa.id}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${empresa.excluida ? 'text-red-600' : 'text-green-600'}`}>
                    {empresa.excluida ? 'Excluida' : 'Ativa'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleEmpresa(empresa)}
                    disabled={salvando === `empresa-${empresa.id}`}
                  >
                    {renderToggle(!empresa.excluida, salvando === `empresa-${empresa.id}`)}
                  </button>
                </div>
              </div>
            ))}
            {empresasFiltradas.length === 0 && (
              <div className="px-6 py-8 text-center text-gray-500">
                Nenhuma empresa encontrada
              </div>
            )}
          </div>
        )}

        {abaAtiva === 'centros' && (
          <div className="divide-y divide-gray-200">
            <div className="bg-blue-50 px-6 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {centrosCusto.length} centro(s) de custo | {centrosCusto.length - totalCentrosExcluidos} ativo(s) | {totalCentrosExcluidos} excluido(s)
                </span>
              </div>
            </div>
            {centrosFiltrados.map(centro => (
              <div
                key={centro.id}
                className={`flex items-center justify-between px-6 py-4 hover:bg-gray-50 ${
                  centro.excluido ? 'bg-red-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${centro.excluido ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {centro.nome}
                  </span>
                  <span className="text-xs text-gray-400">ID: {centro.id}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${centro.excluido ? 'text-red-600' : 'text-green-600'}`}>
                    {centro.excluido ? 'Excluido' : 'Ativo'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCentro(centro)}
                    disabled={salvando === `centro-${centro.id}`}
                  >
                    {renderToggle(!centro.excluido, salvando === `centro-${centro.id}`)}
                  </button>
                </div>
              </div>
            ))}
            {centrosFiltrados.length === 0 && (
              <div className="px-6 py-8 text-center text-gray-500">
                Nenhum centro de custo encontrado
              </div>
            )}
          </div>
        )}

        {abaAtiva === 'documentos' && (
          <div className="divide-y divide-gray-200">
            <div className="bg-blue-50 px-6 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {tiposDocumento.length} tipo(s) | {tiposDocumento.length - totalTiposExcluidos} ativo(s) | {totalTiposExcluidos} excluido(s)
                </span>
              </div>
            </div>
            {tiposFiltrados.map(tipo => (
              <div
                key={tipo.id}
                className={`flex items-center justify-between px-6 py-4 hover:bg-gray-50 ${
                  tipo.excluido ? 'bg-red-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${tipo.excluido ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {tipo.nome}
                  </span>
                  <span className="text-xs text-gray-400">({tipo.id})</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${tipo.excluido ? 'text-red-600' : 'text-green-600'}`}>
                    {tipo.excluido ? 'Excluido' : 'Ativo'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleTipoDoc(tipo)}
                    disabled={salvando === `tipo-${tipo.id}`}
                  >
                    {renderToggle(!tipo.excluido, salvando === `tipo-${tipo.id}`)}
                  </button>
                </div>
              </div>
            ))}
            {tiposFiltrados.length === 0 && (
              <div className="px-6 py-8 text-center text-gray-500">
                Nenhum tipo de documento encontrado
              </div>
            )}
          </div>
        )}

        {abaAtiva === 'contas_correntes' && (
          <div className="divide-y divide-gray-200">
            <div className="bg-blue-50 px-6 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {contasCorrente.length} conta(s) corrente(s) | {contasCorrente.length - totalContasExcluidas} ativa(s) | {totalContasExcluidas} excluida(s)
                </span>
              </div>
            </div>
            {contasFiltradas.map(conta => (
              <div
                key={conta.id}
                className={`flex items-center justify-between px-6 py-4 hover:bg-gray-50 ${
                  conta.excluida ? 'bg-red-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${conta.excluida ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {conta.nome}
                  </span>
                  <span className="text-xs text-gray-400">({conta.id})</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${conta.excluida ? 'text-red-600' : 'text-green-600'}`}>
                    {conta.excluida ? 'Excluida' : 'Ativa'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleContaCorrente(conta)}
                    disabled={salvando === `conta-${conta.id}`}
                  >
                    {renderToggle(!conta.excluida, salvando === `conta-${conta.id}`)}
                  </button>
                </div>
              </div>
            ))}
            {contasFiltradas.length === 0 && (
              <div className="px-6 py-8 text-center text-gray-500">
                Nenhuma conta corrente encontrada
              </div>
            )}
          </div>
        )}

        {abaAtiva === 'snapshots' && (
          <div className="divide-y divide-gray-200">
            <div className="bg-blue-50 px-6 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Snapshot Automatico de Contas a Pagar
                </span>
                <span className={`text-xs font-medium ${snapshotAtivo ? 'text-green-600' : 'text-gray-500'}`}>
                  {snapshotAtivo ? 'Ativo' : 'Desativado'}
                </span>
              </div>
            </div>
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-6">
                O sistema salva automaticamente um snapshot dos valores dos cards de Contas a Pagar no horario configurado abaixo. 
                Voce pode usar esses snapshots para comparar valores e detectar se novos titulos foram inseridos em periodos ja verificados.
              </p>

              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700 w-40">Ativar/Desativar:</label>
                  <button
                    type="button"
                    onClick={() => setSnapshotAtivo(!snapshotAtivo)}
                  >
                    {renderToggle(snapshotAtivo, false)}
                  </button>
                  <span className={`text-sm ${snapshotAtivo ? 'text-green-600' : 'text-gray-500'}`}>
                    {snapshotAtivo ? 'Snapshot automatico ativo' : 'Snapshot automatico desativado'}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700 w-40">Horario diario:</label>
                  <input
                    type="time"
                    value={snapshotHorario}
                    onChange={(e) => setSnapshotHorario(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    disabled={!snapshotAtivo}
                  />
                  <span className="text-xs text-gray-500">Horario em que o snapshot sera salvo automaticamente</span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={salvarSnapshotConfig}
                    disabled={snapshotSalvando}
                    className="rounded-lg bg-blue-600 px-6 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {snapshotSalvando ? 'Salvando...' : 'Salvar Configuracao'}
                  </button>
                  {snapshotMsg && (
                    <span className={`text-sm ${snapshotMsg.includes('Erro') ? 'text-red-600' : 'text-green-600'}`}>
                      {snapshotMsg}
                    </span>
                  )}
                </div>
              </div>

              {snapshotsDisponiveis.length > 0 && (
                <div className="mt-8 border-t border-gray-200 pt-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Ultimos Snapshots Salvos</h3>
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Data</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Salvo em</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {snapshotsDisponiveis.slice(0, 10).map(s => {
                          const [ano, mes, dia] = s.data_snapshot.split('-');
                          let criado = '-';
                          if (s.created_at) {
                            const d = new Date(s.created_at);
                            d.setHours(d.getHours() - 3);
                            criado = d.toLocaleString('pt-BR');
                          }
                          return (
                            <tr key={s.data_snapshot} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-sm text-gray-900">{dia}/{mes}/{ano}</td>
                              <td className="px-4 py-2 text-sm text-gray-500">{criado}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
