import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { ContasAPagar } from './pages/ContasAPagar';
import { ContasPagas } from './pages/ContasPagas';
import { ContasAtrasadas } from './pages/ContasAtrasadas';
import { ContasAReceber } from './pages/ContasAReceber';
import { ContasRecebidas } from './pages/ContasRecebidas';
import { ContasReceberAtrasadas } from './pages/ContasReceberAtrasadas';
import { KPIs } from './pages/KPIs';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
              {currentPage === 'kpis' && 'KPIs'}
              </h1>
              <p className="mt-1 text-blue-100">Gestão Financeira - Construtora</p>
            </div>
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
