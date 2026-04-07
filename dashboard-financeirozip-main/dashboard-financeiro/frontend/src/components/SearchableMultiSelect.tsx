import React, { useState, useRef, useEffect } from 'react';

interface Option {
  id: number | string;
  nome: string;
}

interface SearchableMultiSelectProps {
  options: Option[];
  value: (number | string)[];
  onChange: (value: (number | string)[]) => void;
  placeholder?: string;
  label: string;
  emptyText?: string;
}

export const SearchableMultiSelect: React.FC<SearchableMultiSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  label,
  emptyText = 'Todos',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = options.filter((option) =>
    option.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.id.toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const toggleOption = (optionId: number | string) => {
    if (value.includes(optionId)) {
      onChange(value.filter(v => v !== optionId));
    } else {
      onChange([...value, optionId]);
    }
  };

  const selectAll = () => {
    onChange(options.map(o => o.id));
  };

  const clearAll = () => {
    onChange([]);
    setSearchTerm('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const displayText = () => {
    if (value.length === 0) return emptyText;
    if (value.length === options.length) return emptyText;
    if (value.length === 1) {
      const opt = options.find(o => o.id === value[0]);
      return opt ? opt.nome : '1 selecionado';
    }
    return `${value.length} selecionado(s)`;
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-left focus:border-red-500 focus:outline-none"
      >
        <span className={value.length > 0 && value.length < options.length ? 'text-gray-900 dark:text-slate-100' : 'text-gray-500 dark:text-slate-400'}>
          {displayText()}
        </span>
        <svg
          className={`absolute right-3 top-9 h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg">
          <div className="border-b border-gray-200 dark:border-slate-700 p-2">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Digite para pesquisar..."
              className="w-full rounded border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
            />
          </div>
          <div className="border-b border-gray-200 dark:border-slate-700 p-2 flex gap-2">
            <button type="button" onClick={selectAll} className="text-xs text-red-600 dark:text-red-400 hover:underline">
              Todos
            </button>
            <button type="button" onClick={clearAll} className="text-xs text-gray-500 dark:text-slate-400 hover:underline">
              Limpar
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto p-2">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <label key={option.id} className="flex cursor-pointer items-center gap-2 py-1 hover:bg-gray-50 dark:bg-slate-900 rounded px-1">
                  <input
                    type="checkbox"
                    checked={value.includes(option.id)}
                    onChange={() => toggleOption(option.id)}
                    className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-red-600 dark:text-red-400 focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-slate-300">
                    {option.nome}
                  </span>
                </label>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">Nenhum resultado encontrado</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
