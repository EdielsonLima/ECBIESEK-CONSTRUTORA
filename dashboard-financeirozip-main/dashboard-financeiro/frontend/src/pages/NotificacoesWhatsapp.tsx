import React, { useEffect, useState } from 'react';
import { whatsappService, WhatsappConfig, WhatsappDestinatario, WhatsappLog } from '../services/api';

type Aba = 'config' | 'destinatarios' | 'teste' | 'logs';

const DESTINATARIO_VAZIO: Omit<WhatsappDestinatario, 'id' | 'created_at'> = {
  nome: '',
  telefone: '',
  alerta_vencimentos: true,
  alerta_inadimplencia: false,
  alerta_saldo_bancario: false,
  ativo: true,
};

export const NotificacoesWhatsapp: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('config');

  // Config
  const [config, setConfig] = useState<WhatsappConfig>({
    base_url: '',
    api_key: '',
    instance_name: 'ecbiesek',
    horario: '08:00',
    ativo: false,
    dias_antecedencia: '3,7',
    somente_dias_uteis: true,
  });
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [msgConfig, setMsgConfig] = useState<string | null>(null);
  const [apiKeyMascarada, setApiKeyMascarada] = useState<string>('');

  // Destinatarios
  const [destinatarios, setDestinatarios] = useState<WhatsappDestinatario[]>([]);
  const [editando, setEditando] = useState<WhatsappDestinatario | null>(null);
  const [novo, setNovo] = useState<Omit<WhatsappDestinatario, 'id' | 'created_at'>>(DESTINATARIO_VAZIO);
  const [salvandoDest, setSalvandoDest] = useState(false);
  const [msgDest, setMsgDest] = useState<string | null>(null);

  // Teste e preview
  const [telefoneTeste, setTelefoneTeste] = useState('');
  const [mensagemTeste, setMensagemTeste] = useState('Mensagem de teste do Dashboard ECBIESEK');
  const [msgTeste, setMsgTeste] = useState<string | null>(null);
  const [enviandoTeste, setEnviandoTeste] = useState(false);
  const [preview, setPreview] = useState<{ dias: number; quantidade: number; total: number; mensagem: string } | null>(null);
  const [diasPreview, setDiasPreview] = useState(3);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [disparando, setDisparando] = useState(false);

  // Logs
  const [logs, setLogs] = useState<WhatsappLog[]>([]);
  const [carregandoLogs, setCarregandoLogs] = useState(false);

  useEffect(() => {
    carregarConfig();
    carregarDestinatarios();
  }, []);

  useEffect(() => {
    if (abaAtiva === 'logs') carregarLogs();
  }, [abaAtiva]);

  const carregarConfig = async () => {
    try {
      const r = await whatsappService.getConfig();
      setConfig({ ...r, api_key: '' });
      setApiKeyMascarada(r.api_key_mascarada || '');
    } catch (e) {
      console.error(e);
    }
  };

  const carregarDestinatarios = async () => {
    try {
      const r = await whatsappService.listarDestinatarios();
      setDestinatarios(r);
    } catch (e) {
      console.error(e);
    }
  };

  const carregarLogs = async () => {
    setCarregandoLogs(true);
    try {
      const r = await whatsappService.listarLogs(100);
      setLogs(r);
    } catch (e) {
      console.error(e);
    } finally {
      setCarregandoLogs(false);
    }
  };

  const salvarConfig = async () => {
    setSalvandoConfig(true);
    setMsgConfig(null);
    try {
      await whatsappService.salvarConfig(config);
      setMsgConfig('Configuração salva com sucesso.');
      carregarConfig();
    } catch (e: unknown) {
      setMsgConfig('Erro ao salvar: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setSalvandoConfig(false);
      setTimeout(() => setMsgConfig(null), 4000);
    }
  };

  const salvarDestinatario = async () => {
    setSalvandoDest(true);
    setMsgDest(null);
    try {
      if (editando?.id) {
        await whatsappService.atualizarDestinatario(editando.id, {
          nome: editando.nome,
          telefone: editando.telefone,
          alerta_vencimentos: editando.alerta_vencimentos,
          alerta_inadimplencia: editando.alerta_inadimplencia,
          alerta_saldo_bancario: editando.alerta_saldo_bancario,
          ativo: editando.ativo,
        });
        setEditando(null);
      } else {
        if (!novo.nome || !novo.telefone) {
          setMsgDest('Preencha nome e telefone.');
          setSalvandoDest(false);
          return;
        }
        await whatsappService.criarDestinatario(novo);
        setNovo(DESTINATARIO_VAZIO);
      }
      carregarDestinatarios();
      setMsgDest('Salvo.');
    } catch (e: unknown) {
      setMsgDest('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setSalvandoDest(false);
      setTimeout(() => setMsgDest(null), 3000);
    }
  };

  const excluirDestinatario = async (id: number) => {
    if (!window.confirm('Excluir este destinatario?')) return;
    try {
      await whatsappService.deletarDestinatario(id);
      carregarDestinatarios();
    } catch (e) {
      console.error(e);
    }
  };

  const gerarPreview = async () => {
    setCarregandoPreview(true);
    try {
      const r = await whatsappService.preview(diasPreview);
      setPreview(r);
    } catch (e) {
      console.error(e);
    } finally {
      setCarregandoPreview(false);
    }
  };

  const enviarTeste = async () => {
    if (!telefoneTeste) return;
    setEnviandoTeste(true);
    setMsgTeste(null);
    try {
      const r = await whatsappService.testar(telefoneTeste, mensagemTeste);
      setMsgTeste(r.sucesso ? '✅ Enviado com sucesso.' : '❌ Falhou: ' + r.resposta);
    } catch (e: unknown) {
      setMsgTeste('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setEnviandoTeste(false);
    }
  };

  const dispararAgora = async () => {
    if (!window.confirm('Disparar alerta de vencimentos para TODOS os destinatarios ativos agora?')) return;
    setDisparando(true);
    setMsgTeste(null);
    try {
      const r = await whatsappService.dispararVencimentos();
      setMsgTeste(`Enviados: ${r.enviados} | Erros: ${r.erros.length}${r.erros.length ? ' — ' + r.erros.join('; ') : ''}`);
    } catch (e: unknown) {
      setMsgTeste('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setDisparando(false);
    }
  };

  const formatarTelefone = (tel: string) => {
    if (!tel) return '';
    const d = tel.replace(/\D/g, '');
    if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
    return tel;
  };

  const Aba: React.FC<{ id: Aba; label: string }> = ({ id, label }) => (
    <button
      onClick={() => setAbaAtiva(id)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        abaAtiva === id
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-slate-700 flex">
          <Aba id="config" label="Configuração" />
          <Aba id="destinatarios" label="Destinatários" />
          <Aba id="teste" label="Teste / Disparo" />
          <Aba id="logs" label="Histórico" />
        </div>

        <div className="p-6">
          {abaAtiva === 'config' && (
            <div className="space-y-4 max-w-2xl">
              <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200">Configuração do Evolution API</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Informe os dados da instância Evolution API auto-hospedada (ou qualquer provedor WhatsApp compatível com o endpoint <code>/message/sendText/&#123;instance&#125;</code>).
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Base URL</label>
                <input
                  type="text"
                  value={config.base_url}
                  onChange={(e) => setConfig({ ...config, base_url: e.target.value })}
                  placeholder="https://evolution.seu-dominio.up.railway.app"
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  API Key {apiKeyMascarada && <span className="text-xs text-gray-400 ml-2">(atual: {apiKeyMascarada})</span>}
                </label>
                <input
                  type="password"
                  value={config.api_key || ''}
                  onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
                  placeholder={apiKeyMascarada ? 'Deixe em branco para manter a atual' : 'AUTHENTICATION_API_KEY'}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Nome da instância</label>
                <input
                  type="text"
                  value={config.instance_name}
                  onChange={(e) => setConfig({ ...config, instance_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Horário do disparo diário</label>
                  <input
                    type="time"
                    value={config.horario}
                    onChange={(e) => setConfig({ ...config, horario: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Dias de antecedência (separados por vírgula)
                  </label>
                  <input
                    type="text"
                    value={config.dias_antecedencia}
                    onChange={(e) => setConfig({ ...config, dias_antecedencia: e.target.value })}
                    placeholder="3,7"
                    className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={config.somente_dias_uteis}
                  onChange={(e) => setConfig({ ...config, somente_dias_uteis: e.target.checked })}
                />
                Disparar apenas em dias úteis (pula sábados, domingos e feriados cadastrados)
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={config.ativo}
                  onChange={(e) => setConfig({ ...config, ativo: e.target.checked })}
                />
                Scheduler automático ativo
              </label>

              <button
                onClick={salvarConfig}
                disabled={salvandoConfig}
                className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {salvandoConfig ? 'Salvando...' : 'Salvar configuração'}
              </button>
              {msgConfig && <p className="text-sm text-gray-700 dark:text-slate-300">{msgConfig}</p>}
            </div>
          )}

          {abaAtiva === 'destinatarios' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200">Destinatários das notificações</h2>

              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4 bg-gray-50 dark:bg-slate-900/40">
                <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-slate-300">
                  {editando ? 'Editar destinatário' : 'Novo destinatário'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Nome"
                    value={editando?.nome ?? novo.nome}
                    onChange={(e) =>
                      editando
                        ? setEditando({ ...editando, nome: e.target.value })
                        : setNovo({ ...novo, nome: e.target.value })
                    }
                    className="px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Telefone (ex: 69999998888)"
                    value={editando?.telefone ?? novo.telefone}
                    onChange={(e) =>
                      editando
                        ? setEditando({ ...editando, telefone: e.target.value })
                        : setNovo({ ...novo, telefone: e.target.value })
                    }
                    className="px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-700 dark:text-slate-300">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editando?.alerta_vencimentos ?? novo.alerta_vencimentos}
                      onChange={(e) =>
                        editando
                          ? setEditando({ ...editando, alerta_vencimentos: e.target.checked })
                          : setNovo({ ...novo, alerta_vencimentos: e.target.checked })
                      }
                    />
                    Vencimentos próximos
                  </label>
                  <label className="flex items-center gap-2 opacity-60">
                    <input
                      type="checkbox"
                      checked={editando?.alerta_inadimplencia ?? novo.alerta_inadimplencia}
                      onChange={(e) =>
                        editando
                          ? setEditando({ ...editando, alerta_inadimplencia: e.target.checked })
                          : setNovo({ ...novo, alerta_inadimplencia: e.target.checked })
                      }
                    />
                    Inadimplência (em breve)
                  </label>
                  <label className="flex items-center gap-2 opacity-60">
                    <input
                      type="checkbox"
                      checked={editando?.alerta_saldo_bancario ?? novo.alerta_saldo_bancario}
                      onChange={(e) =>
                        editando
                          ? setEditando({ ...editando, alerta_saldo_bancario: e.target.checked })
                          : setNovo({ ...novo, alerta_saldo_bancario: e.target.checked })
                      }
                    />
                    Saldo bancário (em breve)
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editando?.ativo ?? novo.ativo}
                      onChange={(e) =>
                        editando
                          ? setEditando({ ...editando, ativo: e.target.checked })
                          : setNovo({ ...novo, ativo: e.target.checked })
                      }
                    />
                    Ativo
                  </label>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={salvarDestinatario}
                    disabled={salvandoDest}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {salvandoDest ? 'Salvando...' : editando ? 'Atualizar' : 'Adicionar'}
                  </button>
                  {editando && (
                    <button
                      onClick={() => setEditando(null)}
                      className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-md text-sm font-semibold"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
                {msgDest && <p className="text-sm text-gray-600 dark:text-slate-400 mt-2">{msgDest}</p>}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
                    <tr>
                      <th className="text-left px-3 py-2">Nome</th>
                      <th className="text-left px-3 py-2">Telefone</th>
                      <th className="text-center px-3 py-2">Vencimentos</th>
                      <th className="text-center px-3 py-2">Ativo</th>
                      <th className="text-center px-3 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {destinatarios.map((d) => (
                      <tr key={d.id} className="border-b border-gray-100 dark:border-slate-700">
                        <td className="px-3 py-2 text-gray-800 dark:text-slate-200">{d.nome}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-slate-400">{formatarTelefone(d.telefone)}</td>
                        <td className="px-3 py-2 text-center">{d.alerta_vencimentos ? '✅' : '—'}</td>
                        <td className="px-3 py-2 text-center">{d.ativo ? '✅' : '❌'}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => setEditando(d)} className="text-blue-600 hover:underline text-xs mr-3">
                            Editar
                          </button>
                          <button onClick={() => d.id && excluirDestinatario(d.id)} className="text-red-600 hover:underline text-xs">
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                    {destinatarios.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center px-3 py-6 text-gray-400">
                          Nenhum destinatário cadastrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {abaAtiva === 'teste' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-slate-300">Enviar mensagem de teste</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Telefone (com DDI, ex: 5569999998888)"
                    value={telefoneTeste}
                    onChange={(e) => setTelefoneTeste(e.target.value)}
                    className="px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                  />
                  <input
                    type="text"
                    value={mensagemTeste}
                    onChange={(e) => setMensagemTeste(e.target.value)}
                    className="px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                <button
                  onClick={enviarTeste}
                  disabled={enviandoTeste}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {enviandoTeste ? 'Enviando...' : 'Enviar teste'}
                </button>
                {msgTeste && <p className="text-sm text-gray-700 dark:text-slate-300 mt-2">{msgTeste}</p>}
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-slate-300">Prévia da mensagem de vencimentos</h3>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 dark:text-slate-400">Dias de antecedência:</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={diasPreview}
                    onChange={(e) => setDiasPreview(parseInt(e.target.value) || 3)}
                    className="w-20 px-2 py-1 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                  />
                  <button
                    onClick={gerarPreview}
                    disabled={carregandoPreview}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-md text-sm hover:bg-gray-200 disabled:opacity-50"
                  >
                    {carregandoPreview ? 'Carregando...' : 'Gerar prévia'}
                  </button>
                </div>
                {preview && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
                      {preview.quantidade} títulos, total R$ {preview.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <pre className="whitespace-pre-wrap bg-gray-50 dark:bg-slate-900/60 p-3 rounded text-xs text-gray-700 dark:text-slate-300">
                      {preview.mensagem}
                    </pre>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-red-200 dark:border-red-800/40 p-4 bg-red-50/40 dark:bg-red-900/10">
                <h3 className="font-semibold text-sm mb-2 text-red-800 dark:text-red-300">Disparo manual</h3>
                <p className="text-xs text-red-700 dark:text-red-400 mb-3">
                  Envia o alerta de vencimentos para TODOS os destinatários ativos agora mesmo (usa os dias de antecedência configurados).
                </p>
                <button
                  onClick={dispararAgora}
                  disabled={disparando}
                  className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {disparando ? 'Disparando...' : 'Disparar agora'}
                </button>
              </div>
            </div>
          )}

          {abaAtiva === 'logs' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200">Histórico de envios</h2>
                <button
                  onClick={carregarLogs}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-md text-sm hover:bg-gray-200"
                >
                  Atualizar
                </button>
              </div>
              {carregandoLogs ? (
                <p className="text-sm text-gray-500 dark:text-slate-400">Carregando...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-slate-900/60 text-gray-600 dark:text-slate-400">
                      <tr>
                        <th className="text-left px-3 py-2">Data/Hora</th>
                        <th className="text-left px-3 py-2">Tipo</th>
                        <th className="text-left px-3 py-2">Destinatário</th>
                        <th className="text-center px-3 py-2">Status</th>
                        <th className="text-left px-3 py-2">Resposta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l) => (
                        <tr key={l.id} className="border-b border-gray-100 dark:border-slate-700 align-top">
                          <td className="px-3 py-2 text-gray-600 dark:text-slate-400 whitespace-nowrap">
                            {new Date(l.enviado_em.endsWith('Z') ? l.enviado_em : l.enviado_em + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                          </td>
                          <td className="px-3 py-2 text-gray-700 dark:text-slate-300">{l.tipo}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-slate-300">
                            {l.destinatario_nome || '—'}<br />
                            <span className="text-xs text-gray-400">{formatarTelefone(l.destinatario_telefone)}</span>
                          </td>
                          <td className="px-3 py-2 text-center">{l.sucesso ? '✅' : '❌'}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 dark:text-slate-400 max-w-lg truncate" title={l.resposta_api || ''}>
                            {l.resposta_api || '—'}
                          </td>
                        </tr>
                      ))}
                      {logs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center px-3 py-6 text-gray-400">
                            Nenhum envio registrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
