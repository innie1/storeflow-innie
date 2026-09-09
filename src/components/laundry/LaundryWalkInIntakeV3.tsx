import { useEffect, useMemo, useState } from 'react';
import { attribution } from '@/lib/recorded-by';
import { checkNewMilestone, markMilestoneReached, type MilestoneDef } from '@/lib/milestones';
import MilestoneCelebration from '@/components/MilestoneCelebration';
import QRCode from 'qrcode';
import type { StoreData } from '@/types/store';
import { matchCustomer, addCustomer, updateCustomer, saveStore } from '@/lib/store-data';
import { isInCustomerBook, knownCustomers } from '@/lib/customer-directory';
import { getServicePricingLabel, getStoredServicePricing } from '@/lib/service-pricing';
import { countLaundryPieces, sanitizeGarmentSelections, summarizeLaundryGarments, type LaundryGarmentSelection } from '@/lib/laundry-intake';
import {
  calculateLaundryPriceLines,
  getLaundryGarmentPrice,
  getLaundryPricingConfig,
} from '@/lib/laundry-pricing';
import { recordLaundryPayment, requiredDeposit, settleLaundryPayment } from '@/lib/laundry-money';
import CustomerSuggestions from '@/components/CustomerSuggestions';
import {
  createLocalLaundryRecord,
  getLocalLaundryRecords,
  setLocalLaundryPhone,
  LAUNDRY_SYNC_CHANGED_EVENT,
  localLaundryRecordToOrder,
  syncLaundryRecord,
  type LocalLaundryRecord,
} from '@/lib/laundry-offline';
import { openLaundryWhatsApp, openWhatsAppChooser } from '@/lib/laundry-whatsapp';
import { showToast } from '@/components/Toast';
import ContactPickButton from '@/components/ContactPickButton';
import { beginWork } from '@/lib/work-in-progress';
import { CalendarClock, Check, ChevronDown, ChevronUp, ClipboardCopy, MapPin, MessageCircle, Minus, Plus, Search, Shirt, Ticket, X } from 'lucide-react';
import BundlePhotos from '@/components/laundry/BundlePhotos';
import ClaimTicket from '@/components/laundry/ClaimTicket';
import { reassignLaundryPhotos } from '@/lib/laundry-photos';
import { FULFILLMENT_LABELS, totalWithDelivery, type LaundryFulfillment } from '@/lib/laundry-runs';
import { LAUNDRY_MODIFIERS, describeModifiers, toggleModifier } from '@/lib/laundry-modifiers';
import { orderedDueChips, recordDueChoice } from '@/lib/laundry-due-usage';
import { markPractised } from '@/lib/setup-guide';
import { filterGarments, findSimilarGarment } from '@/lib/garment-match';

interface Props {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  /** Stamped onto the record, so the shop can tell who took the bundle in. */
  currentUser?: { name?: string; role?: string } | null;
  /**
   * The bundle that was just taken in, so the list can show where it landed.
   * Sorted by due date, a new bundle usually appears well down the list.
   */
  onRecorded?: (clientRef: string) => void;
  /**
   * A rehearsal, not a job.
   *
   * The setup walk teaches this screen by having the merchant fill it in, and
   * that used to create a real bundle: a job in the records, a customer in the
   * book, money in the day's takings. Somebody learning the app at home was
   * left with an invented customer and takings that never happened. In this
   * mode nothing is written anywhere.
   */
  practice?: boolean;
}

const OPEN_SIGNAL = 'storeflow:open-laundry-intake';
const OPEN_STORAGE = 'storeflow-open-laundry-intake';

function emptyCounts(garments: string[]): Record<string, number> {
  return Object.fromEntries(garments.map(name => [name, 0]));
}

export function rankGarmentsByUsage(accessCode: string, garmentTypes: string[]): string[] {
  const used = new Map<string, number>();
  const lastUsed = new Map<string, number>();
  for (const record of getLocalLaundryRecords(accessCode)) {
    const at = new Date(record.createdAt || '').getTime();
    for (const garment of record.garments || []) {
      const name = String(garment.garmentType || '');
      if (!name) continue;
      used.set(name, (used.get(name) || 0) + (Number(garment.quantity) || 0));
      if (Number.isFinite(at)) lastUsed.set(name, Math.max(lastUsed.get(name) || 0, at));
    }
  }
  return [...garmentTypes].sort((a, b) => {
    const byUsage = (used.get(b) || 0) - (used.get(a) || 0);
    if (byUsage !== 0) return byUsage;
    const byRecency = (lastUsed.get(b) || 0) - (lastUsed.get(a) || 0);
    if (byRecency !== 0) return byRecency;
    return garmentTypes.indexOf(a) - garmentTypes.indexOf(b);
  });
}

function validPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').length >= 7;
}

function suggestedPromisedLocal(turnaround?: string): string {
  const value = String(turnaround || '24 hours').toLowerCase();
  const date = new Date();
  const hours = value.includes('same day') ? 8 : Number(value.match(/(\d+)\s*hour/)?.[1] || 0);
  const days = Number(value.match(/(\d+)\s*day/)?.[1] || 0);
  const weeks = Number(value.match(/(\d+)\s*week/)?.[1] || 0);
  date.setTime(date.getTime() + (hours || days * 24 || weeks * 7 * 24 || 24) * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const DUE_PRESETS: { label: string; hours: number }[] = [
  { label: '12 hours', hours: 12 },
  { label: '1 day', hours: 24 },
  { label: '2 days', hours: 48 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
];

function isCountedUnit(pricing: string): boolean {
  return pricing === 'per_kg' || pricing === 'per_load' || pricing === 'per_bundle';
}

const CUSTOM_DUE_KEY = 'storeflow_laundry_custom_due_hours';

function readCustomDue(): number | null {
  try {
    const raw = Number(localStorage.getItem(CUSTOM_DUE_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

function rememberCustomDue(hours: number): void {
  try { localStorage.setItem(CUSTOM_DUE_KEY, String(Math.round(hours))); } catch { /* private mode */ }
}

function describeHours(hours: number): string {
  const rounded = Math.round(hours);
  if (rounded < 24) return `${rounded} hour${rounded === 1 ? '' : 's'}`;
  const days = Math.round(rounded / 24);
  if (days === 7) return '1 week';
  return `${days} day${days === 1 ? '' : 's'}`;
}

function promisedInHours(hours: number): string {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function activePreset(promisedFor: string, chips: { hours: number }[]): number | null {
  if (!promisedFor) return null;
  const target = new Date(promisedFor).getTime();
  if (!Number.isFinite(target)) return null;
  for (const chip of chips) {
    const expected = new Date(promisedInHours(chip.hours)).getTime();
    if (Math.abs(target - expected) < 60_000) return chip.hours;
  }
  return null;
}

export default function LaundryWalkInIntakeV3({ store, onUpdate, currentUser, onRecorded, practice: guidedPractice = false }: Props) {
  const [rehearsing, setRehearsing] = useState(guidedPractice);
  useEffect(() => { setRehearsing(guidedPractice); }, [guidedPractice]);
  const practice = rehearsing;
  const services = useMemo(
    () => (store.products || []).filter(service => service.isService && !service.discontinued),
    [store.products],
  );
  const book = store.customers || [];
  const directory = useMemo(() => knownCustomers(store), [store]);
  const garmentTypes = useMemo(() => getLaundryPricingConfig(store).garmentTypes, [store]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paidNow, setPaidNow] = useState('');
  const [paidTouched, setPaidTouched] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [askingNumber, setAskingNumber] = useState(false);
  const [lateNumber, setLateNumber] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [garmentCounts, setGarmentCounts] = useState<Record<string, number>>(() => emptyCounts(garmentTypes));
  const [customGarment, setCustomGarment] = useState('');
  const [garmentSearch, setGarmentSearch] = useState('');
  const [similarGarment, setSimilarGarment] = useState<{ existing: string; typed: string } | null>(null);
  const [billingQuantity, setBillingQuantity] = useState('1');
  const [totalPrice, setTotalPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [promisedFor, setPromisedFor] = useState('');
  const [promisedTouched, setPromisedTouched] = useState(false);
  const [milestone, setMilestone] = useState<MilestoneDef | null>(null);
  const [pickingCustom, setPickingCustom] = useState(false);
  const [shelfLocation, setShelfLocation] = useState('');
  const [fulfillment, setFulfillment] = useState<LaundryFulfillment>('walk_in');
  const [runAddress, setRunAddress] = useState('');
  const [runLandmark, setRunLandmark] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [garmentModifiers, setGarmentModifiers] = useState<Record<string, string[]>>({});
  const [modifyingGarment, setModifyingGarment] = useState<string | null>(null);
  const [draftRef] = useState(() => `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`);
  const [customDue, setCustomDue] = useState<number | null>(() => readCustomDue());
  const [washMethodId, setWashMethodId] = useState('manual:hand-wash');
  const [dryMethodId, setDryMethodId] = useState('manual:sun-dry');
  const [created, setCreated] = useState<LocalLaundryRecord | null>(null);
  const [createdPayment, setCreatedPayment] = useState<ReturnType<typeof settleLaundryPayment> | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showTicket, setShowTicket] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [garmentOrder, setGarmentOrder] = useState<string[]>(garmentTypes);

  const selectedService = services.find(service => String(service.id) === selectedServiceId) || services[0] || null;
  const equipment = (store.laundryEquipment || []).filter(item => item.active);
  const washOptions = [{ id: 'manual:hand-wash', name: 'Hand wash' }, ...equipment.filter(item => ['washer', 'washer_dryer'].includes(item.kind)).map(item => ({ id: item.id, name: item.name }))];
  const dryOptions = [{ id: 'manual:sun-dry', name: 'Sun dry' }, ...equipment.filter(item => ['dryer', 'washer_dryer'].includes(item.kind)).map(item => ({ id: item.id, name: item.name }))];
  const pricing = selectedService ? getStoredServicePricing(selectedService) : 'per_piece';
  const pricingLabel = getServicePricingLabel(pricing);
  const selections = useMemo<LaundryGarmentSelection[]>(
    () => Object.entries(garmentCounts)
      .map(([garmentType, quantity]) => ({
        garmentType,
        quantity,
        modifiers: garmentModifiers[garmentType]?.length ? garmentModifiers[garmentType] : undefined,
      }))
      .filter(item => item.quantity > 0),
    [garmentCounts, garmentModifiers],
  );
  const pieceCount = countLaundryPieces(selections);
  const displayGarments = useMemo(() => {
    const ranked = garmentOrder.filter(name => name in garmentCounts);
    const extras = Object.keys(garmentCounts).filter(name => !ranked.includes(name));
    return [...ranked, ...extras];
  }, [garmentOrder, garmentCounts]);
  const calculated = useMemo(
    () => selectedService ? calculateLaundryPriceLines(store, selectedService, selections, Number(billingQuantity) || 0) : { lines: [], total: 0 },
    [store, selectedService, selections, billingQuantity],
  );

  useEffect(() => {
    if (!selectedServiceId && services[0]) setSelectedServiceId(String(services[0].id));
  }, [selectedServiceId, services]);

  useEffect(() => {
    if (!selectedService || promisedTouched) return;
    setPromisedFor(suggestedPromisedLocal(selectedService.turnaround));
  }, [selectedService, promisedTouched]);

  useEffect(() => {
    setGarmentCounts(current => ({ ...emptyCounts(garmentTypes), ...current }));
  }, [garmentTypes]);

  useEffect(() => {
    if (!selectedService || priceTouched) return;
    setTotalPrice(calculated.total > 0 ? String(calculated.total) : '');
  }, [selectedService, calculated.total, priceTouched]);

  const deposit = requiredDeposit(store, Number(totalPrice) || 0);
  useEffect(() => {
    if (!paidTouched) setPaidNow(deposit > 0 ? String(deposit) : '');
  }, [deposit, paidTouched]);

  useEffect(() => {
    const handleSync = (event: Event) => {
      const record = (event as CustomEvent).detail?.record as LocalLaundryRecord | undefined;
      if (!record?.clientRef) return;
      setCreated(current => current && current.clientRef === record.clientRef ? record : current);
    };
    window.addEventListener(LAUNDRY_SYNC_CHANGED_EVENT, handleSync);
    return () => window.removeEventListener(LAUNDRY_SYNC_CHANGED_EVENT, handleSync);
  }, []);

  useEffect(() => {
    if (!open) return;
    return beginWork();
  }, [open]);

  useEffect(() => {
    if (!created) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(`STORE:${store.accessCode}|LAUNDRY:${created.tagCode}`, { width: 320, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [created, store.accessCode]);

  const reset = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setSelectedCustomerId('');
    setSelectedServiceId(services[0] ? String(services[0].id) : '');
    setGarmentCounts(emptyCounts(garmentTypes));
    setShelfLocation('');
    setGarmentModifiers({});
    setModifyingGarment(null);
    setFulfillment('walk_in');
    setRunAddress('');
    setRunLandmark('');
    setDeliveryFee('');
    setCustomGarment('');
    setBillingQuantity('1');
    setTotalPrice('');
    setPriceTouched(false);
    setNotes('');
    // Keep the merchant's selected due date until they manually change it.
    setWashMethodId('manual:hand-wash');
    setDryMethodId('manual:sun-dry');
    setCreated(null);
    setCreatedPayment(null);
    setQrDataUrl('');
    setSaving(false);
    setShowMore(false);
  };

  const openIntake = () => {
    sessionStorage.removeItem(OPEN_STORAGE);
    reset();
    setGarmentOrder(rankGarmentsByUsage(String((store as any).accessCode || ''), garmentTypes));
    setOpen(true);
  };

  useEffect(() => {
    const handler = () => openIntake();
    window.addEventListener(OPEN_SIGNAL, handler);
    if (sessionStorage.getItem(OPEN_STORAGE) === '1') handler();
    return () => window.removeEventListener(OPEN_SIGNAL, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setOpen(false);
    reset();
  };

  const selectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    setShowSuggestions(false);
    const customer = directory.find(item => item.id === id);
    setCustomerName(customer?.name || '');
    setCustomerPhone(customer?.phone || '');
    setCustomerAddress(customer?.address || '');
  };

  const changeCount = (garment: string, delta: number) => {
    setGarmentCounts(current => ({ ...current, [garment]: Math.max(0, (current[garment] || 0) + delta) }));
    setPriceTouched(false);
  };

  const countGarment = (name: string) => {
    setGarmentCounts(current => ({ ...current, [name]: (current[name] || 0) + 1 }));
    setCustomGarment('');
    setSimilarGarment(null);
    setPriceTouched(false);
  };

  const shownGarments = useMemo(
    () => filterGarments(displayGarments, garmentSearch),
    [displayGarments, garmentSearch],
  );

  const addCustomGarment = () => {
    const name = customGarment.trim();
    if (!name) return;
    const exact = Object.keys(garmentCounts).find(key => key.toLowerCase() === name.toLowerCase());
    if (exact) return countGarment(exact);
    const similar = findSimilarGarment(Object.keys(garmentCounts), name);
    if (similar) {
      setSimilarGarment({ existing: similar, typed: name });
      return;
    }
    countGarment(name);
  };

  const saveIntake = async () => {
    const accessCode = String((store as any).accessCode || '');
    const name = customerName.trim();
    const phone = customerPhone.trim();
    const clean = sanitizeGarmentSelections(selections);
    const fee = fulfillment === 'walk_in' ? 0 : Math.max(0, Number(deliveryFee) || 0);
    const total = totalWithDelivery(Number(totalPrice), fee);
    const billingQty = Number(billingQuantity) || 0;

    if (!accessCode) return showToast('Store access code is missing', 'error');
    if (!name) return showToast('Customer name is required', 'error');
    if (phone && !validPhone(phone)) return showToast('That phone number looks wrong — fix it or leave it empty', 'error');
    if (!selectedService) return showToast('Add and select a laundry service first', 'error');
    if (clean.length === 0) return showToast('Record at least one item of clothing', 'error');
    if (isCountedUnit(pricing) && !(billingQty > 0)) return showToast('Enter the laundry quantity', 'error');
    if (!Number.isFinite(total) || total < 0) return showToast('Enter a valid total price', 'error');

    const pricedGarments = pricing === 'per_piece'
      ? clean.map(item => {
          const unitPrice = getLaundryGarmentPrice(store, selectedService, item.garmentType);
          return { ...item, unitPrice, subtotal: unitPrice * item.quantity };
        })
      : clean;
    const payment = settleLaundryPayment(total, Number(paidNow) || 0);

    setSaving(true);
    try {
      if (practice) {
        setCreated({
          clientRef: `practice_${Date.now().toString(36)}`,
          accessCode,
          tagCode: 'PRACTICE',
          customerName: name,
          customerPhone: phone,
          serviceId: String(selectedService.id),
          serviceName: selectedService.name,
          pricing,
          billingQuantity: isCountedUnit(pricing) ? billingQty : 1,
          total,
          notes: notes.trim(),
          garments: pricedGarments,
          pieceCount: countLaundryPieces(pricedGarments),
          garmentSummary: summarizeLaundryGarments(pricedGarments),
          promisedFor,
          workflowStage: 'received',
          syncStatus: 'pending',
          createdAt: new Date().toISOString(),
        } as any);
        setCreatedPayment(null);
        markPractised(accessCode);
        setSaving(false);
        return;
      }

      let nextStore = store;
      const picked = selectedCustomerId && isInCustomerBook({ id: selectedCustomerId })
        ? book.find(entry => entry.id === selectedCustomerId)
        : undefined;
      const existingCustomer = picked || matchCustomer(book, { name, phone });
      let customerId = existingCustomer?.id || '';
      try {
        if (!existingCustomer) {
          nextStore = addCustomer(nextStore, { name, phone, address: customerAddress.trim() || undefined });
          customerId = (nextStore.customers || [])[0]?.id || '';
        } else {
          const address = customerAddress.trim();
          const learned: Record<string, string> = {};
          if (phone && !String(existingCustomer.phone || '').trim()) learned.phone = phone;
          if (address && !String(existingCustomer.address || '').trim()) learned.address = address;
          if (Object.keys(learned).length) nextStore = updateCustomer(nextStore, existingCustomer.id, learned);
        }
      } catch (customerError) {
        console.warn('[Laundry Intake] Customer book update failed:', customerError);
      }

      const localRecord = createLocalLaundryRecord({
        accessCode,
        customerId,
        customerName: name,
        customerPhone: phone,
        customerAddress: customerAddress.trim(),
        promisedFor,
        washMethodId,
        washMethodName: washOptions.find(item => item.id === washMethodId)?.name || 'Hand wash',
        dryMethodId,
        dryMethodName: dryOptions.find(item => item.id === dryMethodId)?.name || 'Sun dry',
        serviceId: String(selectedService.id),
        serviceName: selectedService.name,
        pricing,
        billingQuantity: isCountedUnit(pricing) ? billingQty : 1,
        total,
        notes: notes.trim(),
        shelfLocation: shelfLocation.trim(),
        fulfillment,
        runAddress: runAddress.trim(),
        runLandmark: runLandmark.trim(),
        deliveryFee: fee,
        garments: pricedGarments,
        ...attribution(currentUser),
      });

      reassignLaundryPhotos(draftRef, localRecord.clientRef).catch(() => {});
      onRecorded?.(localRecord.clientRef);
      if (activeHours) recordDueChoice(accessCode, activeHours);

      nextStore = recordLaundryPayment(nextStore, {
        clientRef: localRecord.clientRef,
        tagCode: localRecord.tagCode,
        customerId,
        customerName: name,
        customerPhone: phone,
        serviceId: String(selectedService.id),
        serviceName: selectedService.name,
        total,
        amountPaid: payment.tendered,
        promisedFor,
      });

      const crossed = checkNewMilestone(nextStore);
      if (crossed) {
        nextStore = markMilestoneReached(nextStore, crossed.id);
        setMilestone(crossed);
      }

      saveStore(nextStore);
      onUpdate(nextStore);
      setCreatedPayment(payment);
      setCreated(localRecord);
      showToast(
        payment.change > 0
          ? `Laundry saved — ₦${payment.change.toLocaleString()} change for customer`
          : `Laundry saved locally — ${localRecord.tagCode}`,
        'success',
      );
      syncLaundryRecord(accessCode, localRecord.clientRef).catch(() => {});
    } catch (error: any) {
      console.error('[Laundry Intake] Local save failed:', error);
      showToast(error?.message || 'Could not save laundry record on this device', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyTag = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.tagCode);
      showToast('Tag code copied');
    } catch {
      showToast(created.tagCode, 'info');
    }
  };

  const sendWhatsAppToAnyone = () => {
    if (!created) return;
    if (!openWhatsAppChooser(store, localLaundryRecordToOrder(created))) {
      showToast('Could not open WhatsApp', 'error');
    }
  };

  const sendWhatsApp = () => {
    if (!created) return;
    if (!openLaundryWhatsApp(store, localLaundryRecordToOrder(created))) {
      showToast('Customer phone number is missing or invalid', 'error');
    }
  };

  const saveNumberAndSend = () => {
    if (!created) return;
    const typed = lateNumber.trim();
    if (!validPhone(typed)) {
      showToast('That number looks too short', 'error');
      return;
    }

    const withNumber = { ...created, customerPhone: typed };
    setLocalLaundryPhone(String(store.accessCode || ''), created.clientRef, typed);
    setCreated(withNumber);

    let next = store;
    if (created.customerId) {
      const known = (store.customers || []).find(entry => entry.id === created.customerId);
      if (known && !String(known.phone || '').trim()) next = updateCustomer(next, known.id, { phone: typed });
    }
    next = {
      ...next,
      pendingPayments: (next.pendingPayments || []).map(payment =>
        payment.id === `laundry-${created.clientRef}` && !String(payment.customerPhone || '').trim()
          ? { ...payment, customerPhone: typed }
          : payment),
    };
    saveStore(next);
    onUpdate(next);

    setAskingNumber(false);
    setLateNumber('');
    if (!openLaundryWhatsApp(next, localLaundryRecordToOrder(withNumber))) {
      showToast('Number saved — could not open WhatsApp', 'error');
    }
  };

  const canSave = Boolean(customerName.trim() && (!customerPhone.trim() || validPhone(customerPhone)) && selectedService && pieceCount > 0 && Number.isFinite(Number(totalPrice)));
  const saveLabel = practice ? 'Try it (nothing saved)' : 'Record Laundry';
  const activeHours = activePreset(promisedFor, [
    ...DUE_PRESETS,
    ...(customDue ? [{ label: describeHours(customDue), hours: customDue }] : []),
  ]);
  const dueChips = useMemo(
    () => orderedDueChips(String((store as any).accessCode || ''), DUE_PRESETS, {
      custom: customDue,
      selected: activeHours,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, customDue, activeHours, created],
  );

  return (
    <>
      {milestone && (
        <MilestoneCelebration milestone={milestone} onDismiss={() => setMilestone(null)} />
      )}
      {showTicket && created && (
        <ClaimTicket
          store={store}
          record={{ ...created, amountPaid: createdPayment?.applied ?? 0 }}
          onClose={() => setShowTicket(false)}
        />
      )}
      <button
        data-guide="record-job"
        onClick={openIntake}
        className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-2 active:scale-[.99] transition-transform"
      >
        <Plus className="w-4 h-4" strokeWidth={3} /> Record a walk-in bundle
      </button>

      {open && <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center" onClick={close}>
        <div className="w-full sm:max-w-lg max-h-[94vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-background border border-border overflow-hidden" onClick={event => event.stopPropagation()}>
          {created ? <>
            <div className="shrink-0 flex justify-between items-start gap-3 border-b border-border p-4 pb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-xs font-bold uppercase ${practice ? 'text-primary' : 'text-success'}`}>
                    {practice ? 'Practice run' : 'Order created'}
                  </p>
                  {practice ? null : created.syncStatus === 'synced' ? (
                    <span className="px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[10px] font-black">Synced</span>
                  ) : (
                    <span className="px-2 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] font-black">Not synced</span>
                  )}
                </div>
                <h3 className="font-display font-black text-lg mt-0.5">{practice ? 'Receipt / Tag Code' : 'Record created'}</h3>
              </div>
              <button onClick={close} className="p-2 rounded-xl bg-surface-2"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {practice && (
              <div className="rounded-2xl border border-primary/40 bg-primary/5 p-3.5 text-left">
                <p className="font-display font-black text-sm">Nothing was saved</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  This was practice, so no job, no customer and no money were recorded. Your prices and services are real and stay.
                </p>
                <button
                  onClick={() => { setCreated(null); showToast('Fill it in again and it will be recorded', 'info'); }}
                  className="mt-2.5 h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black"
                >
                  Record it for real
                </button>
              </div>
            )}

            <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 text-center">
              {qrDataUrl && <img src={qrDataUrl} alt={`Laundry ${created.tagCode} QR code`} className="w-28 h-28 mx-auto rounded-xl bg-white p-2" />}
              <p className="font-mono font-black text-4xl tracking-[0.18em] mt-3">{created.tagCode}</p>
              <p className="text-[11px] text-muted-foreground mt-2">
                {practice ? 'This is where the real tag code appears.' : 'Write this on every tag in the bundle.'}
              </p>
              <button onClick={copyTag} className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 text-primary text-xs font-bold"><ClipboardCopy className="w-3.5 h-3.5" /> Copy code</button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-left">
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Customer</p><p className="text-sm font-bold mt-1 truncate">{created.customerName}</p><p className="text-[11px] text-muted-foreground mt-0.5 truncate">{created.customerPhone}</p></div>
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Service</p><p className="text-sm font-bold mt-1 truncate">{created.serviceName}</p></div>
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Pieces</p><p className="text-sm font-bold mt-1">{created.pieceCount}</p></div>
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Total</p><p className="text-sm font-bold mt-1">₦{created.total.toLocaleString()}</p></div>
            </div>

            {!practice && createdPayment && (
              <div className="rounded-xl border border-border bg-card p-3 text-left text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Customer gave</span>
                  <span className="font-black">₦{createdPayment.tendered.toLocaleString()}</span>
                </div>
                {createdPayment.change > 0 ? (
                  <div className="flex items-center justify-between gap-3 text-emerald-500">
                    <span className="font-bold">Change</span>
                    <span className="font-black">₦{createdPayment.change.toLocaleString()}</span>
                  </div>
                ) : createdPayment.balance > 0 ? (
                  <div className="flex items-center justify-between gap-3 text-amber-500">
                    <span className="font-bold">Balance owing</span>
                    <span className="font-black">₦{createdPayment.balance.toLocaleString()}</span>
                  </div>
                ) : created.total > 0 ? (
                  <p className="font-bold text-emerald-500">Paid in full.</p>
                ) : null}
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-3 text-left text-xs">
              {created.customerAddress && <p><b>Address:</b> {created.customerAddress}</p>}
              {created.promisedFor && <p className="mt-1"><b>Promised:</b> {new Date(created.promisedFor).toLocaleString()}</p>}
              <p className="mt-1"><b>Methods:</b> {created.washMethodName || 'Hand wash'} · {created.dryMethodName || 'Sun dry'}</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 text-left">
              <p className="text-[10px] uppercase font-black text-muted-foreground">Items</p>
              <p className="text-xs font-bold mt-1">{created.garmentSummary}</p>
            </div>

            {!practice && created.syncStatus !== 'synced' && <p className="text-[11px] text-primary text-center font-semibold">Saved on this phone. It will upload when you are back online.</p>}
            </div>

            <div className="shrink-0 border-t border-border p-4 flex gap-2">
              {practice ? (
                <button onClick={close} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Done</button>
              ) : (
                <div className="w-full space-y-2">
                  <button
                    onClick={created.customerPhone ? sendWhatsApp : () => setAskingNumber(true)}
                    className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-display font-black text-sm flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {created.customerPhone ? `WhatsApp ${created.customerName.split(' ')[0]}` : `Add ${created.customerName.split(' ')[0]}'s number`}
                  </button>

                  {askingNumber && !created.customerPhone && (
                    <div className="rounded-xl border border-emerald-600/40 bg-emerald-600/5 p-3 space-y-2">
                      <p className="text-[11px] text-muted-foreground">{created.customerName} gave no number. Add one and the message goes now.</p>
                      <div className="relative">
                        <input value={lateNumber} onChange={event => setLateNumber(event.target.value)} placeholder="e.g. 08012345678" inputMode="tel" autoFocus className="w-full h-11 pl-3 pr-11 rounded-xl bg-surface-2 border border-border text-sm" />
                        <ContactPickButton onPick={phone => setLateNumber(phone)} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveNumberAndSend} disabled={!validPhone(lateNumber)} className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-xs font-display font-black disabled:opacity-40">Save and send</button>
                        <button onClick={() => { setAskingNumber(false); sendWhatsAppToAnyone(); }} className="h-10 px-3 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold">Send to someone else</button>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => setShowTicket(true)} className="flex-1 py-3 rounded-xl bg-surface-2 border border-border font-display font-black text-sm flex items-center justify-center gap-2"><Ticket className="w-4 h-4" /> Show customer</button>
                    <button onClick={close} className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Done</button>
                  </div>

                  {Boolean(created.customerPhone) && (
                    <button onClick={sendWhatsAppToAnyone} className="w-full py-2 text-[11px] font-display font-bold text-muted-foreground">Send to someone else instead</button>
                  )}
                </div>
              )}
            </div>
          </> : <>
            <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border p-4 pb-3">
              <div>
                <p className="text-[10px] uppercase text-primary font-black">Physical store</p>
                <h3 className="font-display font-black text-lg mt-0.5">Record Laundry</h3>
              </div>
              <button onClick={close} className="p-2 rounded-xl bg-surface-2 shrink-0"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {practice && (
              <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-3.5 text-left">
                <p className="font-display font-black text-sm text-amber-500">Practice run — nothing will be saved</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">The guide is showing you how this works. Fill it in and press save to see what happens; no job, no customer and no money will be recorded.</p>
                <button onClick={() => setRehearsing(false)} className="mt-2.5 h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black">This is a real customer — record it</button>
              </div>
            )}
            <section className="space-y-2 text-left">
              <p className="text-[11px] uppercase font-black text-muted-foreground">1. Customer</p>
              <div className="relative">
              <input value={customerName} onChange={event => { setCustomerName(event.target.value); setSelectedCustomerId(''); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} placeholder="Customer name *" className="w-full h-11 px-3 rounded-xl bg-surface-2 border border-border text-sm" />
              <CustomerSuggestions customers={directory} query={customerName} enabled={showSuggestions && !selectedCustomerId} inline onPick={customer => selectCustomer(customer.id)} />
              </div>
              <div className="relative">
                <input value={customerPhone} onChange={event => { setCustomerPhone(event.target.value); setSelectedCustomerId(''); }} placeholder="Phone number — e.g. 08012345678" inputMode="tel" className="w-full h-11 pl-3 pr-11 rounded-xl bg-surface-2 border border-border text-sm" />
                <ContactPickButton onPick={(phone, name) => {
                  setCustomerPhone(phone);
                  setSelectedCustomerId('');
                  if (name && !customerName.trim()) setCustomerName(name);
                }} />
              </div>
              {!customerPhone.trim() && <p className="text-[10px] text-muted-foreground">No phone is fine — you just will not be able to WhatsApp this customer when the clothes are ready.</p>}
            </section>

            <section className="space-y-2 text-left">
              <p className="text-[11px] uppercase font-black text-muted-foreground">2. Service</p>
              {services.length === 0 ? <div className="p-3 rounded-xl border border-primary/25 bg-primary/5 text-xs text-muted-foreground">No services yet. Add them in Price List first.</div> : <div className="grid grid-cols-2 gap-2">{services.map(service => { const active = String(service.id) === String(selectedService?.id); const servicePricing = getStoredServicePricing(service); return <button key={service.id} type="button" onClick={() => { setSelectedServiceId(String(service.id)); setPriceTouched(false); }} className={`px-3 py-2.5 rounded-xl border text-left ${active ? 'border-primary bg-primary/10' : 'border-border bg-surface-2'}`}><p className="text-xs font-black truncate">{service.name}</p><p className="text-[10px] text-muted-foreground mt-0.5 truncate">{servicePricing === 'per_piece' ? 'By clothing item' : `₦${Number(service.sellingPrice || 0).toLocaleString()} ${getServicePricingLabel(servicePricing).unitLabel}`}</p></button>; })}</div>}
            </section>

            <section className="space-y-2 text-left">
              <div className="flex items-baseline justify-between gap-3"><p className="text-[11px] uppercase font-black text-muted-foreground">3. Clothes</p><span className="text-xs font-black text-primary">{pieceCount} {pieceCount === 1 ? 'piece' : 'pieces'}</span></div>
              {displayGarments.length > 6 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input value={garmentSearch} onChange={event => setGarmentSearch(event.target.value)} placeholder="Search clothing type" className="w-full h-10 pl-9 pr-9 rounded-xl bg-surface-2 border border-border text-sm outline-none focus:border-primary" />
                  {garmentSearch && <button type="button" onClick={() => setGarmentSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
                </div>
              )}
              {shownGarments.length === 0 && <p className="text-[11px] text-muted-foreground py-1">Nothing matches “{garmentSearch}”. Add it below.</p>}
              <div className="grid grid-cols-2 gap-1.5">{shownGarments.map(garment => {
                const quantity = garmentCounts[garment] || 0;
                const unitPrice = selectedService && pricing === 'per_piece' ? getLaundryGarmentPrice(store, selectedService, garment) : 0;
                return (
                  <div key={garment} className={`rounded-xl border px-2 pt-1.5 pb-1.5 ${quantity > 0 ? 'border-primary bg-primary/5' : 'border-border bg-surface-2'}`}>
                    <div className="flex items-baseline justify-between gap-1.5 leading-tight"><p className="text-xs font-bold truncate">{garment}</p>{selectedService && pricing === 'per_piece' && <span className="text-[10px] text-primary font-bold shrink-0">₦{unitPrice.toLocaleString()}</span>}</div>
                    <div className="flex items-center justify-between gap-1 mt-1.5">
                      <button type="button" onClick={() => changeCount(garment, -1)} disabled={quantity === 0} className="w-8 h-8 shrink-0 rounded-lg border border-border bg-card flex items-center justify-center disabled:opacity-30" aria-label={`Remove one ${garment}`}><Minus className="w-3.5 h-3.5" /></button>
                      <span className="text-sm font-black tabular-nums">{quantity}</span>
                      <button type="button" onClick={() => changeCount(garment, 1)} className="w-8 h-8 shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center" aria-label={`Add one ${garment}`}><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                    {quantity > 0 && <button type="button" onClick={() => setModifyingGarment(modifyingGarment === garment ? null : garment)} className="w-full mt-1.5 text-left text-[10px] font-bold truncate text-primary">{garmentModifiers[garment]?.length ? describeModifiers(garmentModifiers[garment]) : '+ how to treat it'}</button>}
                  </div>
                );
              })}</div>

              {modifyingGarment && (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2"><p className="text-xs font-display font-black">{modifyingGarment}</p><button type="button" onClick={() => setModifyingGarment(null)} className="text-[10px] font-black text-muted-foreground">Done</button></div>
                  <div className="flex flex-wrap gap-1.5">
                    {LAUNDRY_MODIFIERS.map(modifier => {
                      const on = garmentModifiers[modifyingGarment]?.includes(modifier);
                      return <button key={modifier} type="button" onClick={() => setGarmentModifiers(current => ({ ...current, [modifyingGarment]: toggleModifier(current[modifyingGarment], modifier) }))} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-display font-bold border transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>{modifier}</button>;
                    })}
                  </div>
                </div>
              )}
              <div className="flex gap-2"><input value={customGarment} onChange={event => setCustomGarment(event.target.value)} onKeyDown={event => event.key === 'Enter' && addCustomGarment()} placeholder="Other clothing type" className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-surface-2 border border-border text-sm" /><button onClick={addCustomGarment} type="button" className="px-4 h-11 rounded-xl border border-primary text-primary font-black text-xs shrink-0">Add</button></div>
              {similarGarment && (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2">
                  <p className="text-xs text-foreground leading-snug">You already have <b>{similarGarment.existing}</b>. Is “{similarGarment.typed}” the same thing?</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => countGarment(similarGarment.existing)} className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black">Yes, count as {similarGarment.existing}</button>
                    <button type="button" onClick={() => countGarment(similarGarment.typed)} className="h-9 px-3 rounded-xl bg-surface-2 border border-border text-xs font-display font-black">No, keep “{similarGarment.typed}”</button>
                  </div>
                </div>
              )}
            </section>

            {isCountedUnit(pricing) && <section className="text-left space-y-1"><label className="text-[10px] uppercase font-black text-muted-foreground">Quantity {pricingLabel.unitLabel}</label><input value={billingQuantity} onChange={event => { setBillingQuantity(event.target.value.replace(/[^0-9.]/g, '')); setPriceTouched(false); }} inputMode="decimal" className="w-full h-11 px-3 rounded-xl bg-surface-2 border border-border text-sm" /></section>}

            <section className="space-y-2 text-left">
              <p className="text-[11px] uppercase font-black text-muted-foreground">4. Where it goes</p>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3"><MapPin className="h-4 w-4 text-primary shrink-0" /><input value={shelfLocation} onChange={event => setShelfLocation(event.target.value)} placeholder="Shelf or rack - e.g. Rack B, 3rd shelf" className="w-full bg-transparent py-3 text-sm outline-none" /></div>
              <BundlePhotos clientRef={draftRef} accessCode={String((store as any).accessCode || '')} />
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-2 p-1">
                {(Object.keys(FULFILLMENT_LABELS) as LaundryFulfillment[]).map(option => <button key={option} type="button" onClick={() => setFulfillment(option)} className={`rounded-lg py-2 text-[11px] font-display font-black transition-colors ${fulfillment === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{FULFILLMENT_LABELS[option]}</button>)}
              </div>
              {fulfillment !== 'walk_in' && (
                <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
                  <input value={runAddress} onChange={event => setRunAddress(event.target.value)} placeholder="Address" className="w-full h-10 px-3 rounded-lg bg-card border border-border text-sm" />
                  <input value={runLandmark} onChange={event => setRunLandmark(event.target.value)} placeholder="Landmark — e.g. opposite the filling station" className="w-full h-10 px-3 rounded-lg bg-card border border-border text-sm" />
                  <div className="flex items-center gap-2"><span className="text-[11px] font-display font-bold text-muted-foreground shrink-0">{fulfillment === 'pickup' ? 'Collection fee' : 'Delivery fee'}</span><input value={deliveryFee} onChange={event => setDeliveryFee(event.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" className="flex-1 h-10 px-3 rounded-lg bg-card border border-border text-sm" /></div>
                  <p className="text-[10px] text-muted-foreground leading-snug">Added to what this customer owes, so it reaches the takings.</p>
                </div>
              )}
            </section>

            <section className="space-y-2 text-left">
              <p className="text-[11px] uppercase font-black text-muted-foreground">5. Due &amp; price</p>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-0.5 px-0.5 py-0.5">
                {dueChips.map(chip => {
                  const active = activeHours === chip.hours;
                  return <button key={chip.label} type="button" onClick={() => { setPromisedFor(promisedInHours(chip.hours)); setPromisedTouched(true); }} aria-pressed={active} className={`h-9 shrink-0 px-3 rounded-full border text-xs font-display font-bold transition active:scale-95 ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-muted-foreground border-border hover:text-foreground'}`}>{chip.label}</button>;
                })}
                <button type="button" onClick={() => setPickingCustom(current => !current)} aria-expanded={pickingCustom} className={`h-9 shrink-0 px-3 rounded-full border text-xs font-display font-bold transition active:scale-95 ${pickingCustom || activeHours === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-muted-foreground border-border hover:text-foreground'}`}>Custom</button>
              </div>

              {pickingCustom && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3">
                  <CalendarClock className="h-4 w-4 text-primary shrink-0" />
                  <input type="datetime-local" value={promisedFor} onChange={event => {
                    setPromisedFor(event.target.value);
                    setPromisedTouched(true);
                    const hours = (new Date(event.target.value).getTime() - Date.now()) / 3_600_000;
                    if (Number.isFinite(hours) && hours > 0) {
                      rememberCustomDue(hours);
                      setCustomDue(Math.round(hours));
                    }
                  }} className="w-full bg-transparent py-3 text-sm outline-none" />
                </div>
              )}

              {promisedFor && <p className="text-[11px] text-muted-foreground">Ready {new Date(promisedFor).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}</p>}
              {pricing === 'per_piece' && calculated.lines.length > 0 && <div className="rounded-xl border border-border bg-card divide-y divide-border/60">{calculated.lines.map(line => <div key={line.garmentType} className="flex justify-between gap-3 px-3 py-1.5 text-xs"><span className="truncate">{line.quantity} × {line.garmentType} @ ₦{line.unitPrice.toLocaleString()}</span><span className="font-black shrink-0">₦{line.subtotal.toLocaleString()}</span></div>)}</div>}
              <div className="flex items-center gap-2 h-11 px-3 rounded-xl bg-surface-2 border border-border"><span className="font-black">₦</span><input value={totalPrice} onChange={event => { setTotalPrice(event.target.value.replace(/[^0-9.]/g, '')); setPriceTouched(true); }} inputMode="decimal" className="w-full bg-transparent outline-none font-black" placeholder="Total price" /></div>
              {priceTouched && calculated.total !== Number(totalPrice) && <p className="text-[10px] text-muted-foreground">Manually adjusted. Calculated price is ₦{calculated.total.toLocaleString()}.</p>}
              <div className="flex items-center gap-2 h-11 px-3 rounded-xl bg-surface-2 border border-border"><span className="font-black">₦</span><input inputMode="numeric" value={paidNow} onChange={event => { setPaidTouched(true); setPaidNow(event.target.value.replace(/[^0-9]/g, '')); }} placeholder="Paid now (0 if paying later)" className="flex-1 bg-transparent outline-none text-sm" /></div>
              {(() => {
                const fee = fulfillment === 'walk_in' ? 0 : Math.max(0, Number(deliveryFee) || 0);
                const price = totalWithDelivery(Number(totalPrice) || 0, fee);
                const payment = settleLaundryPayment(price, Number(paidNow) || 0);
                if (deposit > 0 && payment.applied < deposit) return <p className="text-[10px] text-destructive font-bold">This shop asks for ₦{deposit.toLocaleString()} before clothes are left.</p>;
                if (payment.change > 0) return <p className="text-[10px] text-emerald-500 font-bold">Customer gave ₦{payment.tendered.toLocaleString()} — give ₦{payment.change.toLocaleString()} change.</p>;
                if (payment.balance > 0) return <p className="text-[10px] text-amber-500 font-bold">₦{payment.balance.toLocaleString()} owing — it will show in Money Owed.</p>;
                if (price > 0) return <p className="text-[10px] text-emerald-500 font-bold">Paid in full.</p>;
                return null;
              })()}
            </section>

            <section className="text-left border-t border-border/60 pt-1">
              <button type="button" onClick={() => setShowMore(current => !current)} className="w-full flex items-center justify-between gap-3 py-2"><span className="text-[11px] uppercase font-black text-muted-foreground">Address & notes</span>{showMore ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}</button>
              {showMore && <div className="space-y-2 pt-1">
                <textarea value={customerAddress} onChange={event => setCustomerAddress(event.target.value)} placeholder="Pickup or delivery address" rows={2} className="w-full resize-none p-3 rounded-xl bg-surface-2 border border-border text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[10px] uppercase font-black text-muted-foreground">Washing</label><select value={washMethodId} onChange={event => setWashMethodId(event.target.value)} className="mt-1 w-full h-11 rounded-xl border border-border bg-surface-2 px-3 text-sm">{washOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                  <div><label className="text-[10px] uppercase font-black text-muted-foreground">Drying</label><select value={dryMethodId} onChange={event => setDryMethodId(event.target.value)} className="mt-1 w-full h-11 rounded-xl border border-border bg-surface-2 px-3 text-sm">{dryOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                </div>
                {equipment.length === 0 && <p className="text-[10px] text-muted-foreground">Add machines in Records to pick one here.</p>}
                <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Stains, damage, special instructions..." rows={2} className="w-full resize-none p-3 rounded-xl bg-surface-2 border border-border text-sm" />
              </div>}
            </section>
            </div>

            <div className="shrink-0 border-t border-border p-4 flex items-center gap-3">
              <div className="min-w-0"><p className="text-[10px] uppercase font-black text-muted-foreground">{pieceCount} {pieceCount === 1 ? 'piece' : 'pieces'}</p><p className="font-display font-black text-lg leading-tight">₦{(Number(totalPrice) || 0).toLocaleString()}</p></div>
              <button disabled={!canSave || saving} onClick={saveIntake} className={`flex-1 py-3.5 rounded-xl font-display font-black text-sm disabled:opacity-40 ${practice ? 'bg-amber-500 text-black' : 'bg-primary text-primary-foreground'}`}>{saving ? 'Saving…' : saveLabel}</button>
            </div>
          </>}
        </div>
      </div>}
    </>
  );
}
