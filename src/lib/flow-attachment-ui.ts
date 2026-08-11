/*
 * Flow composer attachment/share enhancement.
 *
 * This module is intentionally DOM-level so the existing FlowChat command
 * engine is untouched. FlowChat imports flow-understanding, which imports this
 * module for its side effect while the chat is mounted.
 */

const STYLE_ID = 'storeflow-flow-attachment-ui';
const MENU_ID = 'storeflow-flow-attachment-menu';
const CAMERA_ID = 'storeflow-flow-camera';
const FILE_INPUT_ID = 'storeflow-flow-file-input';
const IMAGE_INPUT_ID = 'storeflow-flow-image-input';

const icon = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" class="storeflow-flow-attachment-icon"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${MENU_ID}{position:absolute;bottom:calc(100% + 10px);left:0;width:min(320px,calc(100vw - 32px));padding:8px;background:hsl(var(--background));border:1px solid hsl(var(--border));border-radius:18px;box-shadow:0 18px 45px rgba(0,0,0,.45);z-index:90;display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .storeflow-flow-attach-item{display:flex;align-items:center;gap:10px;padding:11px 10px;border:0;border-radius:13px;background:transparent;color:hsl(var(--foreground));font:600 13px/1.2 inherit;text-align:left;cursor:pointer}
    .storeflow-flow-attach-item:hover{background:hsl(var(--muted))}
    .storeflow-flow-attach-item.primary{color:hsl(var(--primary));background:hsl(var(--primary)/.08)}
    .storeflow-flow-attachment-icon{width:20px;height:20px;flex:none}
    .storeflow-flow-plus{width:40px;height:40px;flex:none;border:1px solid hsl(var(--border));border-radius:999px;background:hsl(var(--surface-2)/.7);color:hsl(var(--foreground));display:flex;align-items:center;justify-content:center;font-size:25px;line-height:1;cursor:pointer}
    .storeflow-flow-plus:hover{background:hsl(var(--surface-2))}
    .storeflow-flow-modal{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:18px}
    .storeflow-flow-camera-card{width:min(520px,100%);background:hsl(var(--background));border:1px solid hsl(var(--border));border-radius:22px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.55)}
    .storeflow-flow-camera-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid hsl(var(--border));font-weight:700}
    .storeflow-flow-camera-stage{position:relative;background:#000;aspect-ratio:3/4;max-height:70vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
    .storeflow-flow-camera-stage video{width:100%;height:100%;object-fit:cover}
    .storeflow-flow-camera-actions{display:flex;gap:10px;padding:14px 16px}
    .storeflow-flow-camera-actions button{flex:1;border:1px solid hsl(var(--border));border-radius:13px;padding:11px;background:hsl(var(--surface-2));color:hsl(var(--foreground));font-weight:700;cursor:pointer}
    .storeflow-flow-camera-actions .capture{background:hsl(var(--primary));color:hsl(var(--primary-foreground));border-color:transparent}
    .storeflow-flow-share{display:inline-flex;align-items:center;gap:5px;margin-top:4px;padding:6px 9px;border:1px solid hsl(var(--primary)/.35);border-radius:999px;background:hsl(var(--primary)/.08);color:hsl(var(--primary));font:700 11px/1 inherit;cursor:pointer}
    .storeflow-flow-share svg{width:14px;height:14px}
  `;
  document.head.appendChild(style);
}

function getComposer() {
  const input = document.querySelector<HTMLInputElement>('input[placeholder="Tell Flow what to do…"], input[placeholder="Answer Flow…"]');
  const form = input?.closest('form');
  return input && form ? { input, form } : null;
}

function clickExisting(label: string) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  const target = buttons.find(b => b.textContent?.trim().toLowerCase().includes(label.toLowerCase()));
  target?.click();
  return !!target;
}

function submitText(input: HTMLInputElement, form: HTMLFormElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  form.requestSubmit();
}

function showCodeImport(input: HTMLInputElement, form: HTMLFormElement) {
  const modal = document.createElement('div');
  modal.className = 'storeflow-flow-modal';
  modal.innerHTML = `<div class="storeflow-flow-camera-card" role="dialog" aria-modal="true">
    <div class="storeflow-flow-camera-head"><span>Import restock code</span><button type="button" aria-label="Close">×</button></div>
    <div style="padding:16px;display:grid;gap:12px"><p style="margin:0;color:hsl(var(--muted-foreground));font-size:12px">Paste the PO code generated from a Buy List, for example PO-ABC123.</p><input id="storeflow-flow-code" placeholder="PO-ABC123" autocomplete="off" style="width:100%;box-sizing:border-box;border:1px solid hsl(var(--border));border-radius:12px;padding:12px;background:hsl(var(--surface-2));color:hsl(var(--foreground));font-family:monospace;text-transform:uppercase"><button type="button" class="capture" style="border:0;border-radius:12px;padding:12px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-weight:700">Import</button></div>
  </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('button[aria-label="Close"]')?.addEventListener('click', close);
  const code = modal.querySelector<HTMLInputElement>('#storeflow-flow-code')!;
  const importButton = modal.querySelector<HTMLButtonElement>('button.capture')!;
  code.focus();
  const run = () => { const value = code.value.trim().toUpperCase(); if (!value) return; close(); submitText(input, form, `Import restock code ${value}`); };
  importButton.addEventListener('click', run);
  code.addEventListener('keydown', e => { if (e.key === 'Enter') run(); if (e.key === 'Escape') close(); });
}

async function openCamera(input: HTMLInputElement, form: HTMLFormElement) {
  const modal = document.createElement('div');
  modal.className = 'storeflow-flow-modal';
  modal.id = CAMERA_ID;
  modal.innerHTML = `<div class="storeflow-flow-camera-card" role="dialog" aria-modal="true"><div class="storeflow-flow-camera-head"><span>Flow Camera</span><button type="button" aria-label="Close">×</button></div><div class="storeflow-flow-camera-stage"><video autoplay playsinline muted></video><canvas hidden></canvas></div><div class="storeflow-flow-camera-actions"><button type="button" class="capture">Capture</button><button type="button" class="cancel">Cancel</button></div></div>`;
  document.body.appendChild(modal);
  const video = modal.querySelector<HTMLVideoElement>('video')!;
  const canvas = modal.querySelector<HTMLCanvasElement>('canvas')!;
  let stream: MediaStream | null = null;
  const close = () => { stream?.getTracks().forEach(t => t.stop()); modal.remove(); };
  modal.querySelector('button[aria-label="Close"]')?.addEventListener('click', close);
  modal.querySelector('button.cancel')?.addEventListener('click', close);
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    video.srcObject = stream;
    await video.play();
  } catch {
    close();
    showToastLike('Camera permission was not available. You can use Photos instead.');
    return;
  }
  modal.querySelector('button.capture')?.addEventListener('click', () => {
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    close();
    // The captured image is represented in the chat as an import request. The
    // existing receipt importer remains the source of truth for stock parsing.
    submitText(input, form, 'I captured a receipt/photo. Please import and understand the stock from it.');
  });
}

function showToastLike(message: string) {
  const el = document.createElement('div');
  el.textContent = message;
  Object.assign(el.style, { position:'fixed', left:'50%', bottom:'90px', transform:'translateX(-50%)', zIndex:'200', padding:'10px 14px', borderRadius:'12px', background:'#222', color:'#fff', fontSize:'12px', fontWeight:'600', boxShadow:'0 10px 30px rgba(0,0,0,.35)' });
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2400);
}

function attachFileInput(input: HTMLInputElement, form: HTMLFormElement, accept: string, kind: 'image'|'file') {
  const existing = document.getElementById(kind === 'image' ? IMAGE_INPUT_ID : FILE_INPUT_ID) as HTMLInputElement | null;
  const fileInput = existing || document.createElement('input');
  if (!existing) {
    fileInput.type = 'file';
    fileInput.id = kind === 'image' ? IMAGE_INPUT_ID : FILE_INPUT_ID;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }
  fileInput.accept = accept;
  fileInput.multiple = true;
  fileInput.onchange = () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    const names = files.map(f => f.name).join(', ');
    const text = kind === 'image'
      ? `I imported image/photo ${names}. Please understand the stock information in it.`
      : `I imported file(s): ${names}. Please understand the stock information and tell me what should be added or changed.`;
    submitText(input, form, text);
    fileInput.value = '';
  };
  fileInput.click();
}

function addMenu(composer: { input: HTMLInputElement; form: HTMLFormElement }) {
  const { input, form } = composer;
  if (form.querySelector('[data-storeflow-flow-plus]')) return;
  installStyles();
  form.style.position = 'relative';
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.dataset.storeflowFlowPlus = '1';
  plus.className = 'storeflow-flow-plus';
  plus.setAttribute('aria-label', 'Add attachment');
  plus.textContent = '+';
  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.hidden = true;
  menu.innerHTML = `
    <button type="button" class="storeflow-flow-attach-item" data-action="camera">${icon('M7 7h10l1.5 2H21v9H3V9h2.5L7 7Zm5 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z')}<span>Camera</span></button>
    <button type="button" class="storeflow-flow-attach-item" data-action="photos">${icon('M4 5h16v14H4z M7 15l3-3 2 2 2-2 3 3 M8 9h.01')}<span>Photos</span></button>
    <button type="button" class="storeflow-flow-attach-item" data-action="files">${icon('M6 3h8l4 4v14H6z M14 3v5h5 M9 13h6 M9 17h6')}<span>Files</span></button>
    <button type="button" class="storeflow-flow-attach-item primary" data-action="receipt">${icon('M7 3h10v18H7z M9 7h6 M9 11h6 M9 15h4')}<span>Import receipt</span></button>
    <button type="button" class="storeflow-flow-attach-item primary" data-action="restock">${icon('M12 3a5 5 0 0 0 0 10h1v3h3v-3h1a5 5 0 0 0 0-10h-3v3h3a2 2 0 1 1 0 4h-2V7h-3v3h-1a2 2 0 1 1 0-4h3V3z')}<span>Import restock code</span></button>
  `;
  form.insertBefore(plus, input);
  form.appendChild(menu);
  const closeMenu = () => { menu.hidden = true; };
  plus.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); menu.hidden = !menu.hidden; });
  menu.addEventListener('click', e => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    closeMenu();
    if (action === 'camera') openCamera(input, form);
    else if (action === 'photos') attachFileInput(input, form, 'image/*', 'image');
    else if (action === 'files') attachFileInput(input, form, '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.json,.jpg,.jpeg,.png,.webp', 'file');
    else if (action === 'receipt') clickExisting('Import receipt');
    else if (action === 'restock') showCodeImport(input, form);
  });
  document.addEventListener('click', e => { if (!form.contains(e.target as Node)) closeMenu(); }, { capture: true });
}

function addShareButtons() {
  const bubbles = Array.from(document.querySelectorAll<HTMLElement>('.max-w-\\[90\\%\\]'));
  bubbles.forEach(bubble => {
    if (bubble.dataset.flowShareReady === '1' || !bubble.textContent?.includes('List created in Buy List.')) return;
    bubble.dataset.flowShareReady = '1';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'storeflow-flow-share';
    button.innerHTML = `${icon('M4 12v7h16v-7 M8 8l4-4 4 4 M12 4v12')}<span>Send</span>`;
    button.addEventListener('click', async () => {
      const text = bubble.textContent?.trim() || '';
      try {
        if (navigator.share) await navigator.share({ title: 'StoreFlow Buy List', text });
        else { await navigator.clipboard.writeText(text); showToastLike('Buy List copied. You can paste it anywhere.'); }
      } catch { /* User cancelled native share. */ }
    });
    bubble.parentElement?.appendChild(button);
  });
}

function install() {
  const composer = getComposer();
  if (composer) addMenu(composer);
  addShareButtons();
}

let observer: MutationObserver | null = null;
function start() {
  if (typeof document === 'undefined') return;
  installStyles();
  install();
  observer?.disconnect();
  observer = new MutationObserver(() => install());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
