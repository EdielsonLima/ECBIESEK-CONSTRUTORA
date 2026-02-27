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
  const [abaAtiva, setAbaAtiva] = useState<'empresas' | 'centros' | 'documentos' | 'contas_correntes'>('empresas');
  const [empresas, setEmpresas] = useState<EmpresaItem[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoItem[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumentoItem[]>([]);
  const [contasCorrente, setContasCorrente] = useState<ContaCorrenteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [configData, empresasData, centrosData, tiposDocData, contasCorrenteData] = await Promise.all([
        apiService.getConfiguracoes(),
        apiService.getEmpresas(),
        apiService.getCentrosCusto(),
        apiService.getTiposDocumento(),
        apiService.getContasCorrente(),
      ]);

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
      </div>
    </>
  );
};
