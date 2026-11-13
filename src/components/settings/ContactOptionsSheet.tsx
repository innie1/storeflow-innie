import { useState } from 'react';
import { showToast } from '@/components/Toast';

export interface ContactOptionsSheetProps {
  storeName: string;
  onClose: () => void;
}

export default function ContactOptionsSheet({ storeName, onClose }: ContactOptionsSheetProps) {
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
