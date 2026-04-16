import React, { useState } from 'react';
import { 
  Shield, 
  FolderInput, 
  FolderOutput, 
  Play, 
  CheckCircle2, 
  Loader2,
  FileText
} from 'lucide-react';

function App() {
  const [inputPath, setInputPath] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'done'>('idle');
  const [mode, setMode] = useState<'default' | 'aggressive'>('default');

  React.useEffect(() => {
    window.electronAPI.onProgress((data: any) => {
      if (data.status === 'progress') {
        setProgress(data.percentage);
        setCurrentFile(data.file);
      }
    });
  }, []);

  const handleSelectInput = async () => {
    const path = await window.electronAPI.selectFolder();
    if (path) setInputPath(path);
  };

  const handleSelectOutput = async () => {
    const path = await window.electronAPI.selectFolder();
    if (path) setOutputPath(path);
  };

  const handleStart = async () => {
    if (!inputPath || !outputPath) return;
    setIsProcessing(true);
    setStatus('processing');
    setProgress(0);
    
    try {
      await window.electronAPI.startAnonymization({ inputPath, outputPath, mode });
      setIsProcessing(false);
      setStatus('done');
    } catch (error) {
      console.error('Anonymization failed:', error);
      setIsProcessing(false);
      setStatus('idle');
      alert('An error occurred during processing.');
    }
  };

  const reset = () => {
    setStatus('idle');
    setProgress(0);
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans">
      {/* Sidebar */}
      <div className="w-16 h-full flex flex-col items-center py-6 bg-white border-r border-slate-100">
        <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary-200">
          <Shield size={24} />
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-8 overflow-hidden">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">Doc Anonymizer</h1>
          <p className="text-slate-500 mt-1">Protect your sensitive data locally.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Input Folder */}
          <div 
            onClick={handleSelectInput}
            className="glass p-6 rounded-2xl flex flex-col gap-4 cursor-pointer hover:bg-white/80 transition-colors group"
          >
            <div className="flex items-center gap-3 text-slate-700">
              <FolderInput className="text-primary-500" size={24} />
              <h2 className="font-semibold text-lg">Source Folder</h2>
            </div>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Select input folder..." 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 outline-none group-hover:border-primary-500 transition-all cursor-pointer text-sm"
                value={inputPath}
                readOnly
              />
              <button 
                className="absolute right-2 top-1.5 btn-secondary !py-1.5 text-xs pointer-events-none"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Output Folder */}
          <div 
            onClick={handleSelectOutput}
            className="glass p-6 rounded-2xl flex flex-col gap-4 cursor-pointer hover:bg-white/80 transition-colors group"
          >
            <div className="flex items-center gap-3 text-slate-700">
              <FolderOutput className="text-emerald-500" size={24} />
              <h2 className="font-semibold text-lg">Destination Folder</h2>
            </div>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Select output folder..." 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 outline-none group-hover:border-primary-500 transition-all cursor-pointer text-sm"
                value={outputPath}
                readOnly
              />
              <button 
                className="absolute right-2 top-1.5 btn-secondary !py-1.5 text-xs pointer-events-none"
              >
                Browse
              </button>
            </div>
          </div>
        </div>

        {/* Status Area */}
        <div className="flex-1 glass rounded-3xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
          {status === 'idle' && (
            <>
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4 animate-pulse">
                <FileText size={40} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Ready to anonymize</h3>
              <p className="text-slate-500 max-w-sm mb-8 text-sm">
                Configure your folder paths to start processing your documents securely.
              </p>
              <div className="flex bg-slate-100 p-1 rounded-xl mb-8">
                <button 
                  onClick={() => setMode('default')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'default' ? 'bg-white shadow-sm text-primary-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Default
                </button>
                <button 
                  onClick={() => setMode('aggressive')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'aggressive' ? 'bg-white shadow-sm text-primary-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Aggressive
                </button>
              </div>

              <button 
                onClick={handleStart}
                className="btn-primary flex items-center gap-2 py-4 px-10 rounded-2xl text-lg group"
                disabled={isProcessing || !inputPath || !outputPath}
              >
                Start Batch <Play size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
              
              <div className="mt-6 flex items-center gap-4 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                <span>PDF</span>
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <span>DOCX</span>
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <span>TXT</span>
              </div>
            </>
          )}

          {status === 'processing' && (
            <div className="w-full max-w-md">
              <div className="flex justify-between items-end mb-4">
                <div className="text-left">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Loader2 className="animate-spin text-primary-500" size={20} />
                    Processing documents...
                  </h3>
                  <p className="text-sm text-slate-500">Current file: {currentFile || 'Initializing...'}</p>
                </div>
                <span className="font-bold text-primary-600">{progress}%</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary-600 transition-all duration-300 ease-out shadow-lg shadow-primary-200"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-slate-400 mt-6 flex items-center justify-center gap-1 uppercase tracking-wider font-bold">
                <Shield size={12} /> 100% Local Privacy. No data leaves your computer.
              </p>
            </div>
          )}

          {status === 'done' && (
            <div className="animate-in zoom-in duration-300">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-4 mx-auto">
                <CheckCircle2 size={44} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Done!</h3>
              <p className="text-slate-500 max-w-sm mb-8 mx-auto text-sm">
                All documents have been anonymized in the destination folder.
              </p>
              <div className="flex gap-4 justify-center">
                <button onClick={reset} className="btn-secondary">Go Back</button>
                <button 
                  onClick={() => window.electronAPI.openFolder(outputPath)} 
                  className="btn-primary"
                >
                  Open Folder
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
