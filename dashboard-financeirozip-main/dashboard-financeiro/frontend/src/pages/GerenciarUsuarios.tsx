import React, { useState, useEffect } from 'react';
import { adminService, UsuarioAdmin } from '../services/api';

export const GerenciarUsuarios: React.FC = () => {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [novoEmail, setNovoEmail] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [novaPermissao, setNovaPermissao] = useState('somente_leitura');
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState('');

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [permissaoEdit, setPermissaoEdit] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try {
      setLoading(true);
      const data = await adminService.getUsuarios();
      setUsuarios(data);
    } catch {
      setErro('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroCriar('');
    setCriando(true);
    try {
      await adminService.criarUsuario(novoEmail, novoNome, novaSenha, novaPermissao);
      setSucesso('Usuário criado com sucesso!');
      setNovoEmail(''); setNovoNome(''); setNovaSenha(''); setNovaPermissao('somente_leitura');
      await carregar();
      setTimeout(() => setSucesso(''), 3000);
    } catch (err: any) {
      setErroCriar(err.response?.data?.detail || 'Erro ao criar usuário');
    } finally {
      setCriando(false);
    }
  };

  const handleDeletar = async (id: number, email: string) => {
    if (!confirm(`Remover o usuário ${email}?`)) return;
    try {
      await adminService.deletarUsuario(id);
      setSucesso('Usuário removido.');
      await carregar();
      setTimeout(() => setSucesso(''), 3000);
    } catch (err: any) {
      setErro(err.response?.data?.detail || 'Erro ao remover usuário');
    }
  };

  const iniciarEdicao = (u: UsuarioAdmin) => {
    setEditandoId(u.id);
    setPermissaoEdit(u.permissao);
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setPermissaoEdit('');
  };

  const handleSalvarPermissao = async (id: number) => {
    setSalvando(true);
    try {
      await adminService.atualizarPermissao(id, permissaoEdit);
      setSucesso('Permissão atualizada!');
      setEditandoId(null);
      await carregar();
      setTimeout(() => setSucesso(''), 3000);
    } catch (err: any) {
      setErro(err.response?.data?.detail || 'Erro ao atualizar permissão');
    } finally {
      setSalvando(false);
    }
  };

  const badgePermissao = (p: string) =>
    p === 'admin'
      ? 'bg-blue-100 text-blue-700 border border-blue-200'
      : 'bg-gray-100 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700';

  const labelPermissao = (p: string) =>
    p === 'admin' ? 'Admin' : 'Somente leitura';

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* Novo Usuário */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700/50 p-6">
        <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200 mb-1">Novo Usuário</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">Crie uma conta para dar acesso ao painel.</p>

        {erroCriar && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg text-sm text-red-600 dark:text-red-400">{erroCriar}</div>
        )}
        {sucesso && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{sucesso}</div>
        )}

        <form onSubmit={handleCriar} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Email</label>
            <input
              type="email" required value={novoEmail}
              onChange={e => setNovoEmail(e.target.value)}
              placeholder="nome@email.com"
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Nome</label>
            <input
              type="text" required value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              placeholder="Nome completo"
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Senha (mín. 6)</label>
            <input
              type="password" required minLength={6} value={novaSenha}
              onChange={e => setNovaSenha(e.target.value)}
              placeholder="••••••"
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Permissão</label>
            <select
              value={novaPermissao} onChange={e => setNovaPermissao(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="somente_leitura">Somente leitura</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="md:col-span-6">
            <button
              type="submit" disabled={criando}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
              {criando ? 'Criando...' : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Criar Usuário
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Lista de Usuários */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700/50">
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200">Usuários Cadastrados</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Clique em "Editar" para alterar a permissão de um usuário</p>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Carregando...</div>
        ) : erro ? (
          <div className="py-12 text-center text-red-500 dark:text-red-400 text-sm">{erro}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-700/50 text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3 text-left">Usuário</th>
                <th className="px-6 py-3 text-left">Nome</th>
                <th className="px-6 py-3 text-left">Permissão</th>
                <th className="px-6 py-3 text-left">Criado em</th>
                <th className="px-6 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 dark:bg-slate-900 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-800 dark:text-slate-200">{u.email}</td>
                  <td className="px-6 py-3 text-gray-600 dark:text-slate-400">{u.nome}</td>
                  <td className="px-6 py-3">
                    {editandoId === u.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={permissaoEdit}
                          onChange={e => setPermissaoEdit(e.target.value)}
                          className="border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >
                          <option value="somente_leitura">Somente leitura</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          onClick={() => handleSalvarPermissao(u.id)}
                          disabled={salvando}
                          className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {salvando ? '...' : 'Salvar'}
                        </button>
                        <button
                          onClick={cancelarEdicao}
                          className="text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-slate-300 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badgePermissao(u.permissao)}`}>
                        {u.permissao === 'admin' && (
                          <svg className="inline h-3 w-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
                          </svg>
                        )}
                        {labelPermissao(u.permissao)}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500 dark:text-slate-400">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {editandoId !== u.id && (
                        <button
                          onClick={() => iniciarEdicao(u)}
                          className="text-blue-500 hover:text-blue-700 text-xs font-medium transition-colors"
                          title="Alterar permissão"
                        >
                          Editar
                        </button>
                      )}
                      <button
                        onClick={() => handleDeletar(u.id, u.email)}
                        className="text-red-500 dark:text-red-400 hover:text-red-700 dark:text-red-400 text-xs font-medium transition-colors"
                        title="Remover usuário"
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
