import { useState } from 'react';
import { StoreData } from '@/types/store';
import { getDashboardStats, getTopSellers } from '@/lib/store-data';
import { generatePerformanceSummary, generateFullTextReport, generateFullCSV } from '@/lib/reports';
import { showToast } from '@/components/Toast';

// ============ EXPORT SHEET ============
export default function ExportSheet({ store, onClose }: { store: StoreData; onClose: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const stats = getDashboardStats(store);
  const topSellers = getTopSellers(store, 5);

  // Curated summary — used for Share/WhatsApp (sending a full raw dump as a
  // chat message isn't practical). Full data lives in the CSV/Text exports
  // below instead.
  const buildReport = () => generatePerformanceSummary(store);

  const buildCSV = () => generateFullCSV(store);

  const download = (content: string, name: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const slug = store.storeName.replace(/\s+/g, '_');

  const handlePDF = async () => {
    setLoading('pdf');
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      let y = 15;
      const row = (left: string, right: string, bold = false) => {
        if (y > 272) { doc.addPage(); y = 15; }
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(10); doc.setTextColor(20, 20, 20);
        doc.text(left, 15, y);
        doc.setFont('helvetica', 'bold');
        doc.text(right, W - 15, y, { align: 'right' });
        y += 7;
      };
      const heading = (text: string, r = 99, g = 102, b = 241) => {
        if (y > 272) { doc.addPage(); y = 15; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        doc.setTextColor(r, g, b); doc.text(text, 15, y); y += 7;
        doc.setTextColor(20, 20, 20);
      };
      // Header banner
      doc.setFillColor(99, 102, 241);
      doc.rect(0, 0, W, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
      doc.text('StoreFlow', 15, 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text('Performance Report', 15, 20);
      doc.text(new Date().toLocaleDateString(), W - 15, 20, { align: 'right' });
      y = 38;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 20, 20);
      doc.text(store.storeName, 15, y); y += 7;
      if (store.profile?.location) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
        doc.text(store.profile.location, 15, y); y += 7;
      }
      y += 3;
      heading('OVERVIEW');
      row('Gross Revenue', `\u20a6${stats.totalRevenue.toLocaleString()}`);
      row('Total Expenses', `\u20a6${stats.totalExpenses.toLocaleString()}`);
      row('Business Balance', `\u20a6${stats.netIncome.toLocaleString()}`, true);
      row('Net Profit', `\u20a6${stats.totalProfit.toLocaleString()}`, true);
      row('Inventory Value', `\u20a6${stats.inventoryValue.toLocaleString()}`);
      row('Total Sales', `${stats.totalSales}`);
      row('Products', `${stats.totalProducts}`);
      row('Low Stock Items', `${stats.lowStockProducts.length}`);
      y += 3;
      if (topSellers.length > 0) {
        heading('TOP SELLERS');
        topSellers.forEach((t, i) => {
          if (y > 272) { doc.addPage(); y = 15; }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
          doc.text(`${i + 1}. ${t.name} \u2014 ${t.totalSold} units  \u20a6${t.revenue.toLocaleString()}`, 15, y);
          y += 7;
        });
        y += 3;
      }
      if (stats.lowStockProducts.length > 0) {
        heading('LOW STOCK ALERTS', 220, 38, 38);
        stats.lowStockProducts.forEach(p => {
          if (y > 272) { doc.addPage(); y = 15; }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(180, 30, 30);
          doc.text(`\u2022 ${p.name}: only ${p.quantity} left`, 15, y); y += 7;
        });
        y += 3;
      }

      // Raw Export = complete data, not just the curated overview above.
      const smallRow = (text: string, color: [number, number, number] = [80, 80, 80]) => {
        if (y > 272) { doc.addPage(); y = 15; }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.setTextColor(...color);
        doc.text(text, 15, y); y += 5.5;
      };

      doc.addPage(); y = 15;
      heading('ALL PRODUCTS (' + store.products.length + ')');
      store.products.forEach(p => smallRow(`${p.name} | ${p.category} | Cost \u20a6${p.costPrice} | Sell \u20a6${p.sellingPrice} | Qty ${p.quantity} | Value \u20a6${(p.costPrice * p.quantity).toLocaleString()}`));
      y += 3;

      if (store.sales.length > 0) {
        heading('ALL SALES (' + store.sales.length + ')');
        store.sales.forEach(s => smallRow(`${new Date(s.date).toLocaleDateString()} | ${s.productName} | Qty ${s.quantity} | \u20a6${s.total} | Profit \u20a6${s.profit}`));
        y += 3;
      }

      const expenses = store.expenses || [];
      if (expenses.length > 0) {
        heading('ALL EXPENSES (' + expenses.length + ')');
        expenses.forEach(e => smallRow(`${new Date(e.date).toLocaleDateString()} | ${e.category} | \u20a6${e.amount.toLocaleString()}${e.note ? ' | ' + e.note : ''}`));
        y += 3;
      }

      const restocks = store.restocks || [];
      if (restocks.length > 0) {
        heading('ALL RESTOCKS (' + restocks.length + ')');
        restocks.forEach(r => smallRow(`${new Date(r.date).toLocaleDateString()} | ${r.productName} | Qty ${r.quantity} | \u20a6${r.total} | Funded: ${r.funding || 'balance'}`));
        y += 3;
      }

      const loans = store.loans || [];
      if (loans.length > 0) {
        heading('ALL LOANS (' + loans.length + ')');
        loans.forEach(l => smallRow(`${new Date(l.date).toLocaleDateString()} | ${l.source} | \u20a6${l.amount.toLocaleString()} | ${l.status}${l.dueDate ? ' | Due ' + new Date(l.dueDate).toLocaleDateString() : ''}`));
        y += 3;
      }

      const investments = store.investments || [];
      if (investments.length > 0) {
        heading('ALL INVESTMENTS (' + investments.length + ')');
        investments.forEach(i => smallRow(`${new Date(i.date).toLocaleDateString()} | ${i.type} | \u20a6${i.amount.toLocaleString()}${i.note ? ' | ' + i.note : ''}`));
        y += 3;
      }

      const withdrawals = store.withdrawals || [];
      if (withdrawals.length > 0) {
        heading('ALL WITHDRAWALS (' + withdrawals.length + ')');
        withdrawals.forEach(w => smallRow(`${new Date(w.date).toLocaleDateString()} | \u20a6${w.amount.toLocaleString()}${w.note ? ' | ' + w.note : ''}`));
        y += 3;
      }

      const customers = store.customers || [];
      if (customers.length > 0) {
        heading('ALL CUSTOMERS (' + customers.length + ')');
        customers.forEach(c => smallRow(`${c.name} | ${c.phone} | Purchases \u20a6${c.totalPurchases.toLocaleString()} | Owes \u20a6${c.outstandingDebt.toLocaleString()}`));
      }

      // Footer
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFillColor(245, 245, 250);
        doc.rect(0, 285, W, 12, 'F');
        doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal');
        doc.text('Generated by StoreFlow \u00b7 Innie Group', W / 2, 292, { align: 'center' });
        doc.text(`Page ${i} of ${pages}`, W - 15, 292, { align: 'right' });
      }
      doc.save(`StoreFlow_Report_${slug}.pdf`);
      showToast('PDF exported!');
    } catch {
      showToast('PDF export failed', 'error');
    }
    setLoading(null); onClose();
  };

  const handleText = () => {
    setLoading('text');
    download(generateFullTextReport(store), `StoreFlow_${slug}.txt`, 'text/plain');
    showToast('Full data report downloaded');
    setLoading(null); onClose();
  };

  const handleCSV = () => {
    setLoading('csv');
    download(buildCSV(), `StoreFlow_${slug}.csv`, 'text/csv');
    showToast('CSV downloaded');
    setLoading(null); onClose();
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildReport())}`, '_blank');
    onClose();
  };

  const handleShare = async () => {
    const text = buildReport();
    if (navigator.share) {
      try { await navigator.share({ title: `StoreFlow Report \u2014 ${store.storeName}`, text }); }
      catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      showToast('Report copied to clipboard');
    }
    onClose();
  };

  const options = [
    { id: 'pdf',  icon: '\ud83d\udcc4', label: 'Export as PDF',      sub: 'Formatted report saved to your device', color: 'text-destructive', action: handlePDF },
    { id: 'text', icon: '\ud83d\udcdd', label: 'Export as Text',     sub: 'Plain text .txt file',                 color: 'text-foreground',  action: handleText },
    { id: 'csv',  icon: '\ud83d\udcca', label: 'Export as CSV',      sub: 'Spreadsheet-ready data file',          color: 'text-success',     action: handleCSV },
    { id: 'wa',   icon: '\ud83d\udcac', label: 'Share to WhatsApp',  sub: 'Send report via WhatsApp',             color: 'text-success',     action: handleWhatsApp },
    { id: 'share',icon: '\ud83d\udce4', label: 'Share\u2026',        sub: 'Send with any app on your device',     color: 'text-primary',     action: handleShare },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full bg-card rounded-t-3xl shadow-2xl animate-slide-up"
        style={{ maxWidth: '448px', margin: '0 auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1.5 rounded-full bg-border" />
        </div>
        <div className="px-5 pb-3">
          <h3 className="font-display font-bold text-lg">Export Data</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Choose export format or sharing method</p>
        </div>
        <div className="px-4 space-y-1">
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={opt.action}
              disabled={loading !== null}
              className="w-full flex items-center gap-4 p-3 rounded-2xl text-left transition-colors hover:bg-surface-2 active:bg-surface-2 disabled:opacity-60"
            >
              <div className="w-11 h-11 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-xl shrink-0">
                {loading === opt.id ? '\u23f3' : opt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-display font-semibold ${opt.color}`}>{opt.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{opt.sub}</p>
              </div>
              <span className="shrink-0 text-muted-foreground text-lg">›</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-4">
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl border border-border text-muted-foreground font-display font-semibold text-sm transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
