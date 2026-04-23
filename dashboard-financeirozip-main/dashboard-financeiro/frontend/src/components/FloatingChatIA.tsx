import React, { useState, useRef, useEffect } from 'react';
import { apiService } from '../services/api';
import Markdown from 'markdown-to-jsx';
import { Send, Bot, User, Loader2, Sparkles, X, Maximize2 } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface FloatingChatIAProps {
  onExpandir?: () => void; // abre a pagina completa (ChatIA)
}

export const FloatingChatIA: React.FC<FloatingChatIAProps> = ({ onExpandir }) => {
  const [aberto, setAberto] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: 'Olá! Sou seu **Analista Financeiro de IA**. Pergunte sobre contas a pagar, saldos, vencimentos ou KPIs da ECBIESEK.'
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [temNovaMsg, setTemNovaMsg] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (aberto) scrollToBottom();
  }, [messages, isLoading, aberto]);

  useEffect(() => {
    if (aberto) {
      setTemNovaMsg(false);
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [aberto]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user', content: userMsg } as ChatMessage];
    setMessages(newMessages);
    setIsLoading(true);
    try {
      const response = await apiService.chatIA(newMessages);
      setMessages([...newMessages, { role: 'assistant', content: response.reply }]);
      if (!aberto) setTemNovaMsg(true);
    } catch {
      setMessages([...newMessages, {
        role: 'assistant',
        content: '**[Erro]** Não consegui conectar ao servidor de IA agora. Tente novamente em instantes.',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const sugestoesRapidas = [
    'Contas a pagar hoje?',
    'Top credores vencendo hoje',
    'Resumo financeiro',
  ];

  return (
    <>
      {/* Botão flutuante (sempre visível quando fechado) */}
      {!aberto && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="fixed bottom-6 right-6 z-[60] group flex items-center gap-2 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-[0_8px_30px_-4px_rgba(124,58,237,0.6)] hover:shadow-[0_12px_40px_-4px_rgba(124,58,237,0.8)] transition-all duration-300 hover:scale-105"
          aria-label="Abrir chat com IA"
        >
          <div className="relative p-4">
            <Sparkles className="h-6 w-6" />
            {temNovaMsg && (
              <span className="absolute top-2 right-2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            )}
          </div>
          <span className="pr-5 pl-1 font-semibold text-sm hidden md:inline-block max-w-0 group-hover:max-w-[150px] overflow-hidden transition-all duration-300 whitespace-nowrap opacity-0 group-hover:opacity-100">
            Pergunte à IA
          </span>
        </button>
      )}

      {/* Janela do chat (flutuante) */}
      {aberto && (
        <div className="fixed bottom-6 right-6 z-[60] w-[min(420px,calc(100vw-3rem))] h-[min(620px,calc(100vh-3rem))] flex flex-col rounded-2xl shadow-[0_20px_60px_-8px_rgba(0,0,0,0.4)] border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 flex items-center justify-between text-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm truncate">Analista de IA</h3>
                <p className="text-[11px] text-purple-100 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse"></span>
                  Online
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {onExpandir && (
                <button
                  type="button"
                  onClick={() => { setAberto(false); onExpandir(); }}
                  title="Abrir em tela cheia"
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setAberto(false)}
                title="Fechar"
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-3 py-3 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 custom-scrollbar">
            <div className="space-y-3">
              {messages.map((msg, i) => {
                const isAss = msg.role === 'assistant';
                return (
                  <div key={i} className={`flex ${isAss ? 'justify-start' : 'justify-end'}`}>
                    <div className={`flex gap-2 max-w-[90%] ${isAss ? 'flex-row' : 'flex-row-reverse'}`}>
                      <div className="flex-shrink-0 mt-0.5">
                        {isAss ? (
                          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-sm">
                            <Bot className="text-white h-4 w-4" />
                          </div>
                        ) : (
                          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm">
                            <User className="text-white h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className={`px-3 py-2 rounded-xl text-[13.5px] leading-relaxed shadow-sm ${
                        isAss
                          ? 'bg-white dark:bg-slate-700/60 border border-gray-200 dark:border-slate-600 text-gray-800 dark:text-slate-200 rounded-tl-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-strong:text-purple-900 dark:prose-strong:text-purple-300'
                          : 'bg-slate-800 text-white rounded-tr-sm'
                      }`}>
                        {isAss ? <Markdown>{msg.content}</Markdown> : msg.content}
                      </div>
                    </div>
                  </div>
                );
              })}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-2">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-sm">
                      <Loader2 className="text-white h-4 w-4 animate-spin" />
                    </div>
                    <div className="bg-white dark:bg-slate-700/60 border border-gray-200 dark:border-slate-600 px-3 py-2 rounded-xl rounded-tl-sm shadow-sm flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                      <div className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Sugestões rápidas (só quando 1 mensagem) */}
            {messages.length === 1 && !isLoading && (
              <div className="mt-4 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide font-bold text-gray-400 dark:text-slate-500 px-1">Perguntas rápidas:</p>
                {sugestoesRapidas.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setInput(s)}
                    className="w-full text-left px-3 py-2 text-xs bg-white dark:bg-slate-700/40 hover:bg-purple-50 dark:hover:bg-purple-900/30 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:border-purple-300 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex-shrink-0 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }
                }}
                placeholder="Pergunte algo..."
                className="flex-1 resize-none bg-slate-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-800 dark:text-slate-200 placeholder:text-gray-400 max-h-24"
                rows={1}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className={`flex-shrink-0 p-2.5 rounded-xl transition-all ${
                  !input.trim() || isLoading
                    ? 'bg-gray-100 dark:bg-slate-700 text-gray-400'
                    : 'bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md'
                }`}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-1.5">Respostas por IA — pode conter imprecisões.</p>
          </form>
        </div>
      )}
    </>
  );
};
