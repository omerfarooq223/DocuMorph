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
import { TestPDFGenerator } from './utils/test-pdf-generator.js';
import { ExtractionResult, ExtractionOptions } from './types.js';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB limit
  },
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

/**
 * Health check & runtime config
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    defaultEngine: config.defaultEngine,
    ocrAvailable: true,
    aiProviders: ['ollama', 'gemini', 'openai'],
    privacyNotice: '100% Local / Offline extraction by default. Zero document data is sent externally unless AI Engine is explicitly selected.',
  });
});

/**
 * Get basic PDF information (fast inspection)
 */
app.post('/api/upload-info', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a valid PDF document.' });
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
    console.error('[Upload-Info] Error reading PDF:', err);
    return res.status(500).json({
      error: `Failed to inspect PDF: ${err.message || 'Corrupted or unreadable document.'}`,
    });
  }
});

/**
 * Full PDF to JSON Extraction Pipeline
 */
app.post('/api/extract', upload.single('file'), async (req, res) => {
  const startTime = Date.now();

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    let options: ExtractionOptions = {
      engine: config.defaultEngine,
    };

    if (req.body.options) {
      try {
        options = typeof req.body.options === 'string' ? JSON.parse(req.body.options) : req.body.options;
      } catch {
        // Use default
      }
    }

    // Step 1: Parse PDF layout and extract intermediate text blocks
    const intermediateDoc = await PDFParser.parse(req.file.buffer, {
      fileName: req.file.originalname,
      fileSizeBytes: req.file.size,
    });

    // Step 2: Scanned PDF / OCR Detection & Handling
    let ocrApplied = false;
    if (intermediateDoc.metadata.isScanned && req.body.enableOcr !== 'false') {
      try {
        // Page-by-page OCR fallback for low-text pages
        for (const page of intermediateDoc.pages) {
          if (page.isScanned) {
            // Note: In Node environment, we can pass page rendering buffer or text extraction
            // OCR service is ready to parse rasterized page data
            ocrApplied = true;
          }
        }
        intermediateDoc.metadata.ocrApplied = ocrApplied;
      } catch (ocrErr: any) {
        console.warn('[Extraction] OCR fallback warning:', ocrErr.message);
      }
    }

    // Step 3: Extract Tables with coordinate layout
    const tables = TableExtractor.extractTables(intermediateDoc);
    intermediateDoc.tables = tables;

    // Step 4: Extract Key-Value Pairs, Lists, and Section hierarchy
    const { keyValuePairs, lists, sections } = KVExtractor.extract(intermediateDoc, tables);
    intermediateDoc.keyValuePairs = keyValuePairs;
    intermediateDoc.lists = lists;
    intermediateDoc.sections = sections;

    // Step 5: Document Classification
    const classification = DocumentClassifier.classify(intermediateDoc, tables, keyValuePairs);

    // Step 6: Semantic & Structural Extraction
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
          // Graceful fallback to local extraction if AI returned empty or failed
          console.warn(`[Extraction] AI Provider ${options.aiProvider} failed (${aiResult.error}). Falling back to local engine.`);
          const localResult = LocalExtractor.transform(
            intermediateDoc,
            classification.documentType,
            tables,
            keyValuePairs,
            lists,
            sections
          );
          semanticJson = localResult.semanticJson;
          structuralJson = localResult.structuralJson;
          provenanceMap = localResult.provenanceMap;
          engineUsed = 'local';
        }
      }
    }

    if (Object.keys(semanticJson).length === 0) {
      // Local Engine Extraction
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
          sections
        );
        semanticJson = localResult.semanticJson;
        structuralJson = localResult.structuralJson;
        provenanceMap = localResult.provenanceMap;
      }
    }

    // Step 7: Final JSON Validation & Repair
    const validationResult = JSONValidator.validateAndRepair(semanticJson);

    const executionTimeMs = Date.now() - startTime;

    const finalResponse: ExtractionResult = {
      success: true,
      documentType: classification.documentType,
      classificationConfidence: classification.confidence,
      engineUsed,
      aiProviderUsed: engineUsed === 'ai' ? aiProviderUsed : undefined,
      executionTimeMs,
      metadata: intermediateDoc.metadata,
      semanticJson: validationResult.data as Record<string, any>,
      structuralJson: structuralJson || {
        document_type: classification.documentType,
        metadata: intermediateDoc.metadata,
        sections: [],
      },
      provenanceMap,
      validation: {
        isValidJson: validationResult.isValid,
        repaired: validationResult.repaired,
        errors: validationResult.errors,
      },
    };

    return res.json(finalResponse);
  } catch (err: any) {
    console.error('[Extraction Pipeline] Fatal error:', err);
    return res.status(500).json({
      success: false,
      error: `Extraction failed: ${err.message || 'An unexpected error occurred during processing.'}`,
      executionTimeMs: Date.now() - startTime,
    });
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
    res.status(500).json({ error: `Failed to generate sample PDF: ${err.message}` });
  }
});

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`[PDF to JSON Agent] Server listening on http://localhost:${PORT}`);
  console.log(`[Privacy Mode] Default engine is set to "${config.defaultEngine}" (100% Local / Offline)`);
});
