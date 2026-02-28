import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

interface SubMenuItem {
  id: string;
  label: string;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  submenu?: SubMenuItem[];
}

interface MenuGroup {
  group: string;
  icon: React.ReactNode;
  items: MenuItem[];
}

const DIAS_PT = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatarDataPt(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${DIAS_PT[d.getDay()]} ${d.getDate()} ${MESES_PT[d.getMonth()]} ${d.getFullYear()}`;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, isOpen, setIsOpen }) => {
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);

  useEffect(() => {
    apiService.getUltimaAtualizacao()
      .then(r => { if (r.data) setUltimaAtualizacao(formatarDataPt(r.data)); })
      .catch(() => {});
  }, []);

  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({
    'contas-pagar': true,
    'contas-receber': true,
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    'financeiro': true,
    'suprimentos': false,
    'engenharia': false,
  });

  const menuGroups: MenuGroup[] = [
    {
      group: 'Financeiro',
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      items: [
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
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
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
          id: 'exposicao-caixa',
          label: 'Exposição de Caixa',
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          ),
        },
      ],
    },
    {
      group: 'Suprimentos',
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      items: [
        {
          id: 'suprimentos-dashboard',
          label: 'Dashboard',
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          ),
        },
        {
          id: 'pedidos-compra',
          label: 'Pedidos de Compra',
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          ),
        },
        {
          id: 'fornecedores',
          label: 'Fornecedores',
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ),
        },
        {
          id: 'estoque',
          label: 'Estoque',
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          ),
        },
      ],
    },
    {
      group: 'Engenharia',
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
      items: [
        {
          id: 'engenharia-dashboard',
          label: 'Dashboard',
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          ),
        },
        {
          id: 'obras',
          label: 'Obras',
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          ),
        },
        {
          id: 'cronogramas',
          label: 'Cronogramas',
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          ),
        },
        {
          id: 'medicoes',
          label: 'Medições',
          icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          ),
        },
      ],
    },
  ];

  const toggleSubmenu = (itemId: string) => {
    setOpenSubmenus(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const toggleGroup = (groupKey: string) => {
    setOpenGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const groupKey = (group: string) => group.toLowerCase();

  return (
    <>
      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 z-50 h-screen bg-gray-900 text-white transition-all duration-300 flex flex-col ${
          isOpen ? 'w-64' : 'w-20'
        }`}
      >
        {/* Logo e Toggle */}
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-700 px-4">
          {isOpen && (
            <span className="text-sm font-bold tracking-widest text-gray-300 uppercase">
              ECB
            </span>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-lg p-2 hover:bg-gray-700 transition-colors"
          >
            <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              )}
            </svg>
          </button>
        </div>

        {/* Menu com grupos */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-700">
          {menuGroups.map((group) => {
            const key = groupKey(group.group);
            const isGroupOpen = openGroups[key] ?? true;

            return (
              <div key={key} className="mb-1">
                {/* Group Header */}
                <button
                  onClick={() => isOpen && toggleGroup(key)}
                  className={`flex w-full items-center rounded-md px-3 py-2 transition-colors ${
                    isOpen ? 'hover:bg-gray-800 cursor-pointer' : 'cursor-default'
                  }`}
                  title={!isOpen ? group.group : undefined}
                >
                  <span className="flex-shrink-0 text-blue-400">{group.icon}</span>
                  {isOpen && (
                    <>
                      <span className="ml-2 flex-1 text-left text-xs font-semibold uppercase tracking-wider text-blue-400">
                        {group.group}
                      </span>
                      <svg
                        className={`h-3 w-3 text-blue-400 transition-transform duration-200 ${
                          isGroupOpen ? 'rotate-90' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>

                {/* Divider */}
                {isOpen && (
                  <div className="mx-3 mb-1 border-t border-gray-700" />
                )}

                {/* Group Items */}
                {(isGroupOpen || !isOpen) && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const isSubmenuOpen = openSubmenus[item.id] ?? false;
                      const isActive = currentPage === item.id || item.submenu?.some(s => s.id === currentPage);

                      return (
                        <div key={item.id}>
                          <button
                            onClick={() => {
                              if (item.submenu) {
                                if (isOpen) toggleSubmenu(item.id);
                                else onNavigate(item.submenu[0].id);
                              } else {
                                onNavigate(item.id);
                              }
                            }}
                            title={!isOpen ? item.label : undefined}
                            className={`flex w-full items-center rounded-lg px-3 py-2.5 transition-colors ${
                              isActive
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                            }`}
                          >
                            <span className="flex-shrink-0">{item.icon}</span>
                            {isOpen && (
                              <>
                                <span className="ml-3 flex-1 text-left text-sm">{item.label}</span>
                                {item.submenu && (
                                  <svg
                                    className={`h-4 w-4 transition-transform duration-200 ${
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
                            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-700 pl-3">
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
                                  <span className="h-1.5 w-1.5 rounded-full bg-current mr-2 flex-shrink-0" />
                                  {subItem.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Data de atualização do banco */}
        {ultimaAtualizacao && isOpen && (
          <div className="flex-shrink-0 px-4 pb-2">
            <div className="rounded-lg bg-gray-800 px-3 py-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Base atualizada</p>
              <p className="text-xs font-semibold text-green-400">{ultimaAtualizacao}</p>
            </div>
          </div>
        )}

        {/* Configurações no rodapé */}
        <div className="flex-shrink-0 border-t border-gray-700 px-2 py-3">
          <button
            onClick={() => onNavigate('configuracoes')}
            title={!isOpen ? 'Configurações' : undefined}
            className={`flex w-full items-center rounded-lg px-3 py-2.5 transition-colors ${
              currentPage === 'configuracoes'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {isOpen && <span className="ml-3 text-sm">Configurações</span>}
          </button>
        </div>
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
