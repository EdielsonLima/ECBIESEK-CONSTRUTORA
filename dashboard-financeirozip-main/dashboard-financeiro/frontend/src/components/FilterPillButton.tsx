import React, { useEffect, useRef, useState } from 'react';
import { Filter, ChevronDown } from 'lucide-react';

interface Option {
  id: number | string;
  nome: string;
}

interface FilterPillButtonProps {
  label: string;
  options: Option[];
  value: (number | string)[];
  onChange: (value: (number | string)[]) => void;
  searchable?: boolean;
  emptySearchPlaceholder?: string;
}

/**
 * Botao com icone de funil e label, que abre dropdown de selecao multipla.
 * Mostra badge "N selecionado(s)" quando ha selecao ativa.
 */
export const FilterPillButton: React.FC<FilterPillButtonProps> = ({
  label,
  options,
  value,
  onChange,
  searchable = true,
  emptySearchPlaceholder = 'Pesquisar...',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtradas = options.filter(o =>
    !search || o.nome.toLowerCase().includes(search.toLowerCase()) || String(o.id).toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: number | string) => {
    if (value.includes(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  };

  const limpar = () => onChange([]);

  const ativo = value.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
          ativo
            ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-300'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
        }`}
      >
        <Filter className="h-3.5 w-3.5" />
        <span>{label}</span>
        {ativo && (
          <span className="inline-flex items-center rounded-full bg-rose-200 dark:bg-rose-800/60 px-1.5 text-[10px] font-bold text-rose-700 dark:text-rose-200">
            {value.length} selecionado{value.length === 1 ? '' : 's'}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          {searchable && (
            <div className="border-b border-gray-200 dark:border-slate-700 p-2">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={emptySearchPlaceholder}
                className="w-full rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-sm focus:border-rose-500 focus:outline-none dark:text-slate-200"
              />
            </div>
          )}
          {ativo && (
            <div className="border-b border-gray-200 dark:border-slate-700 px-3 py-1.5 flex items-center justify-between">
              <span className="text-[11px] text-gray-500 dark:text-slate-400">
                {value.length} selecionado{value.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={limpar}
                className="text-[11px] text-rose-600 hover:underline dark:text-rose-400"
              >
                Limpar
              </button>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1">
            {filtradas.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">Nenhum resultado</div>
            ) : (
              filtradas.map(o => {
                const checked = value.includes(o.id);
                return (
                  <label
                    key={o.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.id)}
                      className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-slate-300 truncate">{o.nome}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
