import { createWorker } from 'tesseract.js';
import { config } from '../config.js';

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
  private isBusy: boolean = false;
  private queue: Array<() => void> = [];

  private async acquireLock(): Promise<void> {
    if (!this.isBusy) {
      this.isBusy = true;
      return;
    }
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
    this.isBusy = true;
  }

  private releaseLock(): void {
    this.isBusy = false;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  private async getWorker() {
    if (this.worker) return this.worker;
    if (this.isInitializing) {
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
      const ocrInitErr: any = new Error('Failed to initialize local OCR engine.');
      ocrInitErr.code = 'OCR_FAILED';
      throw ocrInitErr;
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
    await this.acquireLock();

    try {
      const worker = await this.getWorker();

      // Bounded timeout per page
      const timeoutMs = config.ocrTimeoutMs || 30000;
      const recognitionPromise = (async () => {
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
      })();

      const timeoutPromise = new Promise<OCRResult>((_, reject) => {
        setTimeout(() => {
          const timeoutErr: any = new Error(`OCR processing timed out after ${Math.round(timeoutMs / 1000)}s.`);
          timeoutErr.code = 'OCR_TIMEOUT';
          reject(timeoutErr);
        }, timeoutMs);
      });

      return await Promise.race([recognitionPromise, timeoutPromise]);
    } catch (err: any) {
      console.error('[OCRService] OCR processing error:', err.message);

      // If worker timed out or crashed, restart worker cleanly
      if (err.code === 'OCR_TIMEOUT') {
        await this.terminate();
      }

      return {
        text: '',
        confidence: 0,
        lines: [],
      };
    } finally {
      this.releaseLock();
    }
  }

  public async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch (err: any) {
        console.error('[OCRService] Error terminating worker:', err.message);
      } finally {
        this.worker = null;
        this.isInitializing = false;
      }
    }
  }
}

// Export singleton default instance
export const ocrService: IOCRService = new TesseractOCRService();
