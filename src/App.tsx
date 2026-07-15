import React, { useState } from 'react';
import
{
  Shield,
  FolderInput,
  FolderOutput,
  Play,
  CheckCircle2,
  Loader2,
  FileText,
  ExternalLink,
  AlertTriangle,
  XCircle,
  Cpu,
  Download
} from 'lucide-react';

type EngineState = 'checking' | 'starting' | 'needs_model' | 'downloading' | 'ready' | 'error';

function App()
{
  const [inputPath, setInputPath] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'done'>('idle');
  const [version, setVersion] = useState('');
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<Array<{ file: string; error: string }>>([]);

  const [engineState, setEngineState] = useState<EngineState>('checking');
  const [engineModel, setEngineModel] = useState('');
  const [engineError, setEngineError] = useState<string | null>(null);
  const [pullStatus, setPullStatus] = useState('');
  const [pullPercentage, setPullPercentage] = useState(0);

  React.useEffect(() =>
  {
    const progressHandler = window.electronAPI.onProgress((data) =>
    {
      setProgress(data.percentage);
      setCurrentFile(data.file);
    });

    const warningHandler = window.electronAPI.onWarning((data) =>
    {
      setWarnings((prev) => [...prev, { file: data.file, error: data.error }]);
    });

    // Check for version and updates
    const initApp = async () =>
    {
      const v = await window.electronAPI.getAppVersion();
      setVersion(v);

      try
      {
        // Fetch latest release from GitHub
        const response = await fetch('https://api.github.com/repos/DanieleBelfiore/doc-anonymizer/releases/latest');

        if (response.ok)
        {
          const data = await response.json();
          if (data && data.tag_name)
          {
            const latestTag = data.tag_name.replace(/^v/, '');
            const a = latestTag.split('.').map(Number);
            const b = v.split('.').map(Number);
            let isNewer = false;
            for (let i = 0; i < Math.max(a.length, b.length); i++) {
              const diff = (a[i] ?? 0) - (b[i] ?? 0);
              if (diff > 0) { isNewer = true; break; }
              if (diff < 0) break;
            }
            if (isNewer) setNewVersion(latestTag);
          }
        }
      } catch (e)
      {
        console.log('Update check skipped: No releases found or network error');
      }
    };

    initApp();

    return () =>
    {
      window.electronAPI.offProgress(progressHandler);
      window.electronAPI.offWarning(warningHandler);
    };
  }, []);

  // Poll the local AI engine (Ollama sidecar) until it's reachable, then
  // decide whether the model still needs to be downloaded.
  React.useEffect(() =>
  {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30; // ~30s at 1s interval

    const poll = async () =>
    {
      if (cancelled) return;
      try
      {
        const s = await window.electronAPI.checkEngine();
        if (cancelled) return;
        setEngineModel(s.model);

        if (!s.running)
        {
          attempts += 1;
          if (attempts >= maxAttempts)
          {
            setEngineState('error');
            setEngineError('Local AI engine did not start. Is Ollama installed?');
            return;
          }
          setEngineState('starting');
          setTimeout(poll, 1000);
          return;
        }

        setEngineState(s.modelPresent ? 'ready' : 'needs_model');
      } catch (e)
      {
        if (cancelled) return;
        setEngineState('error');
        setEngineError(e instanceof Error ? e.message : 'Failed to reach the local AI engine.');
      }
    };

    poll();
    return () => { cancelled = true; };
  }, []);

  const handleDownloadModel = async () =>
  {
    setEngineState('downloading');
    setEngineError(null);
    setPullStatus('Starting download...');
    setPullPercentage(0);

    const pullHandler = window.electronAPI.onEnginePullProgress((data) =>
    {
      setPullStatus(data.status);
      if (data.total && data.completed)
      {
        setPullPercentage(Math.round((data.completed / data.total) * 100));
      }
    });

    try
    {
      await window.electronAPI.pullEngineModel();
      setEngineState('ready');
    } catch (e)
    {
      setEngineState('error');
      setEngineError(e instanceof Error ? e.message : 'Model download failed.');
    } finally
    {
      window.electronAPI.offEnginePullProgress(pullHandler);
    }
  };

  const handleSelectInput = async () =>
  {
    const path = await window.electronAPI.selectFolder();
    if (path) setInputPath(path);
  };

  const handleSelectOutput = async () =>
  {
    const path = await window.electronAPI.selectFolder();
    if (path) setOutputPath(path);
  };

  const handleStart = async () =>
  {
    if (!inputPath || !outputPath) return;
    if (inputPath === outputPath)
    {
      setErrorMessage('Source and destination folders must be different.');
      return;
    }
    setErrorMessage(null);
    setWarnings([]);
    setStatus('processing');
    setProgress(0);

    try
    {
      await window.electronAPI.startAnonymization({ inputPath, outputPath });
      setStatus('done');
    } catch (error)
    {
      const msg = error instanceof Error ? error.message : 'An error occurred during processing.';
      setStatus('idle');
      // User-initiated cancel isn't an error — reset quietly.
      if (!msg.includes('cancelled')) setErrorMessage(msg);
    }
  };

  const handleCancel = () =>
  {
    window.electronAPI.cancelAnonymization();
  };

  const reset = () =>
  {
    setStatus('idle');
    setProgress(0);
    setWarnings([]);
    setErrorMessage(null);
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-50 font-sans">
      {/* Sidebar */}
      <div className="w-16 flex flex-col items-center py-6 bg-white border-r border-slate-100 shrink-0">
        <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary-200">
          <Shield size={24} />
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-8 overflow-y-auto">
        <header className="mb-6 shrink-0">
          <h1 className="text-3xl font-bold text-slate-800">Doc Anonymizer</h1>
          <p className="text-slate-500 mt-1 text-sm">Protect your sensitive data locally.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 shrink-0">
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

        {errorMessage && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-3 mb-4 text-sm shrink-0">
            <XCircle size={16} className="shrink-0" />
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

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

              {(engineState === 'checking' || engineState === 'starting') && (
                <div className="flex items-center gap-2 bg-slate-100 text-slate-500 text-sm font-medium rounded-xl px-4 py-3 mb-8">
                  <Loader2 size={16} className="animate-spin" />
                  Starting local AI engine...
                </div>
              )}

              {engineState === 'needs_model' && (
                <div className="flex flex-col items-center gap-3 bg-primary-50 border border-primary-100 rounded-2xl px-6 py-5 mb-8 max-w-sm">
                  <Cpu className="text-primary-500" size={28} />
                  <p className="text-sm text-slate-600 text-center">
                    The local AI model ({engineModel}) isn't downloaded yet. This is a one-time download (~7.2GB); everything runs offline afterwards.
                  </p>
                  <button onClick={handleDownloadModel} className="btn-primary flex items-center gap-2 !py-2 !px-5 text-sm">
                    <Download size={16} /> Download AI model
                  </button>
                </div>
              )}

              {engineState === 'downloading' && (
                <div className="w-full max-w-sm mb-8">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm font-medium text-slate-600 truncate">{pullStatus || 'Downloading...'}</span>
                    <span className="font-bold text-primary-600 text-sm shrink-0 ml-2">{pullPercentage}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-600 transition-all duration-300 ease-out"
                      style={{ width: `${pullPercentage}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {engineState === 'error' && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-3 mb-8 text-sm max-w-sm">
                  <XCircle size={16} className="shrink-0" />
                  <span>{engineError || 'Local AI engine unavailable.'}</span>
                </div>
              )}

              <button
                onClick={handleStart}
                className="btn-primary flex items-center gap-2 py-4 px-10 rounded-2xl text-lg group"
                disabled={status === 'processing' || !inputPath || !outputPath || engineState !== 'ready'}
              >
                Start <Play size={20} className="group-hover:translate-x-1 transition-transform" />
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
              <div className="flex justify-center mt-6">
                <button onClick={handleCancel} className="btn-secondary !py-2 !px-6 text-sm">
                  Cancel
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-6 flex items-center justify-center gap-1 uppercase tracking-wider font-bold">
                <Shield size={12} /> 100% Local Processing. Your documents never leave your computer.
              </p>
            </div>
          )}

          {status === 'done' && (
            <div className="animate-in zoom-in duration-300 w-full max-w-md">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-4 mx-auto">
                <CheckCircle2 size={44} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Done!</h3>
              <p className="text-slate-500 max-w-sm mb-6 mx-auto text-sm">
                All documents have been processed in the destination folder.
              </p>
              {warnings.length > 0 && (
                <div className="mb-6 text-left bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm mb-2">
                    <AlertTriangle size={14} />
                    {warnings.length} file{warnings.length > 1 ? 's' : ''} skipped
                  </div>
                  <ul className="text-xs text-amber-600 space-y-1">
                    {warnings.map((w, i) => (
                      <li key={i} className="truncate"><span className="font-medium">{w.file}</span>: {w.error}</li>
                    ))}
                  </ul>
                </div>
              )}
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

        <footer className="mt-8 flex justify-between items-center text-[10px] text-slate-400 px-4">
          <div>Version {version}</div>
          {newVersion && (
            <button
              onClick={() => window.electronAPI.openExternal('https://github.com/DanieleBelfiore/doc-anonymizer/releases/latest')}
              className="flex items-center gap-1 text-primary-600 font-bold hover:underline"
            >
              <ExternalLink size={10} /> New version available: v{newVersion}
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}

export default App;
