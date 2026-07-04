import { useState, useEffect, useRef, useMemo } from 'react';
import {
  StoreData, StoreProfile, ManagerSettings, DEFAULT_MANAGER_SETTINGS, Product,
  SavingsGoal, PaymentInfo, SavingsFrequency, RentInfo, RentFrequency,
} from '@/types/store';
import CloudAuthModal from '@/components/CloudAuthModal';
import { supabase } from '@/integrations/supabase/client';
import { drawQRCode, encodeQRData, drawSimpleQR, drawBarcode, generateStoreUrl, generateProductUrl } from '@/lib/qr-code';
import { saveStore, getTrash, getDashboardStats, getTopSellers, removeStoreFromIndex, getStoreIndex, STORE_PREFIX } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { THEMES, ThemeId, getTheme, applyTheme } from '@/lib/theme';
import RecentlyDeleted from '@/components/RecentlyDeleted';
import Wishlist from '@/components/Wishlist';
import StoreSwitcher from '@/components/StoreSwitcher';
import ToggleRow from '@/components/Toggle';
import Mascot from '@/components/Mascot';
import StoreLogo, { LOGO_STYLES } from '@/components/StoreLogo';
import { compileBackupPayload, triggerBackupExport, restoreBackupPayload, BackupPayload, decryptBackup } from '@/lib/backup-system';
import { LocalBackup, getLocalBackups, saveLocalBackup, deleteLocalBackup } from '@/lib/backup-db';
import { getLowStockThreshold, saveLowStockThreshold } from '@/lib/settings';
import { Html5Qrcode } from 'html5-qrcode';
import { generateInsights } from '@/lib/manager-intel';
import BarcodeScanner from '@/components/BarcodeScanner';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Rocket,
  ShoppingCart,
  CreditCard,
  Package,
  Tag,
  Download,
  Cpu,
  Heart,
  MessageSquare,
  Home,
  PiggyBank,
  BarChart3,
  Trash2,
  ShieldCheck,
  RefreshCw,
  Eye,
  EyeOff,

  ChevronDown,
  Share2,
  Printer,
  Link2,
  ShoppingBag,
  Flame,
  Calendar,
  Store,
  Shield,
  Bike,
  Camera,
  CheckCircle2,
  Copy,
  Plus,
  Info
} from 'lucide-react';

export type LockTimer = '1h' | '4h' | '8h' | '12h' | 'never';

const LOCK_TIMER_KEY = 'storeflow_lock_timer';
const SESSION_KEY = 'storeflow_session';

interface SessionData { accessCode: string; loginAt: number; lockTimer: LockTimer; }

export function saveLockTimer(timer: LockTimer) { localStorage.setItem(LOCK_TIMER_KEY, timer); }
export function getLockTimer(): LockTimer { return (localStorage.getItem(LOCK_TIMER_KEY) as LockTimer) || '1h'; }
export function saveSession(accessCode: string) {
  const s: SessionData = { accessCode, loginAt: Date.now(), lockTimer: getLockTimer() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('storeflow_active_user');
}
export function getActiveSession(): string | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session: SessionData = JSON.parse(raw);
    const timer = getLockTimer();
    if (timer === 'never') return session.accessCode;
    let maxMs = 3600000;
    if (timer === '4h') maxMs = 4 * 3600000;
    else if (timer === '8h') maxMs = 8 * 3600000;
    else if (timer === '12h') maxMs = 12 * 3600000;
    if (Date.now() - session.loginAt > maxMs) {
      clearSession();
      return null;
    }
    return session.accessCode;
  } catch { return null; }
}

type View =
  | 'home' | 'profile' | 'flow' | 'pricing' | 'inventory' | 'savings'
  | 'appearance' | 'notifications' | 'security' | 'data' | 'support'
  | 'help' | 'faq' | 'about' | 'contact' | 'backups' | 'discount' | 'activity-log'
  | 'wishlist' | 'barcode';

interface SettingsProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  onLock: () => void;
  currentUser?: any;
}

const card = "bg-card shadow-card rounded-2xl";
const tileBase = "w-full p-4 rounded-2xl bg-card shadow-card flex items-center gap-3 text-left transition-all hover:ring-1 hover:ring-primary/30";
const inputClass = "w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground focus:outline-none focus:border-primary text-sm";

// ---- small helpers ----
function ProgressRing({ pct, size = 56, color = 'hsl(var(--success))' }: { pct: number; size?: number; color?: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} stroke="hsl(var(--border))" strokeWidth="4" fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth="4" fill="none"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        transform={`rotate(90 ${size/2} ${size/2})`}
        className="fill-foreground font-display font-bold" style={{ fontSize: 11 }}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function IconBadge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-base"
      style={{ background: color + '20', color }}>
      {children}
    </div>
  );
}

function SubPage({ title, subtitle, onBack, children, right }: { title: string; subtitle?: string; onBack: () => void; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3.5">
        <div className="flex items-start gap-3.5">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 mt-0.5 transition-colors" aria-label="Back">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="font-display font-bold text-2xl text-foreground leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-1 leading-snug">{subtitle}</p>}
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </div>
  );
}

function ProductQRRow({ product, store }: { product: Product; store: StoreData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const barcodeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [showFullBarcode, setShowFullBarcode] = useState(false);

  // Cache/Store generated dataURLs to prevent redrawing on scroll
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [barcodeDataUrl, setBarcodeDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.05 });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const storeId = store.storeId || store.accessCode;
  const productUrl = generateProductUrl(storeId, product.id);

  useEffect(() => {
    if (!isVisible) return;

    if (qrCanvasRef.current && !qrDataUrl) {
      drawSimpleQR(productUrl, qrCanvasRef.current).then(() => {
        if (qrCanvasRef.current) {
          setQrDataUrl(qrCanvasRef.current.toDataURL('image/png'));
        }
      }).catch(() => {});
    }

    if (barcodeCanvasRef.current && product.barcode && !barcodeDataUrl) {
      const drawn = drawBarcode(product.barcode, barcodeCanvasRef.current, {
        barColor: '#000000',
        bgColor: '#FFFFFF',
        barWidth: 1.5,
        height: 50,
        showText: true
      });
      if (drawn && barcodeCanvasRef.current) {
        setBarcodeDataUrl(barcodeCanvasRef.current.toDataURL('image/png'));
      }
    }
  }, [isVisible, productUrl, product.barcode]);

  const handlePrintShelfLabel = () => {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Could not open print window. Please allow popups.', 'error');
      return;
    }

    const qrImgData = qrCanvasRef.current ? qrCanvasRef.current.toDataURL('image/png') : (qrDataUrl || '');
    const barcodeImgData = (barcodeCanvasRef.current && product.barcode) 
      ? barcodeCanvasRef.current.toDataURL('image/png') 
      : (barcodeDataUrl || '');

    const storeLogoHtml = store.profile?.photo 
      ? `<img class="store-logo" src="${store.profile.photo}" alt="" />`
      : `<div class="store-icon-placeholder">🏪</div>`;

    printWindow.document.write(`
      <html>
        <head>
          <title>Shelf Label - ${product.name}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              margin: 0;
              padding: 20px;
              background: #f8fafc;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .label-card {
              width: 320px;
              border: 2px solid #000;
              border-radius: 12px;
              background: #ffffff;
              padding: 16px;
              box-sizing: border-box;
              box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            }
            .header {
              display: flex;
              align-items: center;
              gap: 8px;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 8px;
              margin-bottom: 10px;
            }
            .store-logo {
              width: 24px;
              height: 24px;
              object-fit: cover;
              border-radius: 4px;
            }
            .store-icon-placeholder {
              font-size: 18px;
            }
            .store-name {
              font-size: 12px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #1e293b;
            }
            .product-name {
              font-size: 16px;
              font-weight: 700;
              color: #0f172a;
              margin: 0 0 4px 0;
              word-break: break-word;
              line-height: 1.25;
            }
            .price-tag {
              font-size: 24px;
              font-weight: 900;
              color: #000000;
              margin: 6px 0 12px 0;
            }
            .codes-container {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              margin-top: 10px;
              border-top: 1px dashed #cbd5e1;
              padding-top: 10px;
            }
            .barcode-wrap {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .barcode-img {
              max-width: 100%;
              height: 40px;
              object-fit: contain;
            }
            .qr-wrap {
              width: 60px;
              height: 60px;
              background: #fff;
              padding: 4px;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }
            .qr-img {
              width: 100%;
              height: 100%;
            }
            .scan-text {
              font-size: 8px;
              font-weight: bold;
              color: #64748b;
              text-align: center;
              margin-top: 2px;
            }
            @media print {
              body {
                background: none;
                padding: 0;
              }
              .label-card {
                box-shadow: none;
                border: 2px solid #000;
              }
            }
          </style>
        </head>
        <body>
          <div class="label-card">
            <div class="header">
              ${storeLogoHtml}
              <span class="store-name">${store.storeName}</span>
            </div>
            <h1 class="product-name">${product.name}</h1>
            <div class="price-tag">₦${(product.sellingPrice || 0).toLocaleString()}</div>
            <div class="codes-container">
              <div class="barcode-wrap">
                ${barcodeImgData ? `<img class="barcode-img" src="${barcodeImgData}" alt="barcode" />` : `<div style="font-size:10px;color:#94a3b8;font-style:italic;">No Barcode</div>`}
              </div>
              <div style="display: flex; flex-direction: column; align-items: center;">
                <div class="qr-wrap">
                  <img class="qr-img" src="${qrImgData}" alt="QR" />
                </div>
                <span class="scan-text">SCAN TO BUY</span>
              </div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownload = () => {
    const dataUrl = qrCanvasRef.current?.toDataURL('image/png') || qrDataUrl;
    if (!dataUrl) {
      showToast('QR Code not fully loaded yet. Please wait.', 'error');
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('✓ Product QR downloaded successfully', 'success');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          text: `Shop ${product.name} on ${store.storeName}:`,
          url: productUrl
        });
      } catch {}
    } else {
      await navigator.clipboard.writeText(productUrl);
      showToast('✓ Product store link copied to clipboard', 'success');
    }
  };

  const handleCopyBarcode = () => {
    if (product.barcode) {
      navigator.clipboard.writeText(product.barcode);
      showToast('✓ Barcode copied to clipboard', 'success');
    } else {
      showToast('No barcode available for this product', 'error');
    }
  };

  const isOutOfStock = (product.quantity || 0) <= 0;

  return (
    <div 
      ref={containerRef}
      className="bg-card border border-border/40 hover:border-primary/20 rounded-2xl p-4 flex flex-col justify-between gap-3 min-h-[140px] relative overflow-hidden transition-all shadow-sm select-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Product Thumbnail */}
          <div className="w-14 h-14 rounded-xl bg-surface-2 border border-border overflow-hidden shrink-0 flex items-center justify-center text-2xl font-display font-black text-primary">
            {product.image ? (
              <img src={product.image} alt="" className="w-full h-full object-cover" />
            ) : (
              '📦'
            )}
          </div>
          {/* Product Details */}
          <div className="text-left min-w-0 flex-1">
            <h4 className="font-display font-bold text-sm text-foreground truncate">{product.name}</h4>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-display font-bold ${
                isOutOfStock 
                  ? 'bg-destructive/10 text-destructive border border-destructive/20' 
                  : 'bg-success/10 text-success border border-success/20'
              }`}>
                {isOutOfStock ? '🔴 Out of Stock' : `🟢 In Stock (${product.quantity})`}
              </span>
            </div>
            <p className="text-xs font-display font-black text-yellow-500 mt-1">₦{(product.sellingPrice || 0).toLocaleString()}</p>
            {product.barcode && (
              <p className="text-[9px] text-muted-foreground font-mono mt-0.5 truncate">🏷️ {product.barcode}</p>
            )}
          </div>
        </div>

        {/* Small Barcode Thumbnail (top-right) — tap to expand */}
        {product.barcode && barcodeDataUrl ? (
          <button
            onClick={() => setShowFullBarcode(!showFullBarcode)}
            className="w-16 h-14 bg-white p-1.5 rounded-xl border border-border flex items-center justify-center shrink-0 shadow-inner cursor-pointer hover:border-primary/30 transition-all active:scale-95 relative"
            title="Tap to view full barcode"
          >
            <img src={barcodeDataUrl} alt="barcode" className="w-full h-full object-contain" />
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] font-display font-bold text-muted-foreground bg-card px-1 rounded">SCAN</span>
          </button>
        ) : (
          <div className="w-16 h-14 bg-surface-2 p-1.5 rounded-xl border border-border/60 flex items-center justify-center shrink-0 relative">
            {!isVisible ? (
              <div className="absolute inset-0 bg-surface-2 animate-pulse rounded-lg" />
            ) : (
              <span className="text-[8px] text-muted-foreground/60 font-display font-bold text-center leading-tight">No<br/>Barcode</span>
            )}
          </div>
        )}
      </div>

      {/* Hidden canvases for generation */}
      <canvas ref={qrCanvasRef} className="hidden" />
      <canvas ref={barcodeCanvasRef} className="hidden" />

      {/* Expanded Full Barcode (shown when tapped) */}
      {showFullBarcode && barcodeDataUrl && (
        <div className="animate-scale-up">
          <div 
            className="p-4 bg-white rounded-2xl border border-border/40 flex flex-col items-center gap-2 shadow-md cursor-pointer"
            onClick={() => setShowFullBarcode(false)}
          >
            <img src={barcodeDataUrl} alt="Full Barcode" className="w-full max-w-[260px] h-14 object-contain" />
            <span className="text-[10px] font-mono text-muted-foreground">{product.barcode}</span>
            <span className="text-[9px] text-primary font-display font-bold">Scan to buy · Tap to close</span>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="border-t border-border/40 my-0.5" />
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={handlePrintShelfLabel}
          className="py-1.5 rounded-lg bg-surface-2 border border-border hover:bg-surface-3 text-foreground hover:text-primary font-display font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition active:scale-95"
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <button
          onClick={handleDownload}
          className="py-1.5 rounded-lg bg-surface-2 border border-border hover:bg-surface-3 text-foreground hover:text-primary font-display font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition active:scale-95"
        >
          <Download className="w-3.5 h-3.5" /> Get QR
        </button>
        <button
          onClick={handleShare}
          className="py-1.5 rounded-lg bg-surface-2 border border-border hover:bg-surface-3 text-foreground hover:text-primary font-display font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition active:scale-95"
        >
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
        <button
          onClick={handleCopyBarcode}
          disabled={!product.barcode}
          className={`py-1.5 rounded-lg border font-display font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition active:scale-95 ${
            product.barcode
              ? 'bg-surface-2 border-border hover:bg-surface-3 text-foreground hover:text-primary'
              : 'bg-surface-2/40 border-border/40 text-muted-foreground/40 cursor-not-allowed'
          }`}
        >
          <Copy className="w-3.5 h-3.5" /> Copy Bar
        </button>
      </div>
    </div>
  );
}

// ============ MAIN ============
export default function Settings({ store, onUpdate, onLock, currentUser }: SettingsProps) {
  const [view, setViewState] = useState<View>('home');
  const [viewStack, setViewStack] = useState<View[]>(['home']);
  const barcodeQrCanvasRef = useRef<HTMLCanvasElement>(null);
  const storeBarcodeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [showAllProductsQR, setShowAllProductsQR] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [analyticsFilter, setAnalyticsFilter] = useState<'today' | 'week' | 'month' | 'year'>('week');
  const [showUrl, setShowUrl] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [storeExistsInCloud, setStoreExistsInCloud] = useState<boolean | null>(null);
  const [checkingCloudStatus, setCheckingCloudStatus] = useState(false);
  const [cloudStatusError, setCloudStatusError] = useState<string | null>(null);

  const setView = (newView: View) => {
    setViewStack(prev => {
      const idx = prev.indexOf(newView);
      if (idx !== -1) {
        const stepsBack = prev.length - 1 - idx;
        if (stepsBack > 0) {
          window.history.go(-stepsBack);
        }
        return prev;
      } else {
        window.history.pushState({ settingsView: newView }, '', '');
        setViewState(newView);
        return [...prev, newView];
      }
    });
  };

  useEffect(() => {
    const handlePop = (e: PopStateEvent) => {
      const targetView = (e.state && e.state.settingsView) || 'home';
      setViewState(targetView);
      setViewStack(prev => {
        const idx = prev.indexOf(targetView);
        if (idx !== -1) {
          return prev.slice(0, idx + 1);
        } else {
          return [...prev, targetView];
        }
      });
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [timer, setTimer] = useState<LockTimer>(getLockTimer());
  const [theme, setTheme] = useState<ThemeId>(getTheme());
  const [showTrash, setShowTrash] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showSavingsModal, setShowSavingsModal] = useState(false);
  const [lowStock, setLowStock] = useState<string>(String(getLowStockThreshold()));
  const [helpOpen, setHelpOpen] = useState<string | null>(null);
  const [newAccessCode, setNewAccessCode] = useState(store.accessCode);
  const [revealCode, setRevealCode] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Cloud Sync Auth Modal State
  const [showCloudAuthModal, setShowCloudAuthModal] = useState(false);

  const handleCloudAuthSuccess = async (profile: any) => {
    setShowCloudAuthModal(false);
    
    if (!profile || !profile.id) {
      showToast("Please sign in again.", "error");
      return;
    }

    if (!store || !store.accessCode) {
      showToast("Store record does not exist. Please load or create a store first.", "error");
      return;
    }

    try {
      // 1. Wait until authentication is fully loaded
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session || !session.user) {
        console.error("Cloud sync: auth session not loaded/missing", sessionError);
        showToast("Please sign in again.", "error");
        return;
      }

      // Check profile matches active session
      if (profile.auth_user_id !== session.user.id) {
        console.error("Cloud sync: profile auth_user_id mismatch with session user id", { profileUid: profile.auth_user_id, sessionUid: session.user.id });
        showToast("Please sign in again.", "error");
        return;
      }

      const { data: existingStore, error: fetchError } = await supabase
        .from('stores')
        .select('id')
        .eq('access_code', store.accessCode)
        .maybeSingle();

      if (fetchError) {
        console.warn("Cloud sync: error querying existing store:", fetchError);
      }

      const storeId = store.storeId || store.accessCode;
      const storeUrl = generateStoreUrl(storeId);

      const payload: any = {
        owner_id: profile.id,
        business_name: store.storeName,
        business_type: store.category || 'retail',
        logo: store.profile?.logoStyle || 'minimalist',
        access_code: store.accessCode,
        owner_password: store.managerSettings?.ownerPassword || 'owner',
        data: store as any,
        store_id: storeId,
        qr_code: storeUrl,
        barcode: storeId,
        updated_at: new Date().toISOString()
      };

      if (existingStore && existingStore.id) {
        payload.id = existingStore.id;
      }

      const { data: dbStore, error: storeError } = await supabase
        .from('stores')
        .upsert(payload, { onConflict: 'access_code' })
        .select('id')
        .maybeSingle();

      if (storeError) {
        console.error("Cloud sync: database upsert failed:", storeError);
        return showToast(storeError.message || 'Database policy restricted the sync operation.', 'error');
      }

      if (!dbStore || !dbStore.id) {
        console.error("Cloud sync: upsert returned no store details or missing ID");
        return showToast('Database policy restricted the sync operation.', 'error');
      }

      const { error: memberError } = await supabase.from('store_members').upsert({
        store_id: dbStore.id,
        profile_id: profile.id,
        role: 'owner'
      }, { onConflict: 'store_id,profile_id' });

      if (memberError) {
        console.error("Cloud sync: member link failed:", memberError);
        return showToast(memberError.message || 'Failed to link account to the store.', 'error');
      }

      updateMgr({ multiDeviceSync: true });
      const updatedStore = {
        ...store,
        managerSettings: {
          ...store.managerSettings,
          multiDeviceSync: true
        }
      };
      saveStore(updatedStore);
      showToast('Cloud Sync Enabled! Backup created successfully.', 'success');
    } catch (err: any) {
      console.error("Cloud sync failed to start:", err);
      showToast(err.message || 'Failed to initialize cloud backup', 'error');
    }
  };

  // Backup system state
  const [localBackups, setLocalBackups] = useState<LocalBackup[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<LocalBackup | null>(null);

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const list = await getLocalBackups();
      setLocalBackups(list);
    } catch (err) {
      showToast('Failed to load local backups', 'error');
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    if (view === 'backups') {
      loadBackups();
    }
  }, [view]);

  const handleCreateManualBackup = async () => {
    try {
      const payload = compileBackupPayload();
      const dbData: Record<string, string> = {
        index: payload.index,
        deviceMemory: JSON.stringify(payload.deviceMemory),
        lowStock: payload.lowStock || '',
        lockTimer: payload.lockTimer || '',
        theme: payload.theme || '',
      };
      for (const [k, v] of Object.entries(payload.stores)) {
        dbData[k] = v;
      }
      await saveLocalBackup('manual', dbData);
      showToast('✓ Local backup snapshot created');
      loadBackups();
    } catch (err) {
      showToast('Failed to save backup snapshot', 'error');
    }
  };

  const handleDeleteBackup = async (id: string) => {
    try {
      await deleteLocalBackup(id);
      showToast('Snapshot deleted');
      loadBackups();
    } catch (err) {
      showToast('Failed to delete snapshot', 'error');
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreConfirm) return;
    try {
      const dbData = restoreConfirm.data;
      const stores: Record<string, string> = {};
      for (const [k, v] of Object.entries(dbData)) {
        if (k.startsWith('storeflow_') && k !== 'storeflow_index' && k !== 'storeflow_flow_memory') {
          stores[k] = v;
        }
      }
      
      const payload: BackupPayload = {
        version: '1.0',
        timestamp: restoreConfirm.timestamp,
        deviceMemory: dbData.deviceMemory ? JSON.parse(dbData.deviceMemory) : null,
        index: dbData.index || '[]',
        stores,
        lowStock: dbData.lowStock || undefined,
        lockTimer: dbData.lockTimer || undefined,
        theme: dbData.theme || undefined,
      };

      const result = restoreBackupPayload(payload);
      showToast(`✓ Restored: ${result.storesRestoredCount} stores merged successfully`);
      setRestoreConfirm(null);
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      showToast('Failed to restore snapshot', 'error');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let payload = JSON.parse(event.target?.result as string);
        if (payload.version === '1.0-encrypted') {
          const key = prompt("Enter Owner Password or Emergency Recovery Key to decrypt backup:");
          if (!key) {
            showToast('Decryption cancelled', 'error');
            return;
          }
          try {
            payload = decryptBackup(payload, key);
          } catch (decErr: any) {
            showToast(decErr.message || 'Incorrect decryption key', 'error');
            return;
          }
        }
        
        if (!payload.version || !payload.index) {
          showToast('Invalid StoreFlow backup file schema', 'error');
          return;
        }
        
        const result = restoreBackupPayload(payload);
        showToast(`✓ Imported: ${result.storesRestoredCount} stores successfully merged`);
        
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } catch (err) {
        showToast('Failed to parse backup JSON file', 'error');
      }
    };
    reader.readAsText(file);
  };
  const [showExport, setShowExport] = useState(false);
  const [showContactPopup, setShowContactPopup] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSQLDetails, setShowSQLDetails] = useState(false);

  // Draw the store QR code and Barcode when barcode view is active
  // 1. Verify that the store already exists in the cloud database before showing the QR code
  useEffect(() => {
    if (view !== 'barcode') return;

    if (!store.storeId) {
      setCloudStatusError("Permanent Store ID is missing.");
      setStoreExistsInCloud(false);
      return;
    }

    setCheckingCloudStatus(true);
    setCloudStatusError(null);
    setStoreExistsInCloud(null);

    console.log("QR Generation: Verifying cloud status for Store ID:", store.storeId);

    // Query stores table to see if it exists in the cloud database
    supabase
      .from('stores')
      .select('id')
      .eq('access_code', store.accessCode)
      .maybeSingle()
      .then(({ data: cloudStore, error }) => {
        setCheckingCloudStatus(false);
        if (error) {
          console.error("Cloud status check failed query:", error);
          setCloudStatusError("Failed to verify cloud connection: " + error.message);
          setStoreExistsInCloud(false);
          return;
        }

        if (cloudStore && cloudStore.id) {
          console.log("Cloud status check: Store exists in cloud with table ID =", cloudStore.id);
          setStoreExistsInCloud(true);
        } else {
          console.warn("Cloud status check: Store does not exist in the cloud.");
          setStoreExistsInCloud(false);
          setCloudStatusError("Store has not been uploaded to the cloud yet. Please enable Multi-device Cloud Sync under Security Settings to back up and publish your store first.");
        }
      }).catch(err => {
        setCheckingCloudStatus(false);
        console.error("Cloud check execution error:", err);
        setStoreExistsInCloud(false);
        setCloudStatusError("Network error occurred while connecting to the cloud.");
      });
  }, [view, store.accessCode, store.storeId]);

  // 2. Draw and decode-verify the store QR code and Barcode
  useEffect(() => {
    if (view !== 'barcode') return;
    if (!storeExistsInCloud) {
      console.warn("Skipping QR code generation because store is not published to the cloud.");
      return;
    }

    const storeId = store.storeId;
    if (!storeId) {
      console.error("Cannot generate QR code: Store ID is missing.");
      return;
    }

    const storeUrl = generateStoreUrl(storeId);
    console.log("QR Generation: Store ID =", storeId, "Generated URL =", storeUrl);

    // Draw QR code
    if (barcodeQrCanvasRef.current) {
      drawQRCode({ text: storeUrl, canvas: barcodeQrCanvasRef.current, logoType: 'cube' })
        .then(() => {
          console.log("QR Generation Success!");
          
          // Verify by decoding after generation
          if (barcodeQrCanvasRef.current) {
            barcodeQrCanvasRef.current.toBlob(async (blob) => {
              if (!blob) {
                console.error("QR Verification: Failed to convert canvas to blob");
                return;
              }
              const file = new File([blob], "qr.png", { type: "image/png" });
              try {
                // Initialize Html5Qrcode using our hidden container
                const html5QrCode = new Html5Qrcode("temp-qr-scanner-element");
                const decodedText = await html5QrCode.scanFile(file, false);
                console.log("QR Verification SUCCESS! Decoded text:", decodedText);
                if (decodedText === storeUrl) {
                  console.log("QR Verification: Decoded URL matches generated URL.");
                } else {
                  console.error("QR Verification ERROR: Decoded URL does not match generated URL!", { decodedText, storeUrl });
                  showToast("QR verification warning: Decoded URL mismatch.", "warning");
                }
              } catch (scanErr) {
                console.error("QR Verification ERROR: Failed to decode generated QR canvas:", scanErr);
              }
            }, "image/png");
          }
        })
        .catch((err) => {
          console.error("QR Generation Failed:", err);
        });
    }

    // Draw Barcode
    if (storeBarcodeCanvasRef.current) {
      drawBarcode(storeId, storeBarcodeCanvasRef.current, {
        barColor: '#000000',
        bgColor: '#FFFFFF',
        barWidth: 2,
        height: 70,
        showText: true
      });
    }
  }, [view, storeExistsInCloud, store.storeId, store.accessCode, store.storeName]);

  const handlePrintQR = () => {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Could not open print window. Please allow popups.', 'error');
      return;
    }

    const storeId = store.storeId || store.accessCode;
    const storeUrl = generateStoreUrl(storeId);

    // Generate a fresh branded QR onto a temp canvas, export as PNG
    const tmpCanvas = document.createElement('canvas');

    drawQRCode({ text: storeUrl, canvas: tmpCanvas, logoType: 'cart' }).then(() => {
      const imgData = tmpCanvas.toDataURL('image/png');
      printWindow.document.write(`
        <html>
          <head>
            <title>Print QR Code - ${store.storeName}</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center;
                padding: 40px;
                color: #0f172a;
              }
              .card {
                border: 3px solid #FFC72C;
                border-radius: 24px;
                padding: 40px;
                max-width: 420px;
                margin: 0 auto;
                background: #111111;
                color: #ffffff;
                box-shadow: 0 0 24px rgba(255,199,44,0.15);
              }
              h1 { font-size: 26px; margin-bottom: 6px; font-weight: 800; color: #fff; }
              p { font-size: 13px; color: #aaa; margin-bottom: 20px; }
              .qr-container {
                margin: 0 auto 20px;
                background: #fff;
                border-radius: 16px;
                display: inline-block;
                padding: 12px;
              }
              img { width: 260px; height: 260px; display: block; }
              .code-box {
                background: #1a1a1a;
                border: 1px solid #FFC72C44;
                padding: 10px 20px;
                border-radius: 12px;
                font-family: monospace;
                font-size: 18px;
                font-weight: bold;
                letter-spacing: 3px;
                color: #FFC72C;
                display: inline-block;
                margin-top: 10px;
              }
              .footer { margin-top: 28px; font-size: 11px; color: #555; }
              @media print { body { padding: 0; } .card { border: none; max-width: 100%; } }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>${store.storeName}</h1>
              <p>Scan this premium QR to view store details, products & contact info.</p>
              <div class="qr-container">
                <img src="${imgData}" alt="StoreFlow QR Code" />
              </div>
              <div><div class="code-box">${storeId}</div></div>
              <div class="footer">Powered by StoreFlow &bull; Secure &bull; Branded</div>
            </div>
            <script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    });
  };
  const [delStoreNameInput, setDelStoreNameInput] = useState('');
  const [delCodeInput, setDelCodeInput] = useState('');
  const [delConfirmTextInput, setDelConfirmTextInput] = useState('');
  const [delError, setDelError] = useState('');

  const [profile, setProfile] = useState<StoreProfile>(
    store.profile || { storeType: '', location: '', phone: '', email: '' }
  );
  const [profilePassword, setProfilePassword] = useState(store.managerSettings?.ownerPassword || '');
  const [revealProfilePass, setRevealProfilePass] = useState(false);
  const [payment, setPayment] = useState<PaymentInfo>(store.profile?.payment || {});
  const [rent, setRent] = useState<RentInfo>(store.profile?.rent || { isRented: false });
  const [mgr, setMgr] = useState<ManagerSettings>({ ...DEFAULT_MANAGER_SETTINGS, ...(store.managerSettings || {}) });
  const [savings, setSavings] = useState<SavingsGoal>(store.savingsGoal || {
    amount: 500000, label: 'Emergency Fund', source: 'profit', percentage: 10, saved: 0,
    bankName: '', frequency: 'weekly',
  });

  const trashCount = getTrash(store).length;
  const insights = useMemo(() => generateInsights(store, '7d'), [store]);
  const latestInsight = insights[0];

  // ----- profile completion -----
  const profileCompletion = useMemo(() => {
    const fields = [
      store.profile?.photo, profile.storeType, profile.location, profile.phone, profile.email,
      profile.website, profile.openingTime, profile.closingTime, profile.ownerName,
      payment.bankName, payment.accountNumber,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [store.profile, profile, payment]);

  const lowStockCount = store.products.filter(p => p.quantity <= getLowStockThreshold()).length;
  const activeNotifTypes = [
    mgr.notifyInsights, mgr.notifyRecommendations, mgr.notifyAlerts,
    mgr.notifyWeeklyRecap, mgr.notifySavingsReminders, mgr.notifyLowStock,
  ].filter(Boolean).length;
  const savingsPct = savings.amount > 0 ? Math.min(100, (savings.saved / savings.amount) * 100) : 0;

  // ----- persistence -----
  const persist = (patch: Partial<StoreData>) => {
    const updated = { ...store, ...patch };
    saveStore(updated); onUpdate(updated);
  };
  const updateMgr = (patch: Partial<ManagerSettings>) => {
    const next = { ...mgr, ...patch };
    setMgr(next); persist({ managerSettings: next });
  };

  const handleWishlistUpdate = (updatedStore: StoreData) => {
    saveStore(updatedStore);
    onUpdate(updatedStore);
  };

  // Auto discount input local string states to allow empty inputs
  const [discValStr, setDiscValStr] = useState('');
  const [discMinStr, setDiscMinStr] = useState('');
  const [discMaxStr, setDiscMaxStr] = useState('');

  // Local state string variables for restock settings
  const [defaultPurchaseQtyStr, setDefaultPurchaseQtyStr] = useState('');
  const [defaultRestockQtyStr, setDefaultRestockQtyStr] = useState('');
  const [minStockThresholdStr, setMinStockThresholdStr] = useState('');

  const handleDiscValChange = (val: string) => {
    setDiscValStr(val);
    const n = Number(val);
    updateMgr({ autoDiscountValue: isNaN(n) ? 0 : n });
  };

  const handleDiscMinChange = (val: string) => {
    setDiscMinStr(val);
    const n = Number(val);
    updateMgr({ autoDiscountMinSubtotal: isNaN(n) ? 0 : n });
  };

  const handleDiscMaxChange = (val: string) => {
    setDiscMaxStr(val);
    const n = Number(val);
    updateMgr({ autoDiscountMaxSubtotal: isNaN(n) ? 0 : n });
  };

  const handleSaveRestockSettings = () => {
    const defaultPurchaseQty = Math.max(1, Number(defaultPurchaseQtyStr) || 1);
    const defaultRestockQty = Math.max(1, Number(defaultRestockQtyStr) || 1);
    const minStockThreshold = Math.max(0, Number(minStockThresholdStr) || 0);

    updateMgr({
      defaultPurchaseQty,
      defaultRestockQty,
      minStockThreshold
    });

    setDefaultPurchaseQtyStr(String(defaultPurchaseQty));
    setDefaultRestockQtyStr(String(defaultRestockQty));
    setMinStockThresholdStr(String(minStockThreshold));

    showToast('✓ Restock settings saved successfully!', 'success');
  };

  useEffect(() => {
    if (view === 'discount') {
      setDiscValStr(mgr.autoDiscountValue ? String(mgr.autoDiscountValue) : '');
      setDiscMinStr(mgr.autoDiscountMinSubtotal ? String(mgr.autoDiscountMinSubtotal) : '');
      setDiscMaxStr(mgr.autoDiscountMaxSubtotal ? String(mgr.autoDiscountMaxSubtotal) : '');
    }
  }, [view, mgr.autoDiscountValue, mgr.autoDiscountMinSubtotal, mgr.autoDiscountMaxSubtotal]);

  useEffect(() => {
    if (view === 'inventory') {
      setDefaultPurchaseQtyStr(mgr.defaultPurchaseQty !== undefined ? String(mgr.defaultPurchaseQty) : '10');
      setDefaultRestockQtyStr(mgr.defaultRestockQty !== undefined ? String(mgr.defaultRestockQty) : '50');
      setMinStockThresholdStr(mgr.minStockThreshold !== undefined ? String(mgr.minStockThreshold) : '5');
    }
  }, [view, mgr.defaultPurchaseQty, mgr.defaultRestockQty, mgr.minStockThreshold]);

  const updateSavings = (patch: Partial<SavingsGoal>) => {
    const next = { ...savings, ...patch };
    setSavings(next); persist({ savingsGoal: next });
  };
  const persistProfile = (nextProfile: StoreProfile, nextPayment = payment, nextRent = rent) => {
    const merged: StoreProfile = { ...nextProfile, payment: nextPayment, rent: nextRent };
    persist({ profile: merged });
  };
  const updatePayment = (patch: Partial<PaymentInfo>) => {
    const next = { ...payment, ...patch };
    setPayment(next);
    persistProfile(profile, next, rent);
  };
  const updateRent = (patch: Partial<RentInfo>) => {
    const next = { ...rent, ...patch };
    setRent(next);
    persistProfile(profile, payment, next);
  };

  const handleThemeChange = (t: ThemeId) => {
    setTheme(t); applyTheme(t);
    const meta = THEMES.find(x => x.id === t);
    if (meta) showToast(meta.quote);
  };

  const handlePhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showToast('Image must be under 2 MB', 'error');
    const reader = new FileReader();
    reader.onload = () => {
      const next: StoreProfile = { ...profile, photo: reader.result as string };
      setProfile(next);
      persistProfile(next);
      showToast('Store photo updated');
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    const next: StoreProfile = { ...profile, photo: undefined };
    setProfile(next);
    persistProfile(next);
    showToast('Photo removed');
  };

  useEffect(() => { saveLockTimer(timer); saveSession(store.accessCode); }, [timer, store.accessCode]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  useEffect(() => {
    setProfile(store.profile || { storeType: '', location: '', phone: '', email: '' });
    setPayment(store.profile?.payment || {});
    setRent(store.profile?.rent || { isRented: false });
    setMgr({ ...DEFAULT_MANAGER_SETTINGS, ...(store.managerSettings || {}) });
    setProfilePassword(store.managerSettings?.ownerPassword || '');
  }, [store]);

  const handleLock = () => { clearSession(); onLock(); showToast('Store locked'); };

  const handleUpdateAccessCode = () => {
    if (!newAccessCode || newAccessCode.trim().length < 4) {
      return showToast('Access code must be at least 4 characters', 'error');
    }
    const cleanCode = newAccessCode.trim().toUpperCase();
    const index = getStoreIndex();
    const duplicate = index.find(s => s.code === cleanCode && s.code !== store.accessCode);
    if (duplicate) {
      return showToast('Access code already in use by another store', 'error');
    }

    localStorage.removeItem(STORE_PREFIX + store.accessCode);
    const updated = { ...store, accessCode: cleanCode };
    localStorage.setItem(STORE_PREFIX + cleanCode, JSON.stringify(updated));
    localStorage.setItem('storeflow_active_session', cleanCode);
    
    const updatedIndex = index.map(s => s.code === store.accessCode ? { ...s, code: cleanCode } : s);
    localStorage.setItem('storeflow_store_index', JSON.stringify(updatedIndex));

    onUpdate(updated);
    showToast('✓ Access code changed successfully');
  };

  const handleUpdatePassword = () => {
    if (!newPassword || newPassword.length < 4) {
      return showToast('Password must be at least 4 characters', 'error');
    }
    if (newPassword !== confirmPassword) {
      return showToast('Passwords do not match', 'error');
    }
    updateMgr({ ownerPassword: newPassword.trim() });
    setNewPassword('');
    setConfirmPassword('');
    showToast('✓ Password reset successfully');
  };
  const toggleSavings = (next: boolean) => {
    updateMgr({ savingsPlanner: next });
    if (next && !store.savingsGoal) setShowSavingsModal(true);
  };

  // ============ BARCODE / QR SCREEN ============
  if (view === 'barcode') {
    const storeId = store.storeId || store.accessCode;
    const storeUrl = generateStoreUrl(storeId);

    const handlePrint = () => {
      if (typeof window === 'undefined') return;
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showToast('Could not open print window. Please allow popups.', 'error');
        return;
      }
      
      const qrDataUrl = barcodeQrCanvasRef.current ? barcodeQrCanvasRef.current.toDataURL('image/png') : '';
      const barcodeDataUrl = storeBarcodeCanvasRef.current ? storeBarcodeCanvasRef.current.toDataURL('image/png') : '';
      
      const logoHtml = store.profile?.photo 
        ? `<img class="store-logo" src="${store.profile.photo}" alt="" />`
        : `<div class="store-icon-placeholder">🏪</div>`;

      printWindow.document.write(`
        <html>
          <head>
            <title>Store Details - ${store.storeName}</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center;
                padding: 40px;
                background: #ffffff;
                color: #0f172a;
              }
              .container {
                max-width: 500px;
                margin: 0 auto;
                border: 2px solid #e2e8f0;
                border-radius: 24px;
                padding: 32px;
                box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
              }
              .store-logo {
                width: 64px;
                height: 64px;
                object-fit: cover;
                border-radius: 50%;
                margin: 0 auto 12px;
                border: 2px solid #FFC72C;
              }
              .store-icon-placeholder {
                font-size: 48px;
                margin-bottom: 12px;
              }
              h1 {
                font-size: 24px;
                font-weight: 800;
                margin: 0 0 4px 0;
              }
              .store-id {
                font-family: monospace;
                font-size: 14px;
                color: #FFC72C;
                font-weight: bold;
                margin-bottom: 24px;
              }
              .qr-box, .barcode-box {
                margin: 20px auto;
              }
              .qr-img {
                width: 180px;
                height: 180px;
              }
              .barcode-img {
                max-width: 100%;
                height: 80px;
                object-fit: contain;
              }
              .url-text {
                font-size: 11px;
                color: #64748b;
                word-break: break-all;
                margin-top: 12px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              ${logoHtml}
              <h1>${store.storeName}</h1>
              <div class="store-id">Store ID: ${storeId}</div>
              
              <div class="qr-box">
                <img class="qr-img" src="${qrDataUrl}" alt="QR" />
              </div>
              <div class="barcode-box">
                <img class="barcode-img" src="${barcodeDataUrl}" alt="Barcode" />
              </div>
              <div class="url-text">${storeUrl}</div>
            </div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    };

    const handlePrintQR = () => {
      if (typeof window === 'undefined') return;
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showToast('Could not open print window. Please allow popups.', 'error');
        return;
      }
      const qrDataUrl = barcodeQrCanvasRef.current ? barcodeQrCanvasRef.current.toDataURL('image/png') : '';
      printWindow.document.write(`
        <html>
          <head>
            <title>Store QR Code - ${store.storeName}</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center;
                padding: 40px;
                background: #ffffff;
                color: #0f172a;
              }
              .qr-img {
                width: 250px;
                height: 250px;
                object-fit: contain;
                margin: 20px auto;
              }
              .url-text {
                font-size: 12px;
                color: #64748b;
                word-break: break-all;
              }
            </style>
          </head>
          <body>
            <h2>${store.storeName} Store QR Code</h2>
            <p>Scan to Browse and Shop</p>
            <img class="qr-img" src="${qrDataUrl}" />
            <div class="url-text">${storeUrl}</div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    };

    const handlePrintBarcode = () => {
      if (typeof window === 'undefined') return;
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showToast('Could not open print window. Please allow popups.', 'error');
        return;
      }
      const barcodeDataUrl = storeBarcodeCanvasRef.current ? storeBarcodeCanvasRef.current.toDataURL('image/png') : '';
      printWindow.document.write(`
        <html>
          <head>
            <title>Store Barcode - ${store.storeName}</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center;
                padding: 40px;
                background: #ffffff;
                color: #0f172a;
              }
              .barcode-img {
                max-width: 100%;
                height: 100px;
                object-fit: contain;
                margin: 20px auto;
              }
            </style>
          </head>
          <body>
            <h2>${store.storeName} Barcode</h2>
            <img class="barcode-img" src="${barcodeDataUrl}" />
            <p>Store ID: ${storeId}</p>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    };

    const handleShareBarcode = () => {
      if (navigator.share) {
        navigator.share({
          title: `${store.storeName} Barcode`,
          text: `Identify store using Barcode: ${storeId}`,
        }).catch(() => {});
      } else {
        navigator.clipboard.writeText(storeId);
        showToast('Store ID copied to clipboard!', 'success');
      }
    };

    const handleShare = () => {
      if (navigator.share) {
        navigator.share({
          title: store.storeName,
          text: `Scan to shop at ${store.storeName}!`,
          url: storeUrl
        }).catch(() => {});
      } else {
        navigator.clipboard.writeText(storeUrl);
        showToast('Store URL copied to clipboard!', 'success');
      }
    };

    const handleCopy = () => {
      navigator.clipboard.writeText(storeUrl);
      showToast('Store URL copied!', 'success');
    };

    const handleDownloadQR = () => {
      if (barcodeQrCanvasRef.current) {
        const url = barcodeQrCanvasRef.current.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `${store.storeName.replace(/\s+/g, '_')}_qr.png`;
        a.click();
        showToast('Store QR Code downloaded!', 'success');
      }
    };

    const handleDownloadBarcode = () => {
      if (storeBarcodeCanvasRef.current) {
        const url = storeBarcodeCanvasRef.current.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `${store.storeName.replace(/\s+/g, '_')}_barcode.png`;
        a.click();
        showToast('Store Barcode downloaded!', 'success');
      }
    };

    const handleScanDetected = (code: string) => {
      let targetId = code;
      if (code.includes('/product/')) {
        const parts = code.split('/product/');
        targetId = parts[parts.length - 1];
      }

      if (code === storeId || code === storeUrl) {
        showToast(`✓ Scanned Store QR: Verified ${store.storeName}`, 'success');
        setScannerOpen(false);
        return;
      }

      const prod = store.products.find(p => p.barcode === targetId || p.id === targetId);
      if (prod) {
        setScannedProduct(prod);
        setScannerOpen(false);
        showToast(`✓ Found product: ${prod.name}`, 'success');
      } else {
        showToast(`Code not found in inventory: ${code}`, 'error');
        setScannerOpen(false);
      }
    };

    return (
      <SubPage 
        title="QR & Barcodes" 
        onBack={() => setView('home')}
      >
        <div className="space-y-6 pb-20 select-none text-left">
          {/* Store Information Card (Premium Identity Card style) */}
          <div className="relative overflow-hidden p-5 rounded-2xl bg-card border border-border/80 shadow-sm flex flex-col gap-4">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border overflow-hidden shrink-0 flex items-center justify-center text-3xl shadow-sm">
                {store.profile?.photo ? (
                  <img src={store.profile.photo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <StoreLogo styleName={store.profile?.logoStyle} storeName={store.storeName} size="md" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-display font-black text-base text-foreground truncate">{store.storeName}</h4>
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-success/15 border border-success/30 text-[9px] font-display font-bold text-success">
                    ✓ Verified
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-mono">Store ID: <span className="text-yellow-500 font-bold">{storeId}</span></p>
                <p className="text-[10px] text-muted-foreground leading-none">Registered: {new Date(store.createdAt).toLocaleDateString('en-GB')}</p>
              </div>
            </div>

            <div className="border-t border-border/40 pt-3 flex gap-2">
              <button 
                onClick={handleShare}
                className="flex-1 py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5" /> Share Store
              </button>
              <button 
                onClick={handlePrint}
                className="flex-1 py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
              >
                <Printer className="w-3.5 h-3.5" /> Print Details
              </button>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(storeId);
                  showToast('✓ Store ID copied to clipboard', 'success');
                }}
                className="flex-1 py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
              >
                <Copy className="w-3.5 h-3.5" /> Copy ID
              </button>
            </div>
          </div>

          {/* Store QR Card (Large center-branded QR) */}
          <div className="p-5 rounded-2xl bg-card border border-border/80 shadow-sm flex flex-col gap-4 text-center">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="font-display font-bold text-sm text-foreground">Official Store QR Code</h3>
              <span className="px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 text-[9px] font-display font-bold flex items-center gap-1">
                <Shield className="w-3 h-3" /> Permanent
              </span>
            </div>

            {checkingCloudStatus ? (
              <div className="flex flex-col items-center justify-center p-8 space-y-3">
                <span className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <p className="text-xs text-muted-foreground">Verifying Cloud Status...</p>
              </div>
            ) : cloudStatusError || !storeExistsInCloud ? (
              <div className="flex flex-col items-center justify-center p-6 space-y-4 border border-destructive/20 bg-destructive/5 rounded-3xl text-center">
                <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center text-xl">⚠️</div>
                <div className="space-y-1">
                  <h4 className="font-display font-black text-sm text-foreground">Cloud Sync Required</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xs">{cloudStatusError || "This store is not published to the cloud."}</p>
                </div>
                <button
                  onClick={() => setView('security')}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs hover:opacity-90 active:scale-95 transition"
                >
                  Enable Cloud Sync
                </button>
              </div>
            ) : (
              <>
                {/* QR Canvas */}
                <div className="relative flex justify-center p-5 bg-white rounded-3xl max-w-[200px] w-full mx-auto border border-border/30 shadow-md">
                  <canvas ref={barcodeQrCanvasRef} className="w-40 h-40" />
                </div>

                <div className="space-y-1">
                  <h4 className="font-display font-black text-base text-foreground">Scan to Shop</h4>
                  <p className="text-[10px] text-muted-foreground max-w-xs mx-auto">Scan with a mobile camera to browse products and buy directly.</p>
                </div>

                {/* Benefit Grid */}
                <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto text-left text-[11px] text-muted-foreground font-display font-semibold py-2.5 border-t border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">📦</span>
                    <span>Browse Products</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">⚡</span>
                    <span>Order Instantly</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">💳</span>
                    <span>Pay Securely</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🚚</span>
                    <span>Pickup or Delivery</span>
                  </div>
                </div>

                {/* View Link Toggle */}
                <div className="space-y-2">
                  <button 
                    onClick={() => setShowUrl(!showUrl)}
                    className="text-xs text-primary font-semibold hover:underline flex items-center justify-center gap-1 mx-auto"
                  >
                    {showUrl ? 'Hide Store URL' : 'View Store URL'}
                  </button>
                  {showUrl && (
                    <div className="p-2.5 rounded-xl bg-surface-2 border border-border text-[10px] font-mono text-muted-foreground break-all select-all/80 animate-scale-up">
                      {storeUrl}
                    </div>
                  )}
                </div>

                {/* Equal Buttons Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    onClick={handleDownloadQR}
                    className="py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                  >
                    <Download className="w-4 h-4" /> Download
                  </button>
                  <button
                    onClick={handlePrintQR}
                    className="py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                  >
                    <Printer className="w-4 h-4" /> Print
                  </button>
                  <button
                    onClick={handleShare}
                    className="py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                  >
                    <Share2 className="w-4 h-4" /> Share
                  </button>
                  <button
                    onClick={handleCopy}
                    className="py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                  >
                    <Link2 className="w-4 h-4" /> Copy Link
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Store Barcode Card (Breathing room layout) */}
          <div className="p-5 rounded-2xl bg-card border border-border/80 shadow-sm flex flex-col gap-4 text-center">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="font-display font-bold text-sm text-foreground">Official Store Barcode</h3>
              <span className="px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 text-[9px] font-display font-bold flex items-center gap-1">
                <Shield className="w-3 h-3" /> Permanent
              </span>
            </div>

            {/* Barcode Canvas with breathing room padding */}
            <div className="p-6 bg-white rounded-3xl border border-border/30 max-w-sm w-full mx-auto flex items-center justify-center shadow-md">
              <canvas ref={storeBarcodeCanvasRef} className="max-w-full h-16 object-contain" />
            </div>

            <p className="text-xs text-muted-foreground font-display font-bold">Store ID: <span className="font-mono text-yellow-500 font-black">{storeId}</span></p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={handleDownloadBarcode}
                className="py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
              >
                <Download className="w-4 h-4" /> Download
              </button>
              <button
                onClick={handlePrintBarcode}
                className="py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
              >
                <Printer className="w-4 h-4" /> Print
              </button>
              <button
                onClick={handleShareBarcode}
                className="py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
              >
                <Share2 className="w-4 h-4" /> Share
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(storeId);
                  showToast('✓ Barcode ID copied to clipboard', 'success');
                }}
                className="py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
              >
                <Copy className="w-4 h-4" /> Copy Bar
              </button>
            </div>
          </div>

          {/* Analytics Section */}
          <div className="space-y-4 pt-2 text-left">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-foreground">QR & Barcode Analytics</h3>
              <div className="flex gap-1 p-1 bg-surface-2 border border-border rounded-xl">
                {['today', 'week', 'month', 'year'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setAnalyticsFilter(filter as any)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-display font-bold transition capitalize select-none ${
                      analyticsFilter === filter 
                        ? 'bg-primary text-primary-foreground shadow-sm' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid of Metric Cards (Blurred out representation) */}
            <div className="relative">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 opacity-30 select-none pointer-events-none">
                {[
                  { name: 'Total QR Scans', value: '-' },
                  { name: 'Orders From QR', value: '-' },
                  { name: 'Conversion Rate', value: '-' },
                  { name: 'Product QR Scans', value: '-' },
                  { name: 'Store Barcode Scans', value: '-' },
                  { name: 'Most Scanned Product', value: '-' }
                ].map((card, i) => (
                  <div key={i} className="p-4 rounded-xl bg-card border border-border/40">
                    <p className="text-[10px] text-muted-foreground font-display font-semibold uppercase">{card.name}</p>
                    <p className="text-xl font-display font-black text-foreground mt-1.5">{card.value}</p>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center p-6 bg-background/20 backdrop-blur-[0.5px]">
                <div className="bg-card border border-border p-5 rounded-2xl shadow-lg max-w-xs text-center space-y-1.5 animate-scale-up">
                  <span className="text-2xl">📊</span>
                  <h4 className="font-display font-bold text-xs text-foreground">No analytics available yet</h4>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">Live telemetry of customer scans, conversions, and orders will appear here automatically.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Product QR Codes Section */}
          <div className="space-y-4 pt-2 text-left">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-foreground">Product QR Codes</h3>
              {store.products.length > 0 && (
                <button 
                  onClick={() => setShowAllProductsQR(true)}
                  className="text-xs text-yellow-500 hover:text-yellow-600 font-display font-bold cursor-pointer"
                >
                  View all ({store.products.length})
                </button>
              )}
            </div>

            {store.products.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {store.products.slice(0, 4).map(prod => (
                  <ProductQRRow key={prod.id} product={prod} store={store} />
                ))}
              </div>
            ) : (
              <div className="p-8 rounded-2xl border border-dashed border-border/80 text-center flex flex-col items-center justify-center gap-3 bg-surface-1">
                <span className="text-4xl animate-breathe">📦</span>
                <div>
                  <h4 className="font-display font-bold text-sm text-foreground">No products yet</h4>
                  <p className="text-[11px] text-muted-foreground max-w-xs mx-auto leading-relaxed mt-1">Products automatically receive QR Codes and optional Barcodes after creation.</p>
                </div>
                <button
                  onClick={() => {
                    setView('home');
                    showToast('Navigate to the Inventory tab to add products', 'info');
                  }}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-display font-bold text-xs rounded-xl cursor-pointer transition active:scale-95 shadow-sm flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 font-bold" /> Add Product
                </button>
              </div>
            )}
          </div>
        </div>

        {/* View All Modal */}
        {showAllProductsQR && (
          <div className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setShowAllProductsQR(false)}>
            <div className="w-full max-w-md bg-card border border-border rounded-3xl p-5 animate-slide-up space-y-4 max-h-[85vh] flex flex-col shadow-[0_0_30px_rgba(0,0,0,0.3)]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-base text-foreground">All Product QR Codes</h3>
                  <p className="text-[10px] text-muted-foreground">Print secure tag labels for inventory tracking.</p>
                </div>
                <button 
                  onClick={() => { setShowAllProductsQR(false); setProductSearchQuery(''); }}
                  className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Search bar inside View All Modal */}
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                <input 
                  type="text"
                  placeholder="Search products..."
                  value={productSearchQuery}
                  onChange={e => setProductSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-2 border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              {/* Scrollable Products List */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 select-none no-scrollbar">
                <div className="grid grid-cols-1 gap-3">
                  {store.products
                    .filter(p => p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) || (p.barcode && p.barcode.includes(productSearchQuery)))
                    .map(prod => (
                      <ProductQRRow key={prod.id} product={prod} store={store} />
                    ))
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Floating Scan Button */}
        <button
          onClick={() => setScannerOpen(true)}
          className="fixed bottom-24 right-5 sm:right-10 z-40 bg-yellow-500 hover:bg-yellow-400 text-black w-14 h-14 rounded-full flex items-center justify-center shadow-lg cursor-pointer transition active:scale-95 border border-yellow-400/20"
          title="Open Scanner Console"
        >
          <Camera className="w-6 h-6" />
        </button>

        {/* Scanner Modal */}
        {scannerOpen && (
          <BarcodeScanner
            title="Scan Store/Product Code"
            subtitle="Point at any Store QR, Barcode, or Product Tag"
            onClose={() => setScannerOpen(false)}
            onDetected={handleScanDetected}
          />
        )}

        {/* Scanned Product Details Modal */}
        {scannedProduct && (
          <div className="fixed inset-0 z-[90] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setScannedProduct(null)}>
            <div className="w-full max-w-sm bg-card border border-border rounded-3xl p-5 animate-scale-up space-y-4 text-left" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-success" /> Scanned Product Found
                </h3>
                <button 
                  onClick={() => setScannedProduct(null)} 
                  className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xs font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-3xl overflow-hidden shrink-0">
                  {scannedProduct.image ? (
                    <img src={scannedProduct.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    '📦'
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-display font-bold text-sm text-foreground truncate">{scannedProduct.name}</h4>
                  <p className="text-xs font-display font-black text-yellow-500 mt-1">₦{(scannedProduct.sellingPrice || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Quantity: {scannedProduct.quantity} units</p>
                </div>
              </div>

              <div className="pt-2 border-t border-border flex gap-2">
                <button
                  onClick={() => {
                    setScannedProduct(null);
                    setProductSearchQuery(scannedProduct.name);
                    setShowAllProductsQR(true);
                  }}
                  className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-display font-bold text-xs rounded-xl cursor-pointer text-center"
                >
                  Manage Product
                </button>
                <button
                  onClick={() => setScannedProduct(null)}
                  className="flex-1 py-2 bg-surface-2 border border-border text-foreground font-display font-bold text-xs rounded-xl cursor-pointer text-center"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        <div id="temp-qr-scanner-element" style={{ display: 'none' }} />
      </SubPage>
    );
  }

  // ============ SUB-VIEWS ============
  if (view === 'profile') return (
    <SubPage title="Edit Profile" onBack={() => setView('home')}>
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-center gap-4">
          <button onClick={() => photoInputRef.current?.click()}
            className="relative w-20 h-20 rounded-2xl overflow-hidden bg-primary/15 border border-primary/30 flex items-center justify-center text-3xl">
            {profile.photo ? (
              <img src={profile.photo} alt="" className="w-full h-full object-cover" />
            ) : profile.logoStyle ? (
              <StoreLogo storeName={store.storeName} selectedStyle={profile.logoStyle} className="w-full h-full" />
            ) : (
              '🏪'
            )}
            <span className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">📷</span>
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
          <div className="flex-1 space-y-1.5">
            <button onClick={() => photoInputRef.current?.click()} className="text-xs font-display font-semibold text-primary">Change photo</button>
            {profile.photo && <button onClick={removePhoto} className="block text-xs text-destructive">Remove</button>}
            <div className="text-[11px] text-muted-foreground font-mono">Store ID: {store.accessCode}</div>
            {store.managerSettings?.multiDeviceSync ? (
              <div className="text-[10px] text-success font-semibold flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                ✓ Pushed to Internet (Synced)
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground/60 font-semibold flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                Not Synced
              </div>
            )}
          </div>
        </div>

        <Field label="Owner Name" value={profile.ownerName || ''} onChange={v => setProfile({ ...profile, ownerName: v })} placeholder="Your full name" />
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Store Type</label>
          <select value={profile.storeType} onChange={e => setProfile({ ...profile, storeType: e.target.value })} className={inputClass}>
            <option value="">Select type…</option>
            {['Retail Shop','Supermarket','Provision Store','Mini Mart','Wholesale','Pharmacy','Restaurant','Other'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground mb-1">Store Logo Concept</label>
          <div className="grid grid-cols-5 gap-1.5">
            {LOGO_STYLES.map(style => (
              <button
                key={style.id}
                type="button"
                onClick={() => setProfile({ ...profile, logoStyle: style.id })}
                className={`p-1 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  profile.logoStyle === style.id ? 'bg-primary/10 border-primary ring-1 ring-primary/20' : 'bg-surface-2 border-border hover:border-border-hover'
                }`}
              >
                <StoreLogo storeName={store.storeName} selectedStyle={style.id} className="w-8 h-8" />
                <span className="text-[7.5px] text-center text-muted-foreground font-bold leading-tight">{style.label}</span>
              </button>
            ))}
          </div>
        </div>
        <Field label="Business Address" value={profile.location} onChange={v => setProfile({ ...profile, location: v })} placeholder="12 Market Road, Lagos" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Phone" value={profile.phone} onChange={v => setProfile({ ...profile, phone: v })} placeholder="08012345678" type="tel" />
          <Field label="Email" value={profile.email} onChange={v => setProfile({ ...profile, email: v })} placeholder="store@email.com" type="email" />
        </div>
        <Field label="Website" value={profile.website || ''} onChange={v => setProfile({ ...profile, website: v })} placeholder="www.mystore.com" />
        <div className="space-y-1 text-left">
          <label className="block text-xs text-muted-foreground mb-1">Owner Password</label>
          <div className="relative">
            <input
              type={revealProfilePass ? "text" : "password"}
              value={profilePassword}
              onChange={e => setProfilePassword(e.target.value)}
              placeholder="Enter password"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setRevealProfilePass(!revealProfilePass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer text-xs"
              title={revealProfilePass ? "Hide Password" : "Show Password"}
            >
              👁️
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Opening Time" value={profile.openingTime || ''} onChange={v => setProfile({ ...profile, openingTime: v })} type="time" />
          <Field label="Closing Time" value={profile.closingTime || ''} onChange={v => setProfile({ ...profile, closingTime: v })} type="time" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Business Opened" value={profile.openingDate || ''} onChange={v => setProfile({ ...profile, openingDate: v })} type="date" />
          <Field label="Employees" value={String(profile.employees ?? '')} onChange={v => setProfile({ ...profile, employees: Number(v) || undefined })} type="number" placeholder="0" />
        </div>
      </div>

      {/* Rent */}
      <div className={`${card} p-5 space-y-3`}>
        <h3 className="font-display font-bold text-base">Store Rent</h3>
        <p className="text-xs text-muted-foreground -mt-1">Is your store rented?</p>
        <div className="flex gap-2">
          {[{v:true,l:'Yes'},{v:false,l:'No · I own it'}].map(o => (
            <button key={o.l} onClick={() => updateRent({ isRented: o.v })}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-display font-semibold ${rent.isRented===o.v ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-surface-2 border-border text-muted-foreground'}`}>
              {o.l}
            </button>
          ))}
        </div>
        {rent.isRented && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Rent Amount (₦)" value={String(rent.amount ?? '')} onChange={v => updateRent({ amount: Number(v) || 0 })} type="number" />
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Frequency</label>
                <select value={rent.frequency || 'yearly'} onChange={e => updateRent({ frequency: e.target.value as RentFrequency })} className={inputClass}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
            <Field label="Next Due Date" value={rent.dueDate || ''} onChange={v => updateRent({ dueDate: v })} type="date" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Landlord (optional)" value={rent.landlordName || ''} onChange={v => updateRent({ landlordName: v })} />
              <Field label="Landlord Contact" value={rent.landlordContact || ''} onChange={v => updateRent({ landlordContact: v })} />
            </div>
            {rent.amount ? (
              <div className="p-3 rounded-lg bg-success/10 border border-success/30 text-xs text-success">
                Flow will plan for a 10% buffer → target ₦{Math.round((rent.amount || 0) * 1.1).toLocaleString()}
              </div>
            ) : null}
          </div>
        )}
        {!rent.isRented && (
          <div className="p-3 rounded-lg bg-success/10 border border-success/30 text-xs text-success">
            Store Owned · Flow will track maintenance & emergency reserves.
          </div>
        )}
      </div>

      <button onClick={() => {
        persistProfile(profile);
        if (profilePassword.trim() && profilePassword.trim() !== store.managerSettings?.ownerPassword) {
          updateMgr({ ownerPassword: profilePassword.trim() });
        }
        setView('home');
        showToast('Profile saved');
      }}
        className="w-full p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold">Save Profile</button>

    </SubPage>
  );

  if (view === 'flow') return (
    <SubPage title="Flow Settings" onBack={() => setView('home')}>
      {/* Master toggle */}
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Enable Flow" description="Master switch — turn on for insights, forecasts and advice." checked={mgr.enabled} onChange={v => updateMgr({ enabled: v })} />
      </div>

      {!mgr.enabled && (
        <div className="flex flex-col items-center justify-center py-16 px-4 space-y-5">
          <div className="flex justify-center items-center drop-shadow-[0_4px_12px_rgba(99,102,241,0.15)]">
            <Mascot size={140} mood="sleeping" animate={mgr.mascotAnimations} store={store} />
          </div>
          <div className="text-center space-y-1.5 max-w-xs">
            <p className="font-display font-bold text-base text-foreground">Flow is resting 💤</p>
            <p className="text-xs text-muted-foreground leading-normal">
              Flow is currently asleep. Toggle the switch above to wake him up and unlock forecasts, advice, and real-time business helpers.
            </p>
          </div>
        </div>
      )}

      {mgr.enabled && (
        <>
          {/* Forecasts */}
          <div className="px-1">
            <SectionLabel>Forecasts</SectionLabel>
          </div>
          <div className={`${card} px-4 divide-y divide-border`}>
            <ToggleRow label="Revenue Forecasts" checked={mgr.revenueForecasts} onChange={v => updateMgr({ revenueForecasts: v })} />
            <ToggleRow label="Profit Forecasts" checked={mgr.profitForecasts} onChange={v => updateMgr({ profitForecasts: v })} />
            <ToggleRow label="Inventory Forecasts" checked={mgr.inventoryForecasts} onChange={v => updateMgr({ inventoryForecasts: v })} />
            <ToggleRow label="Expense Analysis" checked={mgr.expenseAnalysis} onChange={v => updateMgr({ expenseAnalysis: v })} />
          </div>

          {/* Recommendations */}
          <div className="px-1">
            <SectionLabel>Recommendations</SectionLabel>
          </div>
          <div className={`${card} px-4 divide-y divide-border`}>
            <ToggleRow label="Smart Pricing" checked={mgr.smartPricing} onChange={v => updateMgr({ smartPricing: v })} />
            <ToggleRow label="Product Suggestions" checked={mgr.productSuggestions} onChange={v => updateMgr({ productSuggestions: v })} />
            <ToggleRow label="Business Advice" checked={mgr.businessAdvice} onChange={v => updateMgr({ businessAdvice: v })} />
            <ToggleRow label="Business Expansion" checked={mgr.businessExpansion} onChange={v => updateMgr({ businessExpansion: v })} />
          </div>

          {/* Tools */}
          <div className="px-1">
            <SectionLabel>Tools</SectionLabel>
          </div>
          <div className={`${card} px-4 divide-y divide-border`}>
            <ToggleRow label="Weekly Recaps" checked={mgr.weeklyRecap} onChange={v => updateMgr({ weeklyRecap: v })} />
            <ToggleRow label="Customer Request Tracking" checked={mgr.customerRequests} onChange={v => updateMgr({ customerRequests: v })} />
            <ToggleRow label="Savings Planner" checked={mgr.savingsPlanner} onChange={toggleSavings} />
            <ToggleRow label="Voice Notes" checked={mgr.voiceFeatures} onChange={v => updateMgr({ voiceFeatures: v })} />
            <ToggleRow label="Auto-Listen on Sales" description="Mic starts automatically when you open the Sales page." checked={mgr.autoVoiceListen} onChange={v => updateMgr({ autoVoiceListen: v })} />
            <ToggleRow label="Auto Print Receipts" description="Automatically trigger receipt printing after recording a sale." checked={mgr.autoPrintReceipt} onChange={v => updateMgr({ autoPrintReceipt: v })} />
            <ToggleRow label="Business Questions" checked={mgr.businessQuestions} onChange={v => updateMgr({ businessQuestions: v })} />
          </div>

          {/* Flow Speech Voice Selection */}
          <div className="px-1 mt-4">
            <SectionLabel>Flow Speech Voice</SectionLabel>
          </div>
          <div className={`${card} p-4 space-y-3`}>
            <div>
              <p className="text-sm font-display font-semibold text-foreground">Voice Preference</p>
              <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">
                Choose the preferred voice style for Flow's spoken advice.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { id: 'young-male' as const, label: 'Younger Male Voice 👦 (Default)', desc: 'Bright, energetic, and highly engaging' },
                { id: 'male' as const, label: 'Male Voice 👨', desc: 'Deconstructive, deep, and professional' },
                { id: 'female' as const, label: 'Female Voice 👩', desc: 'Warm, natural, and welcoming' }
              ].map(voiceOpt => {
                const isSelected = (mgr.voiceGender || 'young-male') === voiceOpt.id;
                return (
                  <button
                    key={voiceOpt.id}
                    onClick={() => {
                      updateMgr({ voiceGender: voiceOpt.id });
                      
                      // Speak a small preview using standard SpeechSynthesis with selected voice characteristics
                      if (typeof window !== 'undefined' && window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                        const previewText = voiceOpt.id === 'young-male' ? "Hi, I am Flow! Ready to scale your store?" :
                                            voiceOpt.id === 'male' ? "Hello. I am Flow, your business manager companion." :
                                            "Hi there, I am Flow! Let's make some sales today.";
                        const utterance = new SpeechSynthesisUtterance(previewText);
                        
                        const voices = window.speechSynthesis.getVoices();
                        const enVoices = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
                        const maleNames = ['david', 'mark', 'george', 'daniel', 'ravi', 'male', 'google us english male', 'google uk english male'];
                        const femaleNames = ['zira', 'samantha', 'hazel', 'susan', 'heera', 'female', 'google us english female', 'google uk english female'];
                        
                        let selectedVoice = null;
                        let pitch = 1.0;
                        let rate = 0.95;
                        
                        if (voiceOpt.id === 'male') {
                          selectedVoice = enVoices.find(v => maleNames.some(name => v.name.toLowerCase().includes(name))) || 
                                          voices.find(v => maleNames.some(name => v.name.toLowerCase().includes(name)));
                          pitch = 0.95;
                          rate = 0.92;
                        } else if (voiceOpt.id === 'female') {
                          selectedVoice = enVoices.find(v => femaleNames.some(name => v.name.toLowerCase().includes(name))) || 
                                          voices.find(v => femaleNames.some(name => v.name.toLowerCase().includes(name)));
                          pitch = 1.05;
                          rate = 0.95;
                        } else {
                          // young-male
                          selectedVoice = enVoices.find(v => maleNames.some(name => v.name.toLowerCase().includes(name))) || 
                                          voices.find(v => maleNames.some(name => v.name.toLowerCase().includes(name)));
                          pitch = 1.35;
                          rate = 0.98;
                        }
                        
                        if (!selectedVoice) {
                          selectedVoice = enVoices.find(v => 
                            (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Microsoft') || v.name.includes('Premium')) && 
                            v.lang.startsWith('en')
                          ) || enVoices[0] || voices[0];
                        }
                        
                        if (selectedVoice) {
                          utterance.voice = selectedVoice;
                        }
                        utterance.pitch = pitch;
                        utterance.rate = rate;
                        window.speechSynthesis.speak(utterance);
                      }
                    }}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/30'
                        : 'bg-surface-2 border-border hover:border-border-hover'
                    }`}
                  >
                    <div>
                      <p className="font-display font-bold text-xs text-foreground">{voiceOpt.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{voiceOpt.desc}</p>
                    </div>
                    <span className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center shrink-0 ml-3 ${
                      isSelected
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/35'
                    }`}>
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Graph Settings */}
          <div className="px-1 mt-4">
            <SectionLabel>Active Periods Graph</SectionLabel>
          </div>
          <div className={`${card} p-4 space-y-3`}>
            <div>
              <p className="text-sm font-display font-semibold">Graph Interval</p>
              <p className="text-[11px] text-muted-foreground">Select the bucket time interval for the active periods chart.</p>
            </div>
            <div className="flex gap-2">
              {([10, 30, 60] as const).map(interval => (
                <button key={interval} onClick={() => updateMgr({ graphInterval: interval })}
                  className={`flex-1 py-2 rounded-lg text-xs font-display font-bold border transition-colors ${mgr.graphInterval === interval ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 border-border text-muted-foreground'}`}>
                  {interval === 60 ? '1 Hour' : `${interval} Mins`}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </SubPage>
  );

  if (view === 'pricing') return (
    <SubPage title="Pricing" onBack={() => setView('home')}>
      <div className={`${card} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-display font-semibold">Default Profit Margin</p>
            <p className="text-[11px] text-muted-foreground">Used by smart pricing suggestions.</p>
          </div>
          <div className="flex items-center gap-1">
            <input type="number" value={mgr.defaultMargin}
              onChange={e => updateMgr({ defaultMargin: Math.max(0, Number(e.target.value) || 0) })}
              className="w-16 p-2 rounded-lg bg-surface-2 border border-border text-sm text-right focus:outline-none focus:border-primary" />
            <span className="text-sm text-primary font-bold">%</span>
          </div>
        </div>
        <div className="flex gap-2">
          {[20,30,40,50].map(p => (
            <button key={p} onClick={() => updateMgr({ defaultMargin: p })}
              className={`flex-1 py-2 rounded-lg text-xs font-display font-bold border ${mgr.defaultMargin===p ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 border-border text-muted-foreground'}`}>
              {p}%
            </button>
          ))}
        </div>
      </div>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Auto-Suggest Selling Prices" checked={mgr.autoSuggestPrices} onChange={v => updateMgr({ autoSuggestPrices: v })} />
        <ToggleRow label="Auto-Apply Suggested Prices" checked={mgr.autoApplyPrices} onChange={v => updateMgr({ autoApplyPrices: v })} />
        <ToggleRow label="Show Product Profit" checked={mgr.showProductProfit} onChange={v => updateMgr({ showProductProfit: v })} />
        <ToggleRow label="Smart Pricing Enabled" checked={mgr.smartPricing} onChange={v => updateMgr({ smartPricing: v })} />
      </div>
    </SubPage>
  );

  if (view === 'inventory') return (
    <SubPage title="Inventory" onBack={() => setView('home')}>
      <div className={`${card} p-4 space-y-3`}>
        <NumberRow label="Low Stock Threshold" value={lowStock} onChange={setLowStock}
          onSave={() => { const n = Number(lowStock); if (!Number.isFinite(n) || n < 0) return showToast('Invalid number', 'error'); saveLowStockThreshold(n); showToast(`Low stock set to ${Math.floor(n)}`); }} />
        <NumberRow label="Critical Stock Threshold" value={String(mgr.criticalStockThreshold)}
          onChange={v => updateMgr({ criticalStockThreshold: Math.max(0, Number(v) || 0) })}
          onSave={() => showToast('Saved')} />
      </div>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Restock Suggestions" checked={mgr.restockSuggestions} onChange={v => updateMgr({ restockSuggestions: v })} />
        <ToggleRow label="Inventory Alerts" checked={mgr.inventoryAlerts} onChange={v => updateMgr({ inventoryAlerts: v })} />
        <ToggleRow label="Low Stock Notifications" checked={mgr.notifyLowStock} onChange={v => updateMgr({ notifyLowStock: v })} />
      </div>

      <div className="px-1 mt-4">
        <SectionLabel>Default Restock Settings</SectionLabel>
      </div>
      <div className={`${card} p-4 space-y-4`}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Default Purchase Quantity</label>
            <input
              type="number"
              min="1"
              value={defaultPurchaseQtyStr}
              onChange={e => setDefaultPurchaseQtyStr(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Default Restock Target</label>
            <input
              type="number"
              min="1"
              value={defaultRestockQtyStr}
              onChange={e => setDefaultRestockQtyStr(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Minimum Stock Threshold</label>
            <input
              type="number"
              min="0"
              value={minStockThresholdStr}
              onChange={e => setMinStockThresholdStr(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Restock Frequency</label>
            <select
              value={mgr.restockFrequency || 'weekly'}
              onChange={e => updateMgr({ restockFrequency: e.target.value as 'daily' | 'weekly' | 'monthly' })}
              className={inputClass}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        {/* Save Settings Button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSaveRestockSettings}
            className="px-4 py-2 bg-primary text-primary-foreground font-display font-bold text-xs rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            Save Settings
          </button>
        </div>
      </div>
    </SubPage>
  );

  if (view === 'wishlist') return (
    <SubPage title="Wishlist" subtitle="Track products you want to add or stock" onBack={() => setView('home')}>
      <Wishlist store={store} onUpdate={handleWishlistUpdate} />
    </SubPage>
  );

  if (view === 'discount') return (
    <SubPage title="Automatic Discounts" onBack={() => setView('home')}>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow
          label="Enable Automatic Discount"
          description="Automatically calculate and apply a discount at checkout if criteria are met."
          checked={mgr.autoDiscountEnabled ?? false}
          onChange={v => updateMgr({ autoDiscountEnabled: v })}
        />
      </div>

      {mgr.autoDiscountEnabled && (
        <div className={`${card} p-4 space-y-4 animate-fade-in`}>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Discount Type</label>
            <div className="flex rounded-lg bg-surface-2 border border-border overflow-hidden">
              {([['percentage', 'Percentage (%)'], ['flat', 'Flat Amount (₦)']] as const).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => updateMgr({ autoDiscountType: type })}
                  className={`flex-1 px-3 py-2 text-xs font-display font-semibold transition-all ${
                    mgr.autoDiscountType === type ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Discount Value {mgr.autoDiscountType === 'percentage' ? '(%)' : '(₦)'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={discValStr}
                onChange={e => handleDiscValChange(e.target.value)}
                className={inputClass + ' flex-1 font-display font-bold text-sm'}
                placeholder="0"
              />
              <span className="text-sm font-bold text-primary">
                {mgr.autoDiscountType === 'percentage' ? '%' : '₦'}
              </span>
            </div>
          </div>

          <div className="border-t border-border/60 pt-3">
            <h4 className="text-xs font-display font-bold text-muted-foreground uppercase mb-2">Conditions (Criteria)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Min Subtotal (₦)</label>
                <input
                  type="number"
                  min="0"
                  value={discMinStr}
                  onChange={e => handleDiscMinChange(e.target.value)}
                  className={inputClass + ' font-mono text-xs'}
                  placeholder="0"
                />
                <span className="text-[9px] text-muted-foreground block mt-0.5">e.g. above 10,000</span>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Max Subtotal (₦)</label>
                <input
                  type="number"
                  min="0"
                  value={discMaxStr}
                  onChange={e => handleDiscMaxChange(e.target.value)}
                  className={inputClass + ' font-mono text-xs'}
                  placeholder="0"
                />
                <span className="text-[9px] text-muted-foreground block mt-0.5">e.g. below 50,000</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="p-3 bg-success/10 border border-success/20 rounded-xl text-[11px] text-success leading-relaxed">
        <strong>How it works:</strong> Automatic discounts apply in the shopping cart when the subtotal falls within your defined criteria range. You can always override or edit the discount manually during checkout.
      </div>
    </SubPage>
  );

  if (view === 'savings') return (
    <SubPage title="Savings Plan" onBack={() => setView('home')}>
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-center gap-4">
          <ProgressRing pct={savingsPct} size={72} color="hsl(var(--primary))" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Goal</p>
            <p className="font-display font-bold text-xl text-primary">₦{savings.amount.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">Saved ₦{savings.saved.toLocaleString()}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Stat label="Source" value={`${savings.percentage}% of ${savings.source}`} />
          <Stat label="Frequency" value={savings.frequency || 'weekly'} />
          <Stat label="Destination" value={savings.bankName || '—'} />
          <Stat label="Progress" value={`${Math.round(savingsPct)}%`} />
        </div>
        <button onClick={() => setShowSavingsModal(true)} className="w-full p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold">Edit Savings Plan</button>
      </div>
      {showSavingsModal && (
        <SavingsModal initial={savings} onClose={() => setShowSavingsModal(false)} onSave={(g) => { updateSavings(g); setShowSavingsModal(false); showToast('Savings plan saved'); }} animate={mgr.mascotAnimations} store={store} />
      )}
    </SubPage>
  );

  if (view === 'appearance') return (
    <SubPage title="Appearance" onBack={() => setView('home')}>
      <div className={`${card} p-4 space-y-3`}>
        <h3 className="font-display font-bold text-sm">Theme</h3>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map(t => (
            <button key={t.id} onClick={() => handleThemeChange(t.id)}
              className={`relative p-3 rounded-xl border text-center transition-all ${theme === t.id ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/30' : 'bg-surface-2 border-border'}`}>
              {theme === t.id && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">✓</span>}
              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-lg border border-border" style={{ background: t.swatch }}>{t.emoji}</div>
              <p className="font-display font-semibold text-xs">{t.label}</p>
            </button>
          ))}
        </div>
      </div>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Mascot Animations" description="Animate Flow across the app." checked={mgr.mascotAnimations} onChange={v => updateMgr({ mascotAnimations: v })} />
        <ToggleRow label="Number Animations" description="Count up and pulse numeric statistics." checked={mgr.numericAnimations ?? true} onChange={v => updateMgr({ numericAnimations: v })} />
        <ToggleRow label="Reduce Motion" checked={mgr.reduceMotion} onChange={v => updateMgr({ reduceMotion: v })} />
        <ToggleRow label="Compact Mode" description="Tighter spacing across cards." checked={mgr.compactMode} onChange={v => updateMgr({ compactMode: v })} />
      </div>
    </SubPage>
  );

  if (view === 'notifications') return (
    <SubPage title="Notifications" onBack={() => setView('home')}>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Insights" checked={mgr.notifyInsights} onChange={v => updateMgr({ notifyInsights: v })} />
        <ToggleRow label="Recommendations" checked={mgr.notifyRecommendations} onChange={v => updateMgr({ notifyRecommendations: v })} />
        <ToggleRow label="Alerts" checked={mgr.notifyAlerts} onChange={v => updateMgr({ notifyAlerts: v })} />
        <ToggleRow label="Weekly Recaps" checked={mgr.notifyWeeklyRecap} onChange={v => updateMgr({ notifyWeeklyRecap: v })} />
        <ToggleRow label="Monthly Reports" checked={mgr.notifyMonthlyReports} onChange={v => updateMgr({ notifyMonthlyReports: v })} />
        <ToggleRow label="Savings Reminders" checked={mgr.notifySavingsReminders} onChange={v => updateMgr({ notifySavingsReminders: v })} />
        <ToggleRow label="Customer Request Alerts" checked={mgr.notifyCustomerRequests} onChange={v => updateMgr({ notifyCustomerRequests: v })} />
        <ToggleRow label="Low Stock Alerts" checked={mgr.notifyLowStock} onChange={v => updateMgr({ notifyLowStock: v })} />
      </div>
    </SubPage>
  );

  if (view === 'security') return (
    <SubPage title="Security" onBack={() => setView('home')}>
      {/* 1. Multi-device Cloud Sync Section */}
      <div className="px-1">
        <SectionLabel>Cloud Integration</SectionLabel>
      </div>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow 
          label="Multi-device Cloud Sync" 
          description="Enable real-time cloud backup to sync and access this store on other devices." 
          checked={mgr.multiDeviceSync || false} 
          onChange={async (v) => {
            if (v) {
              // 1. Immediately toggle the switch ON for instant user response
              updateMgr({ multiDeviceSync: true });
              const updatedStore = {
                ...store,
                managerSettings: {
                  ...store.managerSettings,
                  multiDeviceSync: true
                }
              };
              saveStore(updatedStore);

              // 2. Perform session check in the background
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session && session.user && session.user.id) {
                  // Active session exists! Setup sync
                  let { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('auth_user_id', session.user.id)
                    .maybeSingle();

                  if (!profile) {
                    const { data: newProfile } = await supabase
                      .from('profiles')
                      .insert({
                        auth_user_id: session.user.id,
                        email: session.user.email || store.profile?.email || '',
                        full_name: session.user.email?.split('@')[0] || store.storeName || 'User',
                        role: 'owner'
                      })
                      .select()
                      .single();
                    profile = newProfile;
                  }

                  if (profile && profile.id) {
                    const { data: existingStore } = await supabase
                      .from('stores')
                      .select('id')
                      .eq('access_code', store.accessCode)
                      .maybeSingle();

                    const payload: any = {
                      owner_id: profile.id,
                      business_name: store.storeName,
                      business_type: store.category || 'retail',
                      logo: store.profile?.logoStyle || 'minimalist',
                      access_code: store.accessCode,
                      owner_password: store.managerSettings?.ownerPassword || 'owner',
                      data: updatedStore as any,
                      updated_at: new Date().toISOString()
                    };

                    if (existingStore && existingStore.id) {
                      payload.id = existingStore.id;
                    }

                    const { data: dbStore, error: storeError } = await supabase
                      .from('stores')
                      .upsert(payload, { onConflict: 'access_code' })
                      .select('id')
                      .maybeSingle();

                    if (storeError) {
                      console.error("Cloud sync background setup error:", storeError);
                    }

                    if (dbStore && dbStore.id) {
                      await supabase.from('store_members').upsert({
                        store_id: dbStore.id,
                        profile_id: profile.id,
                        role: 'owner'
                      }, { onConflict: 'store_id,profile_id' });
                    }

                    showToast('✓ Cloud Sync auto-enabled and data synced to internet!', 'success');
                  }
                } else {
                  // No session, open login modal
                  setShowCloudAuthModal(true);
                }
              } catch (e) {
                console.error("Auto sync session check failed:", e);
                setShowCloudAuthModal(true);
              }
            } else {
              updateMgr({ multiDeviceSync: false });
              const updatedStore = {
                ...store,
                managerSettings: {
                  ...store.managerSettings,
                  multiDeviceSync: false
                }
              };
              saveStore(updatedStore);
              showToast('Cloud Sync disabled.');
            }
          }} 
        />
      </div>
      
      {mgr.multiDeviceSync && (
        <div className={`${card} p-4 text-left text-xs border border-success/20 bg-success/5 space-y-2`}>
          <p className="text-success font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            ✓ Store data successfully synced to the Internet
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Use your <strong>Store Access Code ({store.accessCode})</strong> and your <strong>Owner Password</strong> to view this store on other devices.
          </p>
        </div>
      )}

      {/* 2. Biometric and Timer Locking Section */}
      <div className="px-1 mt-4">
        <SectionLabel>App Locking Settings</SectionLabel>
      </div>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Biometric Lock" description="Use fingerprint / Face ID where supported." checked={mgr.biometricLock} onChange={v => updateMgr({ biometricLock: v })} />
        <ToggleRow label="PIN Lock" checked={mgr.pinLock} onChange={v => updateMgr({ pinLock: v })} />
      </div>

      {/* 3. Access Code & Password Section */}
      <div className="px-1 mt-4">
        <SectionLabel>Store Access Credentials</SectionLabel>
      </div>
      <div className={`${card} p-4 space-y-4`}>
        <div className="space-y-1 text-left">
          <label className="text-xs text-muted-foreground uppercase font-bold">Store Access Code (ID)</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type={revealCode ? "text" : "password"}
              value={store.accessCode}
              readOnly
              className="flex-1 p-2.5 rounded-lg bg-surface-2/60 border border-border text-sm font-mono focus:outline-none text-muted-foreground select-all cursor-not-allowed"
            />
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setRevealCode(!revealCode)}
                className="px-3.5 py-2.5 rounded-lg bg-surface-3 border border-border text-foreground hover:bg-surface-2 transition active:scale-95 flex items-center justify-center cursor-pointer"
                title={revealCode ? "Hide access code" : "Review access code"}
              >
                {revealCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(store.accessCode);
                  showToast('📋 Access code copied to clipboard!', 'success');
                }}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:opacity-90 active:scale-95 transition cursor-pointer"
              >
                Copy Code
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Unique identifier used to access this store. This code cannot be changed.</p>
        </div>

        {/* Reset Owner Password */}
        <div className="border-t border-border/40 pt-3 space-y-3 text-left">
          <label className="text-xs text-muted-foreground uppercase font-bold">Reset Owner Password</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative flex items-center">
              <input
                type={showPass ? "text" : "password"}
                placeholder="New Password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 p-1 hover:bg-surface-3 rounded text-muted-foreground hover:text-foreground transition cursor-pointer"
                title={showPass ? "Hide Password" : "Show Password"}
              >
                {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="relative flex items-center">
              <input
                type={showConfirmPass ? "text" : "password"}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPass(!showConfirmPass)}
                className="absolute right-3 p-1 hover:bg-surface-3 rounded text-muted-foreground hover:text-foreground transition cursor-pointer"
                title={showConfirmPass ? "Hide Password" : "Show Password"}
              >
                {showConfirmPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <button
            onClick={handleUpdatePassword}
            className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:opacity-90 active:scale-95 transition cursor-pointer"
          >
            ✓ Reset Owner Password
          </button>
        </div>
      </div>

      {/* 4. Auto Lock Timer */}
      <div className={`${card} p-4 space-y-2`}>
        <h3 className="font-display font-bold text-sm text-left">Auto Lock Timer</h3>
        {[
          { v: '1h' as LockTimer, l: '1 Hour' },
          { v: '4h' as LockTimer, l: '4 Hours' },
          { v: '8h' as LockTimer, l: '8 Hours' },
          { v: '12h' as LockTimer, l: '12 Hours' },
          { v: 'never' as LockTimer, l: 'Always Open' },
        ].map(opt => (
          <button key={opt.v} onClick={() => setTimer(opt.v)}
            className={`w-full p-3 rounded-lg border text-left flex items-center justify-between cursor-pointer ${timer===opt.v ? 'bg-primary/10 border-primary/40' : 'bg-surface-2 border-border text-foreground'}`}>
            <span className="font-display font-semibold text-sm">{opt.l}</span>
            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${timer===opt.v ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
              {timer===opt.v && <span className="text-primary-foreground text-[10px]">✓</span>}
            </span>
          </button>
        ))}
      </div>

      {/* 5. Lock Action */}
      <div className="pt-4">
        <button onClick={handleLock} className="w-full p-3 rounded-xl bg-surface-2 border border-border text-foreground font-display font-semibold hover:bg-surface-3 cursor-pointer">
          🔒 Lock Store Now
        </button>
      </div>

      {/* Cloud Auth Modal — rendered inside security view */}
      {showCloudAuthModal && (
        <CloudAuthModal
          onAuthSuccess={handleCloudAuthSuccess}
          onClose={() => {
            setShowCloudAuthModal(false);
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (!session) {
                updateMgr({ multiDeviceSync: false });
                const updatedStore = {
                  ...store,
                  managerSettings: {
                    ...store.managerSettings,
                    multiDeviceSync: false
                  }
                };
                saveStore(updatedStore);
                showToast('Cloud Sync disabled.');
              }
            });
          }}
          initialEmail={store.profile?.email || ''}
          initialPassword={store.managerSettings?.ownerPassword || ''}
          initialFullName={store.profile?.ownerName || store.storeName || ''}
        />
      )}
    </SubPage>
  );

  if (view === 'data') return (
    <SubPage title="Data & Storage" onBack={() => setView('home')}>
      <div className="grid grid-cols-2 gap-3">
        <DataTile 
          icon={<RefreshCw className="w-4.5 h-4.5" />} 
          label="Switch Store" 
          subtitle="Switch between your stores"
          iconBg="rgba(99, 102, 241, 0.15)"
          iconColor="#818CF8"
          onClick={() => setShowSwitcher(true)} 
        />
        <DataTile 
          icon={<Trash2 className="w-4.5 h-4.5" />} 
          label={trashCount ? `Recently Deleted (${trashCount})` : 'Recently Deleted'}
          subtitle="View and restore deleted items"
          iconBg="rgba(239, 68, 68, 0.15)"
          iconColor="#F87171"
          onClick={() => setShowTrash(true)} 
        />
        <DataTile 
          icon={<ShieldCheck className="w-4.5 h-4.5" />} 
          label="Backups & Restore" 
          subtitle="Backup and restore your data"
          iconBg="rgba(59, 130, 246, 0.15)"
          iconColor="#60A5FA"
          onClick={() => setView('backups')} 
        />
        <DataTile 
          icon={<Download className="w-4.5 h-4.5" />} 
          label="Raw Export" 
          subtitle="Export your data (CSV)"
          iconBg="rgba(16, 185, 129, 0.15)"
          iconColor="#34D399"
          onClick={() => setShowExport(true)} 
        />
      </div>

      {showTrash && (
        <RecentlyDeleted
          store={store}
          onUpdate={onUpdate}
          onClose={() => setShowTrash(false)}
        />
      )}
      {showSwitcher && (
        <StoreSwitcher
          currentCode={store.accessCode}
          onSwitch={onUpdate}
          onClose={() => setShowSwitcher(false)}
        />
      )}
      {showExport && (
        <ExportSheet store={store} onClose={() => setShowExport(false)} />
      )}

      {/* Danger Actions */}
      <div className="space-y-3 pt-4">
        <button
          onClick={() => setShowDeleteModal(true)}
          className="w-full p-4.5 rounded-2xl bg-red-950/20 hover:bg-red-950/30 border border-red-500/25 text-left flex items-center justify-between transition-all duration-200 active:scale-[0.99] group cursor-pointer"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-red-500/15 text-red-400 flex items-center justify-center shrink-0">
              <Trash2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h4 className="font-display font-bold text-sm text-red-400">Delete Store</h4>
              <p className="text-[11px] text-red-500/80 leading-snug mt-0.5">Permanent Action · This action cannot be undone.</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-red-500/50 group-hover:text-red-400 transition-colors" />
        </button>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-[80] bg-background/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => {
          setShowDeleteModal(false);
          setDelStoreNameInput('');
          setDelCodeInput('');
          setDelConfirmTextInput('');
          setDelError('');
        }}>
          <div className="w-full max-w-sm bg-card border border-destructive/30 rounded-2xl p-5 animate-slide-up space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-1.5">
              <div className="text-3xl">⚠️</div>
              <h3 className="font-display font-bold text-lg text-destructive">Delete Store?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This action is permanent and cannot be undone. Answer the following security questions to proceed.
              </p>
            </div>

            <div className="space-y-3.5 pt-1">
              <div className="space-y-1 text-left">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">1. What is this store's name?</label>
                <input
                  value={delStoreNameInput}
                  onChange={e => setDelStoreNameInput(e.target.value)}
                  placeholder="Type store name..."
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none text-foreground"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">2. What is this store's access code?</label>
                <input
                  value={delCodeInput}
                  onChange={e => setDelCodeInput(e.target.value)}
                  placeholder="Type 6-character code..."
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm font-mono focus:outline-none text-foreground"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">3. Confirm by typing "DELETE STORE"</label>
                <input
                  value={delConfirmTextInput}
                  onChange={e => setDelConfirmTextInput(e.target.value)}
                  placeholder="Type DELETE STORE..."
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none text-foreground"
                />
              </div>
            </div>

            {delError && (
              <p className="text-xs text-destructive text-center font-semibold bg-destructive/10 p-2 rounded-lg border border-destructive/20">{delError}</p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDelStoreNameInput('');
                  setDelCodeInput('');
                  setDelConfirmTextInput('');
                  setDelError('');
                }}
                className="flex-1 p-3 rounded-xl bg-surface-2 border border-border font-display font-semibold text-xs text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const matchesName = delStoreNameInput.trim().toLowerCase() === store.storeName.toLowerCase();
                  const matchesCode = delCodeInput.trim().toUpperCase() === store.accessCode.toUpperCase();
                  const matchesConfirm = delConfirmTextInput.trim() === 'DELETE STORE';

                  if (!matchesName) {
                    setDelError('Incorrect store name');
                    return;
                  }
                  if (!matchesCode) {
                    setDelError('Incorrect access code');
                    return;
                  }
                  if (!matchesConfirm) {
                    setDelError('Type DELETE STORE exactly');
                    return;
                  }

                  removeStoreFromIndex(store.accessCode);
                  onLock();
                  showToast('Store successfully deleted');
                }}
                className="flex-1 p-3 rounded-xl bg-destructive text-white font-display font-bold text-xs active:scale-[0.98] transition-transform cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </SubPage>
  );

  if (view === 'backups') {
    return (
      <SubPage title="Backups & Restore" onBack={() => setView('security')}>
        {/* Toggle for Auto-backups */}
        <div className={`${card} px-4 divide-y divide-border`}>
          <ToggleRow
            label="Automatic Backups"
            description="Create a local recovery snapshot in IndexedDB automatically after every sale checkout and expense entry."
            checked={mgr.autoBackupsEnabled ?? false}
            onChange={(v) => updateMgr({ autoBackupsEnabled: v })}
          />
        </div>

        {/* Global Import/Export actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              const pw = prompt("Enter Owner Password to authorize and encrypt backup:");
              if (!pw) return;
              if (pw !== store.managerSettings?.ownerPassword) {
                showToast("Incorrect owner password", "error");
                return;
              }
              triggerBackupExport(store.managerSettings?.ownerPassword, store.managerSettings?.emergencyRecoveryKey);
              showToast('Backup file exported');
            }}
            className="p-4 rounded-2xl bg-card shadow-card flex flex-col items-center justify-center gap-2 hover:ring-1 hover:ring-primary/30 transition-all text-center"
          >
            <span className="text-2xl">📤</span>
            <span className="font-display font-semibold text-xs text-foreground">Export Backup</span>
            <span className="text-[9px] text-muted-foreground">Download database JSON</span>
          </button>
          
          <label className="p-4 rounded-2xl bg-card shadow-card flex flex-col items-center justify-center gap-2 hover:ring-1 hover:ring-primary/30 transition-all text-center cursor-pointer">
            <span className="text-2xl">📥</span>
            <span className="font-display font-semibold text-xs text-foreground">Import Backup</span>
            <span className="text-[9px] text-muted-foreground">Upload and restore JSON</span>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />
          </label>
        </div>

        {/* Manual backup action */}
        <button
          onClick={handleCreateManualBackup}
          className="w-full p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm hover:opacity-95 transition-opacity"
        >
          💾 Create Manual Backup Snapshot
        </button>

        {/* Local restore points list */}
        <div className={`${card} p-4 space-y-3`}>
          <h3 className="font-display font-bold text-sm">Local Snapshots</h3>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Restore points saved locally in IndexedDB database.
          </p>

          {loadingBackups ? (
            <div className="text-center py-4 text-xs text-muted-foreground">Loading snapshots...</div>
          ) : localBackups.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">No local snapshots created yet.</div>
          ) : (
            <div className="space-y-2">
              {localBackups.map((b) => (
                <div key={b.id} className="p-3 rounded-xl bg-surface-2 border border-border flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-xs text-foreground">
                      {b.type === 'auto_save' ? '🔄 Auto-Save' : '👤 Manual Backup'}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {new Date(b.timestamp).toLocaleString()} · {(b.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setRestoreConfirm(b)}
                      className="px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-display font-bold transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handleDeleteBackup(b.id)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors text-[10px]"
                      title="Delete snapshot"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Restore Confirmation Modal */}
        {restoreConfirm && (
          <div className="fixed inset-0 z-[80] bg-background/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="text-center space-y-2">
                <div className="text-3xl">⚠️</div>
                <h3 className="font-display font-bold text-lg">Restore this snapshot?</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This will restore the database to the state recorded on <strong className="text-foreground">{new Date(restoreConfirm.timestamp).toLocaleString()}</strong>.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setRestoreConfirm(null)}
                  className="flex-1 p-3 rounded-xl bg-surface-2 border border-border font-display font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRestoreBackup}
                  className="flex-1 p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs"
                >
                  Confirm Restore
                </button>
              </div>
            </div>
          </div>
        )}
      </SubPage>
    );
  }

  if (view === 'activity-log') {
    const logs = store.activityLogs || [];
    return (
      <SubPage title="Audit Activity Logs" subtitle="Secure tracking logs of actions performed in this store" onBack={() => setView('home')}>
        <div className={`${card} p-5 space-y-4`}>
          <h3 className="font-display font-bold text-base text-foreground">Action History</h3>
          {logs.length === 0 ? (
            <div className="text-center py-10 bg-slate-900/30 rounded-2xl border border-dashed border-border/80">
              <p className="text-muted-foreground text-xs">No activity logs recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1 no-scrollbar text-left">
              {logs.map((log) => (
                <div key={log.id} className="p-4 rounded-xl bg-slate-950 border border-border flex flex-col gap-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h4 className="font-display font-bold text-sm text-foreground">{log.user}</h4>
                      <span className="inline-block px-1.5 py-0.5 rounded bg-surface-2 border border-border/85 text-[8px] font-bold text-yellow-500 uppercase mt-1">
                        {log.role}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal font-sans bg-surface-2/40 p-2.5 rounded-lg border border-border/30">
                    {log.action}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </SubPage>
    );
  }

  // ===== ABOUT =====
  if (view === 'about') return (
    <SubPage title="About StoreFlow" onBack={() => setView('support')}>
      <div className={`${card} p-6 flex flex-col items-center text-center gap-4`}>
        <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/25 flex items-center justify-center text-4xl">
          🏪
        </div>
        <div>
          <h2 className="font-display font-bold text-2xl">StoreFlow</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Version 1.0 · Innie Group</p>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A modern business management platform for small businesses, supermarkets, kiosks, pharmacies, boutiques, restaurants, and growing stores.
        </p>
      </div>

      <div className={`${card} p-4 space-y-3`}>
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Our Mission</p>
        <ul className="space-y-2">
          {([
            ['📈', 'Help you make better business decisions'],
            ['💸', 'Reduce losses and increase profits'],
            ['📊', 'Track business growth over time'],
            ['🔮', 'Predict future performance'],
            ['🐖', 'Save for business goals'],
            ['🤝', 'Understand what customers want'],
            ['🏪', 'Make store management easier'],
          ] as [string, string][]).map(([icon, text]) => (
            <li key={text} className="flex items-start gap-2.5 text-sm text-foreground/85">
              <span className="shrink-0 leading-5">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${card} px-4 divide-y divide-border`}>
        <div className="py-3.5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Developer</span>
          <span className="text-sm font-display font-semibold">Innie Group</span>
        </div>
        <div className="py-3.5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Version</span>
          <span className="text-sm font-display font-semibold">1.0</span>
        </div>
        <div className="py-3.5 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground shrink-0">Email</span>
          <a href="mailto:inniegroup@gmail.com" className="text-sm font-semibold text-primary truncate">
            inniegroup@gmail.com
          </a>
        </div>
        <div className="py-3.5 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground shrink-0">WhatsApp</span>
          <a href="https://wa.me/2347025517388" target="_blank" rel="noopener noreferrer"
            className="text-sm font-semibold text-success">
            07025517388
          </a>
        </div>
      </div>

      {showCloudAuthModal && (
        <CloudAuthModal
          onAuthSuccess={handleCloudAuthSuccess}
          onClose={() => setShowCloudAuthModal(false)}
          initialEmail={store.profile?.email || ''}
          initialPassword={store.managerSettings?.ownerPassword || ''}
          initialFullName={store.profile?.ownerName || store.storeName || ''}
        />
      )}
    </SubPage>
  );

  // ===== CONTACT =====
  if (view === 'contact') return (
    <SubPage title="Contact Support" onBack={() => setView('support')}>
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center text-2xl shrink-0">💬</div>
          <div>
            <p className="font-display font-bold text-sm">WhatsApp Support</p>
            <p className="text-xs text-muted-foreground">Chat directly with the StoreFlow team</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              window.open('https://wa.me/2347025517388?text=Hello%20StoreFlow%20Team,%20I%20need%20assistance%20with%20StoreFlow.', '_blank');
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-success text-white font-display font-bold text-sm"
          >
            💬 Open WhatsApp
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText('07025517388');
              showToast('WhatsApp phone number copied');
            }}
            className="px-4 rounded-xl bg-surface-2 border border-border text-sm font-semibold hover:bg-surface-3 transition-colors"
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center">Phone: 07025517388</p>
      </div>

      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">📧</div>
          <div>
            <p className="font-display font-bold text-sm">Email Support</p>
            <p className="text-xs text-muted-foreground">Send a detailed issue or request</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              window.open('mailto:inniegroup@gmail.com?subject=StoreFlow%20Support%20Request&body=Hello%20StoreFlow%20Team,%0A%0AI%20need%20help%20with:%0A%0A_________________________%0A%0AThank%20you.', '_blank');
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm"
          >
            ✉️ Email Support
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText('inniegroup@gmail.com');
              showToast('Support email copied');
            }}
            className="px-4 rounded-xl bg-surface-2 border border-border text-sm font-semibold hover:bg-surface-3 transition-colors"
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center">Email: inniegroup@gmail.com</p>
      </div>

      <button
        onClick={() => setShowContactPopup(true)}
        className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-success text-primary-foreground font-display font-bold text-sm shadow-md hover:opacity-95 transition-all"
      >
        ✨ Show More Support Options
      </button>

      <div className={`${card} p-4 text-center space-y-1`}>
        <p className="text-xs font-semibold text-foreground">Support Hours</p>
        <p className="text-xs text-muted-foreground">Monday - Sunday</p>
        <p className="text-[10px] text-muted-foreground">StoreFlow Support Team · Innie Group</p>
      </div>
    </SubPage>
  );

  // ===== FAQ =====
  if (view === 'faq') return (
    <SubPage title="Frequently Asked Questions" onBack={() => setView('support')}>
      <div className={`${card} px-4 divide-y divide-border`}>
        {([
          ['Does StoreFlow work offline?', 'Yes. Most features work offline and data syncs when available.'],
          ['Can I manage multiple stores?', 'Yes. Use the Switch Store feature in Settings → Data & Storage.'],
          ['Can I restore deleted items?', 'Yes. Visit Settings → Data & Storage → Recently Deleted. Nothing is permanently deleted immediately.'],
          ['Can Flow predict future sales?', 'Yes. Predictions become more accurate as more sales and expense data is recorded.'],
          ['Does Flow learn from my business?', 'Yes. Flow learns from your sales history, inventory, expenses, customer requests, and business information.'],
          ['Can I disable Flow?', 'Yes. Flow can be turned off at any time in Settings → Flow Settings.'],
          ['Can I track partial payments and debts?', 'Yes. StoreFlow automatically creates and tracks outstanding balances for partial payments.'],
          ['Can I upload a store logo?', 'Yes. Your logo appears throughout the app. Add it in Settings → Edit Profile.'],
          ['Can StoreFlow help me save money?', 'Yes. The Savings Plan feature and Flow recommendations help you build financial discipline over time.'],
          ['Is my data safe?', 'Yes. StoreFlow stores and protects your business information securely on your device.'],
        ] as [string, string][]).map(([q, a]) => (
          <div key={q}>
            <button
              className="w-full text-left flex items-start justify-between gap-3 py-4"
              onClick={() => setHelpOpen(helpOpen === q ? null : q)}
            >
              <p className="text-sm font-display font-semibold text-foreground leading-snug">{q}</p>
              <span className="shrink-0 text-muted-foreground text-xs mt-0.5">
                {helpOpen === q ? '▴' : '▾'}
              </span>
            </button>
            {helpOpen === q && (
              <p className="pb-4 text-sm text-muted-foreground leading-relaxed animate-fade-in">{a}</p>
            )}
          </div>
        ))}
      </div>
    </SubPage>
  );

  // ===== HELP CENTER =====
  if (view === 'help') {
    const topics = [
      {
        id: 'start', icon: <Rocket className="w-4 h-4" />, iconBg: 'rgba(239, 68, 68, 0.12)', iconColor: '#F87171', title: 'Getting Started',
        body: (
          <div className="space-y-2">
            <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground leading-relaxed">
              {['Create your store profile', 'Add your products', 'Record sales daily', 'Record expenses', 'Set profit margins', 'Configure savings goals', 'Turn on Flow for insights and recommendations', 'Review your dashboard regularly'].map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <p className="text-[10px] text-muted-foreground italic mt-1.5">The more data you record, the smarter StoreFlow becomes.</p>
          </div>
        ),
      },
      {
        id: 'sales', icon: <ShoppingCart className="w-4 h-4" />, iconBg: 'rgba(99, 102, 241, 0.12)', iconColor: '#818CF8', title: 'Making a Sale',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <ol className="list-decimal list-inside space-y-1">
              {['Open the Sales page', 'Search or select products', 'Add products to cart', 'Click Complete Sale', 'Select payment type', 'Save sale'].map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <p className="text-[10px] italic mt-1">Inventory automatically updates after each sale.</p>
          </div>
        ),
      },
      {
        id: 'partial', icon: <CreditCard className="w-4 h-4" />, iconBg: 'rgba(245, 158, 11, 0.12)', iconColor: '#FBBF24', title: 'Partial Payments',
        body: (
          <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
            <p>When a customer pays part of their total, StoreFlow automatically creates a Pending Balance. The sale is still recorded fully.</p>
            <div className="bg-surface-2 border border-border rounded-lg p-3 text-[11px] space-y-1.5">
              <div className="flex justify-between"><span>Customer buys</span><strong className="text-foreground">₦2,500</strong></div>
              <div className="flex justify-between"><span>Customer pays</span><strong className="text-foreground">₦2,000</strong></div>
              <div className="flex justify-between border-t border-border pt-1 mt-1"><span>Pending balance</span><strong className="text-warning font-bold">₦500</strong></div>
            </div>
            <div>
              <p className="font-semibold text-foreground/80 mb-1">When customer pays later:</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px]">
                {['Open Pending Balance', 'Tap Record Payment', 'Enter amount paid', 'Balance updates automatically'].map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
            <p className="text-[10px] italic">Find all balances at: Sales → Pending Balances</p>
          </div>
        ),
      },
      {
        id: 'inventory', icon: <Package className="w-4 h-4" />, iconBg: 'rgba(249, 115, 22, 0.12)', iconColor: '#FB923C', title: 'Adding Products',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>Go to <strong className="text-foreground">Inventory → Add Product</strong> and enter:</p>
            <ul className="space-y-1 text-[11px]">
              {['Product Name', 'Category', 'Cost Price', 'Selling Price', 'Quantity', 'Barcode (optional)'].map(f => (
                <li key={f} className="flex items-center gap-1.5"><span className="text-primary text-[6px]">●</span>{f}</li>
              ))}
            </ul>
          </div>
        ),
      },
      {
        id: 'pricing', icon: <Tag className="w-4 h-4" />, iconBg: 'rgba(234, 179, 8, 0.12)', iconColor: '#FACC15', title: 'Auto Pricing',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>When Auto Pricing is on, StoreFlow suggests a selling price based on cost + desired margin.</p>
            <div className="bg-surface-2 border border-border rounded-lg p-3 text-[11px] space-y-1.5">
              <div className="flex justify-between"><span>Cost Price</span><strong className="text-foreground">₦1,000</strong></div>
              <div className="flex justify-between"><span>Margin</span><strong className="text-foreground">20%</strong></div>
              <div className="flex justify-between border-t border-border pt-1 mt-1"><span>Suggested Price</span><strong className="text-success font-bold">₦1,200</strong></div>
            </div>
            <p className="text-[10px] italic">Enable in Settings → Pricing.</p>
          </div>
        ),
      },
      {
        id: 'batch', icon: <Download className="w-4 h-4" />, iconBg: 'rgba(16, 185, 129, 0.12)', iconColor: '#34D399', title: 'Batch Import',
        body: (
          <p className="text-xs text-muted-foreground leading-relaxed">Import multiple products at once. Before saving, StoreFlow shows a preview screen where you can edit products, correct prices or names, and remove mistakes — then approve and save all at once.</p>
        ),
      },
      {
        id: 'flow', icon: <Cpu className="w-4 h-4" />, iconBg: 'rgba(6, 182, 212, 0.12)', iconColor: '#22D3EE', title: 'Flow Assistant',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>Flow analyzes your sales, expenses, inventory, debts, and trends to give tailored recommendations.</p>
            <ul className="space-y-1 text-[11px]">
              {['Predict revenue and profits', 'Detect slow and fast-moving products', 'Suggest savings targets', 'Analyze rent and expense impact', 'Forecast busy periods and daily sales', 'Answer business questions (Ask Advice)', 'Suggest products worth stocking'].map(f => (
                <li key={f} className="flex items-center gap-1.5"><span className="text-success text-[6px]">●</span>{f}</li>
              ))}
            </ul>
            <p className="text-[10px] italic mt-1">Flow helps you make smarter decisions — it does not replace them.</p>
          </div>
        ),
      },
      {
        id: 'health', icon: <Heart className="w-4 h-4" />, iconBg: 'rgba(244, 63, 94, 0.12)', iconColor: '#F43F5E', title: 'Store Health Score',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>Your Store Health Score reflects overall business performance based on revenue, profit, expenses, inventory levels, savings progress, and outstanding balances. A higher score means a healthier, more profitable business.</p>
            <p className="text-[10px] italic">Tap the score on your dashboard for a full breakdown.</p>
          </div>
        ),
      },
      {
        id: 'requests', icon: <MessageSquare className="w-4 h-4" />, iconBg: 'rgba(20, 184, 166, 0.12)', iconColor: '#2DD4BF', title: 'Customer Requests',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>When a customer asks for a product you don't have, record their request. StoreFlow tracks the product name, frequency, number of requests, and last request date.</p>
            <p>Flow uses this data to recommend which products to stock next.</p>
          </div>
        ),
      },
      {
        id: 'rent', icon: <Home className="w-4 h-4" />, iconBg: 'rgba(59, 130, 246, 0.12)', iconColor: '#60A5FA', title: 'Rent Analysis',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p><strong className="text-foreground">Rented store:</strong> Flow calculates weekly and monthly savings targets to cover rent, including a 10% buffer for increases. It also shows how rent affects your profitability.</p>
            <p><strong className="text-foreground">Owned store:</strong> Flow estimates annual savings, emergency reserves, and property maintenance suggestions.</p>
            <p className="text-[10px] italic">Configure in Settings → Edit Profile.</p>
          </div>
        ),
      },
      {
        id: 'savings', icon: <PiggyBank className="w-4 h-4" />, iconBg: 'rgba(244, 63, 94, 0.12)', iconColor: '#FB7185', title: 'Savings Plan',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>Choose between percentage saving (e.g. 10% of profit) or a fixed amount (e.g. ₦5,000 weekly or ₦20,000 monthly). Plans can be enabled or paused at any time.</p>
            <p className="text-[10px] italic">Set up in Settings → Savings Plan.</p>
          </div>
        ),
      },
      {
        id: 'graphs', icon: <BarChart3 className="w-4 h-4" />, iconBg: 'rgba(139, 92, 246, 0.12)', iconColor: '#A78BFA', title: 'Graphs & Activity',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>The Sales Activity graph shows 30-minute intervals by default (Today view). Switch timeframes:</p>
            <ul className="space-y-1 text-[11px]">
              {['Today (hourly)', '7 Days', '14 Days', '30 Days', '1 Year', 'Lifetime'].map(f => (
                <li key={f} className="flex items-center gap-1.5"><span className="text-primary text-[6px]">●</span>{f}</li>
              ))}
            </ul>
            <p>The Dashboard Sales Trend chart can also be filtered by Today, 1 Week, 14 Days, 30 Days, or All Time.</p>
          </div>
        ),
      },
      {
        id: 'trash', icon: <Trash2 className="w-4 h-4" />, iconBg: 'rgba(239, 68, 68, 0.12)', iconColor: '#F87171', title: 'Data Recovery',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>Nothing is permanently deleted immediately. Deleted products, sales, expenses, and categories all go to Trash and can be restored at any time.</p>
            <p className="text-[10px] italic">Access via: Settings → Data & Storage → Recently Deleted</p>
          </div>
        ),
      },
    ];

    const filteredTopics = topics.filter(topic => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return topic.title.toLowerCase().includes(query) || topic.id.toLowerCase().includes(query);
    });

    return (
      <SubPage title="Help Center" subtitle="Learn, explore and grow your business" onBack={() => { setView('support'); setSearchQuery(''); }}>
        <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border shadow-sm">
          {filteredTopics.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No matching help articles found.
            </div>
          ) : (
            filteredTopics.map(topic => {
              const isOpen = helpOpen === topic.id;
              return (
                <div key={topic.id} className="transition-all">
                  <button
                    className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-surface-2/70 active:bg-surface-2 group"
                    onClick={() => setHelpOpen(isOpen ? null : topic.id)}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: topic.iconBg, color: topic.iconColor }}>
                        {topic.icon}
                      </div>
                      <span className="text-sm font-display font-semibold text-foreground group-hover:text-primary transition-colors">{topic.title}</span>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90 text-primary' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="p-5 bg-black/15 border-t border-border/80 animate-fade-in">
                      {topic.body}
                    </div>
                  )}
                </div>
              );
            })
          )}
          
          {/* Search bar inside the card container at the bottom */}
          <div className="p-4 border-t border-border/60 bg-black/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search help articles..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>
        </div>
      </SubPage>
    );
  }

  // ===== SUPPORT HOME =====
  if (view === 'support') return (
    <SubPage title="Support" onBack={() => setView('home')}>
      <div className={`${card} divide-y divide-border`}>
        <SupportRow icon="📖" label="Help Center" onClick={() => { setHelpOpen(null); setView('help'); }} />
        <SupportRow icon="❓" label="FAQ" onClick={() => { setHelpOpen(null); setView('faq'); }} />
        <SupportRow icon="💬" label="Contact Support" onClick={() => setView('contact')} />
        <SupportRow icon="ℹ️" label="About StoreFlow" onClick={() => setView('about')} />
      </div>
    </SubPage>
  );

  // ============ HOME ============
  return (
    <div className="animate-fade-in space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-start">
        {/* Left column — profile + Flow */}
        <div className="md:col-span-5 space-y-4">
          {/* Store Profile */}
          <button onClick={() => setView('profile')} className={`${card} w-full p-4 text-left hover:ring-1 hover:ring-primary/30 transition-all`}>
            <div className="flex items-start gap-3">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-primary/15 border border-primary/30 flex items-center justify-center text-3xl">
                  {store.profile?.photo ? (
                    <img src={store.profile.photo} alt="" className="w-full h-full object-cover" />
                  ) : store.profile?.logoStyle ? (
                    <StoreLogo storeName={store.storeName} selectedStyle={store.profile.logoStyle} className="w-full h-full" />
                  ) : (
                    '🏪'
                  )}
                </div>
                <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">📷</span>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <h3 className="font-display font-bold text-lg leading-tight truncate">{store.storeName}</h3>
                {profile.location && <p className="text-xs text-muted-foreground flex items-start gap-1"><span>📍</span><span className="line-clamp-2">{profile.location}</span></p>}
                {profile.phone && <p className="text-xs text-muted-foreground flex items-center gap-1">📞 {profile.phone}</p>}
                {profile.email && <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">✉️ {profile.email}</p>}
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-primary">✏️</div>
                <span className="text-[10px] text-muted-foreground font-display font-semibold">Edit</span>
              </div>
            </div>
          </button>

          {/* Flow Card */}
          <button onClick={() => setView('flow')} className={`${card} w-full p-4 text-left hover:ring-1 hover:ring-primary/30 transition-all border ${mgr.enabled ? 'border-success/30 bg-gradient-to-br from-success/10 to-transparent' : 'border-border'}`}>
            <div className="flex items-start gap-3">
              <div className="shrink-0">
                <Mascot size={64} mood={mgr.enabled ? 'happy' : 'sleeping'} animate={mgr.mascotAnimations} store={store} />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-bold text-xl">Flow</h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-display font-bold ${mgr.enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${mgr.enabled ? 'bg-success' : 'bg-muted-foreground'}`} />
                    {mgr.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                {mgr.enabled ? (
                  <>
                    <p className="text-xs text-muted-foreground leading-snug">Your business companion for forecasts, advice and insights.</p>
                    <div className="flex items-center gap-2 pt-1">
                      <ProgressRing pct={profileCompletion} size={40} />
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Business Profile</p>
                        <p className="text-xs font-display font-semibold">{profileCompletion}% Complete</p>
                      </div>
                    </div>
                    {latestInsight && (
                      <p className="text-[11px] text-success mt-1 line-clamp-2">{latestInsight.icon} {latestInsight.text}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Turn on Flow to unlock forecasts, recommendations and business insights.</p>
                )}
              </div>
              <div className="shrink-0 self-center w-12 h-12 rounded-xl bg-surface-2 border border-border flex flex-col items-center justify-center text-primary text-xs">
                <span>›</span>
              </div>
            </div>
          </button>
        </div>

        {/* Right column — settings tiles */}
        <div className="md:col-span-7 space-y-3">
          <SettingTile icon="🏷️" color="#F2C94C" title="Pricing" desc="Manage profit margin and pricing." right={<><p className="text-[10px] text-muted-foreground">Default Margin</p><p className="text-base font-display font-bold text-primary">{mgr.defaultMargin}%</p></>} onClick={() => setView('pricing')} />
          <SettingTile icon="💸" color="#10B981" title="Discounts" desc="Automatic checkout discount settings."
            right={<>
              <p className="text-[10px] text-muted-foreground">{mgr.autoDiscountEnabled ? 'Active' : 'Disabled'}</p>
              {mgr.autoDiscountEnabled && (
                <p className="text-sm font-display font-bold text-success">
                  {mgr.autoDiscountType === 'percentage' ? `${mgr.autoDiscountValue}%` : `₦${(mgr.autoDiscountValue || 0).toLocaleString()}`}
                </p>
              )}
            </>}
            onClick={() => setView('discount')} />
          <SettingTile icon="📦" color="#27AE60" title="Inventory" desc="Stock alerts and restock preferences." right={<><p className="text-[10px] text-muted-foreground">Low Stock</p><p className="text-base font-display font-bold text-success">{lowStockCount} Items</p></>} onClick={() => setView('inventory')} />
          <SettingTile icon="🌟" color="#FFD700" title="Wishlist" desc="Track products you want to add or stock." right={<><p className="text-[10px] text-muted-foreground">Wishlist</p><p className="text-base font-display font-bold text-yellow-500">{(store.wishlist || []).length} Items</p></>} onClick={() => setView('wishlist')} />
          <SettingTile icon="🐖" color="#9B6BFB" title="Savings Plan" desc="Set goals and automation rules." onClick={() => setView('savings')}
            right={<div className="text-right space-y-1">
              <p className="text-[10px] text-muted-foreground">Goal</p>
              <p className="text-sm font-display font-bold" style={{ color: '#9B6BFB' }}>₦{savings.amount.toLocaleString()}</p>
              <div className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden ml-auto">
                <div className="h-full rounded-full" style={{ width: `${savingsPct}%`, background: '#9B6BFB' }} />
              </div>
              <p className="text-[10px] text-muted-foreground">{Math.round(savingsPct)}%</p>
            </div>} />

          <SettingTile icon="🎨" color="#5B8FF9" title="Appearance" desc="Customize theme and experience." onClick={() => setView('appearance')}
            right={<div className="flex gap-1.5">
              {THEMES.map(t => (
                <div key={t.id} className={`w-10 h-10 rounded-xl flex items-center justify-center text-base border ${theme===t.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`} style={{ background: t.swatch + '22' }}>
                  {t.emoji}
                </div>
              ))}
            </div>} />

          <SettingTile icon="🔔" color="#FF8A3D" title="Notifications" desc="Manage alerts and reminders." onClick={() => setView('notifications')}
            right={<><p className="text-[10px] font-display font-semibold text-warning">{activeNotifTypes} Types Active</p>
              <div className="flex gap-1 mt-1">{['📊','⭐','⚠️','📘','💰'].map((e,i)=><span key={i} className="w-6 h-6 rounded bg-surface-2 border border-border flex items-center justify-center text-[10px]">{e}</span>)}</div></> } />

          <SettingTile icon="🛡️" color="#2EBFB1" title="Security" desc="App lock, access code, reset password, and credentials." right={<><p className="text-[10px] text-muted-foreground">Lock Timer</p><p className="text-base font-display font-bold" style={{color:'#2EBFB1'}}>{timer==='1h'?'1 Hour':timer==='4h'?'4 Hours':timer==='8h'?'8 Hours':timer==='12h'?'12 Hours':'Always Open'}</p></>} onClick={() => setView('security')} />

          <SettingTile icon="📱" color="#FFC72C" title="QR & Barcodes" desc="Branded QR codes, analytics, and product tags." onClick={() => setView('barcode')} />

          <SettingTile icon="🗄️" color="#3B82F6" title="Data & Storage" desc="Import, export, backups, and store deletion." onClick={() => setView('data')}
            right={<div className="flex gap-1">
              {[{e:'⬆️',l:'Export'},{e:'⬇️',l:'Import'},{e:'☁️',l:'Backup'},{e:'⋯',l:'More'}].map(o=>(
                <div key={o.l} className="w-10 h-10 rounded-lg bg-surface-2 border border-border flex flex-col items-center justify-center">
                  <span className="text-xs">{o.e}</span>
                  <span className="text-[8px] text-muted-foreground">{o.l}</span>
                </div>
              ))}
            </div>} />

          {currentUser?.role === 'owner' && (
            <SettingTile icon="📋" color="#2F80ED" title="Audit Activity Logs" desc="View secure logs tracking actions performed in this store." onClick={() => setView('activity-log')} />
          )}
          <SettingTile icon="🎧" color="#F2C94C" title="Support" desc="Help, FAQs and contact." onClick={() => setView('support')} />
        </div>
      </div>

      {showTrash && <RecentlyDeleted store={store} onUpdate={onUpdate} onClose={() => setShowTrash(false)} />}
      {showSwitcher && <StoreSwitcher currentCode={store.accessCode} onSwitch={onUpdate} onClose={() => setShowSwitcher(false)} />}
      {showSavingsModal && (
        <SavingsModal initial={savings} onClose={() => setShowSavingsModal(false)} onSave={(g) => { updateSavings(g); setShowSavingsModal(false); showToast('Savings plan saved'); }} animate={mgr.mascotAnimations} store={store} />
      )}
      {showContactPopup && (
        <ContactOptionsSheet storeName={store.storeName} onClose={() => setShowContactPopup(false)} />
      )}
    </div>
  );
}


// ============ small components ============
function Field({ label, value, onChange, placeholder, type='text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} className={inputClass} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold pt-2 pb-1 px-1">
      {children}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-surface-2 border border-border">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-display font-bold capitalize">{value}</p>
    </div>
  );
}

function NumberRow({ label, value, onChange, onSave }: { label: string; value: string; onChange: (v: string) => void; onSave: () => void }) {
  return (
    <div>
      <p className="text-sm font-display font-semibold mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        <input type="number" min="0" value={value} onChange={e => onChange(e.target.value)} className={inputClass + ' flex-1'} />
        <button onClick={onSave} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold">Save</button>
      </div>
    </div>
  );
}

function SettingTile({ icon, color, title, desc, right, onClick }: { icon: string; color: string; title: string; desc: string; right?: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={tileBase}>
      <IconBadge color={color}>{icon}</IconBadge>
      <div className="flex-1 min-w-0">
        <h4 className="font-display font-bold text-sm leading-tight">{title}</h4>
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{desc}</p>
      </div>
      {right && <div className="shrink-0 border-l border-border pl-3 text-right max-w-[160px]">{right}</div>}
      <span className="shrink-0 text-muted-foreground">›</span>
    </button>
  );
}

function DataTile({ icon, label, subtitle, onClick, iconBg, iconColor }: { icon: React.ReactNode; label: string; subtitle: string; onClick: () => void; iconBg: string; iconColor: string }) {
  return (
    <button onClick={onClick} className="p-4.5 rounded-2xl bg-card border border-border flex flex-col gap-3.5 hover:border-primary/40 transition-all text-left w-full cursor-pointer active:scale-[0.98]">
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: iconBg, color: iconColor }}>
        {icon}
      </div>
      <div className="space-y-1">
        <h4 className="font-display font-bold text-sm text-foreground">{label}</h4>
        <p className="text-[11px] text-muted-foreground leading-tight">{subtitle}</p>
      </div>
    </button>
  );
}

function SupportRow({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full p-4 flex items-center gap-3 hover:bg-surface-2 transition-colors">
      <span className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-sm">{icon}</span>
      <span className="flex-1 text-left text-sm font-display font-semibold">{label}</span>
      <span className="text-muted-foreground">›</span>
    </button>
  );
}

// --- Savings setup modal ---
function SavingsModal({ initial, onClose, onSave, animate = true, store }: { initial: SavingsGoal; onClose: () => void; onSave: (g: SavingsGoal) => void; animate?: boolean; store?: StoreData }) {
  const [g, setG] = useState<SavingsGoal>({
    ...initial,
    dayOfWeek: initial.dayOfWeek || 'Monday',
    timeOfDay: initial.timeOfDay || '08:00',
  });
  const inp = "w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary";
  const freqs: SavingsFrequency[] = ['daily', 'weekly', 'monthly'];
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <Mascot size={36} mood="happy" animate={animate} store={store} />
            <h3 className="font-display font-bold text-lg">Set Up Savings Plan</h3>
          </div>
          <button onClick={onClose} className="text-xl text-muted-foreground hover:text-foreground">×</button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Name</label>
          <input value={g.label || ''} onChange={e => setG({ ...g, label: e.target.value })} placeholder="Emergency Fund" className={inp} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Destination Bank</label>
          <input value={g.bankName || ''} onChange={e => setG({ ...g, bankName: e.target.value })} placeholder="Opay / PalmPay / GTBank" className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Goal Amount (₦)</label>
            <input type="number" value={g.amount || ''} onChange={e => setG({ ...g, amount: Number(e.target.value) || 0 })} placeholder="500000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Dynamic Save %</label>
            <input type="number" value={g.percentage || ''} onChange={e => setG({ ...g, percentage: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} placeholder="10" className={inp} />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface-2 border border-border space-y-3">
          <label className="flex items-center justify-between text-xs font-bold text-foreground cursor-pointer select-none">
            <span>Automated Net Income Deduction</span>
            <input 
              type="checkbox" 
              checked={!!g.autoSaveEnabled} 
              onChange={e => setG({ ...g, autoSaveEnabled: e.target.checked })}
              className="rounded accent-primary w-4 h-4 cursor-pointer"
            />
          </label>
          {g.autoSaveEnabled && (
            <div className="space-y-2.5 pt-1.5 border-t border-border/60">
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Deduction Type</label>
                <div className="flex gap-2 mt-1">
                  <button 
                    type="button" 
                    onClick={() => setG({ ...g, autoSaveAmount: undefined })} 
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${!g.autoSaveAmount ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-3 border-border text-muted-foreground'}`}
                  >
                    Use Percentage
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setG({ ...g, autoSaveAmount: g.autoSaveAmount || 2000 })} 
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${g.autoSaveAmount ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-3 border-border text-muted-foreground'}`}
                  >
                    Use Fixed Cash
                  </button>
                </div>
              </div>
              {g.autoSaveAmount !== undefined && (
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">Periodic Cash Deduction (₦)</label>
                  <input 
                    type="number" 
                    value={g.autoSaveAmount || ''} 
                    onChange={e => setG({ ...g, autoSaveAmount: Math.max(0, Number(e.target.value) || 0) })} 
                    placeholder="e.g. 2000" 
                    className={inp} 
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Save from</label>
          <div className="flex rounded-lg bg-surface-2 border border-border overflow-hidden">
            {(['profit','revenue'] as const).map(s => (
              <button key={s} type="button" onClick={() => setG({ ...g, source: s })} className={`flex-1 px-3 py-2 text-xs font-display font-semibold capitalize cursor-pointer ${g.source === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Frequency</label>
          <div className="flex rounded-lg bg-surface-2 border border-border overflow-hidden">
            {freqs.map(f => (
              <button key={f} type="button" onClick={() => setG({ ...g, frequency: f })} className={`flex-1 px-3 py-2 text-xs font-display font-semibold capitalize cursor-pointer ${g.frequency === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{f}</button>
            ))}
          </div>
        </div>

        {g.frequency !== 'daily' && (
          <div>
            <label className="text-xs text-muted-foreground">Deduction Day</label>
            <select
              value={g.dayOfWeek || 'Monday'}
              onChange={e => setG({ ...g, dayOfWeek: e.target.value })}
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary focus:bg-surface-2 [&>option]:bg-card"
            >
              <option value="Monday">Monday</option>
              <option value="Tuesday">Tuesday</option>
              <option value="Wednesday">Wednesday</option>
              <option value="Thursday">Thursday</option>
              <option value="Friday">Friday</option>
              <option value="Saturday">Saturday</option>
              <option value="Sunday">Sunday</option>
            </select>
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground">Deduction Time</label>
          <input
            type="time"
            value={g.timeOfDay || '08:00'}
            onChange={e => setG({ ...g, timeOfDay: e.target.value })}
            className={inp}
          />
        </div>

        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 text-xs text-primary">
          ✨ Auto-deductions occur on login/save. Capped to available Net Income to prevent negative balances.
        </div>

        <button onClick={() => onSave(g)} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 cursor-pointer">Save Plan</button>
      </div>
    </div>
  );
}

// ============ EXPORT SHEET ============
function ExportSheet({ store, onClose }: { store: StoreData; onClose: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const stats = getDashboardStats(store);
  const topSellers = getTopSellers(store, 5);

  const buildReport = () => {
    const p = store.profile;
    let r = `\ud83d\udcca PERFORMANCE REPORT\n`;
    r += `==============================\n`;
    r += `${store.storeName}\n`;
    if (p?.location) r += `\ud83d\udccd ${p.location}\n`;
    r += `\ud83d\udcc5 ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`;
    r += `==============================\n\n`;
    r += `\ud83d\udcb0 OVERVIEW\n`;
    r += `Gross Revenue: \u20a6${stats.totalRevenue.toLocaleString()}\n`;
    r += `Total Expenses: \u20a6${stats.totalExpenses.toLocaleString()}\n`;
    r += `Net Income: \u20a6${stats.netIncome.toLocaleString()}\n`;
    r += `Profit: \u20a6${stats.totalProfit.toLocaleString()}\n`;
    r += `Inventory Value: \u20a6${stats.inventoryValue.toLocaleString()}\n`;
    r += `Total Sales: ${stats.totalSales}\n`;
    r += `Products: ${stats.totalProducts}\n`;
    r += `Low Stock Items: ${stats.lowStockProducts.length}\n\n`;
    const soldMap = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    store.sales.forEach(s => {
      const e = soldMap.get(s.productId) || { name: s.productName, qty: 0, revenue: 0, profit: 0 };
      e.qty += s.quantity; e.revenue += s.total; e.profit += s.profit;
      soldMap.set(s.productId, e);
    });
    if (soldMap.size > 0) {
      r += `\ud83d\udce6 SOLD ITEMS\n------------------------------\n`;
      Array.from(soldMap.values()).sort((a, b) => b.revenue - a.revenue).forEach(i => {
        r += `${i.name}: ${i.qty} sold \u2014 \u20a6${i.revenue.toLocaleString()} (profit: \u20a6${i.profit.toLocaleString()})\n`;
      });
      r += '\n';
    }
    r += `\ud83c\udfea INVENTORY\n------------------------------\n`;
    store.products.filter(p => p.quantity > 0).sort((a, b) => b.quantity - a.quantity).forEach(p => {
      r += `${p.name}: ${p.quantity} left (\u20a6${p.sellingPrice.toLocaleString()} each)\n`;
    });
    if (stats.lowStockProducts.length > 0) {
      r += `\n\u26a0\ufe0f LOW STOCK\n------------------------------\n`;
      stats.lowStockProducts.forEach(p => { r += `${p.name}: only ${p.quantity} left!\n`; });
    }
    if (topSellers.length > 0) {
      r += `\n\ud83c\udfc6 TOP SELLERS\n------------------------------\n`;
      topSellers.forEach((t, i) => { r += `${i + 1}. ${t.name} \u2014 ${t.totalSold} units (\u20a6${t.revenue.toLocaleString()})\n`; });
    }
    r += `\n==============================\nGenerated by StoreFlow\n`;
    return r;
  };

  const buildCSV = () => {
    let csv = 'Type,Name,Category,Cost Price,Selling Price,Quantity,Value\n';
    store.products.forEach(p => {
      csv += `Product,"${p.name}","${p.category}",${p.costPrice},${p.sellingPrice},${p.quantity},${p.costPrice * p.quantity}\n`;
    });
    csv += '\nDate,Product,Quantity,Unit Price,Total,Profit\n';
    store.sales.forEach(s => {
      csv += `${new Date(s.date).toLocaleDateString()},"${s.productName}",${s.quantity},${s.unitPrice},${s.total},${s.profit}\n`;
    });
    return csv;
  };

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
      row('Net Income', `\u20a6${stats.netIncome.toLocaleString()}`, true);
      row('Profit', `\u20a6${stats.totalProfit.toLocaleString()}`, true);
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
    download(buildReport(), `StoreFlow_${slug}.txt`, 'text/plain');
    showToast('Text report downloaded');
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

interface ContactOptionsSheetProps {
  storeName: string;
  onClose: () => void;
}

function ContactOptionsSheet({ storeName, onClose }: ContactOptionsSheetProps) {
  const [activeTab, setActiveTab] = useState<'menu' | 'bug' | 'feature'>('menu');
  const [bugSubject, setBugSubject] = useState('');
  const [bugDesc, setBugDesc] = useState('');
  const [featureName, setFeatureName] = useState('');
  const [featureDesc, setFeatureDesc] = useState('');

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied`);
  };

  const options = [
    {
      id: 'wa',
      icon: '💬',
      label: 'WhatsApp Support',
      desc: 'Chat directly with the StoreFlow team.',
      action: () => {
        window.open('https://wa.me/2347025517388?text=Hello%20StoreFlow%20Team,%20I%20need%20assistance%20with%20StoreFlow.', '_blank');
      }
    },
    {
      id: 'email',
      icon: '✉️',
      label: 'Email Support',
      desc: 'Send a detailed issue or request.',
      action: () => {
        window.open('mailto:inniegroup@gmail.com?subject=StoreFlow%20Support%20Request&body=Hello%20StoreFlow%20Team,%0A%0AI%20need%20help%20with:%0A%0A_________________________%0A%0AThank%20you.', '_blank');
      }
    },
    {
      id: 'bug',
      icon: '🪲',
      label: 'Report a Bug',
      desc: 'Tell us about an issue in the app.',
      action: () => setActiveTab('bug')
    },
    {
      id: 'feature',
      icon: '💡',
      label: 'Suggest a Feature',
      desc: 'Help improve StoreFlow by sharing your ideas.',
      action: () => setActiveTab('feature')
    },
    {
      id: 'partner',
      icon: '🤝',
      label: 'Business Partnership',
      desc: 'Discuss supplier partnerships, promotions, and opportunities.',
      action: () => {
        window.open('mailto:inniegroup@gmail.com?subject=StoreFlow%20Business%20Partnership%20Proposal&body=Hello%20StoreFlow%20Team,%0A%0AI%20would%20like%20to%20discuss%20a%20business%20partnership/promotion%20opportunity%20with%20StoreFlow.%0A%0AStore%20Name:%20' + encodeURIComponent(storeName) + '%0A%0ADetails:%0A%0A_________________________%0A%0AThank%20you.', '_blank');
      }
    }
  ];

  const handleSendBug = () => {
    if (!bugSubject.trim() || !bugDesc.trim()) {
      showToast('Please fill in all fields', 'error');
      return;
    }
    const subject = `StoreFlow Bug Report: ${bugSubject}`;
    const body = `Hello StoreFlow Team,

I found a bug in the app.

Issue Summary:
${bugSubject}

Description & Steps to Reproduce:
${bugDesc}

Store Name: ${storeName}
OS/Browser: ${navigator.userAgent}
Screen Size: ${window.innerWidth}x${window.innerHeight}

Thank you.`;

    window.open(`mailto:inniegroup@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    showToast('Mail client opened');
    setActiveTab('menu');
  };

  const handleSendFeature = () => {
    if (!featureName.trim() || !featureDesc.trim()) {
      showToast('Please fill in all fields', 'error');
      return;
    }
    const subject = `StoreFlow Feature Suggestion: ${featureName}`;
    const body = `Hello StoreFlow Team,

I would like to suggest a new feature for StoreFlow.

Feature Suggestion:
${featureName}

Description:
${featureDesc}

Store Name: ${storeName}

Thank you.`;

    window.open(`mailto:inniegroup@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    showToast('Mail client opened');
    setActiveTab('menu');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full bg-card rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
        style={{ maxWidth: '448px', margin: '0 auto', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-border" />
        </div>

        {activeTab === 'menu' && (
          <>
            <div className="px-5 pb-2 shrink-0">
              <h3 className="font-display font-bold text-xl text-primary">Contact Us</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Support Hours: Monday - Sunday</p>
              <p className="text-[10px] text-muted-foreground">StoreFlow Support Team · Innie Group</p>
            </div>

            <div className="px-4 space-y-1 overflow-y-auto max-h-[50vh] no-scrollbar">
              {options.map(opt => (
                <button
                  key={opt.id}
                  onClick={opt.action}
                  className="w-full flex items-center gap-3.5 p-3 rounded-2xl text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
                >
                  <div className="w-10 h-10 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-lg shrink-0">
                    {opt.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-bold text-foreground">{opt.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{opt.desc}</p>
                  </div>
                  <span className="shrink-0 text-muted-foreground text-base">›</span>
                </button>
              ))}
            </div>

            {/* Quick Copy Section */}
            <div className="px-5 py-3 border-t border-border mt-3 space-y-2 bg-surface-2/40 shrink-0">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">StoreFlow Contact Details</p>
              
              <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-card border border-border">
                <span className="text-muted-foreground">WhatsApp: <strong className="text-foreground">07025517388</strong></span>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleCopy('07025517388', 'WhatsApp phone number')}
                    className="px-2.5 py-1 rounded bg-success/10 text-success text-[10px] font-semibold"
                  >
                    Copy
                  </button>
                  <a
                    href="https://wa.me/2347025517388?text=Hello%20StoreFlow%20Team,%20I%20need%20assistance%20with%20StoreFlow."
                    target="_blank" rel="noopener noreferrer"
                    className="w-5 h-5 flex items-center justify-center text-xs"
                    title="Open chat"
                  >
                    💬
                  </a>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-card border border-border">
                <span className="text-muted-foreground truncate mr-2">Email: <strong className="text-foreground">inniegroup@gmail.com</strong></span>
                <button
                  onClick={() => handleCopy('inniegroup@gmail.com', 'Support email address')}
                  className="px-2.5 py-1 rounded bg-primary/10 text-primary text-[10px] font-semibold shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'bug' && (
          <div className="px-5 pb-2 flex-1 flex flex-col min-h-0">
            <div className="py-2 flex items-center justify-between shrink-0">
              <h3 className="font-display font-bold text-lg text-destructive">Report a Bug 🪲</h3>
              <button onClick={() => setActiveTab('menu')} className="text-xs text-muted-foreground hover:underline">Back</button>
            </div>
            
            <div className="space-y-3 flex-1 overflow-y-auto pb-4 no-scrollbar">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Subject / Short Summary</label>
                <input
                  type="text"
                  placeholder="e.g. Sales checkout is slow"
                  value={bugSubject}
                  onChange={e => setBugSubject(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-destructive"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Details & Steps to Reproduce</label>
                <textarea
                  placeholder="Tell us what you did, what you expected, and what actually happened..."
                  value={bugDesc}
                  onChange={e => setBugDesc(e.target.value)}
                  rows={4}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-destructive resize-none"
                />
              </div>

              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 text-[10px] text-muted-foreground/80 space-y-1">
                <p className="font-semibold text-destructive/80">Included System Details (automatic):</p>
                <p className="truncate">Device: {navigator.userAgent}</p>
                <p>Store: {storeName}</p>
              </div>
            </div>

            <div className="py-3 border-t border-border flex gap-2 shrink-0">
              <button
                onClick={() => setActiveTab('menu')}
                className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleSendBug}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-xs font-display font-bold"
              >
                Open Mail to Send
              </button>
            </div>
          </div>
        )}

        {activeTab === 'feature' && (
          <div className="px-5 pb-2 flex-1 flex flex-col min-h-0">
            <div className="py-2 flex items-center justify-between shrink-0">
              <h3 className="font-display font-bold text-lg text-primary">Suggest a Feature 💡</h3>
              <button onClick={() => setActiveTab('menu')} className="text-xs text-muted-foreground hover:underline">Back</button>
            </div>
            
            <div className="space-y-3 flex-1 overflow-y-auto pb-4 no-scrollbar">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Feature Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dark mode automatic toggle"
                  value={featureName}
                  onChange={e => setFeatureName(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Description & Why it's useful</label>
                <textarea
                  placeholder="Describe your idea and how it would help you run your store..."
                  value={featureDesc}
                  onChange={e => setFeatureDesc(e.target.value)}
                  rows={5}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            <div className="py-3 border-t border-border flex gap-2 shrink-0">
              <button
                onClick={() => setActiveTab('menu')}
                className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleSendFeature}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-display font-bold"
              >
                Open Mail to Send
              </button>
            </div>
          </div>
        )}

        <div className="px-4 pb-4 pt-1 shrink-0">
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
