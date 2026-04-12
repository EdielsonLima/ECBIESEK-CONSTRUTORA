import React, { useState } from 'react';
import { authService } from '../services/api';

interface LoginProps {
  onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await authService.login(email, senha);
      onLoginSuccess();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'E-mail ou senha incorretos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900">
      <div className="flex min-h-screen flex-col md:flex-row">
        <div className="relative flex-1 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 px-8 py-10 md:px-14 lg:px-16 flex items-center justify-center overflow-hidden">
          <div className="absolute -left-24 -top-32 h-72 w-72 bg-blue-100/60 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -right-10 bottom-0 h-64 w-64 bg-indigo-100/50 blur-3xl rounded-full pointer-events-none" />

          <div className="w-full max-w-xl relative z-10">
            <div className="mb-10">
              <div className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]">
                Acesso Seguro
              </div>
              <h1 className="mt-6 text-4xl font-bold text-slate-900 dark:text-white leading-tight font-['Sora']">
                Bem-vindo de volta
              </h1>
              <p className="mt-3 text-base text-slate-500 dark:text-slate-300 max-w-xl">
                Entre para acessar o painel da ECBIESEK-CONSTRUTORA. Use seu e-mail corporativo ou telefone cadastrado.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 shadow-sm">
                {error}
              </div>
            )}

            <div className="bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xl shadow-blue-500/5 backdrop-blur-sm p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">E-mail ou Telefone</label>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900/40 transition">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12.79V12a9 9 0 10-9 9h.79M15 9l-6 6m0-6l6 6" />
                    </svg>
                    <input
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-slate-400"
                      placeholder="email@exemplo.com ou (11) 99999-9999"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Senha</label>
                    <button type="button" className="text-xs font-semibold text-blue-700 hover:text-blue-800">
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900/40 transition">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c1.657 0 3-1.567 3-3.5S13.657 4 12 4s-3 1.567-3 3.5S10.343 11 12 11z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 20c0-2.21 2.686-4 6-4s6 1.79 6 4" />
                    </svg>
                    <input
                      type="password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-slate-400"
                      placeholder="••••••••"
                      required
                    />
                    <button type="button" className="text-slate-400 hover:text-slate-500" aria-label="mostrar senha">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        <circle cx="12" cy="12" r="3" strokeWidth={1.5} />
                      </svg>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-700 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-800 shadow-lg shadow-blue-500/25 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processando...
                    </span>
                  ) : (
                    'Entrar'
                  )}
                </button>

                <div className="text-sm text-slate-500 dark:text-slate-400 text-center">
                  Precisa de acesso? Solicite ao administrador do sistema.
                </div>
              </form>
            </div>

            <div className="mt-10 flex items-center gap-4 text-xs uppercase tracking-[0.18em] text-slate-400">
              <span className="h-px w-10 bg-slate-200" />
              Sistema protegido por autenticação segura
              <span className="h-px w-10 bg-slate-200" />
            </div>
          </div>
        </div>

        <div className="relative md:w-[44%] lg:w-[42%] hidden md:flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0b1020] via-[#111a30] to-[#090f1d]" />
          <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.04) 0, transparent 28%), radial-gradient(circle at 80% 0%, rgba(0,122,255,0.15) 0, transparent 32%), radial-gradient(circle at 70% 70%, rgba(255,255,255,0.05) 0, transparent 30%)' }} />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.05)_0,rgba(255,255,255,0)_25%)]" />

          <div className="relative z-10 flex flex-col items-center text-white px-10">
            <div className="bg-white/10 border border-white/10 rounded-full px-4 py-2 text-xs uppercase tracking-[0.24em] mb-6">
              ECBIESEK • Construção Inteligente
            </div>
            <img
              src="/logo-ecbiesek-full.svg"
              alt="Logotipo ECBIESEK"
              className="w-56 drop-shadow-[0_18px_40px_rgba(0,0,0,0.35)] mb-8"
            />
            <p className="max-w-md text-center text-slate-200 leading-relaxed">
              Traga a identidade da empresa para o login: coloque aqui uma foto da obra, o render 3D do empreendimento ou qualquer arte institucional.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
