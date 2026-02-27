import React, { useState } from 'react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, isOpen, setIsOpen }) => {
  const [contasPagarSubmenuOpen, setContasPagarSubmenuOpen] = useState(true);
  const [contasReceberSubmenuOpen, setContasReceberSubmenuOpen] = useState(true);

  const menuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      id: 'contas-pagar',
      label: 'Contas a Pagar',
      submenuKey: 'pagar',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      submenu: [
        { id: 'contas-a-pagar', label: 'A Pagar' },
        { id: 'contas-pagas', label: 'Pagas' },
        { id: 'contas-atrasadas', label: 'Atrasadas' },
      ],
    },
    {
      id: 'contas-receber',
      label: 'Contas a Receber',
      submenuKey: 'receber',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      submenu: [
        { id: 'contas-a-receber', label: 'A Receber' },
        { id: 'contas-recebidas', label: 'Recebidas' },
        { id: 'recebimentos-atrasados', label: 'Atrasadas' },
        { id: 'extrato-cliente', label: 'Extrato Cliente' },
      ],
    },
    {
      id: 'kpis',
      label: 'KPIs',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: 'classificacao-centro-custo',
      label: 'Centros de Custo',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      id: 'configuracoes',
      label: 'Configuracoes',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 z-50 h-screen bg-gray-900 text-white transition-all duration-300 ${
          isOpen ? 'w-64' : 'w-20'
        }`}
      >
        {/* Logo e Toggle */}
        <div className="flex h-16 items-center justify-between border-b border-gray-800 px-4">
          {isOpen && <span className="text-xl font-bold">Financeiro</span>}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-lg p-2 hover:bg-gray-800"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              )}
            </svg>
          </button>
        </div>

        {/* Menu Items */}
        <nav className="mt-4 px-2">
          {menuItems.map((item) => {
            const isSubmenuOpen = item.submenuKey === 'pagar' ? contasPagarSubmenuOpen : 
                                  item.submenuKey === 'receber' ? contasReceberSubmenuOpen : false;
            
            return (
              <div key={item.id}>
                {/* Menu Item Principal */}
                <button
                  onClick={() => {
                    if (item.submenu) {
                      if (item.submenuKey === 'pagar') {
                        setContasPagarSubmenuOpen(!contasPagarSubmenuOpen);
                      } else if (item.submenuKey === 'receber') {
                        setContasReceberSubmenuOpen(!contasReceberSubmenuOpen);
                      }
                    } else {
                      onNavigate(item.id);
                    }
                  }}
                  className={`mb-1 flex w-full items-center rounded-lg px-3 py-3 transition-colors ${
                    currentPage === item.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {isOpen && (
                    <>
                      <span className="ml-3 flex-1 text-left">{item.label}</span>
                      {item.submenu && (
                        <svg
                          className={`h-5 w-5 transition-transform ${
                            isSubmenuOpen ? 'rotate-90' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </>
                  )}
                </button>

                {/* Submenu */}
                {item.submenu && isOpen && isSubmenuOpen && (
                  <div className="ml-4 mt-1 space-y-1">
                    {item.submenu.map((subItem) => (
                      <button
                        key={subItem.id}
                        onClick={() => onNavigate(subItem.id)}
                        className={`flex w-full items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                          currentPage === subItem.id
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                        }`}
                      >
                        <span className="ml-6">{subItem.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Overlay para mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
};
