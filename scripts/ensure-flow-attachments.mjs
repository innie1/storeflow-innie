import fs from 'node:fs';

const flowPath = 'src/components/FlowChat.tsx';
const receiptPath = 'src/components/ReceiptScanner.tsx';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, text) { fs.writeFileSync(path, text); }

let flow = read(flowPath);

if (!flow.includes("@/components/FlowAttachmentMenu")) {
  flow = flow.replace(
    "import ReceiptScanner from '@/components/ReceiptScanner';",
    "import ReceiptScanner from '@/components/ReceiptScanner';\nimport FlowAttachmentMenu from '@/components/FlowAttachmentMenu';\nimport FlowCameraCapture from '@/components/FlowCameraCapture';\nimport { createFlowBuyList, formatFlowBuyList } from '@/lib/flow-buy-list';"
  );
}

if (!flow.includes('const [showAttachments, setShowAttachments]')) {
  flow = flow.replace(
    "  const [restockCodeInput, setRestockCodeInput] = useState('');",
    "  const [restockCodeInput, setRestockCodeInput] = useState('');\n  const [showAttachments, setShowAttachments] = useState(false);\n  const [showFlowCamera, setShowFlowCamera] = useState(false);\n  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);"
  );
}

if (!flow.includes('const createBuyListFromFlow')) {
  const helper = `
  const createBuyListFromFlow = () => {
    const items = createFlowBuyList(store);
    flow(formatFlowBuyList(items), items.length ? [{ label: 'Open Buy List', onClick: () => onNavigate?.('inventory') }] : undefined);
    rememberBrainContext(store, { lastTopic: 'inventory', lastAction: 'flow buy list recommendation' });
  };

  const handleFlowAttachment = (file: File) => {
    if (file.type.startsWith('image/')) {
      setPendingImportFile(file);
      setShowReceiptImport(true);
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'tsv', 'txt', 'json'].includes(ext)) {
      showToast(file.name + ' selected. Open Inventory to import this stock file.', 'info');
      onNavigate?.('inventory');
      return;
    }
    showToast('That file type is not supported for StoreFlow import.', 'error');
  };
`;
  const marker = '  const executeSales = (items: FlowLineItem[]) => {';
  if (!flow.includes(marker)) throw new Error('FlowChat executeSales anchor not found');
  flow = flow.replace(marker, helper + '\n' + marker);
}

if (!flow.includes('createBuyListFromFlow(); return;')) {
  const marker = '    if (handleFinanceMutation(text)) return;';
  const addition = "    if (/\\b(?:create|make|build|generate)\\b.*\\bbuy list\\b|\\bbuy list\\b.*\\b(?:create|make|build|generate)\\b/i.test(text)) { createBuyListFromFlow(); return; }\n";
  if (!flow.includes(marker)) throw new Error('FlowChat command anchor not found');
  flow = flow.replace(marker, addition + marker);
}

const placeholder = "placeholder={addDraft ? 'Answer Flow…' : 'Tell Flow what to do…'}";
if (flow.includes(placeholder) && !flow.includes('<FlowAttachmentMenu')) {
  const inputIndex = flow.indexOf(placeholder);
  const formStart = flow.lastIndexOf('<form', inputIndex);
  const formEnd = flow.indexOf('</form>', inputIndex);
  if (formStart < 0 || formEnd < 0) throw new Error('FlowChat input form not found');

  const newForm = `
    <form className="relative flex items-center gap-2 px-4 py-3 border-t border-border" onSubmit={e => { e.preventDefault(); const t = input.trim(); if (!t) return; setInput(''); ask(t); }}>
      <button type="button" onClick={() => setShowAttachments(v => !v)} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full border border-border bg-surface-2/40" aria-label="Add attachment">
        <Plus className="w-5 h-5" />
      </button>
      <input value={input} onChange={e => setInput(e.target.value)} placeholder={addDraft ? 'Answer Flow…' : 'Tell Flow what to do…'} className="flex-1 rounded-full border border-border bg-surface-2/40 px-4 py-3 text-sm" />
      <button type="submit" disabled={!input.trim()} className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" aria-label="Send">
        <Send className="w-4 h-4" />
      </button>
      {showAttachments && <FlowAttachmentMenu
        onClose={() => setShowAttachments(false)}
        onCamera={() => { setShowAttachments(false); setShowFlowCamera(true); }}
        onImage={handleFlowAttachment}
        onFile={handleFlowAttachment}
        onRestockCode={() => { setShowAttachments(false); setShowRestockCodeImport(true); }}
        onBuyList={() => { setShowAttachments(false); createBuyListFromFlow(); }}
      />}
    </form>`;
  flow = flow.slice(0, formStart) + newForm + flow.slice(formEnd + '</form>'.length);
}

if (!flow.includes('showFlowCamera && <FlowCameraCapture')) {
  const formMarker = '    <form className="relative flex items-center gap-2 px-4 py-3 border-t border-border"';
  const camera = `    {showFlowCamera && <FlowCameraCapture onClose={() => setShowFlowCamera(false)} onCapture={(file) => { setShowFlowCamera(false); setPendingImportFile(file); setShowReceiptImport(true); }} />}\n`;
  if (!flow.includes(formMarker)) throw new Error('FlowChat final form anchor not found');
  flow = flow.replace(formMarker, camera + formMarker);
}

if (!flow.includes('initialFile={pendingImportFile}')) {
  const receipt = /\{showReceiptImport && <ReceiptScanner[^\n]*\/>\}/;
  if (receipt.test(flow)) {
    flow = flow.replace(receipt, "{showReceiptImport && <ReceiptScanner store={store} onUpdate={onUpdate} onClose={() => { setShowReceiptImport(false); setPendingImportFile(null); }} initialFile={pendingImportFile} />}");
  }
}

let receipt = read(receiptPath);
if (!receipt.includes('initialFile?: File | null;')) {
  receipt = receipt.replace('  currentUser?: any;\n}', '  currentUser?: any;\n  initialFile?: File | null;\n}');
}
if (!receipt.includes('initialFile }: ReceiptScannerProps')) {
  receipt = receipt.replace(
    'export default function ReceiptScanner({ store, onUpdate, onClose, currentUser }: ReceiptScannerProps) {',
    'export default function ReceiptScanner({ store, onUpdate, onClose, currentUser, initialFile }: ReceiptScannerProps) {'
  );
}
if (!receipt.includes('initialProcessedRef')) {
  receipt = receipt.replace(
    '  const fileRef = useRef<HTMLInputElement>(null);',
    '  const fileRef = useRef<HTMLInputElement>(null);\n  const initialProcessedRef = useRef<File | null>(null);'
  );
}
if (!receipt.includes('initialFile && initialProcessedRef')) {
  const anchor = '  const applyStructureToItems = (targetItems: ScannedItem[], pUnit: string, sUnit: string, unitsPerPurchase: number) => {';
  const effect = `  useEffect(() => {
    if (!initialFile || initialProcessedRef.current === initialFile) return;
    initialProcessedRef.current = initialFile;
    const synthetic = { target: { files: [initialFile] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    void handleFileSelect(synthetic);
  }, [initialFile]);

`;
  if (!receipt.includes(anchor)) throw new Error('ReceiptScanner applyStructure anchor not found');
  receipt = receipt.replace(anchor, effect + anchor);
}

if (!flow.includes('<FlowAttachmentMenu') || !flow.includes('onClick={() => setShowAttachments(v => !v)}') || !flow.includes('createBuyListFromFlow(); return;')) {
  throw new Error('Flow attachment wiring was not applied; refusing to build stale Flow UI.');
}
if (!receipt.includes('initialFile?: File | null;') || !receipt.includes('initialProcessedRef')) {
  throw new Error('Receipt import wiring was not applied; refusing to build stale import UI.');
}

write(flowPath, flow);
write(receiptPath, receipt);
console.log('Flow attachment/buy-list wiring verified and ensured.');
