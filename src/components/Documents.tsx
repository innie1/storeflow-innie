import { useState } from 'react';
import { StoreData, VaultDocument } from '@/types/store';
import { addVaultDocument, deleteVaultDocument } from '@/lib/store-data';
import { 
  FolderArchive, Upload, FileText, Trash2, Calendar, HardDrive, Eye, Download, Info
} from 'lucide-react';
import { showToast } from '@/components/Toast';

interface DocumentsProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
}

export default function Documents({ store, onUpdate }: DocumentsProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Invoice');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileSizeKB, setFileSizeKB] = useState(0);
  const [filterCategory, setFilterCategory] = useState('All');
  
  // Modal view file
  const [viewingDoc, setViewingDoc] = useState<VaultDocument | null>(null);

  const categories = ['Invoice', 'Receipt', 'Rent Agreement', 'Supplier Doc', 'License', 'Other'];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: max 400KB to stay within localStorage boundaries
    const sizeKB = Math.round(file.size / 1024);
    if (sizeKB > 400) {
      showToast('File is too large! Please upload a file smaller than 400KB for offline storage.', 'error');
      e.target.value = ''; // Reset input
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      setFileContent(reader.result as string);
      setFileSizeKB(sizeKB);
      if (!name) {
        setName(file.name.split('.')[0]); // Default doc name to file name
      }
    };
  };

  const handleUploadDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !fileContent) {
      showToast('Document name and file selection are required', 'error');
      return;
    }
    const nextStore = addVaultDocument(store, name.trim(), category, fileContent, fileSizeKB);
    onUpdate(nextStore);
    showToast('Document uploaded successfully!');
    
    // Clear states
    setName('');
    setCategory('Invoice');
    setFileContent(null);
    setFileSizeKB(0);
    // Reset file input
    const fileInput = document.getElementById('vault-file-uploader') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleDeleteDocument = (id: string) => {
    if (confirm('Are you sure you want to delete this document from the vault?')) {
      const nextStore = deleteVaultDocument(store, id);
      onUpdate(nextStore);
      showToast('Document deleted.');
    }
  };

  const documents = store.documents || [];
  
  // Calculate total vault size (for quota warn check)
  const totalSizeKB = documents.reduce((sum, d) => sum + d.fileSize, 0);

  const filtered = documents.filter(d => 
    filterCategory === 'All' || d.category === filterCategory
  );

  return (
    <div className="space-y-6">
      <div className="text-left">
        <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
          <FolderArchive className="w-6 h-6 text-yellow-500" /> Document Vault
        </h2>
        <p className="text-sm text-muted-foreground">Secure offline-first repository for store licenses, invoices, and supplier receipts.</p>
      </div>

      {/* Storage quota checker */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-yellow-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <HardDrive className="w-5 h-5 text-yellow-500 shrink-0" />
          <div className="text-left">
            <h4 className="font-display font-bold text-sm text-foreground">Vault Storage Usage</h4>
            <p className="text-xs text-muted-foreground">Keep items small to avoid exceeding browser LocalStorage quotas.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 font-display font-bold text-xs text-foreground">
          <span>{totalSizeKB.toLocaleString()} KB used / 2,000 KB Max</span>
          <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden border border-border">
            <div 
              className={`h-full rounded-full ${totalSizeKB > 1500 ? 'bg-destructive' : 'bg-yellow-500'}`} 
              style={{ width: `${Math.min(100, (totalSizeKB / 2000) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Upload box */}
        <div className="lg:col-span-1 bg-slate-950 border border-border p-5 rounded-2xl space-y-4 h-fit">
          <h3 className="font-display font-bold text-base text-foreground text-left">Upload Document</h3>
          
          <form onSubmit={handleUploadDocument} className="space-y-4">
            <div className="space-y-1 text-left">
              <label className="text-xs text-muted-foreground uppercase font-bold">Document Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Rent Agreement 2026"
                className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
              />
            </div>

            <div className="space-y-1 text-left">
              <label className="text-xs text-muted-foreground uppercase font-bold">Category</label>
              <select 
                value={category} 
                onChange={e => setCategory(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
              >
                {categories.map((c, i) => (
                  <option key={i} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Custom drag/drop look file uploader */}
            <div className="space-y-2 text-left">
              <label className="text-xs text-muted-foreground uppercase font-bold">Select File (Images/PDFs)</label>
              <div className="relative border-2 border-dashed border-border/80 hover:border-yellow-500/25 transition-all p-5 rounded-xl text-center cursor-pointer">
                <input 
                  type="file" 
                  id="vault-file-uploader"
                  onChange={handleFileChange}
                  accept="image/*,application/pdf"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <span className="text-xs text-muted-foreground block font-semibold">Drag & drop or browse</span>
                <span className="text-[10px] text-muted-foreground/60 block mt-1">Image or PDF (Max 400KB)</span>
              </div>
            </div>

            {fileSizeKB > 0 && (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-500 flex justify-between items-center">
                <span>File attached: ({fileSizeKB} KB)</span>
                <button type="button" onClick={() => { setFileContent(null); setFileSizeKB(0); }} className="text-destructive font-bold underline">Remove</button>
              </div>
            )}

            <button 
              type="submit"
              className="w-full py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold text-sm shadow-md active:scale-95 transition-all cursor-pointer"
            >
              Upload to Vault
            </button>
          </form>
        </div>

        {/* Right Column: Files directory list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h3 className="font-display font-bold text-base text-foreground text-left">Stored Documents</h3>
            
            {/* Category filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto">
              {['All', ...categories].map((c, i) => (
                <button 
                  key={i} 
                  onClick={() => setFilterCategory(c)}
                  className={`px-3 py-1 rounded-lg text-xs font-display font-bold transition-all border shrink-0 ${
                    filterCategory === c 
                      ? 'bg-yellow-500/10 border-yellow-500/35 text-yellow-500' 
                      : 'bg-surface-2 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          
          {filtered.length === 0 ? (
            <div className="text-center py-20 bg-slate-900/30 rounded-2xl border border-dashed border-border/80">
              <p className="text-muted-foreground text-sm">No documents found matching this filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map(d => (
                <div key={d.id} className="p-4 rounded-xl bg-slate-950 border border-border flex flex-col justify-between gap-3 text-left hover:border-yellow-500/25 transition-all">
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-yellow-500 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-display font-bold text-sm text-foreground truncate">{d.name}</h4>
                      <p className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3.5 h-3.5" /> {new Date(d.dateAdded).toLocaleDateString()}
                      </p>
                      <span className="inline-block px-1.5 py-0.5 rounded bg-surface-2 border border-border/80 text-[8px] font-bold text-muted-foreground uppercase mt-1">
                        {d.category}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs">
                    <span className="text-[10px] text-muted-foreground">{d.fileSize} KB</span>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setViewingDoc(d)}
                        className="p-1.5 rounded bg-surface-2 hover:bg-surface-3 text-muted-foreground hover:text-yellow-500 border border-border transition-all flex items-center gap-1 text-[10px] font-display font-bold"
                      >
                        <Eye className="w-3 h-3" /> View
                      </button>
                      <a 
                        href={d.fileContent} 
                        download={d.name}
                        className="p-1.5 rounded bg-surface-2 hover:bg-surface-3 text-muted-foreground hover:text-yellow-500 border border-border transition-all flex items-center gap-1 text-[10px] font-display font-bold"
                      >
                        <Download className="w-3 h-3" /> Get
                      </a>
                      <button 
                        onClick={() => handleDeleteDocument(d.id)}
                        className="p-1.5 rounded bg-surface-2 hover:bg-surface-3 text-muted-foreground hover:text-destructive border border-border transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Viewer Modal */}
      {viewingDoc && (
        <div 
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewingDoc(null)}
        >
          <div 
            className="w-full max-w-2xl bg-card border border-border rounded-2xl p-5 animate-slide-up flex flex-col gap-4 max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-border/60 pb-3">
              <div className="text-left">
                <h3 className="font-display font-bold text-lg text-foreground">{viewingDoc.name}</h3>
                <p className="text-xs text-muted-foreground">{viewingDoc.category} · {viewingDoc.fileSize} KB</p>
              </div>
              <button 
                onClick={() => setViewingDoc(null)}
                className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-lg text-muted-foreground hover:text-foreground border border-border"
              >
                ×
              </button>
            </div>

            {/* Content preview pane */}
            <div className="flex-1 min-h-[300px] overflow-auto bg-slate-900 border border-border rounded-xl flex items-center justify-center p-2">
              {viewingDoc.fileContent.startsWith('data:image/') ? (
                <img src={viewingDoc.fileContent} alt={viewingDoc.name} className="max-w-full max-h-[60vh] object-contain" />
              ) : viewingDoc.fileContent.startsWith('data:application/pdf') ? (
                <object data={viewingDoc.fileContent} type="application/pdf" className="w-full h-[55vh]">
                  <div className="text-center p-8 space-y-3">
                    <Info className="w-8 h-8 text-yellow-500 mx-auto" />
                    <p className="text-sm text-muted-foreground">PDF viewer not available. Click download to fetch the file.</p>
                    <a 
                      href={viewingDoc.fileContent} 
                      download={viewingDoc.name}
                      className="inline-block px-4 py-2 bg-yellow-500 text-slate-950 font-display font-bold text-xs rounded-lg"
                    >
                      Download PDF
                    </a>
                  </div>
                </object>
              ) : (
                <p className="text-sm text-muted-foreground">Unable to preview. Download raw file content.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
