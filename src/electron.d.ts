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

type ProgressCallback = (data: ProgressData) => void;
type WarnCallback = (data: WarnData) => void;

// Raw ipcRenderer handler types — used only for removeListener calls
type ProgressHandler = (event: unknown, value: ProgressData) => void;
type WarnHandler = (event: unknown, value: WarnData) => void;

export interface IElectronAPI {
  selectFolder: () => Promise<string | null>;
  startAnonymization: (params: { inputPath: string; outputPath: string; mode: 'default' | 'aggressive' }) => Promise<{ success: boolean }>;
  openFolder: (path: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
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
