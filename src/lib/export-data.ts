import jsPDF from 'jspdf';
import { StoreData } from '@/types/store';
import { getDashboardStats, getTotalInvestment } from '@/lib/store-data';

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v: string | number | undefined | null): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(rows: (string | number | undefined | null)[][]): string {
  return rows.map(r => r.map(csvEscape).join(',')).join('\n');
}

const dateStamp = () => new Date().toISOString().slice(0, 10);

// ---------- HISTORY EXPORT ----------

export function exportHistoryCSV(store: StoreData) {
  const rows: (string | number)[][] = [['Date', 'Type', 'Item', 'Quantity', 'Unit Price', 'Total', 'Profit', 'Notes']];

  store.sales.forEach(s => {
    rows.push([new Date(s.date).toLocaleString(), 'Sale', s.productName, s.quantity, s.unitPrice, s.total, s.profit, '']);
  });
  (store.restocks || []).forEach(r => {
    rows.push([new Date(r.date).toLocaleString(), 'Restock', r.productName, r.quantity, r.costPrice, -r.total, 0, '']);
  });
  (store.expenses || []).forEach(e => {
    rows.push([new Date(e.date).toLocaleString(), 'Expense', e.category, '', '', -e.amount, 0, e.note || '']);
  });

  rows.sort((a, b) => {
    if (a[0] === 'Date') return -1;
    if (b[0] === 'Date') return 1;
    return new Date(b[0] as string).getTime() - new Date(a[0] as string).getTime();
  });

  downloadBlob(toCSV(rows), `${store.storeName}-history-${dateStamp()}.csv`, 'text/csv');
}

export function exportHistoryPDF(store: StoreData) {
  const doc = new jsPDF();
  const stats = getDashboardStats(store);
  const margin = 14;
  let y = 18;

  doc.setFontSize(16);
  doc.text(`${store.storeName} — History Report`, margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}  •  Code: ${store.accessCode}`, margin, y);
  y += 8;

  doc.setTextColor(0);
  doc.setFontSize(10);
  const summary = [
    `Revenue: NGN ${stats.totalRevenue.toLocaleString()}`,
    `Profit: NGN ${stats.totalProfit.toLocaleString()}`,
    `Expenses: NGN ${stats.totalExpenses.toLocaleString()}`,
    `Net Income: NGN ${stats.netIncome.toLocaleString()}`,
    `Sales count: ${stats.totalSales}`,
  ];
  summary.forEach(line => { doc.text(line, margin, y); y += 5; });
  y += 4;

  const writeSection = (title: string, headers: string[], rows: string[][]) => {
    if (y > 270) { doc.addPage(); y = 18; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(headers.join('   |   '), margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    rows.forEach(r => {
      if (y > 285) { doc.addPage(); y = 18; }
      doc.text(r.join('   |   ').substring(0, 110), margin, y);
      y += 5;
    });
    y += 4;
  };

  if (store.sales.length) {
    writeSection('Sales', ['Date', 'Item', 'Qty', 'Total', 'Profit'],
      store.sales.map(s => [
        new Date(s.date).toLocaleDateString(),
        s.productName.substring(0, 25),
        String(s.quantity),
        s.total.toLocaleString(),
        s.profit.toLocaleString(),
      ]));
  }
  if ((store.restocks || []).length) {
    writeSection('Restocks', ['Date', 'Item', 'Qty', 'Cost', 'Total'],
      (store.restocks || []).map(r => [
        new Date(r.date).toLocaleDateString(),
        r.productName.substring(0, 25),
        String(r.quantity),
        r.costPrice.toLocaleString(),
        r.total.toLocaleString(),
      ]));
  }
  if ((store.expenses || []).length) {
    writeSection('Expenses', ['Date', 'Category', 'Amount', 'Note'],
      (store.expenses || []).map(e => [
        new Date(e.date).toLocaleDateString(),
        e.category,
        e.amount.toLocaleString(),
        (e.note || '').substring(0, 30),
      ]));
  }

  doc.save(`${store.storeName}-history-${dateStamp()}.pdf`);
}

// ---------- ROI EXPORT ----------

export function exportROICSV(store: StoreData) {
  const stats = getDashboardStats(store);
  const totalInvested = getTotalInvestment(store);
  const roi = totalInvested > 0 ? (stats.netIncome / totalInvested) * 100 : 0;

  const rows: (string | number)[][] = [
    ['Metric', 'Value'],
    ['Store', store.storeName],
    ['Generated', new Date().toLocaleString()],
    ['Total Invested', totalInvested],
    ['Total Revenue', stats.totalRevenue],
    ['Total Profit', stats.totalProfit],
    ['Total Expenses', stats.totalExpenses],
    ['Net Income', stats.netIncome],
    ['ROI %', roi.toFixed(2)],
    [],
    ['Investment Date', 'Type', 'Amount', 'Note'],
    ...(store.investments || []).map(i => [
      new Date(i.date).toLocaleDateString(),
      i.type,
      i.amount,
      i.note,
    ]),
  ];

  downloadBlob(toCSV(rows), `${store.storeName}-roi-${dateStamp()}.csv`, 'text/csv');
}

export function exportROIPDF(store: StoreData) {
  const doc = new jsPDF();
  const stats = getDashboardStats(store);
  const totalInvested = getTotalInvestment(store);
  const roi = totalInvested > 0 ? (stats.netIncome / totalInvested) * 100 : 0;
  const margin = 14;
  let y = 18;

  doc.setFontSize(16);
  doc.text(`${store.storeName} — ROI Summary`, margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, y);
  y += 10;

  doc.setTextColor(0);
  doc.setFontSize(20);
  doc.text(`ROI: ${roi.toFixed(1)}%`, margin, y);
  y += 10;

  doc.setFontSize(11);
  const lines = [
    `Total Invested:   NGN ${totalInvested.toLocaleString()}`,
    `Total Revenue:    NGN ${stats.totalRevenue.toLocaleString()}`,
    `Total Profit:     NGN ${stats.totalProfit.toLocaleString()}`,
    `Total Expenses:   NGN ${stats.totalExpenses.toLocaleString()}`,
    `Net Income:       NGN ${stats.netIncome.toLocaleString()}`,
    `Inventory Value:  NGN ${stats.inventoryValue.toLocaleString()}`,
  ];
  lines.forEach(l => { doc.text(l, margin, y); y += 6; });
  y += 4;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Investment Log', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  (store.investments || []).forEach(inv => {
    if (y > 280) { doc.addPage(); y = 18; }
    doc.text(
      `${new Date(inv.date).toLocaleDateString()}  ${inv.type.toUpperCase().padEnd(11)}  NGN ${inv.amount.toLocaleString().padStart(10)}  ${inv.note}`,
      margin, y
    );
    y += 5;
  });

  doc.save(`${store.storeName}-roi-${dateStamp()}.pdf`);
}
