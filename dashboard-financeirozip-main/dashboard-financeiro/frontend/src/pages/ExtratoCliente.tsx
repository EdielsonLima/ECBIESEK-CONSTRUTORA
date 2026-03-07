import React, { useState, useEffect } from 'react';
import { SearchableSelect } from '../components/SearchableSelect';
import { apiService } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface Parcela {
  titulo: string;
  parcela: number;
  tipo_condicao: string;
  data_vencimento: string | null;
  valor_nominal: number;
  correcao_monetaria: number;
  valor_corrigido: number;
  acrescimo: number;
  desconto: number;
  data_baixa: string | null;
  valor_baixa: number;
  dias_atraso: number;
  status: string;
}

interface ExtratoData {
  header: {
    cliente: string;
    empresa: string;
    empreendimento: string;
    documento: string;
  };
  parcelas: Parcela[];
  totais: {
    total_nominal: number;
    total_correcao: number;
    total_corrigido: number;
    total_original: number;
    total_recebido: number;
    total_a_receber: number;
    total_atrasado: number;
    total_acrescimo: number;
    quantidade_parcelas: number;
  };
  calculo_incc_manual?: boolean;
  titulos_incc_manual?: string[];
}

export const ExtratoCliente: React.FC = () => {
  const [clientes, setClientes] = useState<Array<{ id: string; nome: string }>>([]);
  const [titulos, setTitulos] = useState<Array<{ id: string; nome: string }>>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<string | null>(null);
  const [tituloSelecionado, setTituloSelecionado] = useState<string | null>(null);
  const [extrato, setExtrato] = useState<ExtratoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [ordenacao, setOrdenacao] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({ campo: 'data_vencimento', direcao: 'asc' });

  useEffect(() => {
    carregarClientes();
  }, []);

  useEffect(() => {
    if (clienteSelecionado) {
      carregarTitulos(clienteSelecionado);
      setTituloSelecionado(null);
    } else {
      setTitulos([]);
      setExtrato(null);
    }
  }, [clienteSelecionado]);

  useEffect(() => {
    if (clienteSelecionado) {
      carregarExtrato();
    }
  }, [clienteSelecionado, tituloSelecionado]);

  const carregarClientes = async () => {
    try {
      setLoadingClientes(true);
      const data = await apiService.getClientesLista();
      setClientes(data.map(c => ({ id: c.id, nome: c.nome })));
    } catch (err) {
      console.error('Erro ao carregar clientes:', err);
    } finally {
      setLoadingClientes(false);
    }
  };

  const carregarTitulos = async (cliente: string) => {
    try {
      const data = await apiService.getTitulosCliente(cliente);
      setTitulos(data.map(t => ({ id: t.id, nome: t.nome })));
    } catch (err) {
      console.error('Erro ao carregar títulos:', err);
    }
  };

  const carregarExtrato = async () => {
    if (!clienteSelecionado) return;
    try {
      setLoading(true);
      const data = await apiService.getExtratoCliente(clienteSelecionado, tituloSelecionado || undefined);
      setExtrato(data);
    } catch (err) {
      console.error('Erro ao carregar extrato:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleInccManual = async () => {
    if (!clienteSelecionado || !tituloSelecionado) return;
    const novoEstado = !(extrato?.calculo_incc_manual || false);
    try {
      await apiService.toggleTituloInccManual(clienteSelecionado, tituloSelecionado, novoEstado);
      await carregarExtrato();
    } catch (err) {
      console.error('Erro ao alterar cálculo INCC:', err);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const parts = dateString.split('T')[0].split('-');
    if (parts.length !== 3) return '-';
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Recebido': return 'bg-green-100 text-green-800 border border-green-200';
      case 'Atrasado': return 'bg-red-100 text-red-800 border border-red-200';
      default: return 'bg-blue-100 text-blue-800 border border-blue-200';
    }
  };

  const corTipoCondicao = (tc: string | undefined): string => {
    if (!tc) return 'bg-gray-100 text-gray-600';
    const val = tc.trim().toLowerCase();
    if (val.includes('mensal') || val === 'pm') return 'bg-blue-100 text-blue-700 border border-blue-200';
    if (val.includes('semestral') || val === 'ps') return 'bg-purple-100 text-purple-700 border border-purple-200';
    if (val.includes('contrato') || val === 'co') return 'bg-green-100 text-green-700 border border-green-200';
    if (val.includes('dito') || val === 'cr') return 'bg-teal-100 text-teal-700 border border-teal-200';
    if (val === 'ato' || val === 'at') return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
    if (val.includes('financ') || val === 'fi') return 'bg-orange-100 text-orange-700 border border-orange-200';
    if (val.includes('duo') || val === 're') return 'bg-red-100 text-red-700 border border-red-200';
    if (val.includes('o') || val === 'pb') return 'bg-pink-100 text-pink-700 border border-pink-200';
    if (val.includes('especiai') || val === 'pe') return 'bg-indigo-100 text-indigo-700 border border-indigo-200';
    if (val.includes('intermedi') || val === 'pi') return 'bg-cyan-100 text-cyan-700 border border-cyan-200';
    return 'bg-gray-100 text-gray-600 border border-gray-200';
  };

  const toggleOrdenacao = (campo: string) => {
    setOrdenacao(prev => ({
      campo,
      direcao: prev.campo === campo && prev.direcao === 'asc' ? 'desc' : 'asc',
    }));
  };

  const renderSortIcon = (campo: string) => {
    if (ordenacao.campo !== campo) return <span className="ml-1 text-gray-300">&#8597;</span>;
    return <span className="ml-1 text-green-600">{ordenacao.direcao === 'asc' ? '▲' : '▼'}</span>;
  };

  const ordenarParcelas = (parcelas: Parcela[]): Parcela[] => {
    return [...parcelas].sort((a, b) => {
      const dir = ordenacao.direcao === 'asc' ? 1 : -1;
      switch (ordenacao.campo) {
        case 'titulo': return dir * String(a.titulo).localeCompare(String(b.titulo));
        case 'tipo_condicao': return dir * String(a.tipo_condicao || '').localeCompare(String(b.tipo_condicao || ''));
        case 'data_vencimento': return dir * String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || ''));
        case 'valor_nominal': return dir * ((a.valor_nominal || 0) - (b.valor_nominal || 0));
        case 'correcao_monetaria': return dir * ((a.correcao_monetaria || 0) - (b.correcao_monetaria || 0));
        case 'valor_corrigido': return dir * ((a.valor_corrigido || 0) - (b.valor_corrigido || 0));
        case 'acrescimo': return dir * ((a.acrescimo || 0) - (b.acrescimo || 0));
        case 'desconto': return dir * ((a.desconto || 0) - (b.desconto || 0));
        case 'dias_atraso': return dir * ((a.dias_atraso || 0) - (b.dias_atraso || 0));
        case 'data_baixa': return dir * String(a.data_baixa || '').localeCompare(String(b.data_baixa || ''));
        case 'valor_baixa': return dir * ((a.valor_baixa || 0) - (b.valor_baixa || 0));
        case 'status': return dir * String(a.status).localeCompare(String(b.status));
        default: return 0;
      }
    });
  };

  const formatCurrencyRaw = (value: number) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const nomeArquivo = (ext: string) => {
    const cliente = extrato?.header?.cliente || 'cliente';
    const nome = cliente.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
    const data = new Date().toISOString().split('T')[0];
    return `extrato_${nome}_${data}.${ext}`;
  };

  const exportarPDF = () => {
    if (!extrato) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 15;

    // Cabeçalho
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pageWidth, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('ECBIESEK CONSTRUTORA', margin, 12);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Extrato do Cliente', margin, 19);
    const agora = new Date();
    const dataGeracao = `Gerado em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    doc.setFontSize(9);
    doc.text(dataGeracao, pageWidth - margin, 12, { align: 'right' });
    doc.text('Gestão Financeira - Construtora', pageWidth - margin, 19, { align: 'right' });

    y = 35;

    // Dados do Cliente
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DADOS DO CLIENTE', margin, y);
    y += 2;
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    const campos = [
      { label: 'Cliente', valor: extrato.header.cliente },
      { label: 'Empreendimento', valor: extrato.header.empreendimento },
      { label: 'Documento', valor: extrato.header.documento },
    ];
    const colW = (pageWidth - 2 * margin) / 3;
    campos.forEach((c, i) => {
      const x = margin + i * colW;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text(c.label, x, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(c.valor || '-', x, y + 5);
    });
    y += 14;

    // Barra de Progresso
    const pctRec = extrato.totais.total_corrigido > 0
      ? (extrato.totais.total_recebido / extrato.totais.total_corrigido * 100) : 0;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('PROGRESSO DE RECEBIMENTO', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(22, 163, 74); // green-600
    doc.text(`${pctRec.toFixed(1)}% do valor recebido`, pageWidth - margin, y, { align: 'right' });
    y += 4;

    const barW = pageWidth - 2 * margin;
    const barH = 5;
    doc.setFillColor(229, 231, 235); // gray-200
    doc.roundedRect(margin, y, barW, barH, 2, 2, 'F');
    if (pctRec > 0) {
      doc.setFillColor(34, 197, 94); // green-500
      doc.roundedRect(margin, y, barW * Math.min(pctRec, 100) / 100, barH, 2, 2, 'F');
    }
    y += 10;

    // Resumo Financeiro
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('RESUMO FINANCEIRO', margin, y);
    y += 4;

    const cards = [
      { label: 'Total Corrigido', valor: extrato.totais.total_corrigido, cor: [71, 85, 105] },    // slate
      { label: 'Total Recebido', valor: extrato.totais.total_recebido, cor: [34, 197, 94] },     // green
      { label: 'A Receber', valor: extrato.totais.total_a_receber, cor: [59, 130, 246] },        // blue
      { label: 'Em Atraso', valor: extrato.totais.total_atrasado, cor: [239, 68, 68] },          // red
      { label: 'Saldo Devedor', valor: extrato.totais.total_a_receber + extrato.totais.total_atrasado, cor: [249, 115, 22] }, // orange
    ];
    const cardW = (pageWidth - 2 * margin - 4 * 3) / 5;
    cards.forEach((card, i) => {
      const x = margin + i * (cardW + 3);
      doc.setFillColor(card.cor[0], card.cor[1], card.cor[2]);
      doc.roundedRect(x, y, cardW, 14, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(card.label.toUpperCase(), x + 3, y + 5);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`R$ ${formatCurrencyRaw(card.valor)}`, x + 3, y + 11);
    });
    y += 20;

    // Tabela de Parcelas
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('HISTÓRICO DE PARCELAS', margin, y);
    y += 3;

    const parcelasOrdenadas = ordenarParcelas(extrato.parcelas);
    const tableBody = parcelasOrdenadas.map(p => [
      p.titulo,
      p.tipo_condicao || '-',
      formatDate(p.data_vencimento),
      `R$ ${formatCurrencyRaw(p.valor_nominal)}`,
      p.correcao_monetaria > 0 ? `R$ ${formatCurrencyRaw(p.correcao_monetaria)}` : '-',
      `R$ ${formatCurrencyRaw(p.valor_corrigido)}`,
      p.acrescimo > 0 ? `R$ ${formatCurrencyRaw(p.acrescimo)}` : '-',
      p.desconto > 0 ? `R$ ${formatCurrencyRaw(p.desconto)}` : '-',
      p.dias_atraso > 0 ? `${p.dias_atraso}d` : '-',
      formatDate(p.data_baixa),
      p.valor_baixa > 0 ? `R$ ${formatCurrencyRaw(p.valor_baixa)}` : '-',
      p.status,
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Titulo/Parcela', 'Tipo Condição', 'Vencimento', 'Valor Original', 'Correção Monetária', 'Valor Corrigido', 'Acréscimo', 'Desconto', 'Dias Atraso', 'Data Baixa', 'Valor Baixa', 'Status']],
      body: tableBody,
      foot: [[
        'TOTAIS', '', '',
        `R$ ${formatCurrencyRaw(extrato.totais.total_nominal)}`,
        `R$ ${formatCurrencyRaw(extrato.totais.total_correcao || 0)}`,
        `R$ ${formatCurrencyRaw(extrato.totais.total_corrigido)}`,
        `R$ ${formatCurrencyRaw(extrato.totais.total_acrescimo || 0)}`,
        '', '', '',
        `R$ ${formatCurrencyRaw(extrato.totais.total_recebido)}`,
        '',
      ]],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      footStyles: { fillColor: [243, 244, 246], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { cellWidth: 24 },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'center' },
        9: { halign: 'right' },
        10: { halign: 'center', cellWidth: 18 },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 10) {
          const status = data.cell.raw;
          if (status === 'Recebido') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          } else if (status === 'Atrasado') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [37, 99, 235];
            data.cell.styles.fontStyle = 'bold';
          }
        }
        if (data.section === 'body' && data.column.index === 7) {
          const val = data.cell.raw;
          if (val !== '-') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        }
        if (data.section === 'body' && data.column.index === 4) {
          const val = data.cell.raw;
          if (val !== '-') {
            data.cell.styles.textColor = [180, 120, 0]; // amber
          }
        }
        if (data.section === 'body' && data.column.index === 6) {
          const val = data.cell.raw;
          if (val !== '-') {
            data.cell.styles.textColor = [234, 88, 12]; // orange
          }
        }
        if (data.section === 'body' && data.column.index === 9) {
          const val = data.cell.raw;
          if (val !== '-') {
            data.cell.styles.textColor = [22, 163, 74]; // green
          }
        }
      },
      margin: { left: margin, right: margin },
    });

    // Rodapé em todas as páginas
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFillColor(30, 41, 59);
      doc.rect(0, pageH - 10, pageWidth, 10, 'F');
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(7);
      doc.text(dataGeracao, margin, pageH - 4);
      doc.text(`ECBIESEK-CONSTRUTORA © ${agora.getFullYear()}`, pageWidth / 2, pageH - 4, { align: 'center' });
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageH - 4, { align: 'right' });
    }

    doc.save(nomeArquivo('pdf'));
  };

  const exportarExcel = () => {
    if (!extrato) return;

    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];

    // Título
    wsData.push(['EXTRATO DO CLIENTE - ECBIESEK CONSTRUTORA']);
    wsData.push([`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`]);
    wsData.push([]);

    // Dados do Cliente
    wsData.push(['DADOS DO CLIENTE']);
    wsData.push(['Cliente:', extrato.header.cliente, '', 'Empresa:', extrato.header.empresa]);
    wsData.push(['Empreendimento:', extrato.header.empreendimento, '', 'Documento:', extrato.header.documento]);
    wsData.push([]);

    // Resumo Financeiro
    wsData.push(['RESUMO FINANCEIRO']);
    wsData.push(['Total Nominal', 'Correção Monetária', 'Total Corrigido', 'Total Recebido', 'A Receber', 'Em Atraso', 'Saldo Devedor', '% Recebido']);
    const pctRec = extrato.totais.total_corrigido > 0
      ? (extrato.totais.total_recebido / extrato.totais.total_corrigido * 100) : 0;
    wsData.push([
      extrato.totais.total_nominal,
      extrato.totais.total_correcao,
      extrato.totais.total_corrigido,
      extrato.totais.total_recebido,
      extrato.totais.total_a_receber,
      extrato.totais.total_atrasado,
      extrato.totais.total_a_receber + extrato.totais.total_atrasado,
      pctRec / 100,
    ]);
    wsData.push([]);

    // Tabela de Parcelas
    wsData.push(['HISTÓRICO DE PARCELAS']);
    wsData.push(['Titulo/Parcela', 'Tipo Condição', 'Vencimento', 'Valor Original', 'Correção Monetária', 'Valor Corrigido', 'Acréscimo', 'Desconto', 'Dias Atraso', 'Data Baixa', 'Valor Baixa', 'Status']);

    const parcelasOrdenadas = ordenarParcelas(extrato.parcelas);
    parcelasOrdenadas.forEach(p => {
      wsData.push([
        p.titulo,
        p.tipo_condicao || '-',
        formatDate(p.data_vencimento),
        p.valor_nominal,
        p.correcao_monetaria > 0 ? p.correcao_monetaria : null,
        p.valor_corrigido,
        p.acrescimo > 0 ? p.acrescimo : null,
        p.desconto > 0 ? p.desconto : null,
        p.dias_atraso > 0 ? p.dias_atraso : null,
        formatDate(p.data_baixa),
        p.valor_baixa > 0 ? p.valor_baixa : null,
        p.status,
      ]);
    });

    // Totais
    wsData.push([
      'TOTAIS', '', '',
      extrato.totais.total_nominal,
      extrato.totais.total_correcao || 0,
      extrato.totais.total_corrigido,
      extrato.totais.total_acrescimo || 0,
      '', '', '',
      extrato.totais.total_recebido,
      '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Larguras das colunas
    ws['!cols'] = [
      { wch: 18 }, // Titulo/Parcela
      { wch: 20 }, // Tipo Condição
      { wch: 14 }, // Vencimento
      { wch: 18 }, // Valor Original
      { wch: 18 }, // Correção Monetária
      { wch: 18 }, // Valor Corrigido
      { wch: 14 }, // Acréscimo
      { wch: 14 }, // Desconto
      { wch: 12 }, // Dias Atraso
      { wch: 14 }, // Data Baixa
      { wch: 18 }, // Valor Baixa
      { wch: 14 }, // Status
    ];

    // Merge do título
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    ];

    // Formatar colunas de valor como número
    const startRow = 13; // row onde começam as parcelas (0-indexed)
    const totalRows = parcelasOrdenadas.length + 1; // +1 para totais
    for (let r = startRow; r < startRow + totalRows; r++) {
      ['D', 'E', 'H'].forEach(col => {
        const cellRef = `${col}${r + 1}`;
        if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
          ws[cellRef].z = '#,##0.00';
        }
      });
    }

    // Formatar % recebido
    const pctCell = `F${10 + 1}`; // row 10 (0-indexed), col F
    if (ws[pctCell]) {
      ws[pctCell].z = '0.0%';
    }

    // Formatar resumo financeiro como moeda
    ['A', 'B', 'C', 'D', 'E'].forEach((col, i) => {
      const cellRef = `${col}${10 + 1}`;
      if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
        ws[cellRef].z = '#,##0.00';
      }
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Extrato');
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, nomeArquivo('xlsx'));
  };

  // Computed values
  const totais = extrato?.totais;
  const parcelas = extrato?.parcelas || [];
  const parcelasRecebidas = parcelas.filter(p => p.status === 'Recebido').length;
  const parcelasAReceber = parcelas.filter(p => p.status === 'A Receber').length;
  const parcelasAtrasadas = parcelas.filter(p => p.status === 'Atrasado').length;
  const totalParcelas = parcelas.length;
  const pctRecebido = totalParcelas > 0 ? (parcelasRecebidas / totalParcelas * 100) : 0;
  const pctAReceber = totalParcelas > 0 ? (parcelasAReceber / totalParcelas * 100) : 0;
  const pctAtrasado = totalParcelas > 0 ? (parcelasAtrasadas / totalParcelas * 100) : 0;
  const pctValorRecebido = totais && totais.total_corrigido > 0 ? (totais.total_recebido / totais.total_corrigido * 100) : 0;

  // Próxima parcela a vencer (primeira "A Receber" ordenada por data)
  const proximaParcela = parcelas
    .filter(p => p.status === 'A Receber')
    .sort((a, b) => String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || '')))[0] || null;

  if (loadingClientes) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-green-600 border-r-transparent"></div>
          <p className="text-gray-600">Carregando clientes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Filtros</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <SearchableSelect
              label="Cliente"
              options={clientes}
              value={clienteSelecionado ?? undefined}
              onChange={(value) => setClienteSelecionado(value as string | null)}
              placeholder="Selecione um cliente..."
            />
          </div>
          {clienteSelecionado && titulos.length > 0 && (
            <div>
              <SearchableSelect
                label="Titulo"
                options={titulos}
                value={tituloSelecionado ?? undefined}
                onChange={(value) => setTituloSelecionado(value as string | null)}
                placeholder="Todos os titulos"
                emptyText="Todos os titulos"
              />
            </div>
          )}
        </div>
        {/* Toggle INCC Manual */}
        {tituloSelecionado && extrato && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <button
              onClick={toggleInccManual}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                extrato.calculo_incc_manual ? 'bg-amber-500' : 'bg-gray-300'
              }`}
              role="switch"
              aria-checked={extrato.calculo_incc_manual || false}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  extrato.calculo_incc_manual ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <div>
              <span className="text-sm font-medium text-amber-800">Correção INCC Manual</span>
              <p className="text-xs text-amber-600">
                {extrato.calculo_incc_manual
                  ? 'Usando fórmula INCC (para títulos com índice incorreto no Sienge)'
                  : 'Usando valores do Sienge (padrão)'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!clienteSelecionado && (
        <div className="rounded-lg bg-gray-50 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">Selecione um cliente</h3>
          <p className="mt-2 text-gray-500">Escolha um cliente no filtro acima para visualizar seu extrato</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex h-48 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-600 border-r-transparent"></div>
            <p className="text-gray-600">Carregando extrato...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!loading && extrato && extrato.parcelas.length > 0 && (
        <>
          {/* Dados do Cliente - Banner */}
          <div className="rounded-lg bg-gradient-to-r from-slate-700 to-slate-900 p-6 shadow-lg text-white">
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Dados do Cliente</h2>
              <div className="flex gap-2">
                <button
                  onClick={exportarPDF}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors shadow"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Exportar PDF
                </button>
                <button
                  onClick={exportarExcel}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors shadow"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Exportar Excel
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-slate-400">Cliente</p>
                <p className="font-semibold text-white text-lg">{extrato.header.cliente}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Empresa</p>
                <p className="font-medium text-slate-100">{extrato.header.empresa}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Empreendimento</p>
                <p className="font-medium text-slate-100">{extrato.header.empreendimento}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Documento</p>
                <p className="font-medium text-slate-100">{extrato.header.documento}</p>
              </div>
            </div>
          </div>

          {/* Barra de Progresso Geral */}
          <div className="rounded-lg bg-white p-5 shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Progresso de Recebimento</h3>
              <span className="text-sm font-bold text-green-600">{pctValorRecebido.toFixed(1)}% do valor recebido</span>
            </div>
            <div className="h-4 w-full rounded-full bg-gray-100 overflow-hidden flex">
              {pctRecebido > 0 && (
                <div
                  className="h-4 bg-green-500 transition-all duration-700"
                  style={{ width: `${pctRecebido}%` }}
                  title={`Recebido: ${parcelasRecebidas} parcelas (${pctRecebido.toFixed(1)}%)`}
                />
              )}
              {pctAReceber > 0 && (
                <div
                  className="h-4 bg-blue-400 transition-all duration-700"
                  style={{ width: `${pctAReceber}%` }}
                  title={`A Receber: ${parcelasAReceber} parcelas (${pctAReceber.toFixed(1)}%)`}
                />
              )}
              {pctAtrasado > 0 && (
                <div
                  className="h-4 bg-red-400 transition-all duration-700"
                  style={{ width: `${pctAtrasado}%` }}
                  title={`Atrasado: ${parcelasAtrasadas} parcelas (${pctAtrasado.toFixed(1)}%)`}
                />
              )}
            </div>
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500"></div>
                Recebido: {parcelasRecebidas}/{totalParcelas} ({pctRecebido.toFixed(1)}%)
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-full bg-blue-400"></div>
                A Receber: {parcelasAReceber} ({pctAReceber.toFixed(1)}%)
              </div>
              {parcelasAtrasadas > 0 && (
                <div className="flex items-center gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400"></div>
                  Atrasado: {parcelasAtrasadas} ({pctAtrasado.toFixed(1)}%)
                </div>
              )}
            </div>
          </div>

          {/* Cards de Totais - Gradient */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 p-4 shadow-lg text-white">
              <p className="text-xs font-medium text-slate-300 uppercase tracking-wider">Total Corrigido</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(extrato.totais.total_corrigido)}</p>
              <p className="text-xs text-slate-400 mt-1">{extrato.totais.quantidade_parcelas} parcelas (Nominal: {formatCurrency(extrato.totais.total_nominal)} + Correção: {formatCurrency(extrato.totais.total_correcao)})</p>
            </div>
            <div className="rounded-lg bg-gradient-to-br from-green-500 to-emerald-700 p-4 shadow-lg text-white">
              <p className="text-xs font-medium text-green-100 uppercase tracking-wider">Total Recebido</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(extrato.totais.total_recebido)}</p>
              <p className="text-xs text-green-200 mt-1">{parcelasRecebidas} parcelas ({pctValorRecebido.toFixed(1)}%)</p>
            </div>
            <div className="rounded-lg bg-gradient-to-br from-blue-500 to-indigo-700 p-4 shadow-lg text-white">
              <p className="text-xs font-medium text-blue-100 uppercase tracking-wider">A Receber</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(extrato.totais.total_a_receber)}</p>
              <p className="text-xs text-blue-200 mt-1">{parcelasAReceber} parcelas</p>
            </div>
            <div className="rounded-lg bg-gradient-to-br from-red-500 to-rose-700 p-4 shadow-lg text-white">
              <p className="text-xs font-medium text-red-100 uppercase tracking-wider">Em Atraso</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(extrato.totais.total_atrasado)}</p>
              <p className="text-xs text-red-200 mt-1">{parcelasAtrasadas} parcelas</p>
            </div>
            <div className="rounded-lg bg-gradient-to-br from-orange-500 to-amber-700 p-4 shadow-lg text-white">
              <p className="text-xs font-medium text-orange-100 uppercase tracking-wider">Saldo Devedor</p>
              <p className="text-xl font-bold mt-1">
                {formatCurrency(extrato.totais.total_a_receber + extrato.totais.total_atrasado)}
              </p>
              <p className="text-xs text-orange-200 mt-1">{parcelasAReceber + parcelasAtrasadas} parcelas pendentes</p>
            </div>
          </div>

          {/* Card Próximo Vencimento */}
          {proximaParcela && (
            <div className="rounded-lg bg-gradient-to-r from-purple-600 to-violet-800 p-5 shadow-lg text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                    <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-purple-200 uppercase tracking-wider">Próximo Vencimento</p>
                    <p className="text-lg font-bold">{proximaParcela.titulo} — {formatDate(proximaParcela.data_vencimento)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-purple-200">Valor a Cobrar</p>
                  <p className="text-2xl font-bold">{formatCurrency(proximaParcela.valor_corrigido)}</p>
                  {proximaParcela.correcao_monetaria > 0 && (
                    <p className="text-xs text-purple-300">
                      Nominal: {formatCurrency(proximaParcela.valor_nominal)} + Correção: {formatCurrency(proximaParcela.correcao_monetaria)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Historico de Parcelas */}
          <div className="rounded-lg bg-white shadow overflow-hidden">
            <div className="p-6 pb-3">
              <h2 className="text-lg font-semibold text-gray-900">Historico de Parcelas</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-green-50">
                  <tr>
                    <th onClick={() => toggleOrdenacao('titulo')} className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Titulo/Parcela {renderSortIcon('titulo')}
                    </th>
                    <th onClick={() => toggleOrdenacao('tipo_condicao')} className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Tipo Condicao {renderSortIcon('tipo_condicao')}
                    </th>
                    <th onClick={() => toggleOrdenacao('data_vencimento')} className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Vencimento {renderSortIcon('data_vencimento')}
                    </th>
                    <th onClick={() => toggleOrdenacao('valor_nominal')} className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Valor Original {renderSortIcon('valor_nominal')}
                    </th>
                    <th onClick={() => toggleOrdenacao('correcao_monetaria')} className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Correção Monetária {renderSortIcon('correcao_monetaria')}
                    </th>
                    <th onClick={() => toggleOrdenacao('valor_corrigido')} className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Valor Corrigido {renderSortIcon('valor_corrigido')}
                    </th>
                    <th onClick={() => toggleOrdenacao('acrescimo')} className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Acrescimo {renderSortIcon('acrescimo')}
                    </th>
                    <th onClick={() => toggleOrdenacao('desconto')} className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Desconto {renderSortIcon('desconto')}
                    </th>
                    <th onClick={() => toggleOrdenacao('dias_atraso')} className="cursor-pointer px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Dias Atraso {renderSortIcon('dias_atraso')}
                    </th>
                    <th onClick={() => toggleOrdenacao('data_baixa')} className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Data Baixa {renderSortIcon('data_baixa')}
                    </th>
                    <th onClick={() => toggleOrdenacao('valor_baixa')} className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Valor Baixa {renderSortIcon('valor_baixa')}
                    </th>
                    <th onClick={() => toggleOrdenacao('status')} className="cursor-pointer px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-green-100">
                      Status {renderSortIcon('status')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {ordenarParcelas(extrato.parcelas).map((parcela, index) => (
                    <tr key={index} className={`hover:bg-gray-50 ${
                      proximaParcela && parcela.titulo === proximaParcela.titulo
                        ? 'bg-purple-50 ring-2 ring-inset ring-purple-300'
                        : parcela.status === 'Atrasado' ? 'bg-red-50/30' : ''
                    }`}>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-gray-900">
                        {parcela.titulo}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm">
                        {parcela.tipo_condicao ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${corTipoCondicao(parcela.tipo_condicao)}`}>
                            {parcela.tipo_condicao}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                        {formatDate(parcela.data_vencimento)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium text-gray-900">
                        {formatCurrency(parcela.valor_nominal)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                        {parcela.correcao_monetaria > 0 ? (
                          <span className="text-amber-600 font-medium">{formatCurrency(parcela.correcao_monetaria)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium text-indigo-700">
                        {formatCurrency(parcela.valor_corrigido)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                        {parcela.acrescimo > 0 ? (
                          <span className="text-orange-600 font-medium">{formatCurrency(parcela.acrescimo)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                        {parcela.desconto > 0 ? (
                          <span className="text-red-600 font-medium">{formatCurrency(parcela.desconto)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-center text-sm">
                        {parcela.dias_atraso > 0 ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                            parcela.dias_atraso > 90 ? 'bg-red-100 text-red-700' :
                            parcela.dias_atraso > 30 ? 'bg-orange-100 text-orange-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {parcela.dias_atraso}d
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                        {formatDate(parcela.data_baixa)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium">
                        {parcela.valor_baixa > 0 ? (
                          <span className="text-green-600">{formatCurrency(parcela.valor_baixa)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusColor(parcela.status)}`}>
                          {parcela.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100">
                  <tr className="font-bold">
                    <td colSpan={3} className="px-3 py-3 text-sm text-gray-900">
                      TOTAIS
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-900">
                      {formatCurrency(extrato.totais.total_nominal)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-amber-600">
                      {formatCurrency(extrato.totais.total_correcao || 0)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-indigo-700">
                      {formatCurrency(extrato.totais.total_corrigido)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-orange-600">
                      {formatCurrency(extrato.totais.total_acrescimo || 0)}
                    </td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-green-600">
                      {formatCurrency(extrato.totais.total_recebido)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && extrato && extrato.parcelas.length === 0 && clienteSelecionado && (
        <div className="rounded-lg bg-yellow-50 p-6 text-center">
          <p className="text-yellow-700">Nenhuma parcela encontrada para este cliente.</p>
        </div>
      )}
    </div>
  );
};
