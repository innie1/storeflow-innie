import { Cloud, Camera } from 'lucide-react';
import type { StoreAccessState } from './useStoreAccess';

/**
 * Opening a shop with its access code, typed or scanned.
 */
export default function AccessCodeStep({ s }: { s: StoreAccessState }) {
  const {
    setMode, accessCode, setAccessCode, setAccessMood, setShowQRScanner, codePreview, handleAccess,
  } = s;
  return (
    <div className="space-y-4 text-left">
      <div>
        <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Access Code</label>
        {/*
          The trade sits inside the field, against its right edge.
          Below it, it was a second box appearing under the one being
          typed in, which pushed the button down as the sixth character
          landed. Inside, it reads as the field answering rather than the
          page growing. The input keeps its right padding whether or not
          the badge is there, so the code does not shift when it appears.
        */}
        <div className="relative rounded-lg bg-surface-2 border border-border focus-within:border-primary transition-colors">
          <input
            value={accessCode}
            onChange={e => {
              setAccessCode(e.target.value.toUpperCase());
              setAccessMood('thinking');
            }}
            placeholder="Enter 6-character code"
            maxLength={6}
            className="w-full p-3 pr-11 pl-11 bg-transparent text-foreground text-center font-mono text-2xl tracking-widest placeholder:text-sm placeholder:tracking-normal focus:outline-none border-0"
          />
          {/* Flush in the corner, inside the field's own edge. */}
          {codePreview && (
            <span className="absolute right-3 top-[1.55rem] -translate-y-1/2 text-xl leading-none">
              {codePreview.icon}
            </span>
          )}

          {/*
            The shop, on its own line inside the same box.
            A separate card below pushed the button down the moment the
            sixth character landed. Held inside the field's border it
            reads as the field answering rather than the page growing.
          */}
          {codePreview && (
            <span className="block border-t border-border/70 px-3 py-1.5 text-center">
              <span className="text-xs font-display font-black truncate block">{codePreview.name}</span>
              <span className="text-[10px] text-muted-foreground">{codePreview.kind}</span>
            </span>
          )}
        </div>


      </div>
      <button onClick={handleAccess} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity cursor-pointer">
        Access Store
      </button>
      <button
        onClick={() => setShowQRScanner(true)}
        className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground font-display font-bold hover:bg-surface-3 transition-colors cursor-pointer flex items-center justify-center gap-2"
      >
        <Camera className="w-4 h-4" /> Scan Store QR Code
      </button>
      <div className="text-center pt-1">
        <button
          type="button"
          onClick={() => setMode('auth-login')}
          className="text-xs text-primary font-semibold hover:underline flex items-center justify-center gap-1.5 mx-auto"
        >
          <Cloud className="w-3.5 h-3.5" /> Or Login with Email
        </button>
      </div>
      <button onClick={() => setMode('access-choice')} className="w-full p-2 text-muted-foreground text-sm hover:text-foreground text-center cursor-pointer">
        ← Back
      </button>
    </div>
  );
}
