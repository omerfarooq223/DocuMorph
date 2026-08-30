/**
 * PDF to JSON Agent - Core Shared Types
 */

export type DocumentType =
  | 'invoice'
  | 'receipt'
  | 'bank_statement'
  | 'resume'
  | 'contract'
  | 'research_paper'
  | 'report'
  | 'form'
  | 'product_catalogue'
  | 'academic_document'
  | 'statement'
  | 'generic';

export type EngineMode = 'local' | 'ai';
export type AIProvider = 'ollama' | 'gemini' | 'openai';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Provenance {
  page: number;
  sourceText: string;
  boundingBox?: BoundingBox;
  confidence?: number;
}

export interface ProvenanceValue<T = any> {
  value: T;
  provenance: Provenance;
}

export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
  fontSize?: number;
  page: number;
}

export interface TextLine {
  text: string;
  y: number;
  minX: number;
  maxX: number;
  height: number;
  items: TextItem[];
  page: number;
}

export interface TextBlock {
  id: string;
  text: string;
  page: number;
  boundingBox: BoundingBox;
  fontSize?: number;
  isHeading?: boolean;
  headingLevel?: number;
  lines: TextLine[];
}

export interface RawTableCell {
  text: string;
  page: number;
  rowIndex: number;
  colIndex: number;
  boundingBox?: BoundingBox;
}

export interface RawTable {
  id: string;
  page: number;
  boundingBox: BoundingBox;
  headers: string[];
  hasReliableHeaders: boolean;
  rows: string[][];
  rawCells: RawTableCell[];
  // Transformed structured objects (when headers exist) or indexed objects
  structuredRows?: Record<string, any>[];
}

export interface KeyValuePair {
  key: string;
  value: string | number | boolean | null;
  rawKey: string;
  rawValue: string;
  provenance: Provenance;
}

export interface ListItem {
  type: 'bullet' | 'numbered';
  marker: string;
  text: string;
  page: number;
  provenance: Provenance;
}

export interface DocumentSection {
  heading: string | null;
  headingLevel?: number;
  page: number;
  content: string;
  tables: RawTable[];
  lists: ListItem[];
  keyValuePairs: KeyValuePair[];
  blocks: TextBlock[];
}

export interface DocumentMetadata {
  fileName: string;
  fileSizeBytes: number;
  pageCount: number;
  title?: string | null;
  author?: string | null;
  creationDate?: string | null;
  isScanned: boolean;
  ocrApplied: boolean;
  detectedLanguage?: string;
  textDensity: number; // characters per page average
}

/**
 * Intermediate Document Representation (IDR)
 * Preserves all coordinates, raw text, detected layout, tables, KV pairs, and provenance.
 */
export interface IntermediateDocument {
  metadata: DocumentMetadata;
  pages: {
    pageNumber: number;
    width: number;
    height: number;
    textLength: number;
    isScanned: boolean;
    textBlocks: TextBlock[];
    lines: TextLine[];
  }[];
  allTextBlocks: TextBlock[];
  tables: RawTable[];
  keyValuePairs: KeyValuePair[];
  lists: ListItem[];
  sections: DocumentSection[];
  rawText: string;
}

export interface ClassificationResult {
  documentType: DocumentType;
  confidence: number;
  reasons: string[];
}

/**
 * Final Extraction Result
 */
export interface ExtractionResult {
  success: boolean;
  documentType: DocumentType;
  classificationConfidence: number;
  engineUsed: EngineMode;
  aiProviderUsed?: AIProvider;
  executionTimeMs: number;
  metadata: DocumentMetadata;
  
  // Output formats
  semanticJson: Record<string, any>;
  structuralJson: {
    document_type: DocumentType;
    metadata: DocumentMetadata;
    sections: Array<{
      heading: string | null;
      content: string;
      tables: Array<{
        headers: string[];
        rows: any[];
      }>;
      lists: string[];
      key_values: Record<string, any>;
    }>;
  };
  
  // Provenance map for drill-down / inspection
  provenanceMap?: Record<string, Provenance>;
  
  // Validation status
  validation: {
    isValidJson: boolean;
    repaired: boolean;
    errors?: string[];
  };
}

export interface ExtractionOptions {
  engine?: EngineMode;
  aiProvider?: AIProvider;
  ollamaUrl?: string;
  ollamaModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  customSchema?: string | Record<string, any> | null;
  outputMode?: 'semantic' | 'structural';
}
