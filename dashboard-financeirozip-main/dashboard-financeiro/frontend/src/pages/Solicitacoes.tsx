import React, { useEffect, useState } from 'react';
import { apiService, authService } from '../services/api';

interface Solicitacao {
  id: number;
  titulo: string;
  descricao: string;
  secao: string;
  prioridade: string;
  status: string;
  usuario_nome: string;
  usuario_email: string;
  resposta_dev: string | null;
  versao_implementada: string | null;
  created_at: string;
  updated_at: string | null;
}

const SECOES = ['Contas a Pagar', 'Contas Pagas', 'Contas Atrasadas', 'Contas a Receber', 'Contas Recebidas', 'Inadimplencia', 'Dashboard', 'KPIs', 'Exposicao de Caixa', 'Geral'];
const PRIORIDADES = [
  { value: 'baixa', label: 'Baixa', cor: 'bg-gray-100 text-gray-700' },
  { value: 'media', label: 'Media', cor: 'bg-blue-100 text-blue-700' },
  { value: 'alta', label: 'Alta', cor: 'bg-orange-100 text-orange-700' },
  { value: 'urgente', label: 'Urgente', cor: 'bg-red-100 text-red-700' },
];
const STATUS_MAP: Record<string, { label: string; cor: string }> = {
  pendente: { label: 'Pendente', cor: 'bg-yellow-100 text-yellow-800' },
  em_analise: { label: 'Em Analise', cor: 'bg-blue-100 text-blue-800' },
  em_desenvolvimento: { label: 'Em Desenvolvimento', cor: 'bg-purple-100 text-purple-800' },
  implementado: { label: 'Implementado', cor: 'bg-green-100 text-green-800' },
  rejeitado: { label: 'Rejeitado', cor: 'bg-red-100 text-red-800' },
};

export const Solicitacoes: React.FC = () => {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [secao, setSecao] = useState('Geral');
  const [prioridade, setPrioridade] = useState('media');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editResposta, setEditResposta] = useState('');
  const [editVersao, setEditVersao] = useState('');

  const user = authService.getStoredUser();
  const isAdmin = user?.permissao === 'admin';

  const carregarDados = async () => {
    try {
      setLoading(true);
      const data = await apiService.getSolicitacoes();
      setSolicitacoes(data);
    } catch {
      console.error('Erro ao carregar solicitacoes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregarDados(); }, []);

  const enviar = async () => {
    if (!titulo.trim() || !descricao.trim()) {
      setMsg({ tipo: 'erro', texto: 'Preencha titulo e descricao.' });
      return;
    }
    setEnviando(true);
    try {
      await apiService.criarSolicitacao({
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        secao,
        prioridade,
        usuario_nome: user?.nome || '',
        usuario_email: user?.email || '',
      });
      setTitulo(''); setDescricao(''); setSecao('Geral'); setPrioridade('media');
      setMostrarForm(false);
      setMsg({ tipo: 'ok', texto: 'Solicitacao enviada com sucesso!' });
      carregarDados();
      setTimeout(() => setMsg(null), 3000);
    } catch {
      setMsg({ tipo: 'erro', texto: 'Erro ao enviar solicitacao.' });
    } finally {
      setEnviando(false);
    }
  };

  const salvarEdicao = async (id: number) => {
    try {
      const data: Record<string, string> = { status: editStatus };
      if (editResposta) data.resposta_dev = editResposta;
      if (editVersao) data.versao_implementada = editVersao;
      await apiService.atualizarSolicitacao(id, data);
      setEditandoId(null);
      carregarDados();
    } catch {
      setMsg({ tipo: 'erro', texto: 'Erro ao atualizar.' });
    }
  };

  const deletar = async (id: number) => {
    if (!confirm('Remover esta solicitacao?')) return;
    try {
      await apiService.deletarSolicitacao(id);
      carregarDados();
    } catch {
      setMsg({ tipo: 'erro', texto: 'Erro ao remover.' });
    }
  };

  const solicitacoesFiltradas = filtroStatus === 'todos'
    ? solicitacoes
    : solicitacoes.filter(s => s.status === filtroStatus);

  const contadores = {
    total: solicitacoes.length,
    pendente: solicitacoes.filter(s => s.status === 'pendente').length,
    em_desenvolvimento: solicitacoes.filter(s => s.status === 'em_desenvolvimento' || s.status === 'em_analise').length,
    implementado: solicitacoes.filter(s => s.status === 'implementado').length,
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Cards resumo */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow border-l-4 border-blue-500">
          <p className="text-xs font-medium text-gray-500 uppercase">Total</p>
          <p className="text-2xl font-bold text-gray-900">{contadores.total}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow border-l-4 border-yellow-500">
          <p className="text-xs font-medium text-gray-500 uppercase">Pendentes</p>
          <p className="text-2xl font-bold text-yellow-600">{contadores.pendente}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow border-l-4 border-purple-500">
          <p className="text-xs font-medium text-gray-500 uppercase">Em Andamento</p>
          <p className="text-2xl font-bold text-purple-600">{contadores.em_desenvolvimento}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow border-l-4 border-green-500">
          <p className="text-xs font-medium text-gray-500 uppercase">Implementados</p>
          <p className="text-2xl font-bold text-green-600">{contadores.implementado}</p>
        </div>
      </div>

      {/* Header + Filtros */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {['todos', 'pendente', 'em_analise', 'em_desenvolvimento', 'implementado', 'rejeitado'].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setFiltroStatus(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filtroStatus === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 'todos' ? 'Todos' : STATUS_MAP[s]?.label || s}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setMostrarForm(!mostrarForm)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nova Solicitacao
        </button>
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${msg.tipo === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.texto}
        </div>
      )}

      {/* Formulário */}
      {mostrarForm && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Nova Solicitacao de Melhoria</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Titulo</label>
              <input
                type="text"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Ex: Adicionar filtro de data no relatorio..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Descricao</label>
              <textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Descreva o que voce gostaria que fosse melhorado ou adicionado..."
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Secao</label>
              <select value={secao} onChange={e => setSecao(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {SECOES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Prioridade</label>
              <select value={prioridade} onChange={e => setPrioridade(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {PRIORIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={enviar} disabled={enviando} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {enviando ? 'Enviando...' : 'Enviar Solicitacao'}
            </button>
            <button type="button" onClick={() => setMostrarForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {solicitacoesFiltradas.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow">
          <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="mt-3 text-gray-500">Nenhuma solicitacao encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {solicitacoesFiltradas.map(s => {
            const statusInfo = STATUS_MAP[s.status] || { label: s.status, cor: 'bg-gray-100 text-gray-700' };
            const prioInfo = PRIORIDADES.find(p => p.value === s.prioridade) || PRIORIDADES[1];
            const editando = editandoId === s.id;

            return (
              <div key={s.id} className="rounded-xl bg-white p-5 shadow hover:shadow-md transition-shadow border border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="text-sm font-bold text-gray-900">{s.titulo}</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusInfo.cor}`}>{statusInfo.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${prioInfo.cor}`}>{prioInfo.label}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{s.secao}</span>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{s.descricao}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                      <span>{s.usuario_nome}</span>
                      <span>{s.created_at ? new Date(s.created_at).toLocaleDateString('pt-BR') : ''}</span>
                      {s.versao_implementada && (
                        <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700 font-medium">v{s.versao_implementada}</span>
                      )}
                    </div>
                    {s.resposta_dev && (
                      <div className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 border border-blue-100">
                        <span className="font-semibold">Resposta:</span> {s.resposta_dev}
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button type="button" onClick={() => { setEditandoId(editando ? null : s.id); setEditStatus(s.status); setEditResposta(s.resposta_dev || ''); setEditVersao(s.versao_implementada || ''); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600" title="Editar">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button type="button" onClick={() => deletar(s.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Admin edit panel */}
                {editando && isAdmin && (
                  <div className="mt-3 rounded-lg bg-gray-50 p-4 border border-gray-200">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
                        <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Versao Implementada</label>
                        <input type="text" value={editVersao} onChange={e => setEditVersao(e.target.value)} placeholder="Ex: 1.4.0" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                      </div>
                      <div className="flex items-end">
                        <button type="button" onClick={() => salvarEdicao(s.id)} className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Salvar</button>
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="mb-1 block text-xs font-medium text-gray-600">Resposta ao usuario</label>
                      <textarea value={editResposta} onChange={e => setEditResposta(e.target.value)} rows={2} placeholder="Opcional: responder ao usuario sobre esta solicitacao..." className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
