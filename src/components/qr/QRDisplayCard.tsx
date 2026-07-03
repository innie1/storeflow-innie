import { useEffect, useRef, useState } from 'react';
import { Share2, Download, Printer, CheckCircle, QrCode, Calendar, Hash, ShieldAlert } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { drawQRCode, exportToSVG } from '@/lib/qr-code';
import { showToast } from '@/components/Toast';

interface QRDisplayCardProps {
  encodedData: string;
  storeName: string;
  storeId: string;
  type: string;
  payloadLabel: string;
  isExpired?: boolean;
}

export default function QRDisplayCard({
  encodedData,
  storeName,
  storeId,
  type,
  payloadLabel,
  isExpired = false
}: QRDisplayCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [successAnimation, setSuccessAnimation] = useState(true);
  const [qrId, setQrId] = useState('');
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    // Generate QR details
    const cleanId = Math.abs(encodedData.split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0)).toString(16).toUpperCase().substring(0, 12);
    
    setQrId(`SF-${type.substring(0, 3).toUpperCase()}-${cleanId}`);
    setDateStr(new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }));

    // Trigger success overlay animation
    setSuccessAnimation(true);
    const timer = setTimeout(() => setSuccessAnimation(false), 1600);

    // Draw the QR canvas
    if (canvasRef.current) {
      drawQRCode({
        text: encodedData,
        canvas: canvasRef.current,
        logoSizePercent: 0.22,
        transparent: false
      }).catch(err => {
        showToast('Failed to generate premium QR styling', 'error');
      });
    }

    return () => clearTimeout(timer);
  }, [encodedData, type]);

  const handleShare = async () => {
    const url = `${window.location.origin}/#qr-hub?scan=${encodedData}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `StoreFlow QR Code`,
          text: `Scan to access ${type} (${payloadLabel}) in ${storeName}`,
          url
        });
      } catch (err) {
        // Ignored or cancelled
      }
    } else {
      navigator.clipboard.writeText(url);
      showToast('Secure QR Link copied to clipboard!', 'success');
    }
  };

  const downloadPNG = (transparent = false) => {
    if (!canvasRef.current) return;
    
    if (transparent) {
      // Draw a temporary canvas with transparency
      const tempCanvas = document.createElement('canvas');
      drawQRCode({
        text: encodedData,
        canvas: tempCanvas,
        logoSizePercent: 0.22,
        transparent: true
      }).then(() => {
        const url = tempCanvas.toDataURL('image/png');
        triggerDownload(url, `${type}-qr-transparent.png`);
      });
    } else {
      const url = canvasRef.current.toDataURL('image/png');
      triggerDownload(url, `${type}-qr.png`);
    }
  };

  const downloadSVG = () => {
    const svgContent = exportToSVG(encodedData);
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `${type}-qr.svg`);
    URL.revokeObjectURL(url);
  };

  const downloadPDF = () => {
    if (!canvasRef.current) return;
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [400, 520]
      });

      // Style PDF as a Premium Dark Card
      doc.setFillColor(17, 17, 17); // #111111
      doc.rect(0, 0, 400, 520, 'F');

      // Thin yellow outline
      doc.setDrawColor(255, 199, 44); // #FFC72C
      doc.setLineWidth(2);
      doc.rect(12, 12, 376, 496, 'D');

      // Embed QR image
      const imgData = canvasRef.current.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', 50, 40, 300, 300);

      // Metadata text details
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(storeName.toUpperCase(), 200, 370, { align: 'center' });

      doc.setTextColor(255, 199, 44);
      doc.setFontSize(12);
      doc.text(`${type.toUpperCase()}: ${payloadLabel}`, 200, 395, { align: 'center' });

      doc.setTextColor(163, 163, 163); // neutral text
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`STORE ID: ${storeId}`, 200, 425, { align: 'center' });
      doc.text(`QR CODE ID: ${qrId}`, 200, 440, { align: 'center' });
      doc.text(`GENERATED ON: ${dateStr}`, 200, 455, { align: 'center' });
      doc.text(`STATUS: ${isExpired ? 'EXPIRED' : 'ACTIVE'}`, 200, 470, { align: 'center' });

      doc.save(`StoreFlow-QR-${qrId}.pdf`);
      showToast('PDF exported successfully!', 'success');
    } catch (e) {
      showToast('Failed to export PDF file', 'error');
    }
  };

  const handlePrint = () => {
    if (!canvasRef.current) return;
    const imgUrl = canvasRef.current.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return showToast('Popup blocker prevented print layout', 'error');

    printWindow.document.write(`
      <html>
        <head>
          <title>Print QR Code - StoreFlow</title>
          <style>
            body {
              background: #ffffff;
              color: #000000;
              font-family: sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              margin: 0;
              height: 100vh;
            }
            .card {
              border: 3px solid #FFC72C;
              border-radius: 20px;
              padding: 30px;
              text-align: center;
              max-width: 400px;
              box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            }
            img {
              width: 300px;
              height: 300px;
              margin-bottom: 20px;
            }
            h1 { font-size: 24px; margin: 10px 0 5px; color: #111111; }
            h2 { font-size: 16px; margin: 0 0 15px; color: #FFC72C; }
            p { font-size: 12px; margin: 4px 0; color: #666666; }
            .badge {
              display: inline-block;
              background: #e2e8f0;
              color: #1a202c;
              padding: 4px 10px;
              border-radius: 9999px;
              font-size: 10px;
              font-weight: bold;
              margin-top: 10px;
              text-transform: uppercase;
            }
            @media print {
              .no-print { display: none; }
              body { height: auto; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <img src="${imgUrl}" />
            <h1>${storeName}</h1>
            <h2>${type.toUpperCase()}: ${payloadLabel}</h2>
            <p><strong>Store ID:</strong> ${storeId}</p>
            <p><strong>QR ID:</strong> ${qrId}</p>
            <p><strong>Generated:</strong> ${dateStr}</p>
            <span class="badge">${isExpired ? 'Expired' : 'Active'}</span>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Downloaded ${filename} successfully!`, 'success');
  };

  return (
    <div className="flex flex-col items-center max-w-sm w-full mx-auto animate-scale-up">
      {/* Dark Premium Card */}
      <div className="relative w-full rounded-3xl p-6 bg-[#111111] border border-[#FFC72C]/40 shadow-[0_0_20px_rgba(255,199,44,0.1)] text-center overflow-hidden flex flex-col gap-5">
        
        {/* Glow Effects */}
        <div className="absolute -top-12 -left-12 w-28 h-28 bg-[#FFC72C]/5 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-28 h-28 bg-[#FFC72C]/5 rounded-full blur-2xl pointer-events-none" />

        {/* QR Canvas Wrapper */}
        <div className="relative w-full aspect-square bg-white rounded-2xl overflow-hidden p-3 shadow-inner border border-white/5 flex items-center justify-center">
          <canvas ref={canvasRef} className="w-full h-full rounded-lg" />

          {/* Success Checkmark Animation Overlay */}
          {successAnimation && (
            <div className="absolute inset-0 bg-[#111111]/80 flex flex-col items-center justify-center gap-2 animate-fade-out">
              <div className="w-16 h-16 rounded-full bg-[#FFC72C]/10 border border-[#FFC72C]/30 flex items-center justify-center text-[#FFC72C] animate-bounce">
                <CheckCircle className="w-10 h-10" />
              </div>
              <span className="text-xs font-display font-semibold text-white tracking-wide">Branded QR Generated!</span>
            </div>
          )}
        </div>

        {/* Metadata Details */}
        <div className="space-y-3.5 text-left border-t border-white/5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-extrabold text-white text-base leading-tight truncate max-w-[200px] uppercase">
                {storeName}
              </h3>
              <p className="text-[11px] text-[#FFC72C] font-semibold flex items-center gap-1 mt-0.5">
                <QrCode className="w-3 h-3" /> {type.toUpperCase()} • {payloadLabel}
              </p>
            </div>
            
            {/* Status Badge */}
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider select-none ${
              isExpired 
                ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                : 'bg-green-500/10 text-green-400 border border-green-500/20'
            }`}>
              {isExpired ? 'Expired' : 'Active'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[10px] text-neutral-400 border-t border-white/5 pt-3">
            <div className="space-y-0.5">
              <span className="text-[9px] text-neutral-500 flex items-center gap-1 uppercase font-semibold"><Hash className="w-2.5 h-2.5" /> Store ID</span>
              <p className="font-mono text-white truncate">{storeId}</p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[9px] text-neutral-500 flex items-center gap-1 uppercase font-semibold"><Hash className="w-2.5 h-2.5" /> QR ID</span>
              <p className="font-mono text-white truncate">{qrId}</p>
            </div>
            <div className="space-y-0.5 col-span-2">
              <span className="text-[9px] text-neutral-500 flex items-center gap-1 uppercase font-semibold"><Calendar className="w-2.5 h-2.5" /> Date Created</span>
              <p className="text-white font-medium">{dateStr}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-2 gap-2 w-full mt-4">
        <button
          onClick={handleShare}
          className="col-span-2 py-2.5 rounded-xl bg-primary hover:brightness-110 text-primary-foreground font-display font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
        >
          <Share2 className="w-3.5 h-3.5" /> Share secure QR Link
        </button>

        <button
          onClick={() => downloadPNG(false)}
          className="py-2 rounded-lg bg-surface-2 border border-border text-foreground font-semibold text-[11px] hover:bg-surface-3 transition flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> PNG
        </button>

        <button
          onClick={() => downloadPNG(true)}
          className="py-2 rounded-lg bg-surface-2 border border-border text-foreground font-semibold text-[11px] hover:bg-surface-3 transition flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> Trans. PNG
        </button>

        <button
          onClick={downloadSVG}
          className="py-2 rounded-lg bg-surface-2 border border-border text-foreground font-semibold text-[11px] hover:bg-surface-3 transition flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> SVG
        </button>

        <button
          onClick={downloadPDF}
          className="py-2 rounded-lg bg-surface-2 border border-border text-foreground font-semibold text-[11px] hover:bg-surface-3 transition flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> PDF
        </button>

        <button
          onClick={handlePrint}
          className="col-span-2 py-2.5 rounded-lg bg-surface-3 border border-border text-foreground font-semibold text-xs hover:bg-surface-2 transition flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" /> Print QR Code
        </button>
      </div>
    </div>
  );
}
