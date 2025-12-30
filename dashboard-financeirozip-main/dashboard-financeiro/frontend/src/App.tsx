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
import { Login } from './pages/Login';
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
  };

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
        return <Dashboard />;
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
        return <KPIs />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />

      <div className={`relative z-20 min-h-screen bg-gray-50 transition-all duration-300 ${sidebarOpen ? 'pl-64' : 'pl-20'}`}>
        <header className="bg-gradient-to-r from-blue-600 to-blue-800 shadow-lg">
          <div className="flex items-center justify-between px-8 py-6">
            <div>
              <h1 className="text-3xl font-bold text-white">
              {currentPage === 'dashboard' && 'Dashboard Financeiro'}
              {currentPage === 'contas-a-pagar' && 'Contas a Pagar'}
              {currentPage === 'contas-pagas' && 'Contas Pagas'}
              {currentPage === 'contas-atrasadas' && 'Contas Atrasadas'}
              {currentPage === 'contas-a-receber' && 'Contas a Receber'}
              {currentPage === 'contas-recebidas' && 'Contas Recebidas'}
              {currentPage === 'recebimentos-atrasados' && 'Recebimentos em Atraso'}
              {currentPage === 'extrato-cliente' && 'Extrato Cliente'}
              {currentPage === 'kpis' && 'KPIs'}
              </h1>
              <p className="mt-1 text-blue-100">Gestão Financeira - Construtora</p>
            </div>
            <div className="flex items-center gap-4">
              {user && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white font-bold">
                    {user.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-white">
                    <p className="text-sm font-medium">{user.nome}</p>
                    <p className="text-xs text-blue-200">{user.email}</p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
                title="Sair"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-lg bg-blue-700 p-2 text-white hover:bg-blue-800"
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
            <p>Dashboard Financeiro - Construtora © {new Date().getFullYear()}</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
