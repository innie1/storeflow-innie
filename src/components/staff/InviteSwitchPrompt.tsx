import { UserPlus } from 'lucide-react';
import ScrollLock from '@/components/ScrollLock';

/**
 * A staff invite opened on a phone that is already in a shop.
 *
 * It used to be ignored: the phone just showed the shop it had open. Now it
 * asks. Joining closes what is open on this phone - for an owner's shop that
 * is only a sign-out, nothing on the phone is deleted; for a worker's phone it
 * means leaving the shop it works at - and opens Join a Store with the
 * invited Store ID filled in. The new shop's owner still approves the phone
 * and gives it a code.
 */

interface Props {
  invitedRef: string;
  /** The shop this phone has open or works at. */
  currentName: string;
  /** 'owner': a shop opened with its access code; 'worker': this phone works there. */
  kind: 'owner' | 'worker';
  onJoin: () => void;
  onStay: () => void;
}

export default function InviteSwitchPrompt({ invitedRef, currentName, kind, onJoin, onStay }: Props) {
  const name = currentName || 'this shop';
  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/85 backdrop-blur-sm" onClick={onStay}>
      <ScrollLock />
      <div
        role="dialog"
        aria-label="Join another shop?"
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-card border border-border p-5 space-y-3 text-left"
        onClick={event => event.stopPropagation()}
      >
        <div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
          <UserPlus className="w-5 h-5" />
        </div>
        <h3 className="font-display font-black text-lg leading-tight">You've been invited to work at another shop</h3>
        <p className="text-sm text-muted-foreground">
          Store ID <span className="font-mono font-semibold text-foreground">{invitedRef}</span>.
          {' '}
          {kind === 'owner'
            ? <>This phone has <span className="font-semibold text-foreground">{name}</span> open. To join, it signs out of {name} first. Nothing in {name} is deleted - open it again any time with Access Existing Store and your password or access code.</>
            : <>This phone works at <span className="font-semibold text-foreground">{name}</span>. Joining signs it out of {name}; to work there again, {name}'s owner would have to approve this phone again.</>}
        </p>
        <p className="text-xs text-muted-foreground">You'll enter your staff PIN next, and the new shop's owner approves your phone.</p>
        <button type="button" onClick={onJoin} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm">
          {kind === 'owner' ? `Sign out of ${name} and join` : `Leave ${name} and join`}
        </button>
        <button type="button" onClick={onStay} className="w-full h-11 rounded-xl bg-surface-2 border border-border font-display font-bold text-sm">
          Stay in {name}
        </button>
      </div>
    </div>
  );
}
