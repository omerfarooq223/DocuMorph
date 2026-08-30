import {
  IntermediateDocument,
  DocumentType,
  AIProvider,
  ExtractionOptions,
} from '../types.js';
import { JSONValidator } from './json-validator.js';

export interface IAIExtractionProvider {
  name: AIProvider;
  extract(
    intermediateDoc: IntermediateDocument,
    options: ExtractionOptions
  ): Promise<{ rawJson: string; error?: string }>;
}

/**
 * Ollama Provider (100% Local AI / Offline server)
 */
export class OllamaProvider implements IAIExtractionProvider {
  public readonly name: AIProvider = 'ollama';

  public async extract(
    intermediateDoc: IntermediateDocument,
    options: ExtractionOptions
  ): Promise<{ rawJson: string; error?: string }> {
    const baseUrl = options.ollamaUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const model = options.ollamaModel || process.env.OLLAMA_MODEL || 'llama3.2';

    const prompt = AIService.buildPrompt(intermediateDoc, options.customSchema);

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: 'json',
          options: {
            temperature: 0.0, // Strict zero temperature
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed with HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { rawJson: data.response || '' };
    } catch (err: any) {
      return {
        rawJson: '',
        error: `Ollama connection error: ${err.message}. Ensure Ollama is running at ${baseUrl}.`,
      };
    }
  }
}

/**
 * Gemini Provider (Google Gemini API)
 */
export class GeminiProvider implements IAIExtractionProvider {
  public readonly name: AIProvider = 'gemini';

  public async extract(
    intermediateDoc: IntermediateDocument,
    options: ExtractionOptions
  ): Promise<{ rawJson: string; error?: string }> {
    const apiKey = options.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { rawJson: '', error: 'Gemini API key is not configured.' };
    }

    const modelName = options.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const prompt = AIService.buildPrompt(intermediateDoc, options.customSchema);

    try {
      // Use standard Gemini REST endpoint for maximum portability
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.0,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { rawJson: content };
    } catch (err: any) {
      return { rawJson: '', error: `Gemini extraction failed: ${err.message}` };
    }
  }
}

/**
 * OpenAI Provider
 */
export class OpenAIProvider implements IAIExtractionProvider {
  public readonly name: AIProvider = 'openai';

  public async extract(
    intermediateDoc: IntermediateDocument,
    options: ExtractionOptions
  ): Promise<{ rawJson: string; error?: string }> {
    const apiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { rawJson: '', error: 'OpenAI API key is not configured.' };
    }

    const modelName = options.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const prompt = AIService.buildPrompt(intermediateDoc, options.customSchema);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          temperature: 0.0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are a strict document extraction assistant. Extract grounded information from the document text into structured JSON. Never hallucinate or guess missing information. Use null for missing fields.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      return { rawJson: content };
    } catch (err: any) {
      return { rawJson: '', error: `OpenAI extraction failed: ${err.message}` };
    }
  }
}

/**
 * AI Orchestration Service
 */
export class AIService {
  private static providers: Map<AIProvider, IAIExtractionProvider> = new Map([
    ['ollama', new OllamaProvider()],
    ['gemini', new GeminiProvider()],
    ['openai', new OpenAIProvider()],
  ]);

  public static getProvider(name: AIProvider): IAIExtractionProvider | undefined {
    return this.providers.get(name);
  }

  public static buildPrompt(
    doc: IntermediateDocument,
    customSchema?: string | Record<string, any> | null
  ): string {
    const customSchemaInstruction = customSchema
      ? `\n\nCUSTOM SCHEMA REQUIREMENT:\nYou MUST conform your output to this exact JSON structure/template:\n${
          typeof customSchema === 'string' ? customSchema : JSON.stringify(customSchema, null, 2)
        }\nFill available fields from the document. For fields not present in the document, use null or empty array []. DO NOT hallucinate missing fields.`
      : '';

    return `You are a precision PDF-to-JSON document extraction agent.

EXTRACTION PHILOSOPHY & MANDATORY RULES:
1. GROUNDED EXTRACTION ONLY: Extract ONLY information found in the document text and layout below.
2. DO NOT HALLUCINATE OR INVENT any details, dates, totals, names, or numbers.
3. If a field or value is not explicitly present in the document, set it to null or omit it.
4. Preserve numbers as JSON numbers (e.g. 35.50), not strings, where applicable.
5. Preserve booleans as JSON booleans (true/false).
6. Tables MUST be extracted as arrays of objects with clear column keys whenever headers exist.
7. Return ONLY clean, valid JSON without explanations or markdown fences.
${customSchemaInstruction}

DOCUMENT METADATA:
File Name: ${doc.metadata.fileName}
Pages: ${doc.metadata.pageCount}

DOCUMENT TEXT & LAYOUT BLOCKS:
${doc.allTextBlocks.map((b) => `[Page ${b.page}] ${b.isHeading ? `HEADING: ` : ''}${b.text}`).join('\n\n')}

EXTRACTED JSON:`;
  }
}
