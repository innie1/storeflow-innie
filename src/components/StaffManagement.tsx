import { useState } from 'react';
import { StoreData, StaffMember, Shift } from '@/types/store';
import { 
  addStaffMember, deleteStaffMember, updateStaffMember, startShift, endShift 
} from '@/lib/store-data';
import { 
  Briefcase, UserPlus, Lock, Key, Shield, Calendar, Play, Square, FileText, CheckSquare, Trash2, Edit
} from 'lucide-react';
import { showToast } from '@/components/Toast';

interface StaffManagementProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
  currentUser?: any;
}

export default function StaffManagement({ store, onUpdate, currentUser }: StaffManagementProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  // Form states for adding staff
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'cashier' | 'inventory' | 'accountant' | 'supervisor' | 'custom'>('cashier');
  
  // Permissions states
  const [salesAccess, setSalesAccess] = useState(true);
  const [inventoryAccess, setInventoryAccess] = useState(false);
  const [reportsAccess, setReportsAccess] = useState(false);
  const [settingsAccess, setSettingsAccess] = useState(false);

  // Shift tracking states
  const [activeStaffId, setActiveStaffId] = useState('');
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [activeShift, setActiveShift] = useState<Shift | null>(null);

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pin.trim()) {
      showToast('Name and security credentials are required', 'error');
      return;
    }

    if (pin.length !== 4 || /[^0-9]/.test(pin)) {
      showToast('Security PIN must be exactly a 4-digit numeric code', 'error');
      return;
    }

    const nextStore = addStaffMember(store, {
      name: name.trim(),
      pin: pin.trim(),
      phone: phone.trim(),
      role,
      permissions: {
        sales: salesAccess,
        inventory: inventoryAccess,
        reports: reportsAccess,
        settings: settingsAccess
      }
    });
    onUpdate(nextStore);
    showToast('Employee account created!');
    resetForm();
  };

  const handleEditStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff || !name.trim() || !pin.trim()) return;

    if (pin.length !== 4 || /[^0-9]/.test(pin)) {
      showToast('Security PIN must be exactly a 4-digit numeric code', 'error');
      return;
    }

    const nextStore = updateStaffMember(store, editingStaff.id, {
      name: name.trim(),
      pin: pin.trim(),
      phone: phone.trim(),
      role,
      permissions: {
        sales: salesAccess,
        inventory: inventoryAccess,
        reports: reportsAccess,
        settings: settingsAccess
      }
    });
    onUpdate(nextStore);
    showToast('Employee settings updated!');
    resetForm();
  };

  const handleDeleteStaff = (id: string) => {
    if (confirm('Permanently remove this employee account?')) {
      const nextStore = deleteStaffMember(store, id);
      onUpdate(nextStore);
      showToast('Employee deleted.');
    }
  };

  const handleStartShift = () => {
    if (!activeStaffId) {
      showToast('Please select a staff member to start a shift', 'error');
      return;
    }
    const staff = (store.staffMembers || []).find(s => s.id === activeStaffId);
    if (!staff) return;
    
    const cash = Number(openingCash) || 0;
    const nextStore = startShift(store, staff.id, staff.name, cash);
    
    // Set active shift in local UI state
    const currentShift = nextStore.shifts?.[0] || null;
    setActiveShift(currentShift);
    
    onUpdate(nextStore);
    showToast(`✓ Shift started for ${staff.name}`);
    setOpeningCash('');
  };

  const handleEndShift = () => {
    if (!activeShift) return;
    const cash = Number(closingCash) || 0;
    const nextStore = endShift(store, activeShift.id, cash);
    
    // Clear active shift in local state
    setActiveShift(null);
    setClosingCash('');
    
    onUpdate(nextStore);
    showToast(`✓ Shift ended. Shift report saved!`);
  };

  const resetForm = () => {
    setName('');
    setPin('');
    setPhone('');
    setRole('cashier');
    setSalesAccess(true);
    setInventoryAccess(false);
    setReportsAccess(false);
    setSettingsAccess(false);
    setShowAddModal(false);
    setEditingStaff(null);
  };

  const startEdit = (s: StaffMember) => {
    setEditingStaff(s);
    setName(s.name);
    setPin(s.pin);
    setPhone(s.phone || '');
    setRole(s.role);
    setSalesAccess(s.permissions.sales);
    setInventoryAccess(s.permissions.inventory);
    setReportsAccess(s.permissions.reports);
    setSettingsAccess(s.permissions.settings);
    setShowAddModal(true);
  };

  const staffMembers = store.staffMembers || [];
  const shifts = store.shifts || [];

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-yellow-500" /> Staff Accounts & Shifts
          </h2>
          <p className="text-sm text-muted-foreground">Manage employee roles, specify permissions access, and track cashier shifts.</p>
        </div>
        {currentUser?.role === 'owner' && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold transition-all text-sm shadow-md active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" /> Add Staff Member
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Active Shift Tracker */}
        <div className="lg:col-span-1 bg-slate-950 border border-border p-5 rounded-2xl space-y-4 h-fit">
          <h3 className="font-display font-bold text-base text-foreground">Shift Controller</h3>
          
          {activeShift ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-yellow-500/10 border border-yellow-500/25 space-y-2">
                <p className="text-xs text-yellow-500 font-bold flex items-center gap-1.5 animate-pulse">
                  <Play className="w-3.5 h-3.5 fill-yellow-500" /> Active Shift Running
                </p>
                <div className="text-xs space-y-1 text-muted-foreground">
                  <p>Cashier: <strong className="text-foreground">{activeShift.staffName}</strong></p>
                  <p>Started: <strong className="text-foreground">{new Date(activeShift.startTime).toLocaleTimeString()}</strong></p>
                  <p>Opening Float: <strong className="text-foreground">₦{activeShift.openingCash.toLocaleString()}</strong></p>
                </div>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Closing Cash (₦)</label>
                <input 
                  type="number" 
                  value={closingCash}
                  onChange={e => setClosingCash(e.target.value)}
                  placeholder="Count drawer cash e.g. 24500"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <button 
                onClick={handleEndShift}
                className="w-full py-2.5 rounded-xl bg-destructive text-white font-display font-bold text-xs flex items-center justify-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-white" /> End Shift & Tally Drawer
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Select Employee</label>
                <select 
                  value={activeStaffId}
                  onChange={e => setActiveStaffId(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                >
                  <option value="">Choose Staff...</option>
                  {staffMembers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Opening Drawer Cash (₦)</label>
                <input 
                  type="number" 
                  value={openingCash}
                  onChange={e => setOpeningCash(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <button 
                onClick={handleStartShift}
                className="w-full py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold text-xs flex items-center justify-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-slate-950" /> Open Cashier Shift
              </button>
            </div>
          )}
        </div>

        {/* Right: Accounts list and Shift history */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Accounts list */}
          <div className="space-y-3.5">
            <h3 className="font-display font-bold text-base text-foreground">Registered Staff Members</h3>
            {staffMembers.length === 0 ? (
              <div className="text-center py-8 bg-slate-900/30 rounded-2xl border border-dashed border-border/80">
                <p className="text-muted-foreground text-xs">No employee accounts registered. Add cashier profiles to enable shift logs.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {staffMembers.map(s => (
                  <div key={s.id} className="p-4 rounded-xl bg-slate-950 border border-border flex flex-col justify-between gap-3 text-left">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4 className="font-display font-bold text-sm text-foreground">{s.name}</h4>
                        <span className="inline-block px-1.5 py-0.5 rounded bg-surface-2 border border-border/80 text-[8px] font-bold text-yellow-500 uppercase mt-1">
                          {s.role}
                        </span>
                      </div>
                      {currentUser?.role === 'owner' && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(s)} className="p-1.5 rounded bg-surface-2 border border-border text-muted-foreground hover:text-yellow-500 transition-all">
                            <Edit className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDeleteStaff(s.id)} className="p-1.5 rounded bg-surface-2 border border-border text-muted-foreground hover:text-destructive transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap text-[9px] font-mono text-muted-foreground">
                      <span className={`px-1.5 py-0.5 rounded ${s.permissions.sales ? 'bg-success/10 text-success' : 'bg-surface-2'}`}>Sales</span>
                      <span className={`px-1.5 py-0.5 rounded ${s.permissions.inventory ? 'bg-success/10 text-success' : 'bg-surface-2'}`}>Inventory</span>
                      <span className={`px-1.5 py-0.5 rounded ${s.permissions.reports ? 'bg-success/10 text-success' : 'bg-surface-2'}`}>Reports</span>
                      <span className={`px-1.5 py-0.5 rounded ${s.permissions.settings ? 'bg-success/10 text-success' : 'bg-surface-2'}`}>Settings</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shift Records Tally */}
          <div className="space-y-3.5">
            <h3 className="font-display font-bold text-base text-foreground">Completed Shift Tally</h3>
            {shifts.length === 0 ? (
              <div className="text-center py-10 bg-slate-900/30 rounded-2xl border border-dashed border-border/80">
                <p className="text-muted-foreground text-xs">No shift logs stored yet.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
                {shifts.map(sh => (
                  <div key={sh.id} className="p-3.5 rounded-xl bg-slate-950 border border-border flex justify-between items-center text-xs">
                    <div className="text-left space-y-1">
                      <p className="font-bold text-foreground">{sh.staffName}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Started: {new Date(sh.startTime).toLocaleDateString()} {new Date(sh.startTime).toLocaleTimeString()}
                      </p>
                      {sh.endTime && (
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Ended: {new Date(sh.endTime).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-muted-foreground">Drawer Float: <strong className="text-foreground">₦{sh.openingCash.toLocaleString()}</strong></p>
                      {sh.closingCash !== undefined && (
                        <p className="text-muted-foreground">Ending Drawer: <strong className="text-yellow-500 font-bold">₦{sh.closingCash.toLocaleString()}</strong></p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Account Creation Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4">
          <form 
            onSubmit={editingStaff ? handleEditStaff : handleAddStaff}
            className="w-full max-w-md bg-card border border-border rounded-2xl p-6 animate-slide-up space-y-4"
          >
            <div>
              <h3 className="font-display font-bold text-lg">{editingStaff ? 'Edit Staff Profile' : 'Add Employee'}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Specify security credentials and app access modules.</p>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Employee Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Joy Okafor"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">WhatsApp / Phone Number</label>
                <input 
                  type="text" 
                  value={phone} 
                  onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. 07025517388"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground uppercase font-bold">Role Title</label>
                  <select 
                    value={role} 
                    onChange={e => setRole(e.target.value as any)}
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  >
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                    <option value="inventory">Inventory Staff</option>
                    <option value="accountant">Accountant</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="custom">Custom Role</option>
                  </select>
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground uppercase font-bold">
                    Security PIN (4 digits)
                  </label>
                  <input 
                    type="password" 
                    maxLength={4}
                    value={pin} 
                    onChange={e => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="e.g. 1234"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500 font-mono text-center"
                  />
                </div>
              </div>

              {/* Permissions switches checklist */}
              <div className="space-y-2 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Module Access Controls</label>
                <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-surface-2 border border-border">
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={salesAccess} 
                      onChange={e => setSalesAccess(e.target.checked)}
                      className="rounded accent-yellow-500 w-4 h-4 border border-border"
                    />
                    Sales access
                  </label>
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={inventoryAccess} 
                      onChange={e => setInventoryAccess(e.target.checked)}
                      className="rounded accent-yellow-500 w-4 h-4 border border-border"
                    />
                    Inventory access
                  </label>
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={reportsAccess} 
                      onChange={e => setReportsAccess(e.target.checked)}
                      className="rounded accent-yellow-500 w-4 h-4 border border-border"
                    />
                    Reports & ROI access
                  </label>
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={settingsAccess} 
                      onChange={e => setSettingsAccess(e.target.checked)}
                      className="rounded accent-yellow-500 w-4 h-4 border border-border"
                    />
                    Store settings access
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={resetForm} className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-yellow-500 text-slate-950 text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                {editingStaff ? 'Save Changes' : 'Register Account'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
