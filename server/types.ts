/**
 * PDF to JSON Agent - Core Shared Types (Phase 2 Hardened)
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
export type SourceMethod = 'pdf_text' | 'ocr';

/**
 * Coordinate Space Contract for Provenance & Bounding Boxes
 * - 'idr_top_left': IDR normalized coordinates (origin at top-left, X right, Y down).
 * - 'pdf_user_space': Native PDF user coordinates (origin at bottom-left, X right, Y up).
 * - 'ocr_image': Pixel coordinates in the rendered raster image used for OCR.
 */
export type CoordinateSpace = 'idr_top_left' | 'pdf_user_space' | 'ocr_image';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ElementRole = 'header' | 'footer' | 'body' | 'heading' | 'table_cell' | 'list_item' | 'form_region';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Provenance {
  page: number;
  sourceText: string;
  sourceValue?: string;
  normalization?: 'number' | 'date' | 'boolean' | 'currency' | 'none';
  boundingBox?: BoundingBox;
  confidence?: ConfidenceLevel;
  sourceMethod?: SourceMethod;
  coordinateSpace?: CoordinateSpace;
  renderDimensions?: { width: number; height: number };
}

export interface ProvenanceValue<T = any> {
  value: T;
  sourceValue?: string;
  normalization?: string;
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
  sourceMethod?: SourceMethod;
}

export interface TextLine {
  text: string;
  y: number;
  minX: number;
  maxX: number;
  height: number;
  items: TextItem[];
  page: number;
  role?: ElementRole;
  columnIndex?: number;
  sourceMethod?: SourceMethod;
}

export interface LayoutRegion {
  type: 'column' | 'header' | 'footer' | 'full_width';
  index?: number;
  boundingBox: BoundingBox;
  lines: TextLine[];
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
  role?: ElementRole;
  lines: TextLine[];
}

export interface RawTableCell {
  text: string;
  sourceText?: string;
  sourceValue?: string;
  page: number;
  sourcePage?: number;
  rowIndex: number;
  colIndex: number;
  boundingBox?: BoundingBox;
  sourceMethod?: SourceMethod;
}

export interface RawTable {
  id: string;
  page: number;
  pages: number[];
  continuedFrom?: string;
  boundingBox: BoundingBox;
  headers: string[];
  hasReliableHeaders: boolean;
  confidence: ConfidenceLevel;
  confidenceScore?: number;
  rows: string[][];
  rawCells: RawTableCell[];
  // Transformed structured objects (when headers exist) or indexed objects
  structuredRows?: Record<string, any>[];
  rowProvenance?: Array<{
    sourcePage: number;
    cells: Record<string, Provenance>;
  }>;
}

export interface KeyValuePair {
  key: string;
  value: string | number | boolean | null;
  rawKey: string;
  rawValue: string;
  sourceValue?: string;
  normalization?: 'number' | 'date' | 'boolean' | 'currency' | 'none';
  confidence: ConfidenceLevel;
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
  hasRepeatedHeaders?: boolean;
  hasRepeatedFooters?: boolean;
  hasMultiColumnLayout?: boolean;
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
    ocrApplied?: boolean;
    textItems: TextItem[];
    textBlocks: TextBlock[];
    lines: TextLine[];
    regions: LayoutRegion[];
    detectedHeadings: string[];
    detectedTables: RawTable[];
    detectedKeyValues: KeyValuePair[];
    ocrResult?: {
      text: string;
      confidence: number;
      lines: string[];
    };
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
  allScores?: Record<DocumentType, { score: number; reasons: string[] }>;
}

export interface StageTimings {
  pdfParsingMs?: number;
  lineReconstructionMs?: number;
  layoutAnalysisMs?: number;
  tableExtractionMs?: number;
  kvExtractionMs?: number;
  classificationMs?: number;
  ocrMs?: number;
  semanticTransformationMs?: number;
  validationMs?: number;
  totalMs?: number;
}

export interface InvariantsCheckResult {
  passed: boolean;
  violations: string[];
}

export interface DiagnosticsData {
  pages: Array<{
    page: number;
    dimensions: { width: number; height: number };
    textItemCount: number;
    lineCount: number;
    isScanned: boolean;
    ocrUsed: boolean;
    columnRegionsDetected: number;
    detectedHeadings: string[];
    detectedKeyValues: Array<{
      key: string;
      value: any;
      confidence: ConfidenceLevel;
      bbox?: BoundingBox;
    }>;
    detectedTables: Array<{
      tableId: string;
      headers: string[];
      rowCount: number;
      confidence: ConfidenceLevel;
      sourcePages: number[];
      bbox: BoundingBox;
    }>;
  }>;
  classifierScores: Record<DocumentType, { score: number; reasons: string[] }>;
  stageTimings: StageTimings;
  invariantsCheck: InvariantsCheckResult;
}

/**
 * Final Extraction Result
 */
export interface ExtractionResult {
  success: boolean;
  documentType: DocumentType;
  classificationConfidence: number;
  classifierReasons?: string[];
  engineUsed: EngineMode;
  aiProviderUsed?: AIProvider;
  executionTimeMs: number;
  stageTimings?: StageTimings;
  metadata: DocumentMetadata;
  
  // Clean Semantic Output (intended for end-users / systems)
  semanticJson: Record<string, any>;

  // Structural / IDR JSON Export
  structuralJson: {
    document_type: DocumentType;
    metadata: DocumentMetadata;
    sections: Array<{
      heading: string | null;
      page: number;
      content: string;
      tables: Array<{
        id?: string;
        headers: string[];
        rows: any[];
        confidence?: ConfidenceLevel;
        sourcePages?: number[];
      }>;
      lists: string[];
      key_values: Record<string, any>;
    }>;
  };
  
  // Provenance Map (available for drill-down / tracing)
  provenanceMap?: Record<string, Provenance>;
  
  // Developer Diagnostics (when requested or in debug view)
  diagnostics?: DiagnosticsData;

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
  includeMetadata?: boolean; // include extraction metadata / provenance in output
  includeDiagnostics?: boolean;
  enableOcr?: boolean;
}
