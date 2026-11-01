import type { StoreData } from '@/types/store';
import WorkerSignIn from '@/components/staff/WorkerSignIn';

/**
 * The worker's 24-hour pass ran out while the app was open.
 *
 * Nothing recorded on this phone can reach the shop until they enter their PIN,
 * so this stands in front of the screen rather than beside it - but over it,
 * not instead of it: what they were doing is still there when it goes.
 */

interface Props {
  onRenewed: (store: StoreData) => void;
  onSignOut: () => void;
  onShutOut: () => void;
}

export default function WorkerPassPrompt({ onRenewed, onSignOut, onShutOut }: Props) {
  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Enter your PIN">
      <div className="w-full max-w-sm text-left">
        <h2 className="font-display font-black text-xl">Enter your PIN to keep working</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Your sign-in lasts one day, and it has run out. Your work is safe on this phone and will go to the shop as soon as you enter your PIN.
        </p>
        <WorkerSignIn onSignedIn={onRenewed} onShutOut={onShutOut} />
        <button type="button" onClick={onSignOut} className="w-full text-sm text-muted-foreground hover:text-foreground">
          Sign out
        </button>
      </div>
    </div>
  );
}
