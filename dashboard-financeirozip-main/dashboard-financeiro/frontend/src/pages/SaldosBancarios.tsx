import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import { apiService } from '../services/api';
import { ContaCorrenteOption, EmpresaOption, SaldoBancarioResumo, SaldoBancarioRegistro } from '../types';

interface OptionItem {
  label: string;
  value: number | string;
}

const currency = (v: number | null | undefined) =>
  v !== null && v !== undefined
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
    : '—';

const MultiSelect: React.FC<{
  options: OptionItem[];
  values: Array<string | number>;
  onChange: (vals: Array<string | number>) => void;
  placeholder: string;
}> = ({ options, values, onChange, placeholder }) => {
  const toggle = (v: string | number) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-3 space-y-2 shadow-sm">
      <div className="text-sm font-semibold text-gray-700 dark:text-slate-200">{placeholder}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              values.includes(opt.value)
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export const SaldosBancarios: React.FC = () => {
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [contas, setContas] = useState<ContaCorrenteOption[]>([]);
  const [empSel, setEmpSel] = useState<number[]>([]);
  const [contaSel, setContaSel] = useState<string[]>([]);
  const [resumo, setResumo] = useState<SaldoBancarioResumo | null>(null);
  const [detalhe, setDetalhe] = useState<SaldoBancarioRegistro[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiService.getEmpresas().then(setEmpresas).catch(() => {});
    apiService.getContasCorrente().then(setContas).catch(() => {});
  }, []);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setErro(null);
      try {
        const [r, d] = await Promise.all([
          apiService.getSaldosResumo(empSel, contaSel),
          apiService.getSaldosDetalhe(empSel, contaSel),
        ]);
        setResumo(r);
        setDetalhe(d);
      } catch (e) {
        setErro('Não foi possível carregar os saldos agora.');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [empSel, contaSel]);

  const empresasOpt: OptionItem[] = useMemo(
    () => empresas.map((e) => ({ label: e.nome, value: e.id })),
    [empresas]
  );
  const contasOpt: OptionItem[] = useMemo(
    () =>
      contas.map((c) => ({
        label: `${c.nome} (${c.empresa_id})`,
        value: c.id,
      })),
    [contas]
  );

  const barData =
    resumo?.empresas
      ?.filter((e) => e && typeof e.saldo === 'number')
      .map((e) => ({ name: e.empresa_nome, saldo: e.saldo ?? 0 })) ?? [];
  const contasData =
    resumo?.contas
      ?.filter((c) => c && typeof c.saldo === 'number')
      .map((c) => ({
        name: `${c.empresa_nome} - ${c.conta_corrente} (${c.banco})`,
        saldo: c.saldo ?? 0,
      })) ?? [];
  const serieData =
    resumo?.serie
      ?.filter((p) => p && typeof p.saldo === 'number')
      .map((p) => ({ data: p.data, saldo: p.saldo ?? 0 })) ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <MultiSelect options={empresasOpt} values={empSel} onChange={(v) => setEmpSel(v as number[])} placeholder="Empresas" />
        </div>
        <div className="flex-1">
          <MultiSelect options={contasOpt} values={contaSel} onChange={(v) => setContaSel(v as string[])} placeholder="Contas correntes" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1">Saldo total</p>
          <p className="text-4xl font-extrabold text-gray-900 dark:text-white">
            {resumo ? currency(resumo.saldo_total) : '—'}
          </p>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {resumo ? `${resumo.empresas.length} empresas • ${resumo.contas.length} contas` : 'Carregando...'}
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">Status</p>
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Atualizando saldos...</p>
          ) : erro ? (
            <p className="text-sm text-red-500">{erro}</p>
          ) : (
            <p className="text-sm text-emerald-600 dark:text-emerald-300">Dados atualizados</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Saldo por empresa</h3>
            <span className="text-xs text-gray-500 dark:text-slate-400">Top empresas</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={barData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tickFormatter={currency} />
                <YAxis type="category" dataKey="name" width={180} />
                <Tooltip formatter={(v: number) => currency(v)} />
                <Bar dataKey="saldo" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Contas por empresa</h3>
            <span className="text-xs text-gray-500 dark:text-slate-400">Saldo atual</span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
            {contasData.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="text-sm text-gray-700 dark:text-slate-200">{c.name}</div>
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">{currency(c.saldo ?? 0)}</div>
              </div>
            ))}
            {!contasData.length && <p className="text-sm text-gray-500 dark:text-slate-400 py-2">Nenhuma conta encontrada.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Evolução do saldo</h3>
          <Legend />
        </div>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={serieData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="data" />
              <YAxis tickFormatter={currency} />
              <Tooltip formatter={(v: number) => currency(v)} />
              <Line type="monotone" dataKey="saldo" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Detalhamento</h3>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500 dark:text-slate-400">
              <tr>
                <th className="py-2 pr-4">Empresa</th>
                <th className="py-2 pr-4">Banco</th>
                <th className="py-2 pr-4">Conta</th>
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4 text-right">Entrada</th>
                <th className="py-2 pr-4 text-right">Saída</th>
                <th className="py-2 pr-4 text-right">Saldo Atual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {detalhe.map((r, i) => (
                <tr key={i} className="text-gray-700 dark:text-slate-200">
                  <td className="py-2 pr-4">{r.empresa_nome}</td>
                  <td className="py-2 pr-4">{r.banco}</td>
                  <td className="py-2 pr-4">{r.conta_corrente}</td>
                  <td className="py-2 pr-4">{r.data_movimento}</td>
                  <td className="py-2 pr-4 text-right text-emerald-600">{currency(r.entrada ?? 0)}</td>
                  <td className="py-2 pr-4 text-right text-red-500">{currency(r.saida ?? 0)}</td>
                  <td className="py-2 pr-4 text-right font-semibold">{currency(r.saldo_atual ?? 0)}</td>
                </tr>
              ))}
              {!detalhe.length && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-500 dark:text-slate-400">
                    Nenhum lançamento encontrado para os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
