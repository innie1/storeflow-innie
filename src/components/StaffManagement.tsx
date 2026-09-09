import { useState } from 'react';
import { runsATill } from '@/lib/business-runtime';
import { StoreData, StaffMember, Shift, PieceRate } from '@/types/store';
import { 
  addStaffMember, deleteStaffMember, updateStaffMember, startShift, endShift 
} from '@/lib/store-data';
import { 
  Briefcase, UserPlus, Lock, Key, Shield, Calendar, Play, Square, FileText, CheckSquare, Trash2, Edit
} from 'lucide-react';
import { showToast } from '@/components/Toast';
import { ANY_GARMENT, pendingClaims, setPieceRate, taskLabel, WORK_TASKS } from '@/lib/piece-work';
import RecordWork from '@/components/laundry/RecordWork';
import WorkerEarnings from '@/components/laundry/WorkerEarnings';
import ContactPickButton from '@/components/ContactPickButton';
import ConfirmModal from '@/components/ConfirmModal';
import ScrollLock from '@/components/ScrollLock';

interface StaffManagementProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
  currentUser?: any;
}

/**
 * What a named role can open, in the merchant's words.
 *
 * The four tick-boxes below the role are only ever read for a custom role —
 * every named role's access is fixed in isTabAllowed and ignores them
 * entirely. So ticking "Reports" for an attendant did nothing at all, which is
 * a worse lie than not offering it. Named roles now show what they get instead
 * of pretending to be configurable.
 */
function roleOpens(role: string, hasTill: boolean): string[] {
  switch (role) {
    case 'cashier':
      return ['Sell and take payment', 'The cash drawer and their shift', 'Sales history, without the totals'];
    case 'attendant':
      return [
        hasTill ? 'Take orders in and hand them back' : 'Record work coming in and hand it back',
        'Move a job along to ready and collected',
        'Look up a customer',
      ];
    case 'inventory':
      return ['Stock and stock counts', 'Suppliers and restocking', 'The marketplace and wishlist'];
    case 'supervisor':
      return ['See all the work on the floor', 'The team list, without changing it', 'Customers and history'];
    case 'accountant':
      return ['Expenses and pending payments', 'Reports, ROI and the ledger', 'No changes to stock or prices'];
    case 'manager':
      return ['Everything except store settings', 'Can delete records and see all takings', 'Cannot change staff accounts'];
    default:
      return ['The dashboard and messages'];
  }
}

export default function StaffManagement({ store, onUpdate, currentUser }: StaffManagementProps) {
  /**
   * A laundry has no till.
   *
   * This screen opened with a Shift Controller, an "Opening drawer cash" box
   * and an "Open Cashier Shift" button, above the thing the owner came for. A
   * laundry, a barber, a tailor — none of them cash up a drawer, and being
   * shown a provision shop's till before you can add a worker is what makes
   * the app feel like it is for somebody else's business.
   */
  const hasTill = runsATill(store);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Form states for adding staff
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [phone, setPhone] = useState('');
  /** What they are paid a month. Feeds the shop's fixed costs. */
  const [salary, setSalary] = useState('');
  const [payType, setPayType] = useState<'monthly' | 'per_piece' | 'none'>('monthly');
  const [pieceRates, setPieceRates] = useState<PieceRate[]>([]);
  const [newRateTask, setNewRateTask] = useState<string>(WORK_TASKS[0].id);
  const [newRateGarment, setNewRateGarment] = useState('');
  const [recordingFor, setRecordingFor] = useState<StaffMember | null>(null);
  const [earningsFor, setEarningsFor] = useState<StaffMember | null>(null);

  /** Claims this worker has waiting, so an owner can see there is something. */
  const pendingFor = (workerId: string) =>
    pendingClaims(store).filter(entry => entry.workerId === workerId).length;

  /** What is typed in a rate box right now, as a string. */
  const rateFor = (task: string, garmentType: string) => {
    const found = pieceRates.find(r => r.task === task && r.garmentType.toLowerCase() === garmentType.toLowerCase());
    return found ? String(found.rate) : '';
  };

  /*
   * Zero and empty both mean "no rate", which setPieceRate turns into a
   * removal rather than a rate of nothing - recording free work by accident is
   * exactly the kind of thing that only shows up on payday.
   */
  const changeRate = (task: string, garmentType: string, value: string) => {
    const rate = Number(value.replace(/[^0-9]/g, '')) || 0;
    setPieceRates(current => {
      const next = setPieceRate(current, { task, garmentType, rate });
      // Keep a named garment visible at zero while it is being typed into.
      if (rate === 0 && garmentType !== ANY_GARMENT && !next.some(r => r.task === task && r.garmentType === garmentType)) {
        return [...next, { task, garmentType, rate: 0 }];
      }
      return next;
    });
  };

  /** Everything except the catch-alls, which have their own row above. */
  const namedRates = pieceRates.filter(r => r.garmentType !== ANY_GARMENT);
  // Whichever role the shop is most likely to be adding: a till shop hires a
  // cashier, a laundry or a barber hires someone to take work in.
  const [role, setRole] = useState<StaffMember['role']>(
    runsATill(store) ? 'cashier' : 'attendant',
  );
  
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
      monthlySalary: payType === 'monthly' ? Math.max(0, Number(salary) || 0) : 0,
      payType,
      pieceRates: payType === 'per_piece' ? pieceRates.filter(r => r.rate > 0) : [],
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
      monthlySalary: payType === 'monthly' ? Math.max(0, Number(salary) || 0) : 0,
      payType,
      pieceRates: payType === 'per_piece' ? pieceRates.filter(r => r.rate > 0) : [],
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
    setPendingDeleteId(id);
  };

  const confirmDeleteStaff = () => {
    if (!pendingDeleteId) return;
    const nextStore = deleteStaffMember(store, pendingDeleteId);
    onUpdate(nextStore);
    showToast('Employee deleted.');
    setPendingDeleteId(null);
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
    setSalary('');
    setPayType('monthly');
    setPieceRates([]);
    setNewRateGarment('');
    setRole(runsATill(store) ? 'cashier' : 'attendant');
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
    setSalary(s.monthlySalary ? String(s.monthlySalary) : '');
    setPayType(s.payType || 'monthly');
    setPieceRates(s.pieceRates || []);
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
    <>
      {/* Full-screen, because both are a job of work rather than a glance. */}
      {recordingFor && (
        <RecordWork
          store={store}
          worker={recordingFor}
          onUpdate={onUpdate}
          onClose={() => setRecordingFor(null)}
        />
      )}
      {earningsFor && (
        <WorkerEarnings
          store={store}
          worker={earningsFor}
          canManage={currentUser?.role === 'owner'}
          onUpdate={onUpdate}
          onClose={() => setEarningsFor(null)}
        />
      )}
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-yellow-500" /> {hasTill ? 'Staff Accounts & Shifts' : 'Staff Accounts'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {hasTill
              ? 'Add your workers, set what each can reach, and track cashier shifts.'
              : 'Add your workers and set what each of them can reach.'}
          </p>
        </div>
        {currentUser?.role === 'owner' && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-primary-foreground font-display font-bold transition-all text-sm shadow-md active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" /> Add Staff Member
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Active Shift Tracker */}
        {hasTill && (
        <div className="lg:col-span-1 bg-background border border-border p-5 rounded-2xl space-y-4 h-fit">
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
                className="w-full py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-primary-foreground font-display font-bold text-xs flex items-center justify-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-primary-foreground" /> Open Cashier Shift
              </button>
            </div>
          )}
        </div>
        )}

        {/* Right: Accounts list and Shift history */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Accounts list */}
          <div className="space-y-3.5">
            <h3 className="font-display font-bold text-base text-foreground">Your team</h3>
            {staffMembers.length === 0 ? (
              <div className="text-center py-8 bg-card/30 rounded-2xl border border-dashed border-border/80">
                <p className="text-muted-foreground text-xs">
              {hasTill
                ? 'Nobody added yet. Add a worker to give them their own login and shift log.'
                : 'Nobody added yet. Add a worker to give them their own login.'}
            </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {staffMembers.map(s => (
                  <div key={s.id} className="p-4 rounded-xl bg-background border border-border flex flex-col justify-between gap-3 text-left">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4 className="font-display font-bold text-sm text-foreground">{s.name}</h4>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-surface-2 border border-border/80 text-[8px] font-bold text-yellow-500 uppercase">
                            {s.role}
                          </span>
                          {/* How somebody is paid changes what the shop owes
                              them, which is worth seeing on the row rather
                              than only inside the edit form. */}
                          {s.payType === 'per_piece' && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-primary/15 border border-primary/30 text-[8px] font-bold text-primary uppercase">
                              per piece
                            </span>
                          )}
                        </div>
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
                      <span className={`px-1.5 py-0.5 rounded ${s.permissions.sales ? 'bg-success/10 text-success' : 'bg-surface-2'}`}>{hasTill ? 'Sales' : 'Orders'}</span>
                      <span className={`px-1.5 py-0.5 rounded ${s.permissions.inventory ? 'bg-success/10 text-success' : 'bg-surface-2'}`}>{hasTill ? 'Inventory' : 'Price list'}</span>
                      <span className={`px-1.5 py-0.5 rounded ${s.permissions.reports ? 'bg-success/10 text-success' : 'bg-surface-2'}`}>Reports</span>
                      <span className={`px-1.5 py-0.5 rounded ${s.permissions.settings ? 'bg-success/10 text-success' : 'bg-surface-2'}`}>Settings</span>
                    </div>

                    {/*
                      Recording work and being paid are the two things a
                      per-piece worker's row is for. Attendance stays where it
                      is: somebody can turn up all day and iron nothing, and
                      the shop owes them for the ironing either way.
                    */}
                    {s.payType === 'per_piece' && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setRecordingFor(s)}
                          className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-[11px] font-display font-black"
                        >
                          Record work
                        </button>
                        <button
                          onClick={() => setEarningsFor(s)}
                          className="flex-1 h-9 rounded-lg bg-surface-2 border border-border text-[11px] font-display font-bold"
                        >
                          Earnings
                          {pendingFor(s.id) > 0 && (
                            <span className="ml-1 inline-flex items-center justify-center min-w-[15px] h-[15px] px-1 rounded-full bg-destructive text-white text-[8px] font-bold">
                              {pendingFor(s.id)}
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shift Records Tally — drawer floats, so only where there is a drawer. */}
          {hasTill && (
          <div className="space-y-3.5">
            <h3 className="font-display font-bold text-base text-foreground">Completed Shift Tally</h3>
            {shifts.length === 0 ? (
              <div className="text-center py-10 bg-card/30 rounded-2xl border border-dashed border-border/80">
                <p className="text-muted-foreground text-xs">No shift logs stored yet.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
                {shifts.map(sh => (
                  <div key={sh.id} className="p-3.5 rounded-xl bg-background border border-border flex justify-between items-center text-xs">
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
          )}
        </div>
      </div>

      {/* Account Creation Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}><ScrollLock />
          <form 
            onSubmit={editingStaff ? handleEditStaff : handleAddStaff}
            className="w-full max-w-md bg-card border border-border rounded-2xl p-6 animate-slide-up space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h3 className="font-display font-bold text-lg">{editingStaff ? 'Edit worker' : 'Add a worker'}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Give them a login and choose what they can open.</p>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Name</label>
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
                <div className="relative">
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="e.g. 07025517388"
                    className="w-full p-2.5 pr-11 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  />
                  <ContactPickButton onPick={(picked, pickedName) => {
                    setPhone(picked);
                    if (pickedName && !name.trim()) setName(pickedName);
                  }} />
                </div>
              </div>

              {/*
                How they are paid, before how much.

                A laundry's ironing is very often done by somebody who comes in
                when there is work, irons forty shirts and goes home. Recording
                them as a monthly wage makes the shop's figures wrong twice
                over: it charges for a salary that is not paid, and it hides
                what those forty shirts actually cost.
              */}
              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">How they are paid</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['monthly', 'Monthly'],
                    ['per_piece', 'Per piece'],
                    ['none', 'No payroll'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPayType(id)}
                      className={`h-10 rounded-lg border text-[11px] font-display font-bold transition-colors ${
                        payType === id ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 border-border text-muted-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {payType === 'per_piece'
                    ? 'Paid for each item they finish. Set the rates below.'
                    : payType === 'none'
                      ? 'An owner or family member who is not on the payroll.'
                      : 'A fixed wage every month, whatever the shop takes.'}
                </p>
              </div>

              {/*
                The rates, only where they mean something.

                A catch-all first - "ironing, anything, fifty" - because most
                shops price it that way, and then the few garments that take
                three times as long can be named on top of it.
              */}
              {payType === 'per_piece' && (
                <div className="space-y-2 text-left rounded-xl border border-primary/25 bg-primary/5 p-3">
                  <p className="text-[11px] font-display font-black text-primary">What they earn per piece</p>
                  {WORK_TASKS.map(task => (
                    <div key={task.id} className="flex items-center gap-2">
                      <span className="text-xs w-16 shrink-0">{task.label}</span>
                      <div className="flex items-center gap-1 flex-1 h-9 px-2 rounded-lg bg-surface-2 border border-border">
                        <span className="text-xs text-muted-foreground">₦</span>
                        <input
                          inputMode="numeric"
                          value={rateFor(task.id, ANY_GARMENT)}
                          onChange={e => changeRate(task.id, ANY_GARMENT, e.target.value)}
                          placeholder="any item"
                          className="w-full bg-transparent text-xs outline-none"
                        />
                      </div>
                    </div>
                  ))}

                  {/* Named garments, for the ones that are not like the rest. */}
                  {namedRates.map(rate => (
                    <div key={`${rate.task}-${rate.garmentType}`} className="flex items-center gap-2">
                      <span className="text-[11px] w-16 shrink-0 truncate text-muted-foreground">{taskLabel(rate.task)}</span>
                      <span className="text-[11px] flex-1 truncate">{rate.garmentType}</span>
                      <div className="flex items-center gap-1 w-24 h-9 px-2 rounded-lg bg-surface-2 border border-border">
                        <span className="text-xs text-muted-foreground">₦</span>
                        <input
                          inputMode="numeric"
                          value={rateFor(rate.task, rate.garmentType)}
                          onChange={e => changeRate(rate.task, rate.garmentType, e.target.value)}
                          className="w-full bg-transparent text-xs outline-none"
                        />
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-1.5 pt-1">
                    <select
                      value={newRateTask}
                      onChange={e => setNewRateTask(e.target.value)}
                      className="h-9 rounded-lg bg-surface-2 border border-border text-[11px] px-2 outline-none"
                    >
                      {WORK_TASKS.map(task => <option key={task.id} value={task.id}>{task.label}</option>)}
                    </select>
                    <input
                      value={newRateGarment}
                      onChange={e => setNewRateGarment(e.target.value)}
                      placeholder="e.g. Native Wear"
                      className="flex-1 h-9 rounded-lg bg-surface-2 border border-border text-[11px] px-2 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const name = newRateGarment.trim();
                        if (!name) return;
                        changeRate(newRateTask, name, '0');
                        setNewRateGarment('');
                      }}
                      className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-display font-black"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              {payType === 'monthly' && (
              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Monthly salary</label>
                <div className="flex items-center gap-2 w-full p-2.5 rounded-lg bg-surface-2 border border-border">
                  <span className="text-sm text-muted-foreground">₦</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={salary}
                    onChange={e => setSalary(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Leave blank if not on a wage"
                    className="w-full bg-transparent text-foreground text-sm focus:outline-none"
                  />
                </div>
              </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground uppercase font-bold">Role</label>
                  <select 
                    value={role} 
                    onChange={e => setRole(e.target.value as any)}
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  >
                    {/* A laundry has no cashier and no stockroom, so leading
                        with those two made the list read like somebody else's
                        business. The trades that do keep them. */}
                    {hasTill && <option value="cashier">Cashier — sells and takes payment</option>}
                    <option value="attendant">Attendant — takes work in and hands it back</option>
                    {hasTill && <option value="inventory">Inventory Staff — stock and suppliers</option>}
                    <option value="supervisor">Supervisor — sees the work and the team</option>
                    <option value="accountant">Accountant — money and reports</option>
                    <option value="manager">Manager — everything except settings</option>
                    <option value="custom">Custom role — you choose</option>
                  </select>
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground uppercase font-bold">
                    PIN (4 digits)
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
                <label className="text-xs text-muted-foreground uppercase font-bold">What they can open</label>
                {role === 'custom' ? (
                  <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-surface-2 border border-border">
                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={salesAccess}
                        onChange={e => setSalesAccess(e.target.checked)}
                        className="rounded accent-yellow-500 w-4 h-4 border border-border"
                      />
                      {hasTill ? 'Sales access' : 'Take orders'}
                    </label>
                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={inventoryAccess}
                        onChange={e => setInventoryAccess(e.target.checked)}
                        className="rounded accent-yellow-500 w-4 h-4 border border-border"
                      />
                      {hasTill ? 'Inventory access' : 'Price list'}
                    </label>
                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reportsAccess}
                        onChange={e => setReportsAccess(e.target.checked)}
                        className="rounded accent-yellow-500 w-4 h-4 border border-border"
                      />
                      {hasTill ? 'Reports & ROI access' : 'Reports'}
                    </label>
                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settingsAccess}
                        onChange={e => setSettingsAccess(e.target.checked)}
                        className="rounded accent-yellow-500 w-4 h-4 border border-border"
                      />
                      {hasTill ? 'Store settings access' : 'Settings'}
                    </label>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-surface-2 border border-border">
                    <ul className="space-y-1">
                      {roleOpens(role, hasTill).map(item => (
                        <li key={item} className="text-xs text-foreground flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span> {item}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-muted-foreground mt-2 leading-snug">
                      Pick <b>Custom role</b> if you want to choose each one yourself.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={resetForm} className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-yellow-500 text-primary-foreground text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                {editingStaff ? 'Save changes' : 'Add worker'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(pendingDeleteId)}
        title="Remove Employee Account?"
        description="Are you sure you want to permanently remove this employee account? Access will be revoked immediately."
        confirmText="Remove Account"
        cancelText="Cancel"
        variant="danger"
        icon="👤"
        onConfirm={confirmDeleteStaff}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
    </>
  );
}
