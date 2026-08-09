import fs from 'node:fs';

const cameraPath = 'src/components/FlowCameraCapture.tsx';
const indexPath = 'src/pages/Index.tsx';

let camera = fs.readFileSync(cameraPath, 'utf8');

// Keep the camera fully inside StoreFlow, but ask the phone for its best
// rear-camera stream and use ImageCapture.takePhoto when supported. This
// avoids the low-resolution canvas screenshot produced by the old camera.
camera = camera.replace(
  "const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });",
  "const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 60 } }, audio: false });"
);

const oldCapture = "const capture = async () => { const video = videoRef.current; if (!video || !video.videoWidth) return; const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height); const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', .9)); if (!blob) return; onCapture(new File([blob], `flow-camera-${Date.now()}.jpg`, { type: 'image/jpeg' })); close(); };";
const newCapture = "const capture = async () => { const track = streamRef.current?.getVideoTracks()[0]; if (!track) return; let blob: Blob | null = null; try { const ImageCaptureCtor = (window as any).ImageCapture; if (ImageCaptureCtor) { const photo = await new ImageCaptureCtor(track).takePhoto(); if (photo) blob = photo; } } catch { /* fall back to the live preview frame */ } if (!blob) { const video = videoRef.current; if (!video || !video.videoWidth) return; const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height); blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', .95)); } if (!blob) return; onCapture(new File([blob], `flow-camera-${Date.now()}.jpg`, { type: 'image/jpeg' })); close(); };";
if (camera.includes(oldCapture)) camera = camera.replace(oldCapture, newCapture);
else if (!camera.includes('ImageCaptureCtor')) throw new Error('Flow camera capture block not found');

// The previous tab-history implementation could restore a stale hash/state
// after refresh. Store the last real tab for this browser session and validate
// it against the actual StoreFlow tab IDs before restoring it.
let index = fs.readFileSync(indexPath, 'utf8');
const oldEffect = `  useEffect(() => {\n    const params = new URLSearchParams(window.location.search);\n    const queryTab = params.get('tab') as TabId | null;\n    const hash = window.location.hash.replace('#', '') as TabId;\n    const initialTab = queryTab || hash;\n    if (initialTab && initialTab !== 'dashboard') {\n      setTabState(initialTab);\n      window.history.replaceState({ tab: initialTab, index: 1 }, '', '#' + initialTab);\n    } else {\n      window.history.replaceState({ tab: 'dashboard', index: 0 }, '', '#dashboard');\n    }\n\n    const handlePopState = (e: PopStateEvent) => {\n      setTabState(e.state?.tab || 'dashboard');\n    };\n\n    window.addEventListener('popstate', handlePopState);\n    return () => window.removeEventListener('popstate', handlePopState);\n  }, []);`;
const newEffect = `  useEffect(() => {\n    const validTabs = new Set<TabId>([\n      ...RETAIL_MAIN_TABS.map(item => item.id),\n      ...RETAIL_MORE_ITEMS.map(item => item.id),\n      ...GAMES_MAIN_TABS.map(item => item.id),\n      ...GAMES_MORE_ITEMS.map(item => item.id),\n    ]);\n    const saved = sessionStorage.getItem('storeflow-active-tab') as TabId | null;\n    const candidate = saved && validTabs.has(saved) ? saved : 'dashboard';\n    setTabState(candidate);\n    window.history.replaceState({ tab: candidate, index: candidate === 'dashboard' ? 0 : 1 }, '', '#' + candidate);\n\n    const handlePopState = (e: PopStateEvent) => {\n      const next = e.state?.tab as TabId | undefined;\n      setTabState(next && validTabs.has(next) ? next : 'dashboard');\n    };\n\n    window.addEventListener('popstate', handlePopState);\n    return () => window.removeEventListener('popstate', handlePopState);\n  }, []);\n\n  useEffect(() => {\n    const validTabs = new Set<TabId>([\n      ...RETAIL_MAIN_TABS.map(item => item.id),\n      ...RETAIL_MORE_ITEMS.map(item => item.id),\n      ...GAMES_MAIN_TABS.map(item => item.id),\n      ...GAMES_MORE_ITEMS.map(item => item.id),\n    ]);\n    if (validTabs.has(tab)) sessionStorage.setItem('storeflow-active-tab', tab);\n  }, [tab]);`;
if (index.includes(oldEffect)) index = index.replace(oldEffect, newEffect);
else if (!index.includes("sessionStorage.setItem('storeflow-active-tab'")) throw new Error('Index tab-history block not found');

fs.writeFileSync(cameraPath, camera);
fs.writeFileSync(indexPath, index);
console.log('Stable in-app camera and tab refresh wiring verified.');
