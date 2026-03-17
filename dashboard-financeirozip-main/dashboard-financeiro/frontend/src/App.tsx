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
import { authService, User } from './services/api';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
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
    authService.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

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
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
              </h1>
              <p className="mt-1 text-sm font-medium text-gray-500">Gestão Financeira - Construtora</p>
            </div>
            <div className="flex items-center gap-4">
              {user && (
                <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-full border border-gray-100 shadow-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold shadow-md">
                    {user.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-gray-700">
                    <p className="text-sm font-semibold leading-tight">{user.nome}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full bg-red-50 p-2.5 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors shadow-sm"
                title="Sair"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-full bg-white p-2.5 text-gray-600 hover:bg-gray-50 border border-gray-200 transition-colors shadow-sm"
                aria-label="Toggle sidebar"
                title="Abrir/Fechar Menu"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
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
