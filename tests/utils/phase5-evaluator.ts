import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { PDFParser } from '../../server/services/pdf-parser.js';
import { TableExtractor } from '../../server/services/table-extractor.js';
import { KVExtractor } from '../../server/services/kv-extractor.js';
import { DocumentClassifier } from '../../server/services/document-classifier.js';
import { LocalExtractor } from '../../server/services/local-extractor.js';
import { InvariantChecker } from '../../server/services/invariant-checker.js';
import { JSONValidator } from '../../server/services/json-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CORPUS_DIR = path.resolve(__dirname, '../../phase5_real_independent/independent_pdfs');
const SOURCES_FILE = path.resolve(__dirname, '../../phase5_real_independent/sources.json');
const OUT_DIR = path.resolve(__dirname, '../../phase5_real_independent/evaluation_outputs');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function runPhase5Evaluation() {
  console.log('===============================================================');
  console.log('   PHASE 5 INDEPENDENT REAL-WORLD CORPUS EVALUATION RUNNER      ');
  console.log('===============================================================\n');

  const sources = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf-8'));
  const results: any[] = [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const pdfPath = path.join(CORPUS_DIR, src.filename);
    console.log(`\n[${i + 1}/${sources.length}] Evaluating ${src.id}: ${src.filename}`);

    if (!fs.existsSync(pdfPath)) {
      console.error(`  ERROR: File not found: ${pdfPath}`);
      results.push({
        id: src.id,
        filename: src.filename,
        status: 'file_missing',
      });
      continue;
    }

    const buffer = fs.readFileSync(pdfPath);
    const hash = sha256(buffer);
    const t0 = Date.now();

    try {
      // 1. PDF Parser
      const tParseStart = Date.now();
      const idr = await PDFParser.parse(buffer, {
        fileName: src.filename,
        fileSizeBytes: buffer.length,
        enableOcrFallback: true,
      });
      const parseMs = Date.now() - tParseStart;

      // 2. Table Extractor
      const tTableStart = Date.now();
      const tables = TableExtractor.extractTables(idr);
      idr.tables = tables;
      const tableMs = Date.now() - tTableStart;

      // 3. KV & Section Extractor
      const tKVStart = Date.now();
      const { keyValuePairs, lists, sections } = KVExtractor.extract(idr, tables);
      idr.keyValuePairs = keyValuePairs;
      idr.lists = lists;
      idr.sections = sections;
      const kvMs = Date.now() - tKVStart;

      // 4. Classifier
      const tClassStart = Date.now();
      const classification = DocumentClassifier.classify(idr, tables, keyValuePairs);
      const classMs = Date.now() - tClassStart;

      // 5. Semantic Transformation
      const tSemStart = Date.now();
      const { semanticJson, structuralJson, provenanceMap } = LocalExtractor.transform(
        idr,
        classification.documentType,
        tables,
        keyValuePairs,
        lists,
        sections
      );
      const semMs = Date.now() - tSemStart;

      // 6. JSON Validation
      const validated = JSONValidator.validateAndRepair(semanticJson);

      // 7. Invariants
      const invariantReport = InvariantChecker.verifyInvariants(
        idr,
        provenanceMap,
        semanticJson
      );

      const totalMs = Date.now() - t0;

      const docSummary = {
        id: src.id,
        filename: src.filename,
        sha256: hash,
        bytes: buffer.length,
        category: src.category,
        pageCount: idr.metadata.pageCount,
        nativePages: idr.metadata.pageCount - (idr.metadata.ocrPagesCount || 0),
        ocrPages: idr.metadata.ocrPagesCount || 0,
        ocrApplied: idr.metadata.ocrApplied || false,
        classification: {
          detectedType: classification.documentType,
          confidence: classification.confidence,
          reasons: classification.matchedKeywords?.slice(0, 5) || [],
        },
        extractionStats: {
          tablesDetected: tables.length,
          tableRowsTotal: tables.reduce((sum, t) => sum + t.rows.length, 0),
          keyValuesCount: keyValuePairs.length,
          sectionsCount: sections.length,
          listsCount: lists.length,
          semanticFieldCount: Object.keys(semanticJson).length,
        },
        timingsMs: {
          total: totalMs,
          parse: parseMs,
          table: tableMs,
          kv: kvMs,
          classify: classMs,
          transform: semMs,
        },
        jsonValid: validated.isValid,
        invariants: {
          passed: invariantReport.passed,
          violations: invariantReport.violations,
        },
        sampleFields: semanticJson,
        tablesSummary: tables.map((t, idx) => ({
          tableIndex: idx + 1,
          headers: t.headers,
          rowCount: t.rows.length,
          columnCount: t.headers.length || (t.rows[0] ? t.rows[0].length : 0),
          page: t.page,
        })),
        sampleLines: idr.pages.map((p) => ({
          pageNumber: p.pageNumber,
          lineCount: p.lines.length,
          textSample: p.lines.slice(0, 5).map((l) => l.text).join(' | '),
        })),
      };

      results.push(docSummary);

      // Save individual output
      fs.writeFileSync(
        path.join(OUT_DIR, `${src.id}_${src.filename}.json`),
        JSON.stringify(
          {
            summary: docSummary,
            semantic: validated.data,
            structural: structuralJson,
            provenance: provenanceMap,
          },
          null,
          2
        )
      );

      console.log(`  ✓ Type: ${classification.documentType} (${classification.confidence}) | Pages: ${idr.metadata.pageCount} | Tables: ${tables.length} | KVs: ${keyValuePairs.length} | Time: ${totalMs}ms`);
    } catch (err: any) {
      console.error(`  ✗ Pipeline Error on ${src.filename}:`, err);
      results.push({
        id: src.id,
        filename: src.filename,
        sha256: hash,
        status: 'error',
        error: err.message || String(err),
        stack: err.stack,
      });
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'ALL_DOCUMENTS_EVALUATION.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('\n===============================================================');
  console.log(`Extraction complete for ${results.length} documents.`);
  console.log(`Results saved to: ${OUT_DIR}`);
  console.log('===============================================================\n');
}

runPhase5Evaluation().catch(console.error);
