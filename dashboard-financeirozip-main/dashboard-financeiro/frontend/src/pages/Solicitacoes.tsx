import React, { useEffect, useState, useRef } from 'react';
import { apiService, authService } from '../services/api';

const comprimirImagem = (dataUrl: string, maxWidth = 800, quality = 0.6): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
};

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
  imagem: string | null;
  created_at: string;
  updated_at: string | null;
  aprovado_em?: string | null;
  aprovado_por?: string | null;
  comentario_validacao?: string | null;
}

const STATUS_FINAIS = ['implementado', 'rejeitado'];

// Banco PostgreSQL retorna timestamps em UTC sem o sufixo "Z".
// Sem o "Z", o JavaScript interpreta como horario local e o relogio fica 3h adiantado.
// Esta funcao garante que a string seja parseada como UTC.
function parseDataUTC(d: string | null | undefined): Date | null {
  if (!d) return null;
  const s = d.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(d) ? d : d + 'Z';
  return new Date(s);
}

function formatarDataHoraBR(d: string | null | undefined): string {
  const dt = parseDataUTC(d);
  if (!dt) return '';
  return dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatarDataBR(d: string | null | undefined): string {
  const dt = parseDataUTC(d);
  if (!dt) return '';
  return dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function calcularTempo(s: Solicitacao) {
  const criado = parseDataUTC(s.created_at);
  if (!criado) return { diasDesdeC: 0, diasParaConcluir: null as number | null, concluido: false };
  const agora = new Date();
  const diasDesdeC = Math.max(0, Math.floor((agora.getTime() - criado.getTime()) / 86400000));
  const concluido = STATUS_FINAIS.includes(s.status);
  let diasParaConcluir: number | null = null;
  if (concluido && s.updated_at) {
    const fim = parseDataUTC(s.updated_at);
    if (fim) {
      diasParaConcluir = Math.max(0, Math.floor((fim.getTime() - criado.getTime()) / 86400000));
    }
  }
  return { diasDesdeC, diasParaConcluir, concluido };
}

function formatarDias(d: number): string {
  if (d === 0) return 'hoje';
  if (d === 1) return '1 dia';
  return `${d} dias`;
}

const SECOES = ['Painel Executivo', 'Contas a Pagar', 'Contas Pagas', 'Contas Atrasadas', 'Contas a Receber', 'Contas Recebidas', 'Inadimplencia', 'Dashboard', 'KPIs', 'Centros de Custo', 'Exposicao de Caixa', 'Extrato Cliente', 'Geral'];
const PRIORIDADES = [
  { value: 'baixa', label: 'Baixa', cor: 'bg-gray-100 text-gray-700 dark:text-slate-300', borda: 'border-l-gray-400' },
  { value: 'media', label: 'Media', cor: 'bg-blue-100 text-blue-700', borda: 'border-l-blue-400' },
  { value: 'alta', label: 'Alta', cor: 'bg-orange-100 text-orange-700', borda: 'border-l-orange-400' },
  { value: 'urgente', label: 'Urgente', cor: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400', borda: 'border-l-red-500' },
];

const KANBAN_COLUNAS = [
  { status: 'pendente', label: 'Pendente', cor: 'border-t-yellow-400', bgHeader: 'bg-yellow-50', textCor: 'text-yellow-700', dot: 'bg-yellow-400' },
  { status: 'em_analise', label: 'Em Analise', cor: 'border-t-blue-400', bgHeader: 'bg-blue-50', textCor: 'text-blue-700', dot: 'bg-blue-400' },
  { status: 'em_desenvolvimento', label: 'Em Desenvolvimento', cor: 'border-t-purple-400', bgHeader: 'bg-purple-50', textCor: 'text-purple-700', dot: 'bg-purple-400' },
  { status: 'aguardando_validacao', label: 'Aguardando Validacao', cor: 'border-t-amber-400', bgHeader: 'bg-amber-50', textCor: 'text-amber-700', dot: 'bg-amber-400' },
  { status: 'implementado', label: 'Implementado', cor: 'border-t-green-400', bgHeader: 'bg-green-50', textCor: 'text-green-700', dot: 'bg-green-400' },
  { status: 'rejeitado', label: 'Rejeitado', cor: 'border-t-red-400', bgHeader: 'bg-red-50 dark:bg-red-900/20', textCor: 'text-red-700 dark:text-red-400', dot: 'bg-red-400' },
];

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
  const [imagem, setImagem] = useState<string | null>(null);
  const [imagemExpandida, setImagemExpandida] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [detalheAberto, setDetalheAberto] = useState<Solicitacao | null>(null);
  const [editResposta, setEditResposta] = useState('');
  const [editVersao, setEditVersao] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');

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
        imagem,
      });
      setTitulo(''); setDescricao(''); setSecao('Geral'); setPrioridade('media'); setImagem(null);
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

  const moverParaStatus = async (id: number, novoStatus: string) => {
    try {
      await apiService.atualizarSolicitacao(id, { status: novoStatus });
      setSolicitacoes(prev => prev.map(s => s.id === id ? { ...s, status: novoStatus } : s));
    } catch {
      setMsg({ tipo: 'erro', texto: 'Erro ao mover.' });
    }
  };

  const salvarEdicao = async (id: number) => {
    try {
      const data: Record<string, string> = {};
      if (editResposta) data.resposta_dev = editResposta;
      if (editVersao) data.versao_implementada = editVersao;
      if (Object.keys(data).length > 0) {
        await apiService.atualizarSolicitacao(id, data);
        carregarDados();
      }
      setEditandoId(null);
    } catch {
      setMsg({ tipo: 'erro', texto: 'Erro ao atualizar.' });
    }
  };

  const validar = async (id: number, aprovado: boolean) => {
    const acao = aprovado ? 'aprovar (entrega aceita)' : 'reabrir (entrega nao atende)';
    let comentario: string | undefined = undefined;
    if (!aprovado) {
      const c = prompt('Por que esta reabrindo? (opcional)') || '';
      comentario = c.trim() || undefined;
    } else if (!confirm(`Confirma ${acao}?`)) {
      return;
    }
    try {
      await apiService.validarSolicitacao(id, {
        aprovado,
        aprovado_por: user?.nome || user?.email || '',
        comentario,
      });
      setMsg({ tipo: 'ok', texto: aprovado ? 'Entrega aprovada!' : 'Solicitacao reaberta.' });
      setTimeout(() => setMsg(null), 3000);
      carregarDados();
      if (detalheAberto?.id === id) setDetalheAberto(null);
    } catch {
      setMsg({ tipo: 'erro', texto: 'Erro ao validar.' });
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

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, id: number) => {
    if (!isAdmin) return;
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    (e.target as HTMLElement).style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDragId(null);
    setDragOverCol(null);
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(status);
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = (e: React.DragEvent, novoStatus: string) => {
    e.preventDefault();
    setDragOverCol(null);
    if (dragId !== null) {
      const sol = solicitacoes.find(s => s.id === dragId);
      if (sol && sol.status !== novoStatus) {
        moverParaStatus(dragId, novoStatus);
      }
    }
    setDragId(null);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-slate-400">Carregando...</p>
        </div>
      </div>
    );
  }

  // Lista unica de usuarios para o dropdown
  const usuariosUnicos = Array.from(
    new Set(solicitacoes.map(s => s.usuario_nome).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // Filtros combinados: busca de texto + filtro de usuario
  const buscaNorm = busca.trim().toLowerCase();
  const solicitacoesFiltradas = solicitacoes.filter(s => {
    if (filtroUsuario && s.usuario_nome !== filtroUsuario) return false;
    if (buscaNorm) {
      const campos = [
        s.titulo,
        s.descricao,
        s.usuario_nome,
        s.usuario_email,
        s.secao,
        s.resposta_dev,
        s.versao_implementada,
      ];
      if (!campos.some(c => (c || '').toLowerCase().includes(buscaNorm))) return false;
    }
    return true;
  });

  const contadores = {
    total: solicitacoes.length,
    pendente: solicitacoes.filter(s => s.status === 'pendente').length,
    em_andamento: solicitacoes.filter(s => s.status === 'em_desenvolvimento' || s.status === 'em_analise').length,
    aguardando_validacao: solicitacoes.filter(s => s.status === 'aguardando_validacao').length,
    implementado: solicitacoes.filter(s => s.status === 'implementado').length,
  };

  return (
    <div>
      {/* Cards resumo */}
      <div className="mb-5 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl bg-white dark:bg-slate-800 p-3 shadow-sm border-l-4 border-blue-500">
          <p className="text-[10px] font-medium text-gray-500 dark:text-slate-400 uppercase">Total</p>
          <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{contadores.total}</p>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-800 p-3 shadow-sm border-l-4 border-yellow-500">
          <p className="text-[10px] font-medium text-gray-500 dark:text-slate-400 uppercase">Pendentes</p>
          <p className="text-xl font-bold text-yellow-600">{contadores.pendente}</p>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-800 p-3 shadow-sm border-l-4 border-purple-500">
          <p className="text-[10px] font-medium text-gray-500 dark:text-slate-400 uppercase">Em Andamento</p>
          <p className="text-xl font-bold text-purple-600">{contadores.em_andamento}</p>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-800 p-3 shadow-sm border-l-4 border-amber-500">
          <p className="text-[10px] font-medium text-gray-500 dark:text-slate-400 uppercase">Aguardando Voce</p>
          <p className="text-xl font-bold text-amber-600">{contadores.aguardando_validacao}</p>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-800 p-3 shadow-sm border-l-4 border-green-500">
          <p className="text-[10px] font-medium text-gray-500 dark:text-slate-400 uppercase">Implementados</p>
          <p className="text-xl font-bold text-green-600">{contadores.implementado}</p>
        </div>
      </div>

      {/* Busca + Filtro Usuario + Botão Nova Solicitação */}
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-1">
          {/* Busca */}
          <div className="relative w-full sm:max-w-sm">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por titulo, descricao, secao..."
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 pl-9 pr-9 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200"
                title="Limpar busca"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Dropdown filtro usuario */}
          <div className="relative w-full sm:w-56">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <select
              value={filtroUsuario}
              onChange={e => setFiltroUsuario(e.target.value)}
              className="w-full appearance-none rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 pl-9 pr-8 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Todos os usuarios</option>
              {usuariosUnicos.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>

          {/* Contador / chip de filtro ativo */}
          {(buscaNorm || filtroUsuario) && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
              <span>
                {solicitacoesFiltradas.length} de {solicitacoes.length}
              </span>
              {filtroUsuario && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  {filtroUsuario}
                  <button type="button" onClick={() => setFiltroUsuario('')} className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 p-0.5" title="Remover filtro">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </span>
              )}
              {(buscaNorm || filtroUsuario) && (
                <button
                  type="button"
                  onClick={() => { setBusca(''); setFiltroUsuario(''); }}
                  className="rounded text-blue-600 dark:text-blue-400 hover:underline"
                >
                  limpar tudo
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMostrarForm(!mostrarForm)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm self-end lg:self-auto"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nova Solicitacao
        </button>
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${msg.tipo === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200'}`}>
          {msg.texto}
        </div>
      )}

      {/* Formulário */}
      {mostrarForm && (
        <div className="mb-5 rounded-xl bg-white dark:bg-slate-800 p-5 shadow-lg border border-gray-100 dark:border-slate-700/50">
          <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mb-3">Nova Solicitacao de Melhoria</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">Titulo</label>
              <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Adicionar filtro de data no relatorio..." className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">Descricao</label>
              <textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descreva o que voce gostaria que fosse melhorado..." rows={3} className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">Secao</label>
              <select value={secao} onChange={e => setSecao(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {SECOES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">Prioridade</label>
              <select value={prioridade} onChange={e => setPrioridade(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {PRIORIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          {/* Área de imagem */}
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">Print da tela (opcional)</label>
            <div
              className={`relative rounded-lg border-2 border-dashed p-3 text-center transition-colors ${imagem ? 'border-blue-300 bg-blue-50' : 'border-gray-300 dark:border-slate-600 hover:border-blue-400'}`}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) { const reader = new FileReader(); reader.onload = async (ev) => { setImagem(await comprimirImagem(ev.target?.result as string)); }; reader.readAsDataURL(file); }
                    e.preventDefault(); break;
                  }
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file?.type.startsWith('image/')) { const reader = new FileReader(); reader.onload = async (ev) => { setImagem(await comprimirImagem(ev.target?.result as string)); }; reader.readAsDataURL(file); } }}
              tabIndex={0}
            >
              {imagem ? (
                <div className="relative inline-block">
                  <img src={imagem} alt="Print" className="max-h-36 rounded-lg shadow-sm mx-auto" />
                  <button type="button" onClick={() => setImagem(null)} className="absolute -top-2 -right-2 rounded-full bg-red-50 dark:bg-red-900/200 p-1 text-white shadow hover:bg-red-600">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <div className="py-2">
                  <p className="text-xs text-gray-500 dark:text-slate-400">Cole (<span className="font-semibold">Ctrl+V</span>), arraste ou <label className="cursor-pointer text-blue-600 hover:underline">selecione<input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = async (ev) => { setImagem(await comprimirImagem(ev.target?.result as string)); }; reader.readAsDataURL(file); } }} /></label> uma imagem</p>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={enviar} disabled={enviando} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {enviando ? 'Enviando...' : 'Enviar'}
            </button>
            <button type="button" onClick={() => { setMostrarForm(false); setImagem(null); }} className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:bg-slate-900">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-6 gap-3 pb-4" style={{ minHeight: '65vh' }}>
        {KANBAN_COLUNAS.map(col => {
          const prioOrdem: Record<string, number> = { urgente: 1, alta: 2, media: 3, baixa: 4 };
          const cards = solicitacoesFiltradas
            .filter(s => s.status === col.status)
            .sort((a, b) => (prioOrdem[a.prioridade] || 5) - (prioOrdem[b.prioridade] || 5));
          const isDragOver = dragOverCol === col.status;

          return (
            <div
              key={col.status}
              className={`rounded-xl bg-gray-50 dark:bg-slate-900 border-t-4 ${col.cor} transition-all ${isDragOver ? 'ring-2 ring-blue-400 bg-blue-50/50' : ''}`}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.status)}
            >
              {/* Header da coluna */}
              <div className={`px-4 py-3 ${col.bgHeader} rounded-t-lg`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${col.dot}`}></div>
                    <span className={`text-sm font-bold ${col.textCor}`}>{col.label}</span>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${col.bgHeader} ${col.textCor} border border-current/20`}>{cards.length}</span>
                </div>
              </div>

              {/* Cards */}
              <div className="p-3 space-y-3 min-h-[300px]">
                {cards.map(s => {
                  const prioInfo = PRIORIDADES.find(p => p.value === s.prioridade) || PRIORIDADES[1];
                  const editando = editandoId === s.id;

                  return (
                    <div
                      key={s.id}
                      draggable={isAdmin}
                      onDragStart={(e) => handleDragStart(e, s.id)}
                      onDragEnd={handleDragEnd}
                      className={`rounded-lg bg-white dark:bg-slate-800 p-4 shadow-sm border border-gray-100 dark:border-slate-700/50 border-l-4 ${prioInfo.borda} ${isAdmin ? 'cursor-grab active:cursor-grabbing' : ''} hover:shadow-md transition-shadow`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-slate-100 leading-tight flex-1 cursor-pointer hover:text-blue-600" onClick={() => setDetalheAberto(s)}>{s.titulo}</h4>
                        {isAdmin && (
                          <div className="flex gap-0.5 flex-shrink-0">
                            <button type="button" onClick={() => { setEditandoId(editando ? null : s.id); setEditResposta(s.resposta_dev || ''); setEditVersao(s.versao_implementada || ''); }} className="rounded p-0.5 text-gray-300 hover:text-blue-600" title="Editar">
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button type="button" onClick={() => deletar(s.id)} className="rounded p-0.5 text-gray-300 hover:text-red-600 dark:text-red-400" title="Remover">
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-400 line-clamp-3 cursor-pointer hover:text-gray-700 dark:text-slate-300" onClick={() => setDetalheAberto(s)}>{s.descricao}</p>

                      {s.imagem && (
                        <img
                          src={s.imagem}
                          alt="Print"
                          className="mt-2 max-h-20 rounded border border-gray-100 dark:border-slate-700/50 cursor-pointer hover:opacity-80"
                          onClick={() => setImagemExpandida(s.imagem)}
                        />
                      )}

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${prioInfo.cor}`}>{prioInfo.label}</span>
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:text-slate-400">{s.secao}</span>
                        {s.versao_implementada && (
                          <span className="rounded bg-green-50 px-1.5 py-0.5 text-[9px] text-green-700 font-medium">v{s.versao_implementada}</span>
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-gray-400">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFiltroUsuario(s.usuario_nome); }}
                          className="font-medium hover:text-blue-600 hover:underline cursor-pointer"
                          title={`Filtrar por ${s.usuario_nome}`}
                        >
                          {s.usuario_nome}
                        </button>
                        <span>&middot;</span>
                        <span>{formatarDataBR(s.created_at)}</span>
                      </div>

                      {(() => {
                        const t = calcularTempo(s);
                        if (t.concluido && t.diasParaConcluir !== null) {
                          return (
                            <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300" title={`Criada em ${formatarDataBR(s.created_at)} e concluida em ${formatarDataBR(s.updated_at)}`}>
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              Entregue em {formatarDias(t.diasParaConcluir)}
                            </div>
                          );
                        }
                        const cor = t.diasDesdeC <= 3 ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                 : t.diasDesdeC <= 10 ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                                 : t.diasDesdeC <= 30 ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                                 : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300';
                        return (
                          <div className={`mt-1.5 inline-flex items-center gap-1 rounded ${cor} px-1.5 py-0.5 text-[10px] font-semibold`} title="Dias desde a criacao da solicitacao">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {t.diasDesdeC === 0 ? 'Aberta hoje' : `${formatarDias(t.diasDesdeC)} em aberto`}
                          </div>
                        );
                      })()}

                      {s.resposta_dev && (
                        <div className="mt-1.5 rounded bg-blue-50 p-1.5 text-[10px] text-blue-700 border border-blue-100">
                          <span className="font-semibold">Dev:</span> {s.resposta_dev}
                        </div>
                      )}

                      {/* Botoes Aprovar / Reabrir - apenas para o autor da solicitacao quando aguardando validacao */}
                      {s.status === 'aguardando_validacao' && user?.email && s.usuario_email === user.email && (
                        <div className="mt-2 flex gap-1.5 border-t border-gray-100 dark:border-slate-700/50 pt-2">
                          <button
                            type="button"
                            onClick={() => validar(s.id, true)}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700"
                            title="Aprovar a entrega"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            Aprovar
                          </button>
                          <button
                            type="button"
                            onClick={() => validar(s.id, false)}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-red-50 dark:bg-red-900/30 px-2 py-1 text-[10px] font-semibold text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/40 hover:bg-red-100"
                            title="Reabrir solicitacao"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Reabrir
                          </button>
                        </div>
                      )}
                      {s.status === 'aguardando_validacao' && user?.email && s.usuario_email !== user.email && (
                        <div className="mt-2 rounded bg-amber-50 dark:bg-amber-900/20 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-800/40">
                          Aguardando validacao de <span className="font-semibold">{s.usuario_nome}</span>
                        </div>
                      )}
                      {s.status === 'implementado' && s.aprovado_por && (
                        <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          Aprovado por {s.aprovado_por}
                        </div>
                      )}

                      {/* Admin edit inline */}
                      {editando && isAdmin && (
                        <div className="mt-2 space-y-1.5 border-t border-gray-100 dark:border-slate-700/50 pt-2">
                          <input type="text" value={editVersao} onChange={e => setEditVersao(e.target.value)} placeholder="Versao (ex: 1.6.0)" className="w-full rounded border border-gray-200 dark:border-slate-700 px-2 py-1 text-[10px]" />
                          <textarea value={editResposta} onChange={e => setEditResposta(e.target.value)} rows={2} placeholder="Resposta..." className="w-full rounded border border-gray-200 dark:border-slate-700 px-2 py-1 text-[10px]" />
                          <button type="button" onClick={() => salvarEdicao(s.id)} className="rounded bg-blue-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-blue-700">Salvar</button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {cards.length === 0 && (
                  <div className={`rounded-lg border-2 border-dashed p-6 text-center ${isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 dark:border-slate-700'}`}>
                    <svg className="mx-auto h-8 w-8 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    <p className="text-xs text-gray-400">{isAdmin ? 'Arraste cards aqui' : 'Nenhuma solicitacao'}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal detalhe da solicitação */}
      {detalheAberto && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDetalheAberto(null)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-800 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white relative">
              <button type="button" onClick={() => setDetalheAberto(null)} className="absolute right-4 top-4 rounded-full p-1 text-white/70 hover:bg-white dark:bg-slate-800/20 hover:text-white">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <h2 className="text-lg font-bold pr-8">{detalheAberto.titulo}</h2>
              <div className="mt-1 flex items-center gap-2 text-sm text-blue-100">
                <span>{detalheAberto.usuario_nome}</span>
                <span>&middot;</span>
                <span>{formatarDataBR(detalheAberto.created_at)}</span>
                <span>&middot;</span>
                <span>{detalheAberto.secao}</span>
              </div>
            </div>
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              <div className="flex gap-2 mb-4">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${(PRIORIDADES.find(p => p.value === detalheAberto.prioridade) || PRIORIDADES[1]).cor}`}>
                  {(PRIORIDADES.find(p => p.value === detalheAberto.prioridade) || PRIORIDADES[1]).label}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${(KANBAN_COLUNAS.find(c => c.status === detalheAberto.status) ? `${KANBAN_COLUNAS.find(c => c.status === detalheAberto.status)!.bgHeader} ${KANBAN_COLUNAS.find(c => c.status === detalheAberto.status)!.textCor}` : 'bg-gray-100 text-gray-700 dark:text-slate-300')}`}>
                  {KANBAN_COLUNAS.find(c => c.status === detalheAberto.status)?.label || detalheAberto.status}
                </span>
              </div>
              <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">Descricao completa</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">{detalheAberto.descricao}</p>
              {detalheAberto.imagem && (
                <div className="mt-4">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">Print anexado</h3>
                  <img src={detalheAberto.imagem} alt="Print" className="max-h-64 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm cursor-pointer hover:opacity-90" onClick={() => { setImagemExpandida(detalheAberto.imagem); setDetalheAberto(null); }} />
                </div>
              )}
              {detalheAberto.resposta_dev && (
                <div className="mt-4">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">Resposta do desenvolvedor</h3>
                  <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 border border-blue-100">{detalheAberto.resposta_dev}</div>
                </div>
              )}
              {detalheAberto.versao_implementada && (
                <div className="mt-3">
                  <span className="rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">Implementado na v{detalheAberto.versao_implementada}</span>
                </div>
              )}

              <div className="mt-5 border-t border-gray-100 dark:border-slate-700/50 pt-4">
                <h3 className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-3">Tempo da Solicitacao</h3>
                {(() => {
                  const t = calcularTempo(detalheAberto);
                  return (
                    <div className="space-y-2.5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex-shrink-0">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-gray-700 dark:text-slate-300">Criada</p>
                          <p className="text-[11px] text-gray-500 dark:text-slate-400">
                            {formatarDataHoraBR(detalheAberto.created_at)}
                          </p>
                        </div>
                      </div>

                      {detalheAberto.status === 'aguardando_validacao' && (
                        <div className="flex items-start gap-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex-shrink-0">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-gray-700 dark:text-slate-300">Aguardando sua validacao</p>
                            <p className="text-[11px] text-gray-500 dark:text-slate-400">
                              Implementado em {formatarDataHoraBR(detalheAberto.updated_at)}
                            </p>
                          </div>
                        </div>
                      )}

                      {detalheAberto.status === 'implementado' && detalheAberto.aprovado_em ? (
                        <>
                          <div className="flex items-start gap-3">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex-shrink-0">
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-gray-700 dark:text-slate-300">
                                Aprovado{detalheAberto.aprovado_por ? ` por ${detalheAberto.aprovado_por}` : ''}
                              </p>
                              <p className="text-[11px] text-gray-500 dark:text-slate-400">
                                {formatarDataHoraBR(detalheAberto.aprovado_em)}
                              </p>
                            </div>
                          </div>
                          {t.diasParaConcluir !== null && (
                            <div className="ml-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 px-3 py-2">
                              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                Tempo total de entrega: {formatarDias(t.diasParaConcluir)}
                              </p>
                            </div>
                          )}
                        </>
                      ) : t.concluido && t.diasParaConcluir !== null && detalheAberto.updated_at ? (
                        <>
                          <div className="flex items-start gap-3">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex-shrink-0">
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-gray-700 dark:text-slate-300">
                                {detalheAberto.status === 'implementado' ? 'Implementada' : 'Rejeitada'}
                              </p>
                              <p className="text-[11px] text-gray-500 dark:text-slate-400">
                                {formatarDataHoraBR(detalheAberto.updated_at)}
                              </p>
                            </div>
                          </div>
                          <div className="ml-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 px-3 py-2">
                            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                              Tempo total de entrega: {formatarDias(t.diasParaConcluir)}
                            </p>
                          </div>
                        </>
                      ) : detalheAberto.status !== 'aguardando_validacao' && (
                        <div className="flex items-start gap-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-300 flex-shrink-0">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-gray-700 dark:text-slate-300">Em aberto</p>
                            <p className="text-[11px] text-gray-500 dark:text-slate-400">
                              Faz {formatarDias(t.diasDesdeC)} que a solicitacao foi criada
                            </p>
                          </div>
                        </div>
                      )}

                      {detalheAberto.comentario_validacao && (
                        <div className="ml-10 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 px-3 py-2">
                          <p className="text-[11px] text-amber-700 dark:text-amber-300">
                            <span className="font-semibold">Comentario:</span> {detalheAberto.comentario_validacao}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="border-t border-gray-100 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-900 px-6 py-3">
              {detalheAberto.status === 'aguardando_validacao' && user?.email && detalheAberto.usuario_email === user.email ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => validar(detalheAberto.id, true)}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    Aprovar entrega
                  </button>
                  <button
                    type="button"
                    onClick={() => validar(detalheAberto.id, false)}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Reabrir
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setDetalheAberto(null)} className="w-full rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-300">Fechar</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal imagem expandida */}
      {imagemExpandida && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4" onClick={() => setImagemExpandida(null)}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setImagemExpandida(null)} className="absolute -top-3 -right-3 rounded-full bg-white dark:bg-slate-800 p-1.5 shadow-lg hover:bg-gray-100 z-10">
              <svg className="h-5 w-5 text-gray-700 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <img src={imagemExpandida} alt="Print expandido" className="max-h-[85vh] rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
};
