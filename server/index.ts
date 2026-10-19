import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { PDFParser } from './services/pdf-parser.js';
import { TableExtractor } from './services/table-extractor.js';
import { KVExtractor } from './services/kv-extractor.js';
import { DocumentClassifier } from './services/document-classifier.js';
import { LocalExtractor } from './services/local-extractor.js';
import { AIService } from './services/ai-service.js';
import { JSONValidator } from './services/json-validator.js';
import { SchemaValidator } from './services/schema-validator.js';
import { ocrService } from './services/ocr-service.js';
import { InvariantChecker } from './services/invariant-checker.js';
import { TestPDFGenerator } from './utils/test-pdf-generator.js';
import {
  ExtractionResult,
  ExtractionOptions,
  DiagnosticsData,
  StageTimings,
} from './types.js';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024,
    files: 1,
  },
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));

/**
 * Standardized API Error Response Helper
 */
function sendStandardError(res: express.Response, statusCode: number, code: string, message: string) {
  return res.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
}

/**
 * Health check & runtime config
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0-rc.1',
    defaultEngine: config.defaultEngine,
    ocrAvailable: true,
    aiProviders: ['ollama', 'gemini', 'openai'],
    privacyNotice:
      '100% Local / Offline extraction by default. Grounded extraction — values are derived from document content.',
    limits: {
      maxFileSizeMb: config.maxFileSizeMb,
      maxPdfPages: config.maxPdfPages,
      maxOcrPages: config.maxOcrPages,
    },
  });
});

/**
 * Get basic PDF information (fast inspection)
 */
app.post('/api/upload-info', (req, res, next) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendStandardError(
          res,
          413,
          'PDF_TOO_LARGE',
          `File size exceeds maximum allowed limit of ${config.maxFileSizeMb}MB.`
        );
      }
      return sendStandardError(res, 400, 'INVALID_FILE_TYPE', err.message || 'File upload error.');
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return sendStandardError(res, 400, 'INVALID_FILE_TYPE', 'No PDF file uploaded.');
    }

    if (
      req.file.mimetype !== 'application/pdf' &&
      !req.file.originalname.toLowerCase().endsWith('.pdf')
    ) {
      return sendStandardError(
        res,
        400,
        'INVALID_PDF',
        'Unsupported file type. Please upload a valid PDF document.'
      );
    }

    const intermediateDoc = await PDFParser.parse(req.file.buffer, {
      fileName: req.file.originalname,
      fileSizeBytes: req.file.size,
    });

    return res.json({
      success: true,
      metadata: intermediateDoc.metadata,
    });
  } catch (err: any) {
    console.error('[Upload-Info] Error reading PDF:', err.message);
    const code = err.code || 'INVALID_PDF';
    const status = code === 'PDF_TOO_LARGE' ? 413 : code === 'PDF_PASSWORD_PROTECTED' ? 401 : 400;
    return sendStandardError(res, status, code, err.message || 'Corrupted or unreadable document.');
  }
});

/**
 * Full PDF to JSON Extraction Pipeline with Stage-by-Stage Diagnostics & Invariant Checks
 */
app.post('/api/extract', (req, res, next) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendStandardError(
          res,
          413,
          'PDF_TOO_LARGE',
          `File size exceeds maximum allowed limit of ${config.maxFileSizeMb}MB.`
        );
      }
      return sendStandardError(res, 400, 'INVALID_FILE_TYPE', err.message || 'File upload error.');
    }
    next();
  });
}, async (req, res) => {
  const overallStartTime = Date.now();
  const stageTimings: StageTimings = {};

  try {
    if (!req.file) {
      return sendStandardError(res, 400, 'INVALID_FILE_TYPE', 'No PDF file uploaded.');
    }

    let options: ExtractionOptions = {
      engine: config.defaultEngine,
    };

    if (req.body.options) {
      try {
        options =
          typeof req.body.options === 'string'
            ? JSON.parse(req.body.options)
            : req.body.options;
      } catch {
        // Use default
      }
    }

    // Stage 1 & 2: Parse PDF layout, detect scans, and apply OCR fallback
    const t0 = Date.now();
    const enableOcr = req.body.enableOcr !== 'false';
    const intermediateDoc = await PDFParser.parse(req.file.buffer, {
      fileName: req.file.originalname,
      fileSizeBytes: req.file.size,
      enableOcrFallback: enableOcr,
    });
    stageTimings.pdfParsingMs = Date.now() - t0;
    stageTimings.ocrMs = intermediateDoc.metadata.ocrApplied ? (Date.now() - t0) : 0;

    // Stage 3: Extract Tables with coordinate layout & multi-page continuation
    const tTableStart = Date.now();
    const tables = TableExtractor.extractTables(intermediateDoc);
    intermediateDoc.tables = tables;
    stageTimings.tableExtractionMs = Date.now() - tTableStart;

    // Stage 4: Extract Key-Value Pairs, Lists, and Section hierarchy
    const tKVStart = Date.now();
    const { keyValuePairs, lists, sections } = KVExtractor.extract(
      intermediateDoc,
      tables
    );
    intermediateDoc.keyValuePairs = keyValuePairs;
    intermediateDoc.lists = lists;
    intermediateDoc.sections = sections;
    stageTimings.kvExtractionMs = Date.now() - tKVStart;

    // Stage 5: Document Classification
    const tClassStart = Date.now();
    const classification = DocumentClassifier.classify(
      intermediateDoc,
      tables,
      keyValuePairs
    );
    stageTimings.classificationMs = Date.now() - tClassStart;

    // Stage 6: Semantic & Structural Extraction
    const tSemStart = Date.now();
    let semanticJson: Record<string, any> = {};
    let structuralJson: any = {};
    let provenanceMap: Record<string, any> = {};
    let engineUsed = options.engine || 'local';
    let aiProviderUsed = options.aiProvider;

    if (engineUsed === 'ai' && options.aiProvider) {
      const provider = AIService.getProvider(options.aiProvider);
      if (provider) {
        const aiResult = await provider.extract(intermediateDoc, options);
        if (aiResult.rawJson) {
          const validated = JSONValidator.validateAndRepair(aiResult.rawJson);
          semanticJson = validated.data as Record<string, any>;
        } else {
          console.warn(
            `[Extraction] AI Provider ${options.aiProvider} failed (${aiResult.error}). Falling back to local engine.`
          );
          const localResult = LocalExtractor.transform(
            intermediateDoc,
            classification.documentType,
            tables,
            keyValuePairs,
            lists,
            sections,
            { includeMetadata: options.includeMetadata }
          );
          semanticJson = localResult.semanticJson;
          structuralJson = localResult.structuralJson;
          provenanceMap = localResult.provenanceMap;
          engineUsed = 'local';
        }
      }
    }

    if (Object.keys(semanticJson).length === 0) {
      if (options.customSchema) {
        const customTemplate =
          typeof options.customSchema === 'string'
            ? JSON.parse(options.customSchema)
            : options.customSchema;

        semanticJson = SchemaValidator.mapToCustomSchema(
          customTemplate,
          keyValuePairs,
          tables,
          intermediateDoc
        );
      } else {
        const localResult = LocalExtractor.transform(
          intermediateDoc,
          classification.documentType,
          tables,
          keyValuePairs,
          lists,
          sections,
          { includeMetadata: options.includeMetadata }
        );
        semanticJson = localResult.semanticJson;
        structuralJson = localResult.structuralJson;
        provenanceMap = localResult.provenanceMap;
      }
    }
    stageTimings.semanticTransformationMs = Date.now() - tSemStart;

    // Stage 7: Final JSON Validation & Repair
    const tValStart = Date.now();
    const validationResult = JSONValidator.validateAndRepair(semanticJson);
    stageTimings.validationMs = Date.now() - tValStart;

    const totalExecutionTimeMs = Date.now() - overallStartTime;
    stageTimings.totalMs = totalExecutionTimeMs;

    // Stage 8: Extraction Invariants Verification
    const invariantsCheck = InvariantChecker.verifyInvariants(
      intermediateDoc,
      provenanceMap,
      validationResult.data as Record<string, any>
    );

    // Build Diagnostics Data
    const diagnosticsData: DiagnosticsData = {
      pages: intermediateDoc.pages.map((p) => ({
        page: p.pageNumber,
        dimensions: { width: p.width, height: p.height },
        textItemCount: p.textItems.length,
        lineCount: p.lines.length,
        isScanned: p.isScanned,
        ocrUsed: !!p.ocrApplied,
        columnRegionsDetected: p.regions.length,
        detectedHeadings: p.detectedHeadings,
        detectedKeyValues: p.detectedKeyValues.map((kv) => ({
          key: kv.key,
          value: kv.value,
          confidence: kv.confidence,
          bbox: kv.provenance.boundingBox,
        })),
        detectedTables: p.detectedTables.map((t) => ({
          tableId: t.id,
          headers: t.headers,
          rowCount: t.rows.length,
          confidence: t.confidence,
          sourcePages: t.pages,
          bbox: t.boundingBox,
        })),
      })),
      classifierScores: classification.allScores || ({} as any),
      stageTimings,
      invariantsCheck,
    };

    const finalResponse: ExtractionResult = {
      success: true,
      documentType: classification.documentType,
      classificationConfidence: classification.confidence,
      classifierReasons: classification.reasons,
      engineUsed,
      aiProviderUsed: engineUsed === 'ai' ? aiProviderUsed : undefined,
      executionTimeMs: totalExecutionTimeMs,
      stageTimings,
      metadata: intermediateDoc.metadata,
      semanticJson: validationResult.data as Record<string, any>,
      structuralJson: structuralJson || {
        document_type: classification.documentType,
        metadata: intermediateDoc.metadata,
        sections: [],
      },
      provenanceMap,
      diagnostics: diagnosticsData,
      validation: {
        isValidJson: validationResult.isValid,
        repaired: validationResult.repaired,
        errors: validationResult.errors,
      },
    };

    return res.json(finalResponse);
  } catch (err: any) {
    console.error('[Extraction Pipeline] Error:', err.message);
    const code = err.code || 'EXTRACTION_FAILED';
    const status =
      code === 'PDF_TOO_LARGE'
        ? 413
        : code === 'PDF_PASSWORD_PROTECTED'
        ? 401
        : code === 'PDF_PAGE_LIMIT_EXCEEDED'
        ? 413
        : code === 'SCHEMA_TOO_LARGE'
        ? 413
        : code === 'SCHEMA_INVALID' || code === 'INVALID_PDF'
        ? 400
        : 500;

    return sendStandardError(
      res,
      status,
      code,
      err.message || 'An unexpected error occurred during document extraction.'
    );
  }
});

/**
 * Endpoint to serve test PDF samples
 */
app.get('/api/sample/:type', async (req, res) => {
  try {
    const type = req.params.type;
    let pdfBuffer: Buffer;
    let filename = 'sample.pdf';

    switch (type) {
      case 'invoice':
        pdfBuffer = await TestPDFGenerator.createInvoicePDF();
        filename = 'sample_invoice.pdf';
        break;
      case 'multipage':
        pdfBuffer = await TestPDFGenerator.createMultiPageBankStatement();
        filename = 'sample_multipage_statement.pdf';
        break;
      case 'resume':
        pdfBuffer = await TestPDFGenerator.createResumePDF();
        filename = 'sample_resume.pdf';
        break;
      default:
        pdfBuffer = await TestPDFGenerator.createInvoicePDF();
        filename = 'sample.pdf';
        break;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    return sendStandardError(res, 500, 'EXTRACTION_FAILED', `Failed to generate sample PDF: ${err.message}`);
  }
});

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`[PDF to JSON Agent] Server listening on http://localhost:${PORT}`);
  console.log(
    `[Privacy Mode] Default engine is set to "${config.defaultEngine}" (100% Local / Grounded Extraction)`
  );
});
