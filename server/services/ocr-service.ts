import { createWorker } from 'tesseract.js';

export interface OCRResult {
  text: string;
  confidence: number;
  lines: string[];
}

export interface IOCRService {
  name: string;
  isAvailable(): Promise<boolean>;
  recognizePage(imageBuffer: Buffer | Uint8Array): Promise<OCRResult>;
  terminate(): Promise<void>;
}

export class TesseractOCRService implements IOCRService {
  public readonly name = 'Tesseract.js';
  private worker: any = null;
  private isInitializing: boolean = false;

  private async getWorker() {
    if (this.worker) return this.worker;
    if (this.isInitializing) {
      // Wait if currently initializing
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (this.worker) return this.worker;
    }

    try {
      this.isInitializing = true;
      const worker = await createWorker('eng');
      this.worker = worker;
      this.isInitializing = false;
      return this.worker;
    } catch (err) {
      this.isInitializing = false;
      console.error('[OCRService] Failed to initialize Tesseract worker:', err);
      throw err;
    }
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await this.getWorker();
      return true;
    } catch {
      return false;
    }
  }

  public async recognizePage(imageBuffer: Buffer | Uint8Array): Promise<OCRResult> {
    try {
      const worker = await this.getWorker();
      const result = await worker.recognize(imageBuffer);
      const text = result.data.text || '';
      const confidence = result.data.confidence || 0;
      const lines = text
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);

      return {
        text,
        confidence,
        lines,
      };
    } catch (err: any) {
      console.error('[OCRService] OCR processing error:', err.message);
      return {
        text: '',
        confidence: 0,
        lines: [],
      };
    }
  }

  public async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

// Export singleton default instance
export const ocrService: IOCRService = new TesseractOCRService();
