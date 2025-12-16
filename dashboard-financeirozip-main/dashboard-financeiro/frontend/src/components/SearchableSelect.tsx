import React, { useState, useRef, useEffect } from 'react';

interface Option {
  id: number | string;
  nome: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: number | string | undefined;
  onChange: (value: number | string | undefined) => void;
  placeholder?: string;
  label: string;
  emptyText?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
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

  // Filtra opções baseado no termo de busca (busca por ID e nome)
  const filteredOptions = options.filter((option) =>
    option.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.id.toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Encontra a opção selecionada
  const selectedOption = options.find((opt) => opt.id === value);

  // Fecha o dropdown quando clicar fora
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

  // Foca no input quando abrir
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (optionId: number | string | undefined) => {
    onChange(optionId);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {label}
      </label>

      {/* Campo de exibição/busca */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:border-blue-500 focus:outline-none"
        >
          <span className={selectedOption ? 'text-gray-900' : 'text-gray-500'}>
            {selectedOption ? (
              <span>
                <span className="font-semibold text-blue-600">{selectedOption.id}</span>
                {' - '}
                {selectedOption.nome}
              </span>
            ) : (
              placeholder
            )}
          </span>
          <svg
            className={`absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown com busca */}
        {isOpen && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg">
            {/* Campo de busca */}
            <div className="border-b border-gray-200 p-2">
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Digite para pesquisar..."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Opção "Todos" */}
            <div className="max-h-60 overflow-auto">
              <button
                type="button"
                onClick={() => handleSelect(undefined)}
                className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                  !value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-900'
                }`}
              >
                {emptyText}
              </button>

              {/* Lista de opções filtradas */}
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelect(option.id)}
                    className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                      value === option.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-900'
                    }`}
                  >
                    <span className="font-semibold text-blue-600 mr-2">{option.id}</span>
                    <span className="flex-1">{option.nome}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-gray-500">
                  Nenhum resultado encontrado
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
