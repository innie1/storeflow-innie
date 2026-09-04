import { useEffect, useRef, useState } from 'react';
import { Plus, Mic, MicOff, Send, X, FileText, Image as ImageIcon } from 'lucide-react';

export interface FlowAttachment {
  file: File;
  /** Object URL for images, so the chip can show a thumbnail. */
  previewUrl?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string, attachment: FlowAttachment | null) => void;
  placeholder: string;
  isListening: boolean;
  onToggleVoice: () => void;
  onOpenAttachments: () => void;
  attachmentsOpen: boolean;
  attachment: FlowAttachment | null;
  onClearAttachment: () => void;
  /** Rendered above the input — the attachment menu lives here. */
  children?: React.ReactNode;
}

const MAX_ROWS = 6;

/**
 * The Flow message composer.
 *
 * This replaces a single flex row in FlowChat where the send button was the
 * only child without `shrink-0`, so flexbox crushed it from its intended 44px
 * to 16px — the primary action, well under the 44px minimum touch target.
 *
 * It also grows to fit what is being typed. A shopkeeper reading a customer's
 * full order into Flow was doing it through a one-line input that scrolled the
 * beginning out of sight, with no way to add a line break.
 */
export default function FlowComposer({
  value,
  onChange,
  onSend,
  placeholder,
  isListening,
  onToggleVoice,
  onOpenAttachments,
  attachmentsOpen,
  attachment,
  onClearAttachment,
  children,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [rows, setRows] = useState(1);
  const [focused, setFocused] = useState(false);

  // Grow with the message, up to a ceiling, then scroll inside.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // A textarea set to height:auto sizes itself to its `rows` attribute, not
    // to its content, so measuring while `rows` still holds the previous value
    // latches the box open — it could grow but never shrink back. Measure at
    // one row, then restore, so scrollHeight reports what the text needs.
    const previous = el.rows;
    el.rows = 1;
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const needed = Math.min(MAX_ROWS, Math.max(1, Math.round((el.scrollHeight - padding) / lineHeight)));
    el.rows = previous;
    setRows(needed);
  }, [value]);

  const canSend = value.trim().length > 0 || attachment !== null;

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim(), attachment);
  };

  return (
    <div className="border-t border-border">
      {children}

      {/* What is attached, and a way to remove it before sending. Picking a
          file used to navigate straight out of the chat, discarding it. */}
      {attachment && (
        <div className="px-4 pt-3">
          <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-border bg-surface-2/50 py-1.5 pl-1.5 pr-2">
            {attachment.previewUrl ? (
              <img src={attachment.previewUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
            ) : (
              <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block text-[11px] font-bold truncate max-w-[180px]">{attachment.file.name}</span>
              <span className="block text-[10px] text-muted-foreground">
                {attachment.file.type.startsWith('image/') ? 'Image' : 'File'} · {Math.max(1, Math.round(attachment.file.size / 1024))} KB
              </span>
            </span>
            <button
              type="button"
              onClick={onClearAttachment}
              aria-label={`Remove ${attachment.file.name}`}
              className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/*
        One pill. The + sits inside on the left, and the right-hand control is
        the microphone until there is something to send, at which point it
        becomes Send — so there is only ever one action there.

        This replaces a row of three 44px circles either side of a separate
        input, which ate most of a 375px screen and left the send button
        crushed to 16px because it was the one child without shrink-0.
      */}
      <form
        className="relative px-3 py-2"
        onSubmit={e => { e.preventDefault(); submit(); }}
      >
        <div className={`flow-composer flex items-end gap-1 rounded-[22px] border bg-surface-2/40 px-1 py-1 transition-colors ${
          focused ? 'border-primary/50' : 'border-border'
        }`}>
          <button
            type="button"
            onClick={onOpenAttachments}
            aria-label="Add attachment"
            aria-expanded={attachmentsOpen}
            className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-colors ${
              attachmentsOpen ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-primary hover:bg-surface-2'
            }`}
          >
            <Plus className={`w-[18px] h-[18px] transition-transform ${attachmentsOpen ? 'rotate-45' : ''}`} />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={e => {
              // Enter sends; Shift+Enter adds a line. On a touch keyboard Enter
              // inserts a newline as usual, so long orders can still be typed.
              if (e.key === 'Enter' && !e.shiftKey && !/Mobi|Android/i.test(navigator.userAgent)) {
                e.preventDefault();
                submit();
              }
            }}
            rows={rows}
            placeholder={placeholder}
            aria-label="Message Flow"
            className="flex-1 min-w-0 resize-none bg-transparent border-0 px-1.5 py-2 text-sm leading-5 focus:outline-none placeholder:text-muted-foreground"
          />

          {/* Mic until there is something to send, then Send. */}
          {canSend ? (
            <button
              type="submit"
              aria-label="Send"
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors"
            >
              <Send className="w-[18px] h-[18px]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleVoice}
              aria-label={isListening ? 'Stop listening' : 'Speak to Flow'}
              title={isListening ? 'Listening — tap to stop' : 'Speak to Flow'}
              className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-colors ${
                isListening
                  ? 'bg-destructive/15 text-destructive animate-pulse'
                  : 'text-muted-foreground hover:text-primary hover:bg-surface-2'
              }`}
            >
              {isListening ? <MicOff className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Builds an attachment (with a thumbnail for images) from a picked file. */
export function makeFlowAttachment(file: File): FlowAttachment {
  return {
    file,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  };
}

export { ImageIcon };
