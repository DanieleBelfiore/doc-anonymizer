export interface ProgressData {
  status: 'progress';
  current: number;
  total: number;
  percentage: number;
  file: string;
}

type ProgressHandler = (event: unknown, value: ProgressData) => void;

export interface IElectronAPI {
  selectFolder: () => Promise<string | null>;
  startAnonymization: (params: { inputPath: string; outputPath: string; mode: 'default' | 'aggressive' }) => Promise<{ success: boolean }>;
  openFolder: (path: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  onProgress: (callback: (data: ProgressData) => void) => ProgressHandler;
  offProgress: (handler: ProgressHandler) => void;
}


declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
