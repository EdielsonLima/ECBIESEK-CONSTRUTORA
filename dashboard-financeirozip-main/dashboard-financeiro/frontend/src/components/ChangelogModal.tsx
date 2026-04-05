import React, { useEffect, useState } from 'react';

interface ChangelogItem {
  versao: string;
  data: string;
  titulo: string;
  secoes: Array<{
    titulo: string;
    icone: string;
    itens: string[];
  }>;
}

interface ChangelogData {
  versao_atual: string;
  historico: ChangelogItem[];
}

const STORAGE_KEY = 'ecb_ultima_versao_vista';

const iconeMap: Record<string, React.ReactNode> = {
  wallet: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  alert: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  ),
  download: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  settings: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

export const ChangelogModal: React.FC = () => {
  const [visivel, setVisivel] = useState(false);
  const [dados, setDados] = useState<ChangelogItem | null>(null);
  const [versao, setVersao] = useState('');
  const [animando, setAnimando] = useState(false);

  useEffect(() => {
    fetch('/changelog.json?' + Date.now())
      .then(res => res.json())
      .then((data: ChangelogData) => {
        const ultimaVista = localStorage.getItem(STORAGE_KEY);
        if (ultimaVista !== data.versao_atual && data.historico.length > 0) {
          setDados(data.historico[0]);
          setVersao(data.versao_atual);
          setTimeout(() => {
            setVisivel(true);
            setAnimando(true);
          }, 500);
        }
      })
      .catch(() => {});
  }, []);

  const fechar = () => {
    setAnimando(false);
    setTimeout(() => {
      setVisivel(false);
      localStorage.setItem(STORAGE_KEY, versao);
    }, 300);
  };

  if (!visivel || !dados) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${
        animando ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/0'
      }`}
      onClick={fechar}
    >
      <div
        className={`relative w-full max-w-lg transform transition-all duration-300 ${
          animando ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="relative bg-gradient-to-r from-blue-700 to-indigo-600 px-6 py-6 text-white">
            <div className="absolute right-4 top-4">
              <button
                type="button"
                onClick={fechar}
                className="rounded-full p-1 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold">{dados.titulo}</h2>
                <p className="mt-0.5 text-sm text-blue-100">
                  Versao {dados.versao} &middot; {new Date(dados.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[55vh] overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              {dados.secoes.map((secao, i) => (
                <div key={i}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      {iconeMap[secao.icone] || iconeMap.settings}
                    </span>
                    <h3 className="text-sm font-bold text-gray-900">{secao.titulo}</h3>
                  </div>
                  <ul className="ml-10 space-y-1.5">
                    {secao.itens.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                        <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
            <button
              type="button"
              onClick={fechar}
              className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-md"
            >
              Entendi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
