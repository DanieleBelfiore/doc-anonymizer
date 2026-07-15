export interface ProgressData {
  status: 'progress';
  current: number;
  total: number;
  percentage: number;
  file: string;
}

export interface WarnData {
  status: 'warning';
  file: string;
  error: string;
}

export interface EngineStatus {
  running: boolean;
  modelPresent: boolean;
  model: string;
}

export interface PullProgressData {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

type ProgressCallback = (data: ProgressData) => void;
type WarnCallback = (data: WarnData) => void;
type PullProgressCallback = (data: PullProgressData) => void;

// Raw ipcRenderer handler types — used only for removeListener calls
type ProgressHandler = (event: unknown, value: ProgressData) => void;
type WarnHandler = (event: unknown, value: WarnData) => void;
type PullProgressHandler = (event: unknown, value: PullProgressData) => void;

export interface IElectronAPI {
  selectFolder: () => Promise<string | null>;
  startAnonymization: (params: { inputPath: string; outputPath: string }) => Promise<{ success: boolean }>;
  cancelAnonymization: () => Promise<{ cancelled: boolean }>;
  openFolder: (path: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;

  checkEngine: () => Promise<EngineStatus>;
  pullEngineModel: () => Promise<{ success: boolean; model: string }>;
  onEnginePullProgress: (callback: PullProgressCallback) => PullProgressHandler;
  offEnginePullProgress: (handler: PullProgressHandler) => void;

  onProgress: (callback: ProgressCallback) => ProgressHandler;
  offProgress: (handler: ProgressHandler) => void;
  onWarning: (callback: WarnCallback) => WarnHandler;
  offWarning: (handler: WarnHandler) => void;
}


declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
