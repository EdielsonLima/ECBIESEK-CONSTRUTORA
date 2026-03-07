import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface CardResumo {
  label: string;
  valor: number | string;
  cor: [number, number, number];
}

export interface FiltroAtivo {
  label: string;
  valor: string;
}

export interface TabelaConfig {
  head: string[][];
  body: (string | number)[][];
  foot?: (string | number)[][];
  columnStyles?: Record<number, any>;
  didParseCell?: (data: any) => void;
}

export function formatCurrencyPDF(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDatePDF(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
}

export function criarPDFBase(
  titulo: string,
  subtitulo: string,
  orientation: 'landscape' | 'portrait' = 'landscape'
): { doc: jsPDF; pageWidth: number; margin: number; y: number; dataGeracao: string } {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Header
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('ECBIESEK CONSTRUTORA', margin, 12);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(titulo, margin, 19);

  if (subtitulo) {
    doc.setFontSize(8);
    doc.text(subtitulo, margin, 24);
  }

  const agora = new Date();
  const dataGeracao = `Gerado em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  doc.setFontSize(9);
  doc.text(dataGeracao, pageWidth - margin, 12, { align: 'right' });
  doc.text('Gestão Financeira', pageWidth - margin, 19, { align: 'right' });

  return { doc, pageWidth, margin, y: 34, dataGeracao };
}

export function adicionarFiltrosAtivos(
  doc: jsPDF,
  filtros: FiltroAtivo[],
  y: number,
  pageWidth: number,
  margin: number
): number {
  const ativos = filtros.filter(f => f.valor && f.valor !== 'Todos');
  if (ativos.length === 0) return y;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 100, 100);
  doc.text('FILTROS APLICADOS:', margin, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const textoFiltros = ativos.map(f => `${f.label}: ${f.valor}`).join('  |  ');

  // Quebra em linhas se muito grande
  const lines = doc.splitTextToSize(textoFiltros, pageWidth - 2 * margin);
  doc.text(lines, margin, y);
  y += lines.length * 3.5 + 3;

  return y;
}

export function adicionarResumoCards(
  doc: jsPDF,
  cards: CardResumo[],
  y: number,
  pageWidth: number,
  margin: number
): number {
  if (cards.length === 0) return y;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('RESUMO', margin, y);
  y += 4;

  const gap = 3;
  const cardW = (pageWidth - 2 * margin - (cards.length - 1) * gap) / cards.length;

  cards.forEach((card, i) => {
    const x = margin + i * (cardW + gap);
    doc.setFillColor(card.cor[0], card.cor[1], card.cor[2]);
    doc.roundedRect(x, y, cardW, 14, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(card.label.toUpperCase(), x + 2, y + 5);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const valorStr = typeof card.valor === 'number'
      ? `R$ ${formatCurrencyPDF(card.valor)}`
      : card.valor;
    doc.text(valorStr, x + 2, y + 11);
  });

  return y + 20;
}

export function adicionarTabela(
  doc: jsPDF,
  config: TabelaConfig,
  startY: number,
  margin: number
): number {
  autoTable(doc, {
    startY,
    head: config.head,
    body: config.body,
    foot: config.foot,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    footStyles: { fillColor: [243, 244, 246], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: config.columnStyles || {},
    didParseCell: config.didParseCell,
    margin: { left: margin, right: margin },
  });

  return (doc as any).lastAutoTable?.finalY || startY + 10;
}

export function finalizarPDF(doc: jsPDF, nomeArquivo: string, dataGeracao: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const totalPages = doc.getNumberOfPages();
  const agora = new Date();

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

  doc.save(nomeArquivo);
}

export function gerarNomeArquivo(pagina: string, aba?: string): string {
  const data = new Date().toISOString().split('T')[0];
  const abaStr = aba ? `_${aba.replace(/\s+/g, '_').toLowerCase()}` : '';
  return `${pagina}${abaStr}_${data}.pdf`;
}
