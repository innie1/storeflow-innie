import { useState, useRef, useEffect } from 'react';
import { StoreData, DiaryEntry } from '@/types/store';
import { addDiaryEntry, deleteDiaryEntry } from '@/lib/store-data';
import { 
  BookOpen, Mic, Square, Trash2, Calendar, FileText, Play, Pause, AlertTriangle, Sparkles
} from 'lucide-react';
import { showToast } from '@/components/Toast';

interface DiaryProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
}

export default function Diary({ store, onUpdate }: DiaryProps) {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  
  // Audio playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  
  // Media recorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Microphone recording not supported on this browser.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const options = { mimeType: 'audio/webm' };
      
      let recorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Convert blob to compressed base64 URI
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          setAudioBase64(base64data);
          showToast('Voice memo recorded successfully!');
        };

        // Stop all media tracks to release hardware
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= 15) { // 15 seconds limit
            stopRecording();
            showToast('Auto-stopped: 15 seconds limit reached.', 'info');
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error(err);
      showToast('Unable to access microphone.', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !audioBase64) {
      showToast('Please type a diary entry or record a voice note.', 'error');
      return;
    }
    const nextStore = addDiaryEntry(store, text.trim(), audioBase64 || undefined);
    onUpdate(nextStore);
    showToast('Diary entry saved.');
    setText('');
    setAudioBase64(null);
  };

  const handleDeleteEntry = (id: string) => {
    if (confirm('Delete this diary entry?')) {
      const nextStore = deleteDiaryEntry(store, id);
      onUpdate(nextStore);
      showToast('Entry deleted.');
    }
  };

  const togglePlayAudio = (id: string, audioData: string) => {
    if (playingId === id) {
      audioPlayerRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = audioData;
        audioPlayerRef.current.play().catch(e => {
          console.error(e);
          showToast('Failed to play voice note.', 'error');
        });
        setPlayingId(id);
        audioPlayerRef.current.onended = () => {
          setPlayingId(null);
        };
      }
    }
  };

  const entries = store.diaryEntries || [];

  return (
    <div className="space-y-6">
      <div className="text-left">
        <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-yellow-500" /> Business Diary
        </h2>
        <p className="text-sm text-muted-foreground">Keep personal journals, log customer complaints, and capture daily store insights.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form entry */}
        <div className="lg:col-span-1 bg-slate-950 border border-border p-5 rounded-2xl space-y-4">
          <h3 className="font-display font-bold text-base text-foreground text-left">New Diary Entry</h3>
          
          <form onSubmit={handleSaveEntry} className="space-y-4">
            <textarea 
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Record notes e.g., 'Competitor down the street raised their bread price. Lots of new walk-in clients today...'"
              rows={4}
              className="w-full p-3 rounded-xl bg-slate-900 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-yellow-500 resize-none text-left"
            />

            {/* Voice Recorder control block */}
            <div className="p-3 rounded-xl bg-surface-2 border border-border/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {isRecording ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-ping shrink-0" />
                ) : (
                  <Mic className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="text-left">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Voice Memo (15s Max)</span>
                  <span className="text-xs text-foreground font-mono">
                    {isRecording ? `Recording: ${recordingDuration}s` : audioBase64 ? 'Recorded ✓' : 'Ready'}
                  </span>
                </div>
              </div>
              
              <button 
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  isRecording 
                    ? 'bg-destructive text-white hover:bg-destructive/80' 
                    : 'bg-yellow-500 hover:bg-yellow-600 text-slate-950'
                } active:scale-95`}
              >
                {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>

            {audioBase64 && (
              <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/20 p-2.5 rounded-xl text-xs text-yellow-500">
                <span>Voice memo attached.</span>
                <button type="button" onClick={() => setAudioBase64(null)} className="text-destructive font-bold underline">Remove</button>
              </div>
            )}

            <button 
              type="submit"
              className="w-full py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold text-sm shadow-md active:scale-95 transition-all cursor-pointer"
            >
              Save Entry
            </button>
          </form>
        </div>

        {/* Right Column: Historical logs list */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-display font-bold text-base text-foreground text-left">Historical Journal Memos</h3>
          
          {entries.length === 0 ? (
            <div className="text-center py-20 bg-slate-900/30 rounded-2xl border border-dashed border-border/80">
              <p className="text-muted-foreground text-sm">Diary is empty. Log observations to build a historical record.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map(e => (
                <div key={e.id} className="p-4 rounded-2xl bg-slate-950 border border-border flex gap-4 justify-between items-start text-left shadow-sm">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> {new Date(e.date).toLocaleString()}
                      </span>
                    </div>
                    {e.text && <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{e.text}</p>}
                    
                    {e.audioData && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => togglePlayAudio(e.id, e.audioData!)}
                          className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border hover:border-yellow-500/25 transition-all text-xs font-display font-bold flex items-center gap-1.5"
                        >
                          {playingId === e.id ? (
                            <>
                              <Pause className="w-3 h-3 text-yellow-500 fill-yellow-500" /> Stop Note
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 text-yellow-500 fill-yellow-500" /> Play Note
                            </>
                          )}
                        </button>
                        <span className="text-[10px] text-muted-foreground">Voice Recording</span>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={() => handleDeleteEntry(e.id)}
                    className="p-2 rounded-lg bg-surface-2 border border-border text-muted-foreground hover:text-destructive hover:border-destructive/25 transition-all shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Hidden audio tag for playback */}
      <audio ref={audioPlayerRef} className="hidden" />
    </div>
  );
}
