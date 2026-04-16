import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiService } from '../services/api';
import { ManualSecao, ManualArtigo } from '../types/manual';

interface ManualProps {
  isAdmin: boolean;
}

const LS_DRAFT_KEY = 'manual_draft_';

// Mapa de icones: mesmo esquema da pagina de Documentacao
const iconMap: Record<string, React.ReactNode> = {
  home: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  wallet: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  alert: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  ),
  'check-square': (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  settings: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  book: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
};

const iconeDe = (nome?: string | null) => iconMap[nome || 'book'] || iconMap.book;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export const Manual: React.FC<ManualProps> = ({ isAdmin }) => {
  const [secoes, setSecoes] = useState<ManualSecao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [artigoSel, setArtigoSel] = useState<{ secao: ManualSecao; artigo: ManualArtigo } | null>(null);
  const [editando, setEditando] = useState(false);
  const [editConteudo, setEditConteudo] = useState('');
  const [editTitulo, setEditTitulo] = useState('');
  const [editResumo, setEditResumo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modalNovoArtigo, setModalNovoArtigo] = useState<{ secaoId: number } | null>(null);
  const [modalNovaSecao, setModalNovaSecao] = useState(false);
  const [confirmacao, setConfirmacao] = useState<{ tipo: 'artigo' | 'secao'; id: number; nome: string } | null>(null);

  const carregar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await apiService.getManual();
      setSecoes(r.secoes || []);
      // Se nada selecionado, seleciona primeiro artigo
      if (!artigoSel && (r.secoes || []).length > 0) {
        const primeira = r.secoes.find(s => (s.artigos || []).length > 0);
        const art = primeira?.artigos?.[0];
        if (primeira && art) setArtigoSel({ secao: primeira, artigo: art });
      }
    } catch (e) {
      setErro('Nao foi possivel carregar o manual.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  // Filtragem por busca
  const secoesFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return secoes;
    return secoes.map(s => ({
      ...s,
      artigos: (s.artigos || []).filter(a =>
        a.titulo.toLowerCase().includes(termo) ||
        (a.resumo || '').toLowerCase().includes(termo) ||
        (a.conteudo_md || '').toLowerCase().includes(termo) ||
        s.titulo.toLowerCase().includes(termo)
      ),
    })).filter(s => s.artigos.length > 0);
  }, [secoes, busca]);

  const iniciarEdicao = () => {
    if (!artigoSel) return;
    setEditTitulo(artigoSel.artigo.titulo);
    setEditResumo(artigoSel.artigo.resumo || '');
    // Restaura rascunho se houver
    const draft = localStorage.getItem(LS_DRAFT_KEY + artigoSel.artigo.id);
    setEditConteudo(draft || artigoSel.artigo.conteudo_md);
    setEditando(true);
  };

  const cancelarEdicao = () => {
    if (artigoSel) localStorage.removeItem(LS_DRAFT_KEY + artigoSel.artigo.id);
    setEditando(false);
  };

  // Autosave do rascunho a cada edicao
  useEffect(() => {
    if (!editando || !artigoSel) return;
    const t = setTimeout(() => {
      localStorage.setItem(LS_DRAFT_KEY + artigoSel.artigo.id, editConteudo);
    }, 800);
    return () => clearTimeout(t);
  }, [editConteudo, editando, artigoSel]);

  const salvarEdicao = async () => {
    if (!artigoSel) return;
    if (!editTitulo.trim()) { alert('O titulo nao pode estar vazio'); return; }
    setSalvando(true);
    try {
      await apiService.editarArtigoManual(artigoSel.artigo.id, {
        titulo: editTitulo,
        resumo: editResumo,
        conteudo_md: editConteudo,
      });
      localStorage.removeItem(LS_DRAFT_KEY + artigoSel.artigo.id);
      await carregar();
      // Recarrega artigo selecionado com valores novos
      setArtigoSel(prev => prev ? {
        ...prev,
        artigo: { ...prev.artigo, titulo: editTitulo, resumo: editResumo, conteudo_md: editConteudo }
      } : null);
      setEditando(false);
    } catch (e: any) {
      alert('Erro ao salvar: ' + (e?.response?.data?.detail || e.message));
    } finally {
      setSalvando(false);
    }
  };

  const excluirArtigo = async (artigoId: number) => {
    try {
      await apiService.excluirArtigoManual(artigoId);
      setArtigoSel(null);
      await carregar();
    } catch (e: any) {
      alert('Erro ao excluir: ' + (e?.response?.data?.detail || e.message));
    } finally {
      setConfirmacao(null);
    }
  };

  const excluirSecao = async (secaoId: number) => {
    try {
      await apiService.excluirSecaoManual(secaoId);
      setArtigoSel(null);
      await carregar();
    } catch (e: any) {
      alert('Erro ao excluir: ' + (e?.response?.data?.detail || e.message));
    } finally {
      setConfirmacao(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-emerald-600 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-slate-400">Carregando manual...</p>
        </div>
      </div>
    );
  }

  // Estado vazio
  if (!secoes.length) {
    return (
      <div className="space-y-5">
        <HeaderManual />
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="mt-3 text-sm text-gray-600 dark:text-slate-300">O manual ainda nao tem conteudo.</p>
          {isAdmin && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const r = await apiService.seedManual();
                  if (r.ok) {
                    alert(`Manual populado! ${r.secoes} secoes e ${r.artigos} artigos criados.`);
                    await carregar();
                  } else {
                    alert(r.motivo || 'Seed ignorado.');
                  }
                } catch (e: any) {
                  alert('Erro: ' + (e?.response?.data?.detail || e.message));
                }
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              Popular com conteudo inicial
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <HeaderManual />

      {/* Barra de busca + acoes admin */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar no manual..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setModalNovaSecao(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nova Secao
          </button>
        )}
      </div>

      {erro && <p className="text-sm text-red-500">{erro}</p>}

      {/* Layout 2 colunas: Navegacao + Conteudo */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-5">
        {/* Navegacao */}
        <aside className="rounded-2xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden self-start lg:sticky lg:top-4">
          <nav className="max-h-[calc(100vh-180px)] overflow-y-auto p-2">
            {secoesFiltradas.map((secao) => (
              <div key={secao.id} className="mb-3">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-emerald-600 dark:text-emerald-400 flex-shrink-0">{iconeDe(secao.icone)}</span>
                    <h3 className="text-sm font-bold text-gray-800 dark:text-slate-200 truncate" title={secao.titulo}>{secao.titulo}</h3>
                    {secao.apenas_admin && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">ADMIN</span>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setModalNovoArtigo({ secaoId: secao.id })}
                        title="Novo artigo nesta secao"
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-emerald-600"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmacao({ tipo: 'secao', id: secao.id, nome: secao.titulo })}
                        title="Excluir secao"
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-red-600"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                <ul className="space-y-0.5">
                  {secao.artigos.map((artigo) => {
                    const ativo = artigoSel?.artigo.id === artigo.id;
                    return (
                      <li key={artigo.id}>
                        <button
                          type="button"
                          onClick={() => { setArtigoSel({ secao, artigo }); setEditando(false); }}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                            ativo
                              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold'
                              : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                          }`}
                        >
                          {artigo.titulo}
                        </button>
                      </li>
                    );
                  })}
                  {secao.artigos.length === 0 && (
                    <li className="px-3 py-1 text-xs text-gray-400 italic">sem artigos</li>
                  )}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Conteudo */}
        <article className="rounded-2xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {!artigoSel ? (
            <div className="p-10 text-center">
              <p className="text-gray-500 dark:text-slate-400">Selecione um artigo a esquerda para comecar.</p>
            </div>
          ) : editando ? (
            <EditorArtigo
              titulo={editTitulo}
              setTitulo={setEditTitulo}
              resumo={editResumo}
              setResumo={setEditResumo}
              conteudo={editConteudo}
              setConteudo={setEditConteudo}
              salvando={salvando}
              onCancelar={cancelarEdicao}
              onSalvar={salvarEdicao}
            />
          ) : (
            <div className="p-6 md:p-8">
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">{artigoSel.secao.titulo}</p>
                  <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white mt-1">{artigoSel.artigo.titulo}</h1>
                  {artigoSel.artigo.resumo && (
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{artigoSel.artigo.resumo}</p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={iniciarEdicao}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmacao({ tipo: 'artigo', id: artigoSel.artigo.id, nome: artigoSel.artigo.titulo })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300"
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </div>
              <div className="prose prose-sm md:prose-base max-w-none dark:prose-invert prose-headings:text-gray-900 dark:prose-headings:text-slate-100 prose-a:text-emerald-600 dark:prose-a:text-emerald-400 prose-code:text-emerald-700 dark:prose-code:text-emerald-300 prose-code:bg-gray-100 dark:prose-code:bg-slate-900 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{artigoSel.artigo.conteudo_md}</ReactMarkdown>
              </div>
              {artigoSel.artigo.updated_at && (
                <p className="mt-8 pt-4 border-t border-gray-100 dark:border-slate-700 text-xs text-gray-400">
                  Ultima atualizacao: {new Date(artigoSel.artigo.updated_at).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          )}
        </article>
      </div>

      {/* Modais */}
      {modalNovaSecao && (
        <ModalSecao
          onClose={() => setModalNovaSecao(false)}
          onSalvar={async () => { await carregar(); setModalNovaSecao(false); }}
        />
      )}
      {modalNovoArtigo && (
        <ModalArtigo
          secaoId={modalNovoArtigo.secaoId}
          onClose={() => setModalNovoArtigo(null)}
          onSalvar={async () => { await carregar(); setModalNovoArtigo(null); }}
        />
      )}
      {confirmacao && (
        <ModalConfirmacao
          tipo={confirmacao.tipo}
          nome={confirmacao.nome}
          onCancelar={() => setConfirmacao(null)}
          onConfirmar={() => {
            if (confirmacao.tipo === 'artigo') excluirArtigo(confirmacao.id);
            else excluirSecao(confirmacao.id);
          }}
        />
      )}
    </div>
  );
};

// --- Sub-componentes ---

const HeaderManual: React.FC = () => (
  <div className="rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 p-6 shadow-lg">
    <div className="flex items-center gap-3 mb-2">
      <div className="rounded-full bg-white/20 p-2">
        <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h2 className="text-xl md:text-2xl font-bold text-white">Manual do Usuario</h2>
    </div>
    <p className="text-emerald-50 text-sm max-w-2xl">Aprenda a usar cada parte do sistema, passo a passo. Busque por pagina, filtro ou funcionalidade.</p>
  </div>
);

interface EditorArtigoProps {
  titulo: string;
  setTitulo: (v: string) => void;
  resumo: string;
  setResumo: (v: string) => void;
  conteudo: string;
  setConteudo: (v: string) => void;
  salvando: boolean;
  onCancelar: () => void;
  onSalvar: () => void;
}
const EditorArtigo: React.FC<EditorArtigoProps> = ({ titulo, setTitulo, resumo, setResumo, conteudo, setConteudo, salvando, onCancelar, onSalvar }) => (
  <div className="p-5 md:p-6">
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div className="flex-1 min-w-[240px]">
        <input
          type="text"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Titulo do artigo"
          className="w-full px-3 py-2 text-lg font-bold rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          type="text"
          value={resumo}
          onChange={(e) => setResumo(e.target.value)}
          placeholder="Resumo (subtitulo curto)"
          className="w-full mt-2 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          disabled={salvando}
          className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-slate-200"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[60vh]">
      <div className="flex flex-col">
        <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">Markdown</label>
        <textarea
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          className="flex-1 p-3 font-mono text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          spellCheck={false}
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">Pré-visualização</label>
        <div className="flex-1 p-3 overflow-y-auto rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-gray-900 dark:prose-headings:text-slate-100">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{conteudo}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  </div>
);

interface ModalSecaoProps { onClose: () => void; onSalvar: () => void | Promise<void>; }
const ModalSecao: React.FC<ModalSecaoProps> = ({ onClose, onSalvar }) => {
  const [titulo, setTitulo] = useState('');
  const [slug, setSlug] = useState('');
  const [icone, setIcone] = useState('book');
  const [apenasAdmin, setApenasAdmin] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const handleTituloChange = (v: string) => {
    setTitulo(v);
    if (!slug) setSlug(slugify(v));
  };
  const salvar = async () => {
    if (!titulo.trim()) { alert('Titulo obrigatorio'); return; }
    if (!slug.trim()) { alert('Slug obrigatorio'); return; }
    setSalvando(true);
    try {
      await apiService.criarSecaoManual({ titulo, slug, icone, apenas_admin: apenasAdmin });
      await onSalvar();
    } catch (e: any) {
      alert('Erro: ' + (e?.response?.data?.detail || e.message));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <ModalBase titulo="Nova Secao" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Titulo"><input type="text" value={titulo} onChange={(e) => handleTituloChange(e.target.value)} className={inputCls} /></Field>
        <Field label="Slug (identificador)"><input type="text" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} className={inputCls} /></Field>
        <Field label="Icone">
          <select value={icone} onChange={(e) => setIcone(e.target.value)} className={inputCls}>
            <option value="book">Livro (geral)</option>
            <option value="home">Casa</option>
            <option value="wallet">Carteira (financeiro)</option>
            <option value="alert">Alerta</option>
            <option value="check-square">Checklist</option>
            <option value="settings">Configuracoes</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
          <input type="checkbox" checked={apenasAdmin} onChange={(e) => setApenasAdmin(e.target.checked)} className="rounded text-emerald-600" />
          Apenas administradores veem esta secao
        </label>
      </div>
      <ModalFooter salvando={salvando} onCancelar={onClose} onSalvar={salvar} />
    </ModalBase>
  );
};

interface ModalArtigoProps { secaoId: number; onClose: () => void; onSalvar: () => void | Promise<void>; }
const ModalArtigo: React.FC<ModalArtigoProps> = ({ secaoId, onClose, onSalvar }) => {
  const [titulo, setTitulo] = useState('');
  const [slug, setSlug] = useState('');
  const [resumo, setResumo] = useState('');
  const [conteudo, setConteudo] = useState('# Titulo\n\nEscreva o conteudo aqui...');
  const [salvando, setSalvando] = useState(false);
  const handleTituloChange = (v: string) => {
    setTitulo(v);
    if (!slug) setSlug(slugify(v));
  };
  const salvar = async () => {
    if (!titulo.trim()) { alert('Titulo obrigatorio'); return; }
    if (!slug.trim()) { alert('Slug obrigatorio'); return; }
    setSalvando(true);
    try {
      await apiService.criarArtigoManual({ secao_id: secaoId, titulo, slug, resumo, conteudo_md: conteudo });
      await onSalvar();
    } catch (e: any) {
      alert('Erro: ' + (e?.response?.data?.detail || e.message));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <ModalBase titulo="Novo Artigo" onClose={onClose} wide>
      <div className="space-y-3">
        <Field label="Titulo"><input type="text" value={titulo} onChange={(e) => handleTituloChange(e.target.value)} className={inputCls} /></Field>
        <Field label="Slug (identificador)"><input type="text" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} className={inputCls} /></Field>
        <Field label="Resumo (opcional)"><input type="text" value={resumo} onChange={(e) => setResumo(e.target.value)} className={inputCls} /></Field>
        <Field label="Conteudo (Markdown)"><textarea value={conteudo} onChange={(e) => setConteudo(e.target.value)} rows={14} className={inputCls + ' font-mono text-sm'} /></Field>
      </div>
      <ModalFooter salvando={salvando} onCancelar={onClose} onSalvar={salvar} />
    </ModalBase>
  );
};

interface ModalConfirmacaoProps { tipo: 'artigo' | 'secao'; nome: string; onCancelar: () => void; onConfirmar: () => void; }
const ModalConfirmacao: React.FC<ModalConfirmacaoProps> = ({ tipo, nome, onCancelar, onConfirmar }) => (
  <ModalBase titulo={`Excluir ${tipo}`} onClose={onCancelar}>
    <p className="text-sm text-gray-700 dark:text-slate-300">
      Tem certeza que deseja excluir <strong>"{nome}"</strong>?
      {tipo === 'secao' && <span className="block mt-2 text-red-600 dark:text-red-400">Todos os artigos dentro dela tambem serao removidos.</span>}
    </p>
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" onClick={onCancelar} className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-slate-200">Cancelar</button>
      <button type="button" onClick={onConfirmar} className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-semibold text-white">Excluir</button>
    </div>
  </ModalBase>
);

interface ModalBaseProps { titulo: string; onClose: () => void; children: React.ReactNode; wide?: boolean; }
const ModalBase: React.FC<ModalBaseProps> = ({ titulo, onClose, children, wide }) => (
  <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
    <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-md'} w-full max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-slate-700">
        <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">{titulo}</h3>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

const inputCls = "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500";

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">{label}</label>
    {children}
  </div>
);

interface ModalFooterProps { salvando: boolean; onCancelar: () => void; onSalvar: () => void; }
const ModalFooter: React.FC<ModalFooterProps> = ({ salvando, onCancelar, onSalvar }) => (
  <div className="mt-5 flex justify-end gap-2">
    <button type="button" onClick={onCancelar} disabled={salvando} className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-slate-200">Cancelar</button>
    <button type="button" onClick={onSalvar} disabled={salvando} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {salvando ? 'Salvando...' : 'Salvar'}
    </button>
  </div>
);
