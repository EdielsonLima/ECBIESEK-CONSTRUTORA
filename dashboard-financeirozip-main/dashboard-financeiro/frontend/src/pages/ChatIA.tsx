import React, { useState, useRef, useEffect } from 'react';
import { apiService } from '../services/api';
import Markdown from 'markdown-to-jsx';
import { Send, Bot, User, Loader2, Sparkles, TrendingUp, AlertCircle } from 'lucide-react';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export const ChatIA: React.FC = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([{
        role: 'assistant',
        content: 'Olá! Sou seu Analista Financeiro de IA. Posso analisar nosso Dashboard, buscar insights sobre pagamentos, identificar centros de custo problemáticos ou gerar resumos. Como posso ajudar com os dados da ECBIESEK-CONSTRUTORA hoje?'
    }]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

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
        } catch (error) {
            console.error('Erro no chat IA:', error);
            setMessages([...newMessages, {
                role: 'assistant',
                content: '**[Erro]** Não consegui me conectar ao servidor de IA no momento. Por favor, verifique se a API Key está configurada no backend.'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const sugestoes = [
        "Quais as métricas principais hoje?",
        "Identifique centros de custo anormais",
        "Gere um resumo financeiro",
        "Por favor, ajude com a Exposição de Caixa"
    ];

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-50 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 pointer-events-none translate-y-1/2 -translate-x-1/2"></div>

            {/* Header section */}
            <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between z-10 shadow-sm relative">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                        <Sparkles className="text-white h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-700 to-blue-800">Analista de IA</h1>
                        <p className="text-sm text-gray-500 font-medium flex items-center gap-1.5">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                            </span>
                            Inteligência Artificial Operante
                        </p>
                    </div>
                </div>
                <div className="hidden lg:flex gap-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-100 font-medium text-sm">
                        <TrendingUp className="h-4 w-4" /> Dados atualizados
                    </div>
                </div>
            </div>

            {/* Sugestões Iniciais */}
            {messages.length === 1 && (
                <div className="max-w-4xl mx-auto w-full px-4 mt-8 mb-4 z-10 relative">
                    <p className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2 uppercase tracking-wide">
                        <AlertCircle className="h-4 w-4" /> Sugestões para perguntar:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {sugestoes.map((sug, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    setInput(sug);
                                    setTimeout(() => {
                                        document.getElementById('chat-input')?.focus();
                                    }, 50);
                                }}
                                className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm text-left text-sm text-gray-700 font-medium hover:border-purple-300 hover:shadow-md hover:bg-purple-50/50 transition-all flex items-center gap-3 group whitespace-nowrap overflow-hidden text-ellipsis"
                            >
                                <div className="h-8 w-8 shrink-0 rounded-lg bg-gray-100 group-hover:bg-purple-100 flex items-center justify-center transition-colors">
                                    <Bot className="h-4 w-4 text-gray-500 group-hover:text-purple-600" />
                                </div>
                                {sug}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-6 z-10 custom-scrollbar">
                <div className="max-w-4xl mx-auto space-y-6 flex flex-col justify-end min-h-full">
                    {messages.map((msg, index) => {
                        const isAss = msg.role === 'assistant';
                        return (
                            <div key={index} className={`flex ${isAss ? 'justify-start' : 'justify-end'}`}>
                                <div className={`flex gap-4 max-w-[85%] ${isAss ? 'flex-row' : 'flex-row-reverse'}`}>

                                    {/* Avatar */}
                                    <div className="flex-shrink-0 mt-1">
                                        {isAss ? (
                                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-md">
                                                <Bot className="text-white h-5 w-5" />
                                            </div>
                                        ) : (
                                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-md border border-slate-600">
                                                <User className="text-white h-5 w-5" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Bubble */}
                                    <div className={`
                    px-5 py-4 rounded-2xl shadow-sm text-[15px] leading-relaxed relative
                    ${isAss
                                            ? 'bg-white border text-gray-800 border-gray-200/60 rounded-tl-none prose prose-p:my-1 prose-strong:text-purple-900 prose-ul:my-2 prose-li:my-0'
                                            : 'bg-slate-800 text-white rounded-tr-none shadow-slate-900/10'}
                  `}>
                                        {isAss ? (
                                            <Markdown>{msg.content}</Markdown>
                                        ) : (
                                            msg.content
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="flex gap-4">
                                <div className="flex-shrink-0 mt-1">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-md">
                                        <Loader2 className="text-white h-5 w-5 animate-spin" />
                                    </div>
                                </div>
                                <div className="bg-white border border-gray-200/60 p-5 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                                    <div className="flex space-x-1.5">
                                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                                        <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                                    </div>
                                    <span className="text-sm text-gray-500 font-medium ml-2">Analisando dados...</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input area */}
            <div className="p-4 bg-white/80 backdrop-blur-md border-t border-gray-200 z-20 pb-8">
                <div className="max-w-4xl mx-auto relative">
                    <form onSubmit={handleSubmit} className="relative flex items-end gap-3 bg-white p-2 rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-gray-100">
                        <textarea
                            id="chat-input"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e as any);
                                }
                            }}
                            placeholder="Pergunte sobre seus pagamentos, centro de custo problemático ou resumo financeiro..."
                            className="w-full bg-transparent border-0 resize-none max-h-32 min-h-[44px] px-3 py-2.5 focus:ring-0 text-slate-700 placeholder:text-slate-400 font-medium text-[15px]"
                            rows={input.split('\n').length > 1 ? Math.min(input.split('\n').length, 5) : 1}
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className={`flex-shrink-0 p-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 mb-0.5 mr-0.5
                ${!input.trim() || isLoading
                                    ? 'bg-slate-100 text-slate-400'
                                    : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/30'}`}
                        >
                            <Send className="h-5 w-5 ml-0.5" />
                            <span className="sr-only">Enviar</span>
                        </button>
                    </form>
                    <div className="text-center mt-3 mb-1 absolute w-full -bottom-7">
                        <span className="text-[11px] font-semibold text-slate-400 tracking-wide uppercase">
                            Respostas geradas por inteligência artificial podem conter imprecisões e ainda está em fase beta.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
