import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  defaultEngine: (process.env.DEFAULT_ENGINE as 'local' | 'ai') || 'local',
  
  // OCR threshold: if a page has fewer than this many characters, flag as candidate for OCR
  scannedTextDensityThreshold: 50,
  
  // Resource Safeguards & Limits
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
  maxPdfPages: parseInt(process.env.MAX_PDF_PAGES || '500', 10),
  maxOcrPages: parseInt(process.env.MAX_OCR_PAGES || '50', 10),
  maxRenderPixels: parseInt(process.env.MAX_RENDER_PIXELS || '25000000', 10), // e.g. 5000x5000
  ocrTimeoutMs: parseInt(process.env.OCR_TIMEOUT_MS || '30000', 10),

  // AI Defaults (Optional)
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
};

