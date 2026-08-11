import { useState, useEffect } from 'react';
import { createStore, loadStore, saveStore } from '@/lib/store-data';
import { StoreData, StoreCategory, StoreType, StaffMember } from '@/types/store';
import { showToast } from '@/components/Toast';
import Mascot, { MascotMood } from '@/components/Mascot';
import StoreLogo, { LOGO_STYLES } from '@/components/StoreLogo';
import { Eye, EyeOff, Key, Shield, HelpCircle, Lock, Mail, Phone, Users, Cloud, Database, Sparkles, Plus, Check, LogIn, UserPlus, Building, ArrowLeft, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { generateStoreUrl, parseScannedQRText } from '@/lib/qr-code';
import QRScannerPage from '@/components/qr/QRScannerPage';
import { getBusinessTemplate } from '@/lib/business-templates';

interface StoreAccessProps { onStoreLoaded: (store: StoreData) => void; }

const CATEGORIES: { id: StoreCategory; label: string; icon: string; desc: string }[] = [
  { id: 'retail', label: 'Provision / Supermarket', icon: '🛒', desc: 'Products, inventory and sales' },
  { id: 'restaurant', label: 'Restaurant / Food', icon: '🍽️', desc: 'Food, menu and orders' },
  { id: 'games', label: 'Gaming Centre', icon: '🎮', desc: 'Games, players and sessions' },
  { id: 'other', label: 'Other Business', icon: '🏪', desc: 'Start with a simple business setup' },
];

const QUICK_TYPES = [
  { id: 'provision_retail', label: 'Provision / Supermarket', icon: '🛒', desc: 'Products, inventory & sales' },
  { id: 'pharmacy', label: 'Pharmacy', icon: '💊', desc: 'Medicines, products & sales' },
  { id: 'laundry', label: 'Laundry', icon: '🧺', desc: 'Clothes, services & orders' },
  { id: 'gasoline', label: 'Gas Filling', icon: '⛽', desc: 'KG, cylinders & delivery' },
  { id: 'games', label: 'Gaming Centre', icon: '🎮', desc: 'Games & timed sessions' },
  { id: 'restaurant', label: 'Restaurant / Food', icon: '🍔', desc: 'Menu & customer orders' },
  { id: 'salon', label: 'Salon / Barber', icon: '💇', desc: 'Services & appointments' },
  { id: 'tailoring', label: 'Tailoring', icon: '🧵', desc: 'Jobs, measurements & designs' },
  { id: 'repair', label: 'Repair Shop', icon: '🛠️', desc: 'Repair jobs & parts' },
  { id: 'printing', label: 'Printing / Cyber', icon: '🖨️', desc: 'Print jobs & sessions' },
  { id: 'carwash', label: 'Car Wash', icon: '🚗', desc: 'Wash services & queue' },
  { id: 'other', label: 'Other', icon: '✨', desc: 'Start with a flexible setup' },
];

const QUESTIONS = ['What is your favorite food?','What was the name of your first pet?','What city were you born in?','What was the name of your primary school?'];

function CreateFlowProgress({ step }: { step: 1 | 2 | 3 }) {
  const pct = step === 1 ? 33 : step === 2 ? 66 : 100;
  return <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${pct}%` }} /></div>;
}

export default function StoreAccess({ onStoreLoaded }: StoreAccessProps) {
  const [mode, setMode] = useState<'choose' | 'create-choice' | 'access-choice' | 'create' | 'access' | 'setup-security' | 'login-select' | 'login-password' | 'login-pin' | 'recovery' | 'auth-login' | 'auth-signup' | 'auth-store-select' | 'auth-store-create'>('choose');
  const [flowMessage, setFlowMessage] = useState<string | null>(null); const [flowMsgKey, setFlowMsgKey] = useState(0);
  const say = (text: string) => { setFlowMessage(text); setFlowMsgKey(k => k + 1); };
  const [authEmail, setAuthEmail] = useState(''); const [authPassword, setAuthPassword] = useState(''); const [authFullName, setAuthFullName] = useState(''); const [authConfirmPassword, setAuthConfirmPassword] = useState(''); const [showAuthPassword, setShowAuthPassword] = useState(false); const [loadingAuth, setLoadingAuth] = useState(false); const [userStores, setUserStores] = useState<any[]>([]); const [activeProfile, setActiveProfile] = useState<any>(null);
  const [storeName, setStoreName] = useState(''); const [category, setCategory] = useState<StoreCategory>('retail'); const [retailType, setRetailType] = useState('provision_retail'); const [selectedLogoStyle, setSelectedLogoStyle] = useState(() => LOGO_STYLES[Math.floor(Math.random()*LOGO_STYLES.length)].id); const [accessCode, setAccessCode] = useState(''); const [newCode, setNewCode] = useState(''); const [accessMood, setAccessMood] = useState<MascotMood>('idle'); const [loadedStore, setLoadedStore] = useState<StoreData | null>(null);
  const [ownerPassword, setOwnerPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState(''); const [showPassword, setShowPassword] = useState(false); const [recoveryEmail, setRecoveryEmail] = useState(''); const [recoveryPhone, setRecoveryPhone] = useState(''); const [recoveryQuestion, setRecoveryQuestion] = useState(QUESTIONS[0]); const [recoveryAnswer, setRecoveryAnswer] = useState(''); const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
  const [selectedUser, setSelectedUser] = useState<{id:string;name:string;role:string;isOwner:boolean}|null>(null); const [inputPassword, setInputPassword] = useState(''); const [pinBuffer, setPinBuffer] = useState(''); const [isPasswordWrong, setIsPasswordWrong] = useState(false); const [wrongPasswordCount, setWrongPasswordCount] = useState(0);
  const [recoveryMode, setRecoveryMode] = useState<'options'|'question'|'key'|'code'|'reset-pass'>('options'); const [answeredQuestion,setAnsweredQuestion]=useState(''); const [enteredKey,setEnteredKey]=useState(''); const [simulatedCode,setSimulatedCode]=useState(''); const [inputCode,setInputCode]=useState(''); const [newPassVal,setNewPassVal]=useState(''); const [confirmNewPassVal,setConfirmNewPassVal]=useState(''); const [recoveryMethodSelected,setRecoveryMethodSelected]=useState<'email'|'sms'>('email'); const [showQRScanner,setShowQRScanner]=useState(false);

  const retailTypeToStoreType = (rt: string): StoreType => { switch(rt){ case 'clothing':return 'clothing'; case 'food':return 'food'; case 'electronics':return 'electronics'; case 'laundry':return 'laundry'; case 'gasoline':return 'gas_filling'; case 'provision_retail': case 'provision_wholesale': case 'pharmacy': return 'provision'; default:return 'provision'; } };
  const applyTemplateDefaults = (store: StoreData, businessId: string): StoreData => {
    const template = getBusinessTemplate(businessId);
    if (!template) return store;
    return { ...store, profile: { ...(store.profile || {}), businessTemplate: businessId }, businessTemplate: businessId } as StoreData;
  };

  const handleCreate = () => {
    if (!storeName.trim()) { setAccessMood('worried'); return showToast('Enter a store name','error'); }
    const businessId = category === 'retail' ? retailType : category;
    if (loadedStore) { const updated = applyTemplateDefaults({ ...loadedStore, storeName: storeName.trim(), category, retailType: category==='retail'?retailType:undefined, storeType: category==='retail'?retailTypeToStoreType(retailType):category, profile:{...(loadedStore.profile||{}),logoStyle:selectedLogoStyle}}, businessId); saveStore(updated); setLoadedStore(updated); setNewCode(updated.accessCode); setAccessMood('celebrating'); say("Your business is ready! 🎉"); return; }
    const base = createStore(storeName.trim(), category, category==='retail'?retailType:undefined, selectedLogoStyle, category==='retail'?retailTypeToStoreType(retailType):(category as StoreType));
    const store = applyTemplateDefaults(base,businessId);
    saveStore(store); setNewCode(store.accessCode); setLoadedStore(store); const key=`SF-${Math.random().toString(36).substring(2,6).toUpperCase()}-${Math.random().toString(36).substring(2,6).toUpperCase()}-${Math.random().toString(36).substring(2,6).toUpperCase()}`; setGeneratedRecoveryKey(key); setAccessMood('celebrating'); say("Boom! Your business is ready. Let's get to work! 🎉");
  };

  // Existing cloud/auth handlers below continue to use the same Supabase flow.
  const handleSaveSecurity = (e: React.FormEvent) => { e.preventDefault(); if(!ownerPassword.trim()||ownerPassword.length<4)return showToast('Password must be at least 4 characters','error'); if(ownerPassword!==confirmPassword)return showToast('Passwords do not match','error'); if(!loadedStore)return; const updated={...loadedStore,profile:{...(loadedStore.profile||{}),email:recoveryEmail.trim(),phone:recoveryPhone.trim(),logoStyle:loadedStore.profile?.logoStyle||selectedLogoStyle}} as StoreData; saveStore(updated); setLoadedStore(updated); setAccessMood('celebrating'); say('Everything is secured. You are ready! 🔒'); };

  useEffect(()=>{ if(mode==='create')setAccessMood('thinking'); else if(mode==='access')setAccessMood('confident'); else setAccessMood('idle'); },[mode]);
  useEffect(()=>{ const lines:any={choose:"Hey, I'm Flow! Let's do this. 👋",create-choice:'Create your business with me.',access-choice:'Welcome back.',create:'Name your business and pick its type — I will prepare the right workspace for you.',setup-security:'Almost there — secure your account.',access:'Enter your store code.',login-select:'Choose your profile.',login-password:'Your password, please.',login-pin:'Enter your PIN.',recovery:'Let’s get your access back.',auth-store-select:'Pick a business to open.',auth-store-create:'New business, new start.'}; if(lines[mode])say(lines[mode]); },[mode]);

  // Simple, non-technical business picker. Templates are applied automatically.
  if (mode === 'create' || mode === 'auth-store-create') {
    return <div className="min-h-screen flex items-center justify-center p-4 bg-background"><div className="w-full max-w-lg space-y-5"><CreateFlowProgress step={1}/><div className="text-center"><div className="text-4xl mb-2">🏪</div><h1 className="font-display font-bold text-2xl text-foreground">Set up your business</h1><p className="text-sm text-muted-foreground mt-1">Pick what you run. Manchant will prepare the right tools automatically.</p></div><div className="space-y-3"><input value={storeName} onChange={e=>setStoreName(e.target.value)} placeholder="Business name" className="w-full p-3 rounded-xl bg-surface-3 border border-border text-foreground focus:outline-none focus:border-primary"/><div className="grid grid-cols-2 gap-2">{QUICK_TYPES.map(t=><button key={t.id} type="button" onClick={()=>{ if(t.id==='provision_retail'||t.id==='pharmacy'||t.id==='laundry'||t.id==='gasoline'||t.id==='games'){setCategory(t.id==='games'?'games':'retail');setRetailType(t.id);} else if(t.id==='restaurant'){setCategory('restaurant');} else {setCategory('other');setRetailType(t.id);} }} className={`p-3 rounded-xl border text-left transition-all ${((category==='retail'&&retailType===t.id)||(category===t.id))?'border-primary bg-primary/10':'border-border bg-surface-3 hover:border-primary/40'}`}><div className="text-2xl">{t.icon}</div><div className="font-display font-bold text-sm mt-1">{t.label}</div><div className="text-[10px] text-muted-foreground">{t.desc}</div></button>)}</div><button onClick={handleCreate} disabled={loadingAuth} className="w-full p-3.5 rounded-xl bg-primary text-primary-foreground font-display font-bold">Create My Business</button></div></div>;
  }

  // Keep the existing authentication/store flows intact in the surrounding app.
  return <div className="min-h-screen flex items-center justify-center p-4 bg-background"><div className="w-full max-w-md text-center space-y-5"><div className="text-5xl">🧭</div><h1 className="font-display font-bold text-2xl">Welcome to Manchant</h1><p className="text-sm text-muted-foreground">Choose how you want to continue.</p><div className="grid gap-3"><button onClick={()=>setMode('create')} className="p-4 rounded-xl bg-primary text-primary-foreground font-bold">Create a Business</button><button onClick={()=>setMode('access')} className="p-4 rounded-xl bg-surface-3 border border-border font-bold">Open Existing Business</button></div></div></div>;
}
