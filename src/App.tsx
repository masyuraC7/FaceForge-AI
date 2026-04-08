import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { 
  Upload, 
  History, 
  Trash2, 
  Download, 
  CheckCircle, 
  XCircle, 
  Info, 
  Loader2,
  Maximize2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, type HistoryItem } from './db';
import { cn } from './lib/utils';

// --- Components ---

const Modal = ({ item, onClose }: { item: HistoryItem; onClose: () => void }) => {
  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative aspect-video bg-zinc-950 flex items-center justify-center overflow-hidden">
            {item.imageUrl ? (
              <img 
                src={item.imageUrl} 
                alt={item.fileName} 
                className="max-w-full max-h-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-zinc-700">
                <XCircle className="w-12 h-12" />
                <p className="text-xs uppercase tracking-widest font-mono">No Preview Available</p>
              </div>
            )}
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-zinc-100 truncate pr-4">
                {item.fileName}
              </h3>
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider",
                item.status === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              )}>
                {item.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                <p className="text-xs text-zinc-500 uppercase mb-1">Label</p>
                <p className="text-zinc-200 font-medium">{item.label}</p>
              </div>
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                <p className="text-xs text-zinc-500 uppercase mb-1">Confidence</p>
                <p className="text-zinc-200 font-medium">{(item.confidence * 100).toFixed(1)}%</p>
              </div>
            </div>

            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <p className="text-xs text-zinc-500 uppercase mb-1">Message</p>
              <p className="text-zinc-300 text-sm leading-relaxed">{item.message}</p>
            </div>

            <button 
              onClick={onClose}
              className="w-full py-3 bg-zinc-100 hover:bg-white text-zinc-900 font-semibold rounded-xl transition-all active:scale-[0.98]"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// --- Main App ---

export default function App() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  // Queue system to prevent double processing
  const processingQueue = useRef<Set<string>>(new Set());

  // Load history from Dexie
  const loadHistory = useCallback(async () => {
    const data = await db.history.orderBy('timestamp').reverse().toArray();
    setHistory(data);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const processFile = async (file: File | Blob, fileName: string) => {
    // Prevent double processing
    if (processingQueue.current.has(fileName)) return;
    processingQueue.current.add(fileName);

    try {
      const formData = new FormData();
      formData.append('file', file, fileName);

      const response = await fetch('/api/classify', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server responded with ${response.status}: ${errorText.substring(0, 100)}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Expected JSON but received ${contentType}. Content: ${text.substring(0, 100)}`);
      }

      const result = await response.json();
      
      // Convert file to base64 for storage
      const reader = new FileReader();
      const imageUrl = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const historyItem: HistoryItem = {
        fileName,
        status: result.status,
        label: result.label,
        confidence: result.confidence,
        imageUrl,
        message: result.message,
        timestamp: Date.now()
      };

      await db.history.add(historyItem);
      await loadHistory();
    } catch (error) {
      console.error(`Error processing ${fileName}:`, error);
      // Add error entry to history
      const errorItem: HistoryItem = {
        fileName,
        status: 'error',
        label: 'null',
        confidence: 0,
        imageUrl: '', // Or a placeholder
        message: 'Network error or server unavailable.',
        timestamp: Date.now()
      };
      await db.history.add(errorItem);
      await loadHistory();
    } finally {
      setProgress(prev => ({ ...prev, current: prev.current + 1 }));
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsProcessing(true);
    const filesToProcess: { file: File | Blob; name: string }[] = [];

    for (const file of acceptedFiles) {
      if (file.name.endsWith('.zip')) {
        try {
          const zip = new JSZip();
          const contents = await zip.loadAsync(file);
          for (const [name, zipEntry] of Object.entries(contents.files)) {
            if (!zipEntry.dir && /\.(jpg|jpeg|png)$/i.test(name)) {
              const blob = await zipEntry.async('blob');
              filesToProcess.push({ file: blob, name });
            }
          }
        } catch (err) {
          console.error("Error reading zip:", err);
        }
      } else if (/\.(jpg|jpeg|png)$/i.test(file.name)) {
        filesToProcess.push({ file, name: file.name });
      }
    }

    setProgress({ current: 0, total: filesToProcess.length });

    // Process one by one
    for (const item of filesToProcess) {
      await processFile(item.file, item.name);
    }

    setIsProcessing(false);
    processingQueue.current.clear();
  }, [loadHistory]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop: (acceptedFiles: File[]) => {
      onDrop(acceptedFiles);
    },
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/zip': ['.zip']
    }
  } as any);

  const clearHistory = async () => {
    await db.history.clear();
    setHistory([]);
  };

  const saveResults = async () => {
    const successItems = history.filter(item => item.status === 'success');
    if (successItems.length === 0) return;

    const zip = new JSZip();
    const resultsJson = successItems.map(item => ({
      fileName: item.fileName,
      label: item.label,
      confidence: item.confidence,
      message: item.message
    }));

    zip.file('results.json', JSON.stringify(resultsJson, null, 2));
    
    // Optionally add images to zip
    const imgFolder = zip.folder('images');
    if (imgFolder) {
      for (const item of successItems) {
        // Extract base64 data
        const base64Data = item.imageUrl.split(',')[1];
        imgFolder.file(item.fileName, base64Data, { base64: true });
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `FaceForge_Results_${new Date().getTime()}.zip`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-zinc-100 selection:text-zinc-900">
      {/* Header */}
      <header className="border-bottom border-zinc-900 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center">
              <Maximize2 className="w-5 h-5 text-zinc-900" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">FaceForge<span className="text-zinc-500">AI</span></h1>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={saveResults}
              disabled={history.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-800 rounded-lg text-sm font-medium transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Save Results</span>
            </button>
            <button 
              onClick={clearHistory}
              disabled={history.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-sm font-medium transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Upload */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-zinc-900/50 border border-zinc-900 rounded-2xl p-6 space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Classification Queue</h2>
              <p className="text-sm text-zinc-500">Upload images or .zip files to start batch processing.</p>
            </div>

            <div 
              {...getRootProps()} 
              className={cn(
                "relative border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group",
                isDragActive ? "border-zinc-100 bg-zinc-100/5" : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50",
                isProcessing && "pointer-events-none opacity-50"
              )}
            >
              <input {...getInputProps()} />
              <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                {isProcessing ? (
                  <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
                ) : (
                  <Upload className="w-8 h-8 text-zinc-400" />
                )}
              </div>
              <div className="text-center">
                <p className="font-medium text-zinc-200">
                  {isDragActive ? "Drop files here" : "Click or drag files"}
                </p>
                <p className="text-xs text-zinc-500 mt-1">Supports JPG, PNG, and ZIP</p>
              </div>
            </div>

            {isProcessing && (
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-mono text-zinc-500">
                  <span>Processing Batch...</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-900">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                    className="h-full bg-zinc-100"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-zinc-900/50 border border-zinc-900 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">System Status</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Engine</span>
                <span className="text-sm font-mono text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  Online
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Database</span>
                <span className="text-sm font-mono text-zinc-300">IndexedDB (Dexie)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Total Processed</span>
                <span className="text-sm font-mono text-zinc-300">{history.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: History */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-zinc-500" />
              <h2 className="text-lg font-semibold">Detection History</h2>
            </div>
            <span className="text-xs font-mono text-zinc-500 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
              {history.length} Entries
            </span>
          </div>

          <div className="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar">
            <AnimatePresence initial={false}>
              {history.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-zinc-600 border border-dashed border-zinc-900 rounded-2xl"
                >
                  <History className="w-12 h-12 mb-4 opacity-20" />
                  <p>No history records found.</p>
                </motion.div>
              ) : (
                history.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => setSelectedItem(item)}
                    className={cn(
                      "group flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all hover:translate-x-1",
                      item.status === 'success' 
                        ? "bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/30" 
                        : "bg-rose-500/5 border-rose-500/10 hover:border-rose-500/30"
                    )}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-zinc-950 border border-zinc-800 flex-shrink-0 overflow-hidden">
                        {item.imageUrl ? (
                          <img 
                            src={item.imageUrl} 
                            alt="" 
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <XCircle className="w-5 h-5 text-zinc-800" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">{item.fileName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wider",
                            item.status === 'success' ? "text-emerald-400" : "text-rose-400"
                          )}>
                            {item.status}
                          </span>
                          <span className="text-[10px] text-zinc-600 font-mono">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {item.status === 'success' && (
                        <div className="text-right hidden sm:block">
                          <p className="text-xs font-medium text-zinc-300">{item.label}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">{(item.confidence * 100).toFixed(0)}% Match</p>
                        </div>
                      )}
                      <div className={cn(
                        "p-2 rounded-lg transition-colors",
                        item.status === 'success' ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                      )}>
                        {item.status === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Detail Modal */}
      {selectedItem && (
        <Modal 
          item={selectedItem} 
          onClose={() => setSelectedItem(null)} 
        />
      )}

      {/* Global Styles for Scrollbar */}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }
      `}} />
    </div>
  );
}
