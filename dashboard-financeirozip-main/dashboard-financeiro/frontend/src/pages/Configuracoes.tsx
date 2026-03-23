import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import axios from 'axios';

const apiHttp = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});
apiHttp.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

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

interface EmpresaCentros {
  id: number;
  nome: string;
  centros: { id: number; nome: string }[];
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

interface OrigemTituloItem {
  id: number;
  sigla: string;
  descricao: string;
  incluir: boolean;
  paginas: string; // ex: 'exposicao_caixa' ou 'exposicao_caixa,outro'
  configurado: boolean; // se já existe registro no config DB
}

interface TipoBaixaConfigItem {
  id: number;
  nome: string;
  flag: string; // P=Pagamento R=Recebimento A=Ajuste S=Sistema
  incluir: boolean;
  paginas: string;
  configurado: boolean;
}

const PAGINAS_DISPONIVEIS = [
  { key: 'exposicao_caixa', label: 'Exposição de Caixa' },
  { key: 'contas_pagas', label: 'Contas Pagas' },
];

export const Configuracoes: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<'empresas' | 'centros' | 'documentos' | 'contas_correntes' | 'origens' | 'tipos_baixa' | 'snapshots' | 'diagnostico' | 'orcamentos' | 'feriados'>('empresas');
  const [empresas, setEmpresas] = useState<EmpresaItem[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoItem[]>([]);
  const [empresasCentros, setEmpresasCentros] = useState<EmpresaCentros[]>([]);
  const [loadingDiagnostico, setLoadingDiagnostico] = useState(false);
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumentoItem[]>([]);
  const [contasCorrente, setContasCorrente] = useState<ContaCorrenteItem[]>([]);
  const [origensTitulo, setOrigensTitulo] = useState<OrigemTituloItem[]>([]);
  const [tiposBaixaConfig, setTiposBaixaConfig] = useState<TipoBaixaConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [snapshotHorario, setSnapshotHorario] = useState('07:00');
  const [snapshotAtivo, setSnapshotAtivo] = useState(true);
  const [snapshotSalvando, setSnapshotSalvando] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);
  const [snapshotsDisponiveis, setSnapshotsDisponiveis] = useState<Array<{ data_snapshot: string; created_at: string }>>([]);
  const [empreendimentosConfig, setEmpreendimentosConfig] = useState<any[]>([]);
  const [loadingOrcamentos, setLoadingOrcamentos] = useState(false);
  const [salvandoOrcamentos, setSalvandoOrcamentos] = useState(false);
  const [orcamentosMsg, setOrcamentosMsg] = useState<string | null>(null);
  const [cubValor, setCubValor] = useState(2334.56);
  const [cubReferencia, setCubReferencia] = useState('Fev/2026');
  const [feriadosList, setFeriadosList] = useState<Array<{ id: number; data: string; descricao: string }>>([]);
  const [novoFeriadoData, setNovoFeriadoData] = useState('');
  const [novoFeriadoDescricao, setNovoFeriadoDescricao] = useState('');
  const [feriadosSalvando, setFeriadosSalvando] = useState(false);
  const [feriadosMsg, setFeriadosMsg] = useState<string | null>(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDiagnostico = async () => {
    setLoadingDiagnostico(true);
    try {
      const data = await apiService.getEmpresasCentrosDiagnostico();
      setEmpresasCentros(data);
    } catch (err) {
      console.error('Erro ao carregar diagnóstico:', err);
    } finally {
      setLoadingDiagnostico(false);
    }
  };

  const carregarFeriados = async () => {
    try {
      const data = await apiService.getFeriados();
      setFeriadosList(data);
    } catch (err) {
      console.error('Erro ao carregar feriados:', err);
    }
  };

  const adicionarFeriado = async () => {
    if (!novoFeriadoData || !novoFeriadoDescricao.trim()) {
      setFeriadosMsg('Preencha data e descrição');
      return;
    }
    setFeriadosSalvando(true);
    setFeriadosMsg(null);
    try {
      await apiService.addFeriado(novoFeriadoData, novoFeriadoDescricao.trim());
      setNovoFeriadoData('');
      setNovoFeriadoDescricao('');
      await carregarFeriados();
      setFeriadosMsg('Feriado adicionado!');
    } catch (err) {
      console.error('Erro ao adicionar feriado:', err);
      setFeriadosMsg('Erro ao adicionar feriado');
    } finally {
      setFeriadosSalvando(false);
      setTimeout(() => setFeriadosMsg(null), 3000);
    }
  };

  const removerFeriado = async (id: number) => {
    try {
      await apiService.deleteFeriado(id);
      await carregarFeriados();
    } catch (err) {
      console.error('Erro ao remover feriado:', err);
    }
  };

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Promise.allSettled para não falhar tudo se uma API falhar (ex: tabelas config ainda não criadas)
      const [configResult, empresasResult, centrosResult, tiposDocResult, contasCorrenteResult, snapshotConfigResult, snapshotsListResult, origensTituloResult, origensConfigResult, tiposBaixaResult, tiposBaixaConfigResult] = await Promise.allSettled([
        apiService.getConfiguracoes(),
        apiService.getTodasEmpresas(),
        apiService.getTodosCentrosCustoConfig(),
        apiService.getTodosTiposDocumento(),
        apiService.getTodasContasCorrente(),
        apiService.getSnapshotHorario(),
        apiService.listarSnapshotsCardsPagar(),
        apiService.getOrigensTitulo(),
        apiService.getOrigensExposicao(),
        apiService.getTiposBaixaCompleto(),
        apiService.getTiposBaixaExposicao(),
      ]);

      const configData = configResult.status === 'fulfilled' ? configResult.value : { empresas_excluidas: [], centros_custo_excluidos: [], tipos_documento_excluidos: [], contas_correntes_excluidas: [] };
      const empresasData = empresasResult.status === 'fulfilled' ? empresasResult.value : [];
      const centrosData = centrosResult.status === 'fulfilled' ? centrosResult.value : [];
      const tiposDocData = tiposDocResult.status === 'fulfilled' ? tiposDocResult.value : [];
      const contasCorrenteData = contasCorrenteResult.status === 'fulfilled' ? contasCorrenteResult.value : [];
      const snapshotConfig = snapshotConfigResult.status === 'fulfilled' ? snapshotConfigResult.value : { horario: '07:00', ativo: true };
      const snapshotsList = snapshotsListResult.status === 'fulfilled' ? snapshotsListResult.value : [];
      const origensTituloData: Array<{ id: number; sigla: string; descricao: string }> = origensTituloResult.status === 'fulfilled' ? origensTituloResult.value : [];
      const origensConfigData: Array<{ id_origem_titulo: number; sigla: string; descricao: string; incluir: boolean; paginas: string }> = origensConfigResult.status === 'fulfilled' ? origensConfigResult.value : [];
      const tiposBaixaData: Array<{ id: number; nome: string; flag: string; descricao: string }> = tiposBaixaResult.status === 'fulfilled' ? tiposBaixaResult.value : [];
      const tiposBaixaConfigData: Array<{ id_tipo_baixa: number; nome_tipo_baixa: string; flag_sistema_uso: string; incluir: boolean; paginas: string }> = tiposBaixaConfigResult.status === 'fulfilled' ? tiposBaixaConfigResult.value : [];

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

      // Origens: merge da lista completa com a config salva
      const configMap = new Map(origensConfigData.map(o => [o.id_origem_titulo, o]));
      const temConfig = origensConfigData.length > 0;
      setOrigensTitulo(
        origensTituloData.map(o => {
          const cfg = configMap.get(o.id);
          return {
            id: o.id,
            sigla: o.sigla,
            descricao: o.descricao,
            incluir: cfg ? cfg.incluir : true, // sem config = inclui tudo
            paginas: cfg ? cfg.paginas : 'exposicao_caixa',
            configurado: !!cfg || temConfig, // indica se há alguma config salva
          };
        })
      );

      // Tipos de Baixa: merge da lista completa com a config salva
      const tbConfigMap = new Map(tiposBaixaConfigData.map(t => [t.id_tipo_baixa, t]));
      const temTbConfig = tiposBaixaConfigData.length > 0;
      setTiposBaixaConfig(
        tiposBaixaData.map(t => {
          const cfg = tbConfigMap.get(t.id);
          return {
            id: t.id,
            nome: t.nome,
            flag: t.flag,
            incluir: cfg ? cfg.incluir : true,
            paginas: cfg ? cfg.paginas : 'exposicao_caixa',
            configurado: !!cfg || temTbConfig,
          };
        })
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

  const toggleOrigemExposicao = async (origem: OrigemTituloItem, novoIncluir: boolean) => {
    const key = `origem-${origem.id}`;
    setSalvando(key);
    try {
      await apiService.toggleOrigemExposicao({
        id_origem_titulo: origem.id,
        sigla: origem.sigla,
        descricao: origem.descricao,
        incluir: novoIncluir,
        paginas: origem.paginas,
      });
      setOrigensTitulo(prev => prev.map(o =>
        o.id === origem.id ? { ...o, incluir: novoIncluir, configurado: true } : { ...o, configurado: true }
      ));
    } catch (error) {
      console.error('Erro ao alterar origem:', error);
    } finally {
      setSalvando(null);
    }
  };

  const togglePaginaOrigem = async (origem: OrigemTituloItem, pagKey: string, ativo: boolean) => {
    const key = `origem-pag-${origem.id}-${pagKey}`;
    setSalvando(key);
    try {
      const paginasAtuais = origem.paginas ? origem.paginas.split(',').map(p => p.trim()).filter(Boolean) : [];
      let novasPaginas: string[];
      if (ativo) {
        novasPaginas = paginasAtuais.includes(pagKey) ? paginasAtuais : [...paginasAtuais, pagKey];
      } else {
        novasPaginas = paginasAtuais.filter(p => p !== pagKey);
      }
      const paginasStr = novasPaginas.join(',') || '';
      await apiService.toggleOrigemExposicao({
        id_origem_titulo: origem.id,
        sigla: origem.sigla,
        descricao: origem.descricao,
        incluir: origem.incluir,
        paginas: paginasStr,
      });
      setOrigensTitulo(prev => prev.map(o =>
        o.id === origem.id ? { ...o, paginas: paginasStr, configurado: true } : { ...o, configurado: true }
      ));
    } catch (error) {
      console.error('Erro ao alterar páginas da origem:', error);
    } finally {
      setSalvando(null);
    }
  };

  const toggleTipoBaixaExposicao = async (tipo: TipoBaixaConfigItem, novoIncluir: boolean) => {
    const key = `tipobaixa-${tipo.id}`;
    setSalvando(key);
    try {
      await apiService.toggleTipoBaixaExposicao({
        id_tipo_baixa: tipo.id,
        nome_tipo_baixa: tipo.nome,
        flag_sistema_uso: tipo.flag,
        incluir: novoIncluir,
        paginas: tipo.paginas,
      });
      setTiposBaixaConfig(prev => prev.map(t =>
        t.id === tipo.id ? { ...t, incluir: novoIncluir, configurado: true } : { ...t, configurado: true }
      ));
    } catch (error) {
      console.error('Erro ao alterar tipo de baixa:', error);
    } finally {
      setSalvando(null);
    }
  };

  const togglePaginaTipoBaixa = async (tipo: TipoBaixaConfigItem, pagKey: string, ativo: boolean) => {
    const key = `tipobaixa-pag-${tipo.id}-${pagKey}`;
    setSalvando(key);
    try {
      const paginasAtuais = tipo.paginas ? tipo.paginas.split(',').map(p => p.trim()).filter(Boolean) : [];
      const novasPaginas = ativo
        ? (paginasAtuais.includes(pagKey) ? paginasAtuais : [...paginasAtuais, pagKey])
        : paginasAtuais.filter(p => p !== pagKey);
      const paginasStr = novasPaginas.join(',') || '';
      await apiService.toggleTipoBaixaExposicao({
        id_tipo_baixa: tipo.id,
        nome_tipo_baixa: tipo.nome,
        flag_sistema_uso: tipo.flag,
        incluir: tipo.incluir,
        paginas: paginasStr,
      });
      setTiposBaixaConfig(prev => prev.map(t =>
        t.id === tipo.id ? { ...t, paginas: paginasStr, configurado: true } : { ...t, configurado: true }
      ));
    } catch (error) {
      console.error('Erro ao alterar páginas do tipo de baixa:', error);
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

  const carregarOrcamentos = async () => {
    setLoadingOrcamentos(true);
    try {
      const [resEmp, resCub] = await Promise.all([
        apiHttp.get('/configuracoes/empreendimentos'),
        apiHttp.get('/configuracoes/cub'),
      ]);
      setEmpreendimentosConfig(resEmp.data);
      if (resCub.data) {
        setCubValor(resCub.data.valor || 2334.56);
        setCubReferencia(resCub.data.referencia || '');
      }
    } catch (err) {
      console.error('Erro ao carregar orcamentos:', err);
    } finally {
      setLoadingOrcamentos(false);
    }
  };

  const salvarTodosOrcamentos = async () => {
    setSalvandoOrcamentos(true);
    setOrcamentosMsg(null);
    try {
      await Promise.all([
        ...empreendimentosConfig.map(emp =>
          apiHttp.put(`/configuracoes/empreendimentos/${emp.id}`, {
            nome: emp.nome,
            codigo: emp.codigo,
            centro_custo_id: emp.centro_custo_id,
            metragem: emp.metragem,
            fator: emp.fator,
            vgv_mock: emp.vgv_mock,
            status: emp.status,
          })
        ),
        apiHttp.put('/configuracoes/cub', { valor: cubValor, referencia: cubReferencia }),
      ]);
      setOrcamentosMsg('Salvo com sucesso!');
      // Reload empreendimentos in apiService so painel executivo picks up changes
      await apiService.loadEmpreendimentos();
      setTimeout(() => setOrcamentosMsg(null), 3000);
    } catch (err) {
      console.error('Erro ao salvar orcamentos:', err);
      setOrcamentosMsg('Erro ao salvar');
    } finally {
      setSalvandoOrcamentos(false);
    }
  };

  const adicionarEmpreendimento = async () => {
    try {
      const res = await apiHttp.post('/configuracoes/empreendimentos', {
        nome: 'Novo Empreendimento',
        codigo: 'NOVO',
        centro_custo_id: null,
        metragem: 0,
        fator: 1,
        vgv_mock: 0,
        status: 'ativa',
      });
      setEmpreendimentosConfig(prev => [...prev, res.data]);
    } catch (err) {
      console.error('Erro ao adicionar empreendimento:', err);
    }
  };

  const removerEmpreendimento = async (id: number) => {
    try {
      await apiHttp.delete(`/configuracoes/empreendimentos/${id}`);
      setEmpreendimentosConfig(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      console.error('Erro ao remover empreendimento:', err);
    }
  };

  const toggleStatusEmpreendimento = (id: number) => {
    setEmpreendimentosConfig(prev =>
      prev.map(e =>
        e.id === id
          ? { ...e, status: e.status === 'ativa' ? 'finalizada' : 'ativa' }
          : e
      )
    );
  };

  const updateEmpreendimentoField = (id: number, field: string, value: any) => {
    setEmpreendimentosConfig(prev =>
      prev.map(e => (e.id === id ? { ...e, [field]: value } : e))
    );
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
  const totalOrigensExcluidas = origensTitulo.filter(o => o.configurado && !o.incluir).length;
  const origensFiltradas = origensTitulo.filter(o => filtrarPorBusca(o.descricao) || filtrarPorBusca(o.sigla));
  const totalTiposBaixaExcluidos = tiposBaixaConfig.filter(t => t.configurado && !t.incluir).length;
  const tiposBaixaFiltrados = tiposBaixaConfig.filter(t => filtrarPorBusca(t.nome));

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
          onClick={() => { setAbaAtiva('origens'); setBusca(''); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            abaAtiva === 'origens'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          Origens Titulos
          {totalOrigensExcluidas > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
              {totalOrigensExcluidas} excluida(s)
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setAbaAtiva('tipos_baixa'); setBusca(''); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            abaAtiva === 'tipos_baixa'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          Tipos de Baixa
          {totalTiposBaixaExcluidos > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
              {totalTiposBaixaExcluidos} excluido(s)
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
        <button
          type="button"
          onClick={() => { setAbaAtiva('diagnostico'); setBusca(''); if (empresasCentros.length === 0) carregarDiagnostico(); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            abaAtiva === 'diagnostico'
              ? 'bg-purple-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          Empresas e Centros
        </button>
        <button
          type="button"
          onClick={() => { setAbaAtiva('orcamentos'); setBusca(''); if (empreendimentosConfig.length === 0) carregarOrcamentos(); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            abaAtiva === 'orcamentos'
              ? 'bg-green-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          Orcamentos
        </button>
        <button
          type="button"
          onClick={() => { setAbaAtiva('feriados'); setBusca(''); if (feriadosList.length === 0) carregarFeriados(); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            abaAtiva === 'feriados'
              ? 'bg-green-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          Feriados
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

        {abaAtiva === 'origens' && (
          <div className="divide-y divide-gray-200">
            <div className="bg-blue-50 px-6 py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-medium text-gray-700">
                  {origensTitulo.length} origem(s) | {origensTitulo.filter(o => !o.configurado || o.incluir).length} ativa(s) | {totalOrigensExcluidas} excluida(s)
                </span>
                <span className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
                  Afeta: <strong>Exposicao de Caixa</strong> (Tabela e Grafico) e <strong>Contas Pagas</strong>
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Quando nenhuma origem estiver configurada, <strong>todas</strong> sao incluidas. Ao desativar ao menos uma, somente as ativas serao consideradas.
              </p>
            </div>

            {/* Cabecalho das colunas */}
            <div className="flex items-center px-6 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span className="w-16">Sigla</span>
              <span className="flex-1">Descricao</span>
              <div className="flex items-center gap-6">
                {PAGINAS_DISPONIVEIS.map(p => (
                  <span key={p.key} className="w-36 text-center">{p.label}</span>
                ))}
                <span className="w-20 text-center">Incluir</span>
              </div>
            </div>

            {origensFiltradas.map(origem => (
              <div
                key={origem.id}
                className={`flex items-center px-6 py-3 hover:bg-gray-50 transition-colors ${
                  origem.configurado && !origem.incluir ? 'bg-red-50' : ''
                }`}
              >
                <span className="w-16 font-mono text-sm font-bold text-blue-700">{origem.sigla}</span>
                <span className={`flex-1 text-sm ${origem.configurado && !origem.incluir ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {origem.descricao}
                </span>
                <div className="flex items-center gap-6">
                  {PAGINAS_DISPONIVEIS.map(p => {
                    const paginasArr = origem.paginas ? origem.paginas.split(',').map(s => s.trim()) : [];
                    const ativa = paginasArr.includes(p.key);
                    const loadKey = `origem-pag-${origem.id}-${p.key}`;
                    return (
                      <div key={p.key} className="w-36 flex justify-center">
                        <button
                          type="button"
                          onClick={() => togglePaginaOrigem(origem, p.key, !ativa)}
                          disabled={salvando === loadKey || !origem.incluir}
                          title={ativa ? `Remover efeito em ${p.label}` : `Aplicar em ${p.label}`}
                        >
                          <div className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                            !origem.incluir ? 'opacity-30 cursor-not-allowed' :
                            ativa ? 'bg-indigo-500' : 'bg-gray-300'
                          } ${salvando === loadKey ? 'opacity-50' : ''}`}>
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${ativa ? 'translate-x-4' : 'translate-x-0'}`} />
                          </div>
                        </button>
                      </div>
                    );
                  })}
                  <div className="w-20 flex justify-center">
                    <button
                      type="button"
                      onClick={() => toggleOrigemExposicao(origem, !origem.incluir)}
                      disabled={salvando === `origem-${origem.id}`}
                    >
                      {renderToggle(origem.incluir, salvando === `origem-${origem.id}`)}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {origensFiltradas.length === 0 && (
              <div className="px-6 py-8 text-center text-gray-500">
                Nenhuma origem encontrada
              </div>
            )}
          </div>
        )}

        {abaAtiva === 'tipos_baixa' && (
          <div className="divide-y divide-gray-200">
            <div className="bg-blue-50 px-6 py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-medium text-gray-700">
                  {tiposBaixaConfig.length} tipo(s) | {tiposBaixaConfig.filter(t => !t.configurado || t.incluir).length} ativo(s) | {totalTiposBaixaExcluidos} excluido(s)
                </span>
                <span className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
                  Afeta: <strong>Exposicao de Caixa</strong> (coluna Pago)
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Quando nenhum tipo estiver configurado, <strong>todos</strong> sao incluidos. Flag: <span className="font-mono">P</span>=Pagamento <span className="font-mono">R</span>=Recebimento <span className="font-mono">A</span>=Ajuste <span className="font-mono">S</span>=Sistema.
              </p>
            </div>

            {/* Cabecalho */}
            <div className="flex items-center px-6 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span className="w-10">Flag</span>
              <span className="flex-1">Nome</span>
              <div className="flex items-center gap-6">
                {PAGINAS_DISPONIVEIS.map(p => (
                  <span key={p.key} className="w-36 text-center">{p.label}</span>
                ))}
                <span className="w-20 text-center">Incluir</span>
              </div>
            </div>

            {tiposBaixaFiltrados.map(tipo => {
              const flagColors: Record<string, string> = {
                P: 'bg-red-100 text-red-700',
                R: 'bg-green-100 text-green-700',
                A: 'bg-yellow-100 text-yellow-700',
                S: 'bg-blue-100 text-blue-700',
              };
              const flagClass = flagColors[tipo.flag] || 'bg-gray-100 text-gray-600';
              return (
                <div
                  key={tipo.id}
                  className={`flex items-center px-6 py-3 hover:bg-gray-50 transition-colors ${
                    tipo.configurado && !tipo.incluir ? 'bg-red-50' : ''
                  }`}
                >
                  <span className={`w-10 inline-flex items-center justify-center rounded text-xs font-bold px-1 py-0.5 mr-1 ${flagClass}`}>
                    {tipo.flag || '?'}
                  </span>
                  <span className={`flex-1 text-sm ${tipo.configurado && !tipo.incluir ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {tipo.nome}
                  </span>
                  <div className="flex items-center gap-6">
                    {PAGINAS_DISPONIVEIS.map(p => {
                      const paginasArr = tipo.paginas ? tipo.paginas.split(',').map(s => s.trim()) : [];
                      const ativa = paginasArr.includes(p.key);
                      const loadKey = `tipobaixa-pag-${tipo.id}-${p.key}`;
                      return (
                        <div key={p.key} className="w-36 flex justify-center">
                          <button
                            type="button"
                            onClick={() => togglePaginaTipoBaixa(tipo, p.key, !ativa)}
                            disabled={salvando === loadKey || !tipo.incluir}
                            title={ativa ? `Remover efeito em ${p.label}` : `Aplicar em ${p.label}`}
                          >
                            <div className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                              !tipo.incluir ? 'opacity-30 cursor-not-allowed' :
                              ativa ? 'bg-indigo-500' : 'bg-gray-300'
                            } ${salvando === loadKey ? 'opacity-50' : ''}`}>
                              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${ativa ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                          </button>
                        </div>
                      );
                    })}
                    <div className="w-20 flex justify-center">
                      <button
                        type="button"
                        onClick={() => toggleTipoBaixaExposicao(tipo, !tipo.incluir)}
                        disabled={salvando === `tipobaixa-${tipo.id}`}
                      >
                        {renderToggle(tipo.incluir, salvando === `tipobaixa-${tipo.id}`)}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {tiposBaixaFiltrados.length === 0 && (
              <div className="px-6 py-8 text-center text-gray-500">
                Nenhum tipo de baixa encontrado
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
                            const raw = s.created_at.endsWith('Z') ? s.created_at : s.created_at + 'Z';
                            const d = new Date(raw);
                            criado = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
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
        {abaAtiva === 'diagnostico' && (
          <div>
            <div className="bg-purple-50 px-6 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {empresasCentros.length} empresa(s) cadastrada(s) com seus centros de custo
                </span>
                <button
                  type="button"
                  onClick={carregarDiagnostico}
                  disabled={loadingDiagnostico}
                  className="rounded-lg bg-purple-600 px-3 py-1 text-xs text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {loadingDiagnostico ? 'Carregando...' : 'Atualizar'}
                </button>
              </div>
            </div>
            {loadingDiagnostico ? (
              <div className="px-6 py-8 text-center text-gray-500">Carregando...</div>
            ) : empresasCentros.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">Nenhuma empresa encontrada</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {empresasCentros
                  .filter(e => !busca || e.nome.toLowerCase().includes(busca.toLowerCase()) ||
                    e.centros.some(c => c.nome.toLowerCase().includes(busca.toLowerCase())))
                  .map(empresa => (
                  <div key={empresa.id} className="px-6 py-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                        ID {empresa.id}
                      </span>
                      <span className="font-semibold text-gray-900">{empresa.nome}</span>
                      <span className="text-xs text-gray-400">{empresa.centros.length} centro(s)</span>
                    </div>
                    <div className="ml-4 flex flex-wrap gap-2">
                      {empresa.centros.map(cc => (
                        <span
                          key={cc.id}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
                        >
                          <span className="font-mono text-gray-400">{cc.id}</span>
                          {cc.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {abaAtiva === 'feriados' && (
          <div>
            <div className="bg-blue-50 px-6 py-4 border-b border-gray-200">
              <p className="text-sm text-gray-600 mb-3">
                Cadastre feriados nacionais, estaduais e municipais. No dia seguinte a um feriado, contas com vencimento no feriado aparecem como "Vence Hoje" nas telas de Contas a Pagar.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="date"
                  value={novoFeriadoData}
                  onChange={(e) => setNovoFeriadoData(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={novoFeriadoDescricao}
                  onChange={(e) => setNovoFeriadoDescricao(e.target.value)}
                  placeholder="Ex: Tiradentes, Aniversário de Porto Velho..."
                  className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  onKeyDown={(e) => { if (e.key === 'Enter') adicionarFeriado(); }}
                />
                <button
                  type="button"
                  onClick={adicionarFeriado}
                  disabled={feriadosSalvando}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {feriadosSalvando ? 'Salvando...' : '+ Adicionar'}
                </button>
                {feriadosMsg && (
                  <span className={`text-sm ${feriadosMsg.includes('Erro') ? 'text-red-600' : 'text-green-600'}`}>
                    {feriadosMsg}
                  </span>
                )}
              </div>
            </div>
            {feriadosList.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">Nenhum feriado cadastrado</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {feriadosList
                  .filter(f => !busca || f.descricao.toLowerCase().includes(busca.toLowerCase()) || f.data.includes(busca))
                  .sort((a, b) => a.data.localeCompare(b.data))
                  .map(f => {
                    const [ano, mes, dia] = f.data.split('T')[0].split('-');
                    const dataFormatada = `${dia}/${mes}/${ano}`;
                    const d = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
                    const diaSemana = d.toLocaleDateString('pt-BR', { weekday: 'long' });
                    return (
                      <div key={f.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-mono font-medium text-gray-700 w-24">{dataFormatada}</span>
                          <span className="text-xs text-gray-400 w-24 capitalize">{diaSemana}</span>
                          <span className="text-sm text-gray-900">{f.descricao}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removerFeriado(f.id)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                          title="Remover feriado"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {abaAtiva === 'orcamentos' && (
          <div>
            {/* CUB/RO info bar */}
            <div className="bg-blue-50 px-6 py-3 border-b border-gray-200">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium text-gray-700">CUB/RO (R$/m²):</span>
                <input
                  type="number"
                  step="0.01"
                  value={cubValor}
                  onChange={(e) => setCubValor(parseFloat(e.target.value) || 0)}
                  className="w-32 text-sm font-semibold border border-blue-200 rounded px-2 py-1 focus:border-blue-500 focus:outline-none"
                />
                <span className="text-sm text-gray-500">Referência:</span>
                <input
                  type="text"
                  value={cubReferencia}
                  onChange={(e) => setCubReferencia(e.target.value)}
                  className="w-28 text-sm border border-blue-200 rounded px-2 py-1 focus:border-blue-500 focus:outline-none"
                  placeholder="Mês/Ano"
                />
                <span className="text-xs text-gray-400">Fonte: SINDUSCON-RO | Fórmula: M² × Fator × CUB</span>
              </div>
            </div>

            <div className="bg-green-50 px-6 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">
                    {empreendimentosConfig.length} empreendimento(s)
                  </span>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    {empreendimentosConfig.filter(e => e.status === 'ativa').length} ativa(s)
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {empreendimentosConfig.filter(e => e.status === 'finalizada').length} finalizada(s)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {orcamentosMsg && (
                    <span className={`text-sm ${orcamentosMsg.includes('Erro') ? 'text-red-600' : 'text-green-600'}`}>
                      {orcamentosMsg}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={adicionarEmpreendimento}
                    className="rounded-lg bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
                  >
                    + Adicionar
                  </button>
                  <button
                    type="button"
                    onClick={salvarTodosOrcamentos}
                    disabled={salvandoOrcamentos}
                    className="rounded-lg bg-blue-600 px-4 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {salvandoOrcamentos ? 'Salvando...' : 'Salvar Tudo'}
                  </button>
                </div>
              </div>
            </div>

            {loadingOrcamentos ? (
              <div className="px-6 py-8 text-center text-gray-500">Carregando...</div>
            ) : empreendimentosConfig.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">Nenhum empreendimento configurado</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 table-fixed">
                  <colgroup>
                    <col className="w-14" />
                    <col />
                    <col className="w-24" />
                    <col className="w-24" />
                    <col className="w-32" />
                    <col className="w-20" />
                    <col className="w-40" />
                    <col className="w-12" />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cod</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empreendimento</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">CC</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">M²</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Fator</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Orçamento (R$)</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {empreendimentosConfig
                      .filter(e => !busca || e.nome.toLowerCase().includes(busca.toLowerCase()) || e.codigo.toLowerCase().includes(busca.toLowerCase()))
                      .map(emp => (
                      <tr key={emp.id} className={`hover:bg-gray-50 ${emp.status === 'finalizada' ? 'bg-gray-50' : ''}`}>
                        <td className="px-3 py-3 text-sm text-gray-500 font-mono">{emp.id}</td>
                        <td className="px-3 py-3">
                          <input
                            type="text"
                            value={emp.nome}
                            onChange={(e) => updateEmpreendimentoField(emp.id, 'nome', e.target.value)}
                            className={`w-full text-sm border-0 bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 ${emp.status === 'finalizada' ? 'text-gray-400' : 'text-gray-900'}`}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            value={emp.centro_custo_id ?? ''}
                            onChange={(e) => updateEmpreendimentoField(emp.id, 'centro_custo_id', e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full text-sm text-center border border-gray-200 rounded px-2 py-1 focus:border-blue-500 focus:outline-none"
                            placeholder="CC"
                          />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleStatusEmpreendimento(emp.id)}
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer ${
                              emp.status === 'ativa'
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {emp.status === 'ativa' ? 'Ativa' : 'Finalizada'}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={emp.metragem}
                            onChange={(e) => updateEmpreendimentoField(emp.id, 'metragem', parseFloat(e.target.value) || 0)}
                            className="w-full text-sm text-right border border-gray-200 rounded px-2 py-1 focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={emp.fator}
                            onChange={(e) => updateEmpreendimentoField(emp.id, 'fator', parseFloat(e.target.value) || 0)}
                            className="w-full text-sm text-right border border-gray-200 rounded px-2 py-1 focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-3 text-right text-sm font-medium text-gray-700 whitespace-nowrap">
                          {((emp.metragem || 0) * (emp.fator || 1) * cubValor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => removerEmpreendimento(emp.id)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                            title="Remover empreendimento"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
