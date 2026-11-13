import { showToast } from '@/components/Toast';
import ToggleRow from '@/components/Toggle';
import { triggerBackupExport } from '@/lib/backup-system';
import ScrollLock from '@/components/ScrollLock';
import { card, SubPage } from '../ui';
import type { SettingsState } from '../useSettings';

export default function BackupsView({ s }: { s: SettingsState }) {
  const {
    store, setView, localBackups, loadingBackups, restoreConfirm, setRestoreConfirm,
    handleCreateManualBackup, handleDeleteBackup, handleRestoreBackup, handleImportFile, mgr,
    updateMgr,
  } = s;
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
          onClick={async () => {
            const pw = prompt("Enter Owner Password to authorize and encrypt backup:");
            if (!pw) return;
            if (pw !== store.managerSettings?.ownerPassword) {
              showToast("Incorrect owner password", "error");
              return;
            }
            try {
              await triggerBackupExport(store.managerSettings?.ownerPassword, store.managerSettings?.emergencyRecoveryKey);
              showToast('Backup file exported');
            } catch (err: any) {
              showToast(err?.message || 'Could not write the backup file', 'error');
            }
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
        <div className="fixed inset-0 z-[80] bg-background/85 backdrop-blur-sm flex items-center justify-center p-4"><ScrollLock />
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
