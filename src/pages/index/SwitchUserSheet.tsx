import { showToast } from '@/components/Toast';
import ScrollLock from '@/components/ScrollLock';
import type { IndexScreenReady } from './useIndexScreen';

/**
 * Hands the phone to someone else on the team: pick who, then their PIN.
 */
export default function SwitchUserSheet({ s }: { s: IndexScreenReady }) {
  const {
    store, setCurrentUser, setShowSwitchUser, switchTargetUser, setSwitchTargetUser, switchPassword,
    setSwitchPassword, switchPinBuffer, setSwitchPinBuffer, showSwitchPassField,
    setShowSwitchPassField,
  } = s;
  return (
    <div className="fixed inset-0 z-[80] bg-background/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => { setShowSwitchUser(false); setSwitchTargetUser(null); }}><ScrollLock />
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-4 text-left" onClick={e => e.stopPropagation()}>
        {!switchTargetUser ? (
          <>
            <div className="text-center space-y-1">
              <h3 className="font-display font-bold text-lg">Switch Staff User</h3>
              <p className="text-xs text-muted-foreground">Select the staff member to log in as.</p>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
              {/* Owner Profile */}
              <button
                onClick={() => {
                  setSwitchTargetUser({ id: 'owner', name: store.storeName + ' Owner', role: 'owner', isOwner: true });
                  setShowSwitchPassField(true);
                  setSwitchPassword('');
                }}
                className="w-full p-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 flex items-center justify-between text-xs cursor-pointer text-left font-semibold text-foreground transition-colors"
              >
                <div>
                  <p>{store.storeName} Owner</p>
                  <p className="text-[9px] text-yellow-500 uppercase font-bold mt-0.5">owner</p>
                </div>
                <span>Select ›</span>
              </button>
              {/* Staff Profiles */}
              {(store.staffMembers || []).map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSwitchTargetUser({ id: s.id, name: s.name, role: s.role, isOwner: false });
                    setShowSwitchPassField(false);
                    setSwitchPinBuffer('');
                  }}
                  className="w-full p-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 flex items-center justify-between text-xs cursor-pointer text-left font-semibold text-foreground transition-colors"
                >
                  <div>
                    <p>{s.name}</p>
                    <p className="text-[9px] text-yellow-500 uppercase font-bold mt-0.5">{s.role}</p>
                  </div>
                  <span>Select ›</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowSwitchUser(false)} className="w-full py-2.5 rounded-xl bg-surface-2 border border-border font-display font-semibold text-xs text-center cursor-pointer">
              Cancel
            </button>
          </>
        ) : showSwitchPassField ? (
          /* Password input form */
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (switchTargetUser.isOwner) {
                 if (switchPassword === store.managerSettings?.ownerPassword) {
                  const ownerUser = {
                    name: 'Owner',
                    role: 'owner',
                    permissions: { sales: true, inventory: true, reports: true, settings: true }
                  };
                  localStorage.setItem('storeflow_active_user', JSON.stringify(ownerUser));
                  setCurrentUser(ownerUser);
                  setShowSwitchUser(false);
                  setSwitchTargetUser(null);
                  showToast('Welcome back Owner!');
                } else {
                  showToast('Incorrect owner password', 'error');
                }
              } else {
                const staff = (store.staffMembers || []).find(s => s.id === switchTargetUser.id);
                if (staff && switchPassword === staff.pin) {
                  const sessionUser = {
                    id: staff.id,
                    name: staff.name,
                    role: staff.role,
                    permissions: staff.permissions
                  };
                  localStorage.setItem('storeflow_active_user', JSON.stringify(sessionUser));
                  setCurrentUser(sessionUser);
                  setShowSwitchUser(false);
                  setSwitchTargetUser(null);
                  showToast(`Welcome back ${staff.name}!`);
                } else {
                  showToast('Incorrect password', 'error');
                }
              }
            }}
            className="space-y-4"
          >
            <div className="text-center space-y-1">
              <h3 className="font-display font-bold text-base">Enter Password</h3>
              <p className="text-xs text-muted-foreground">Credentials required for: {switchTargetUser.name}</p>
            </div>
            <input
              type="password"
              value={switchPassword}
              onChange={e => setSwitchPassword(e.target.value)}
              placeholder="Enter Password"
              autoFocus
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary text-center"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setSwitchTargetUser(null)} className="flex-1 py-2 rounded-xl bg-surface-2 border border-border font-display font-semibold text-xs text-center cursor-pointer">
                Back
              </button>
              <button type="submit" className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs text-center cursor-pointer">
                Unlock
              </button>
            </div>
          </form>
        ) : (
          /* PIN input view */
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="font-display font-bold text-base">Enter PIN Code</h3>
              <p className="text-xs text-muted-foreground">Verification required for: {switchTargetUser.name}</p>
            </div>

            <div className="flex justify-center gap-2 py-2">
              {[0, 1, 2, 3].map(idx => (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full border border-border transition-all ${
                    switchPinBuffer.length > idx ? 'bg-primary border-primary scale-110 gold-glow' : 'bg-surface-2'
                  }`}
                />
              ))}
            </div>

            {/* Pin Pad Grid */}
            <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto pt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                <button
                  key={digit}
                  onClick={() => {
                    if (switchPinBuffer.length >= 4) return;
                    const nextPin = switchPinBuffer + digit;
                    setSwitchPinBuffer(nextPin);

                    const staff = (store.staffMembers || []).find(s => s.id === switchTargetUser.id);
                    if (staff && nextPin === staff.pin) {
                      const sessionUser = {
                        id: staff.id,
                        name: staff.name,
                        role: staff.role,
                        permissions: staff.permissions
                      };
                      localStorage.setItem('storeflow_active_user', JSON.stringify(sessionUser));
                      setCurrentUser(sessionUser);
                      setShowSwitchUser(false);
                      setSwitchTargetUser(null);
                      showToast(`Welcome back ${staff.name}!`);
                    } else if (staff && nextPin.length >= 4) {
                      setTimeout(() => {
                        setSwitchPinBuffer('');
                        showToast('Incorrect PIN', 'error');
                      }, 150);
                    }
                  }}
                  className="p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-foreground font-display font-bold text-base active:scale-95 flex items-center justify-center cursor-pointer select-none"
                >
                  {digit}
                </button>
              ))}
              <button
                onClick={() => setSwitchPinBuffer('')}
                className="p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-destructive text-[10px] font-bold active:scale-95 flex items-center justify-center cursor-pointer select-none"
              >
                Clear
              </button>
              <button
                onClick={() => {
                  if (switchPinBuffer.length >= 4) return;
                  const nextPin = switchPinBuffer + '0';
                  setSwitchPinBuffer(nextPin);

                  const staff = (store.staffMembers || []).find(s => s.id === switchTargetUser.id);
                  if (staff && nextPin === staff.pin) {
                    const sessionUser = {
                      id: staff.id,
                      name: staff.name,
                      role: staff.role,
                      permissions: staff.permissions
                    };
                    localStorage.setItem('storeflow_active_user', JSON.stringify(sessionUser));
                    setCurrentUser(sessionUser);
                    setShowSwitchUser(false);
                    setSwitchTargetUser(null);
                    showToast(`Welcome back ${staff.name}!`);
                  } else if (staff && nextPin.length >= 4) {
                    setTimeout(() => {
                      setSwitchPinBuffer('');
                      showToast('Incorrect PIN', 'error');
                    }, 150);
                  }
                }}
                className="p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-foreground font-display font-bold text-base active:scale-95 flex items-center justify-center cursor-pointer select-none"
              >
                0
              </button>
              <button
                onClick={() => setSwitchPinBuffer(p => p.slice(0, -1))}
                className="p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-foreground text-xs font-bold active:scale-95 flex items-center justify-center cursor-pointer select-none"
              >
                ⌫
              </button>
            </div>

            <button onClick={() => setSwitchTargetUser(null)} className="w-full mt-2 py-2 rounded-xl bg-surface-2 border border-border font-display font-semibold text-xs text-center cursor-pointer">
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
