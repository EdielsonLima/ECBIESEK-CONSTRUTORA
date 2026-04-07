import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface ValorDoc {
  nome: string;
  fonte: string;
  endpoint: string;
  filtros: string[];
  referencia_cruzada: string | null;
  arquivo: string;
  descricao: string;
}

interface PaginaDoc {
  nome: string;
  icone: string;
  valores: ValorDoc[];
}

interface EndpointDoc {
  area: string;
  rota: string;
  descricao: string;
  tabelas: string;
  filtros_auto?: string;
}

interface GlossarioItem {
  termo: string;
  definicao: string;
}

interface DocData {
  paginas: PaginaDoc[];
  endpoints_resumo: EndpointDoc[];
  glossario: GlossarioItem[];
}

const iconMap: Record<string, React.ReactNode> = {
  'home': (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
  ),
  'check-circle': (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  'clock': (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  'alert-triangle': (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
  ),
  'arrow-down-circle': (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13l-3 3m0 0l-3-3m3 3V8m0 13a9 9 0 110-18 9 9 0 010 18z" /></svg>
  ),
  'check-square': (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
  ),
  'alert-circle': (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  'file-text': (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  ),
  'bar-chart-2': (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
  ),
  'trending-up': (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
  ),
  'activity': (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
  ),
};

export const Documentacao: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<'fluxo' | 'endpoints' | 'glossario'>('fluxo');
  const [data, setData] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<Record<number, boolean>>({});
  const [buscaEndpoint, setBuscaEndpoint] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [buscaGlossario, setBuscaGlossario] = useState('');

  useEffect(() => {
    const carregar = async () => {
      try {
        const res = await axios.get('/api/documentacao/fluxo-dados');
        setData(res.data);
        // Abre o primeiro accordion por padrão
        setExpandido({ 0: true });
      } catch (err) {
        console.error('Erro ao carregar documentação:', err);
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, []);

  const toggleExpandido = (idx: number) => {
    setExpandido(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 p-6 text-center">
          <p className="text-red-700 dark:text-red-400">Erro ao carregar documentação.</p>
        </div>
      </div>
    );
  }

  const areas = [...new Set(data.endpoints_resumo.map(e => e.area))];
  const endpointsFiltrados = data.endpoints_resumo.filter(e => {
    const matchArea = !filtroArea || e.area === filtroArea;
    const matchBusca = !buscaEndpoint ||
      e.rota.toLowerCase().includes(buscaEndpoint.toLowerCase()) ||
      e.descricao.toLowerCase().includes(buscaEndpoint.toLowerCase()) ||
      e.tabelas.toLowerCase().includes(buscaEndpoint.toLowerCase());
    return matchArea && matchBusca;
  });

  const glossarioFiltrado = data.glossario.filter(g =>
    !buscaGlossario ||
    g.termo.toLowerCase().includes(buscaGlossario.toLowerCase()) ||
    g.definicao.toLowerCase().includes(buscaGlossario.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <h1 className="text-2xl font-bold">Documentacao do Sistema</h1>
        </div>
        <p className="text-blue-100 text-sm">
          Referencia completa de onde vem cada valor exibido no dashboard. Use para rastrear e validar dados.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { id: 'fluxo' as const, label: 'Fluxo de Dados', count: data.paginas.length },
          { id: 'endpoints' as const, label: 'Mapa de Endpoints', count: data.endpoints_resumo.length },
          { id: 'glossario' as const, label: 'Glossario', count: data.glossario.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setAbaAtiva(tab.id)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              abaAtiva === tab.id
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-100 border border-gray-200 dark:border-slate-700'
            }`}
          >
            {tab.label}
            <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
              abaAtiva === tab.id ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 dark:text-slate-400'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Aba Fluxo de Dados */}
      {abaAtiva === 'fluxo' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Clique em uma pagina para ver de onde vem cada valor exibido.
          </p>
          {data.paginas.map((pagina, idx) => (
            <div key={idx} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
              {/* Accordion Header */}
              <button
                onClick={() => toggleExpandido(idx)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:bg-slate-900 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${expandido[idx] ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500 dark:text-slate-400'}`}>
                    {iconMap[pagina.icone] || iconMap['file-text']}
                  </div>
                  <span className="font-semibold text-gray-800 dark:text-slate-200">{pagina.nome}</span>
                  <span className="text-xs bg-gray-100 text-gray-500 dark:text-slate-400 rounded-full px-2 py-0.5">
                    {pagina.valores.length} {pagina.valores.length === 1 ? 'valor' : 'valores'}
                  </span>
                </div>
                <svg
                  className={`h-5 w-5 text-gray-400 transition-transform ${expandido[idx] ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Accordion Content */}
              {expandido[idx] && (
                <div className="border-t border-gray-100 dark:border-slate-700/50 px-5 py-4 space-y-4 bg-gray-50/50">
                  {pagina.valores.map((valor, vi) => (
                    <div key={vi} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-semibold text-gray-900 dark:text-slate-100 text-base">{valor.nome}</h4>
                        <span className="text-xs bg-blue-50 text-blue-600 rounded px-2 py-1 font-mono">
                          {valor.arquivo}
                        </span>
                      </div>

                      <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">{valor.descricao}</p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        {/* Fonte */}
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 mt-0.5">
                            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                            </svg>
                          </span>
                          <div>
                            <span className="font-medium text-gray-500 dark:text-slate-400">Fonte:</span>
                            <span className="ml-1 font-mono text-xs bg-gray-100 rounded px-1.5 py-0.5 text-gray-700 dark:text-slate-300">{valor.fonte}</span>
                          </div>
                        </div>

                        {/* Endpoint */}
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 mt-0.5">
                            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </span>
                          <div>
                            <span className="font-medium text-gray-500 dark:text-slate-400">Endpoint:</span>
                            <span className="ml-1 font-mono text-xs bg-green-50 text-green-700 rounded px-1.5 py-0.5">{valor.endpoint}</span>
                          </div>
                        </div>
                      </div>

                      {/* Filtros */}
                      {valor.filtros.length > 0 && (
                        <div className="mt-3">
                          <span className="text-xs font-medium text-gray-500 dark:text-slate-400">Filtros automaticos:</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {valor.filtros.map((f, fi) => (
                              <span key={fi} className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs text-amber-700">
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Referência Cruzada */}
                      {valor.referencia_cruzada && (
                        <div className="mt-3 flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                          <svg className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-xs text-blue-700">{valor.referencia_cruzada}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Aba Mapa de Endpoints */}
      {abaAtiva === 'endpoints' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Buscar por rota, descricao ou tabela..."
                value={buscaEndpoint}
                onChange={e => setBuscaEndpoint(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={filtroArea}
              onChange={e => setFiltroArea(e.target.value)}
              className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 text-sm focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
            >
              <option value="">Todas as areas</option>
              {areas.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Contagem */}
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {endpointsFiltrados.length} de {data.endpoints_resumo.length} endpoints
          </p>

          {/* Tabela */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Area</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Rota</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Descricao</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Tabelas</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Filtros Auto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {endpointsFiltrados.map((ep, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:bg-slate-900">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          {ep.area}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-green-700 whitespace-nowrap">{ep.rota}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300">{ep.descricao}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{ep.tabelas}</td>
                      <td className="px-4 py-3">
                        {ep.filtros_auto ? (
                          <span className="text-xs text-amber-600">{ep.filtros_auto}</span>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Aba Glossário */}
      {abaAtiva === 'glossario' && (
        <div className="space-y-4">
          {/* Busca */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar termo..."
              value={buscaGlossario}
              onChange={e => setBuscaGlossario(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {glossarioFiltrado.map((item, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="h-4 w-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <h3 className="font-bold text-gray-900 dark:text-slate-100">{item.termo}</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">{item.definicao}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100 dark:border-slate-700/50">
        Documentacao gerada automaticamente pelo sistema. Dados servidos por <code className="bg-gray-100 px-1 rounded">/api/documentacao/fluxo-dados</code>
      </div>
    </div>
  );
};
