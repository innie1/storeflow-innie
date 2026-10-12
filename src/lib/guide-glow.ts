import { SPOTLIGHT_CLASS, SPOTLIGHT_MS } from '@/lib/spotlight';

/**
 * Light the control a checklist button sent the merchant to.
 *
 * The same short pulse as any other spotlit card, on the visible copy of the
 * control (the sidebar and the bottom bar can both carry one; the hidden one
 * measures 0x0). The screen it lives on may still be mounting after the tab
 * switch, so it looks for a few seconds and then gives up quietly - nothing
 * dims, nothing blocks, and a control that never appears simply is not lit.
 */
export function glowGuideTarget(target: string, giveUpAfterMs = 3000): void {
  const started = Date.now();
  const look = () => {
    const element = Array.from(document.querySelectorAll<HTMLElement>(`[data-guide="${target}"]`))
      .find(node => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
    if (!element) {
      if (Date.now() - started < giveUpAfterMs) window.setTimeout(look, 150);
      return;
    }
    try { element.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* old browser */ }
    element.classList.add(SPOTLIGHT_CLASS);
    window.setTimeout(() => element.classList.remove(SPOTLIGHT_CLASS), SPOTLIGHT_MS);
  };
  window.setTimeout(look, 120);
}
