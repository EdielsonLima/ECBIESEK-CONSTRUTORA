import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { ContasAPagar } from './pages/ContasAPagar';
import { ContasPagas } from './pages/ContasPagas';
import { ContasAtrasadas } from './pages/ContasAtrasadas';
import { ContasAReceber } from './pages/ContasAReceber';
import { ContasRecebidas } from './pages/ContasRecebidas';
import { ContasReceberAtrasadas } from './pages/ContasReceberAtrasadas';
import { ExtratoCliente } from './pages/ExtratoCliente';
import { KPIs } from './pages/KPIs';
import { ClassificacaoCentroCusto } from './pages/ClassificacaoCentroCusto';
import { Configuracoes } from './pages/Configuracoes';
import { ExposicaoCaixa } from './pages/ExposicaoCaixa';
import { PainelExecutivo } from './pages/PainelExecutivo';
import { ChatIA } from './pages/ChatIA';
import { Documentacao } from './pages/Documentacao';
import { Login } from './pages/Login';
import { GerenciarUsuarios } from './pages/GerenciarUsuarios';
import { LogAtividades } from './pages/LogAtividades';
import { AlterarSenha } from './pages/AlterarSenha';
import { Validacao } from './pages/Validacao';
import { Solicitacoes } from './pages/Solicitacoes';
import { authService, apiService, User } from './services/api';
import { ChangelogModal } from './components/ChangelogModal';

const DIAS_PT = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sab.'];
const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function formatarDataPt(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return `${DIAS_PT[d.getDay()]} ${d.getDate()} ${MESES_PT[d.getMonth()]} ${d.getFullYear()}`;
}

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);
  const [usuariosOnline, setUsuariosOnline] = useState<Array<{ user_id: number; user_nome: string; user_email: string; user_permissao: string; login_at: string }>>([]);
  const [mostrarOnline, setMostrarOnline] = useState(false);

  useEffect(() => {
    checkAuth();
    apiService.getUltimaAtualizacao()
      .then(r => { if (r.data) setUltimaAtualizacao(formatarDataPt(r.data)); })
      .catch(() => {});
  }, []);

  const checkAuth = async () => {
    try {
      if (authService.isAuthenticated()) {
        const result = await authService.checkAuth();
        if (result.authenticated && result.user) {
          setIsAuthenticated(true);
          setUser(result.user);
        } else {
          setIsAuthenticated(false);
          setUser(null);
        }
      }
    } catch {
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = () => {
    const storedUser = authService.getStoredUser();
    setUser(storedUser);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    if (user) apiService.removerHeartbeat(user.id).catch(() => {});
    authService.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  // Heartbeat e polling de usuários online
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const enviar = () => {
      apiService.enviarHeartbeat({ user_id: user.id, user_nome: user.nome, user_email: user.email, user_permissao: user.permissao })
        .catch(err => console.error('[heartbeat] erro:', err));
    };
    const buscar = () => {
      apiService.getUsuariosOnline()
        .then(r => { setUsuariosOnline(r.online || []); })
        .catch(err => console.error('[usuarios-online] erro:', err));
    };
    enviar();
    buscar();
    const hbInterval = setInterval(enviar, 30000);
    const pollInterval = setInterval(buscar, 30000);
    return () => { clearInterval(hbInterval); clearInterval(pollInterval); };
  }, [isAuthenticated, user]);

  const isAdmin = user?.permissao === 'admin';

  const AcessoNegado = () => (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
        <svg className="h-8 w-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Acesso Negado</h2>
      <p className="text-gray-500 text-sm">Você não tem permissão para acessar esta página.</p>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'contas-a-pagar':
        return <ContasAPagar />;
      case 'contas-pagas':
        return <ContasPagas />;
      case 'contas-atrasadas':
        return <ContasAtrasadas />;
      case 'contas-a-receber':
        return <ContasAReceber />;
      case 'contas-recebidas':
        return <ContasRecebidas />;
      case 'recebimentos-atrasados':
        return <ContasReceberAtrasadas />;
      case 'extrato-cliente':
        return <ExtratoCliente />;
      case 'kpis':
        return <KPIs isAdmin={isAdmin} />;
      case 'classificacao-centro-custo':
        return <ClassificacaoCentroCusto />;
      case 'configuracoes':
        return isAdmin ? <Configuracoes /> : <AcessoNegado />;
      case 'painel-executivo':
        return <PainelExecutivo onNavigate={setCurrentPage} />;
      case 'exposicao-caixa':
        return <ExposicaoCaixa />;
      case 'chat-ia':
        return <ChatIA />;
      case 'documentacao':
        return <Documentacao />;
      case 'gerenciar-usuarios':
        return isAdmin ? <GerenciarUsuarios /> : <AcessoNegado />;
      case 'log-atividades':
        return isAdmin ? <LogAtividades /> : <AcessoNegado />;
      case 'alterar-senha':
        return <AlterarSenha />;
      case 'validacao':
        return isAdmin ? <Validacao /> : <AcessoNegado />;
      case 'solicitacoes':
        return <Solicitacoes />;
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ChangelogModal />
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        user={user}
        onLogout={handleLogout}
      />

      <div className={`relative z-20 min-h-screen bg-gray-50 transition-all duration-300 ${sidebarOpen ? 'pl-64' : 'pl-20'}`}>
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100 transition-all duration-300">
          <div className="flex items-center justify-between px-8 py-5">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">
                {currentPage === 'dashboard' && 'ECBIESEK-CONSTRUTORA'}
                {currentPage === 'contas-a-pagar' && 'Contas a Pagar'}
                {currentPage === 'contas-pagas' && 'Contas Pagas'}
                {currentPage === 'contas-atrasadas' && 'Contas Atrasadas'}
                {currentPage === 'contas-a-receber' && 'Contas a Receber'}
                {currentPage === 'contas-recebidas' && 'Contas Recebidas'}
                {currentPage === 'recebimentos-atrasados' && 'Inadimplência'}
                {currentPage === 'extrato-cliente' && 'Extrato Cliente'}
                {currentPage === 'kpis' && 'KPIs'}
                {currentPage === 'configuracoes' && 'Configurações'}
                {currentPage === 'exposicao-caixa' && 'Exposição de Caixa'}
                {currentPage === 'painel-executivo' && 'Painel Executivo'}
                {currentPage === 'chat-ia' && 'Chat IA'}
                {currentPage === 'documentacao' && 'Documentacao'}
                {currentPage === 'gerenciar-usuarios' && 'Gerenciar Usuários'}
                {currentPage === 'log-atividades' && 'Log de Atividades'}
                {currentPage === 'alterar-senha' && 'Alterar Senha'}
                {currentPage === 'validacao' && 'Validacao de Dados'}
                {currentPage === 'solicitacoes' && 'Solicitacoes de Melhorias'}
              </h1>
              <p className="mt-1 text-sm font-medium text-gray-500">Gestão Financeira - Construtora</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Usuários Online */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMostrarOnline(!mostrarOnline)}
                  className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 border border-gray-200 shadow-sm hover:bg-gray-100 transition-colors"
                >
                  <div className="flex -space-x-1.5">
                    {usuariosOnline.slice(0, 3).map((u, i) => (
                      <div key={u.user_id} className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-bold text-white ring-2 ring-white" style={{ zIndex: 3 - i }}>
                        {u.user_nome?.charAt(0).toUpperCase() || '?'}
                      </div>
                    ))}
                    {usuariosOnline.length > 3 && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-300 text-[9px] font-bold text-gray-600 ring-2 ring-white">
                        +{usuariosOnline.length - 3}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-xs font-semibold text-gray-700">{usuariosOnline.length} online</span>
                  </div>
                </button>

                {/* Dropdown lista */}
                {mostrarOnline && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMostrarOnline(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
                      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5">
                        <p className="text-sm font-bold text-white">Usuarios Online</p>
                        <p className="text-[10px] text-blue-100">{usuariosOnline.length} usuario(s) ativo(s)</p>
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                        {usuariosOnline.map(u => (
                          <div key={u.user_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white flex-shrink-0">
                              {u.user_nome?.charAt(0).toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-900 truncate">{u.user_nome}</p>
                              <p className="text-[10px] text-gray-500 truncate">{u.user_email}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="flex items-center gap-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
                                <span className="text-[9px] text-green-600 font-medium">Online</span>
                              </div>
                              <p className="text-[9px] text-gray-400">
                                Entrou {u.login_at ? new Date(u.login_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                              </p>
                            </div>
                          </div>
                        ))}
                        {usuariosOnline.length === 0 && (
                          <div className="px-4 py-6 text-center text-xs text-gray-400">Nenhum usuario online</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Base Atualizada */}
              {ultimaAtualizacao && (
                <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 border border-gray-200 shadow-sm">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{ultimaAtualizacao}</p>
                    <p className="text-[10px] text-gray-400">Desenvolvido por <span className="font-medium text-gray-500">DT Consultorias</span></p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="p-8">
          {renderPage()}
        </main>

        <footer className="mt-12 bg-white py-6 shadow-inner">
          <div className="px-8 text-center text-sm text-gray-600">
            <p>ECBIESEK-CONSTRUTORA &copy; {new Date().getFullYear()}</p>
            <p className="mt-1 text-xs text-gray-400">Desenvolvido por DT Consultorias</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
