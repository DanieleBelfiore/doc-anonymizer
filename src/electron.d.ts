export interface IElectronAPI {
  selectFolder: () => Promise<string | null>;
  startAnonymization: (params: { inputPath: string; outputPath: string; mode: 'strict' | 'balanced' }) => Promise<{ success: boolean }>;
  openFolder: (path: string) => Promise<void>;
  onProgress: (callback: (data: any) => void) => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
