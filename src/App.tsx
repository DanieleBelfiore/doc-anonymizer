import React, { useState } from 'react';
import './App.css';
import
{
  Shield,
  FolderInput,
  FolderOutput,
  Play,
  CircleCheck,
  LoaderCircle,
  FileText,
  ExternalLink,
  TriangleAlert,
  CircleX,
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
    <div className="app">
      {/* Sidebar */}
      <div className="app__sidebar">
        <img src="./logo.svg" alt="Doc Anonymizer" className="app__logo" />
      </div>

      {/* Main Content */}
      <main className="app__main">
        <header className="app__header">
          <h1 className="app__title">Doc Anonymizer</h1>
          <p className="app__subtitle">Protect your sensitive data locally.</p>
        </header>

        <div className="folders">
          {/* Input Folder */}
          <div
            onClick={handleSelectInput}
            className="glass folder-card"
          >
            <div className="folder-card__head">
              <FolderInput className="folder-card__icon" size={24} />
              <h2 className="folder-card__title">Source Folder</h2>
            </div>
            <div className="folder-card__field">
              <input
                type="text"
                placeholder="Select input folder..."
                className="folder-card__input"
                value={inputPath}
                readOnly
              />
              <button
                className="btn-secondary folder-card__browse"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Output Folder */}
          <div
            onClick={handleSelectOutput}
            className="glass folder-card"
          >
            <div className="folder-card__head">
              <FolderOutput className="folder-card__icon folder-card__icon--out" size={24} />
              <h2 className="folder-card__title">Destination Folder</h2>
            </div>
            <div className="folder-card__field">
              <input
                type="text"
                placeholder="Select output folder..."
                className="folder-card__input"
                value={outputPath}
                readOnly
              />
              <button
                className="btn-secondary folder-card__browse"
              >
                Browse
              </button>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="alert alert--page">
            <CircleX size={16} />
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="alert__close">✕</button>
          </div>
        )}

        {/* Status Area */}
        <div className="glass status">
          {status === 'idle' && (
            <>
              <div className="status__icon status__icon--idle pulse">
                <FileText size={40} />
              </div>
              <h3 className="status__title">Ready to anonymize</h3>
              <p className="status__text">
                Configure your folder paths to start processing your documents securely.
              </p>

              {(engineState === 'checking' || engineState === 'starting') && (
                <div className="engine-note">
                  <LoaderCircle size={16} className="spin" />
                  Starting local AI engine...
                </div>
              )}

              {engineState === 'needs_model' && (
                <div className="model-offer">
                  <Cpu className="model-offer__icon" size={28} />
                  <p className="model-offer__text">
                    The local AI model ({engineModel}) isn't downloaded yet. This is a one-time download (~7.2GB); everything runs offline afterwards.
                  </p>
                  <button onClick={handleDownloadModel} className="btn-primary model-offer__button">
                    <Download size={16} /> Download AI model
                  </button>
                </div>
              )}

              {engineState === 'downloading' && (
                <div className="pull">
                  <div className="pull__head">
                    <span className="pull__status">{pullStatus || 'Downloading...'}</span>
                    <span className="pull__pct">{pullPercentage}%</span>
                  </div>
                  <div className="progress">
                    <div
                      className="progress__bar"
                      style={{ width: `${pullPercentage}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {engineState === 'error' && (
                <div className="alert alert--engine">
                  <CircleX size={16} />
                  <span>{engineError || 'Local AI engine unavailable.'}</span>
                </div>
              )}

              <button
                onClick={handleStart}
                className="btn-primary start"
                disabled={!inputPath || !outputPath || engineState !== 'ready'}
              >
                Start <Play size={20} className="start__icon" />
              </button>

              <div className="formats">
                <span>PDF</span>
                <span className="formats__dot"></span>
                <span>DOCX</span>
                <span className="formats__dot"></span>
                <span>TXT</span>
              </div>
            </>
          )}

          {status === 'processing' && (
            <div className="processing">
              <div className="processing__head">
                <div className="processing__info">
                  <h3 className="processing__title">
                    <LoaderCircle className="spin processing__spinner" size={20} />
                    Processing documents...
                  </h3>
                  <p className="processing__file">Current file: {currentFile || 'Initializing...'}</p>
                </div>
                <span className="processing__pct">{progress}%</span>
              </div>
              <div className="progress progress--lg">
                <div
                  className="progress__bar progress__bar--glow"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <div className="processing__actions">
                <button onClick={handleCancel} className="btn-secondary processing__cancel">
                  Cancel
                </button>
              </div>
              <p className="processing__note">
                <Shield size={12} /> 100% Local Processing. Your documents never leave your computer.
              </p>
            </div>
          )}

          {status === 'done' && (
            <div className="done">
              <div className="status__icon status__icon--done">
                <CircleCheck size={44} />
              </div>
              <h3 className="status__title status__title--done">Done!</h3>
              <p className="status__text status__text--done">
                All documents have been processed in the destination folder.
              </p>
              {warnings.length > 0 && (
                <div className="warnings">
                  <div className="warnings__head">
                    <TriangleAlert size={14} />
                    {warnings.length} file{warnings.length > 1 ? 's' : ''} skipped
                  </div>
                  <ul className="warnings__list">
                    {warnings.map((w, i) => (
                      <li key={i} className="warnings__item"><span className="warnings__file">{w.file}</span>: {w.error}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="done__actions">
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

        <footer className="app__footer">
          <div>Version {version}</div>
          {newVersion && (
            <button
              onClick={() => window.electronAPI.openExternal('https://github.com/DanieleBelfiore/doc-anonymizer/releases/latest')}
              className="update-link"
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
