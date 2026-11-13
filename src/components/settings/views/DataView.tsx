import { removeStoreFromIndex } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import RecentlyDeleted from '@/components/RecentlyDeleted';
import StoreSwitcher from '@/components/StoreSwitcher';
import { ChevronRight, Download, Trash2, ShieldCheck, RefreshCw } from 'lucide-react';
import ScrollLock from '@/components/ScrollLock';
import { SubPage, DataTile } from '../ui';
import ExportSheet from '../ExportSheet';
import type { SettingsState } from '../useSettings';

export default function DataView({ s }: { s: SettingsState }) {
  const {
    store, onUpdate, onLock, setView, showTrash, setShowTrash, showSwitcher, setShowSwitcher,
    showExport, setShowExport, showDeleteModal, setShowDeleteModal, delStoreNameInput,
    setDelStoreNameInput, delCodeInput, setDelCodeInput, delConfirmTextInput,
    setDelConfirmTextInput, delError, setDelError, trashCount,
  } = s;
  return (
    <SubPage title="Data & Storage" onBack={() => setView('home')}>
      <div className="grid grid-cols-2 gap-3">
        {/* Not on a worker's own phone: it holds one shop, theirs to work in. */}
        {!store.staffDevice && (
        <DataTile
          icon={<RefreshCw className="w-4.5 h-4.5" />}
          label="Switch Store"
          subtitle="Switch between your stores"
          iconBg="rgba(99, 102, 241, 0.15)"
          iconColor="#818CF8"
          onClick={() => setShowSwitcher(true)}
        />
        )}
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
        }}><ScrollLock />
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
}
