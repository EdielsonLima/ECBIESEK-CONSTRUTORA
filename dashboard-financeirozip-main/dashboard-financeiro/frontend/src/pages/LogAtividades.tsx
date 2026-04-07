import React, { useState, useEffect } from 'react';
import { adminService, AtividadeLog } from '../services/api';

const CORES_ACAO: Record<string, string> = {
  LOGIN: 'bg-blue-100 text-blue-700',
  ALTERAR_SENHA: 'bg-yellow-100 text-yellow-700',
  CRIAR_USUARIO: 'bg-green-100 text-green-700',
  REMOVER_USUARIO: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
};

const POR_PAGINA = 50;

export const LogAtividades: React.FC = () => {
  const [atividades, setAtividades] = useState<AtividadeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [pagina, setPagina] = useState(1);
  const [filtroAcao, setFiltroAcao] = useState('');

  useEffect(() => {
    adminService.getAtividades()
      .then(data => setAtividades(data))
      .catch(() => setErro('Erro ao carregar log de atividades'))
      .finally(() => setLoading(false));
  }, []);

  const acoes = Array.from(new Set(atividades.map(a => a.acao))).sort();

  const filtradas = filtroAcao
    ? atividades.filter(a => a.acao === filtroAcao)
    : atividades;

  const totalPaginas = Math.ceil(filtradas.length / POR_PAGINA);
  const pagAtual = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const formatarData = (s: string) => {
    try {
      const d = new Date(s);
      return d.toLocaleString('pt-BR');
    } catch {
      return s;
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700/50 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200">Log de Atividades</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{filtradas.length} registros</p>
          </div>
          <select
            value={filtroAcao}
            onChange={e => { setFiltroAcao(e.target.value); setPagina(1); }}
            className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">Todas as ações</option>
            {acoes.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Carregando...</div>
        ) : erro ? (
          <div className="py-16 text-center text-red-500 dark:text-red-400 text-sm">{erro}</div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Nenhum registro encontrado</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-700/50 text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">Data/Hora</th>
                    <th className="px-6 py-3 text-left">Usuário</th>
                    <th className="px-6 py-3 text-left">Ação</th>
                    <th className="px-6 py-3 text-left">Detalhes</th>
                    <th className="px-6 py-3 text-left">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {pagAtual.map(a => (
                    <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50 dark:bg-slate-900 transition-colors">
                      <td className="px-6 py-2.5 text-gray-600 dark:text-slate-400 whitespace-nowrap text-xs">{formatarData(a.created_at)}</td>
                      <td className="px-6 py-2.5 font-medium text-gray-800 dark:text-slate-200">{a.email}</td>
                      <td className="px-6 py-2.5">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${CORES_ACAO[a.acao] ?? 'bg-gray-100 text-gray-600 dark:text-slate-400'}`}>
                          {a.acao}
                        </span>
                      </td>
                      <td className="px-6 py-2.5 text-gray-500 dark:text-slate-400 text-xs">{a.detalhes ?? '—'}</td>
                      <td className="px-6 py-2.5 text-gray-400 text-xs font-mono">{a.ip ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="px-6 py-3 border-t border-gray-100 dark:border-slate-700/50 flex items-center justify-between text-sm text-gray-500 dark:text-slate-400">
                <span>Pág. {pagina}/{totalPaginas}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPagina(p => Math.max(1, p - 1))}
                    disabled={pagina === 1}
                    className="px-3 py-1 rounded border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:bg-slate-900 disabled:opacity-40 transition-colors"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                    disabled={pagina === totalPaginas}
                    className="px-3 py-1 rounded border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:bg-slate-900 disabled:opacity-40 transition-colors"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
