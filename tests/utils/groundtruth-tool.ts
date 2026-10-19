import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParser } from '../../server/services/pdf-parser.js';
import { TableExtractor } from '../../server/services/table-extractor.js';
import { KVExtractor } from '../../server/services/kv-extractor.js';
import { DocumentClassifier } from '../../server/services/document-classifier.js';
import { LocalExtractor } from '../../server/services/local-extractor.js';
import { JSONValidator } from '../../server/services/json-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runGroundTruthTool() {
  const args = process.argv.slice(2);
  const targetArg = args.find((a) => !a.startsWith('-'));

  if (!targetArg) {
    console.error('\nUsage: npm run groundtruth -- <path/to/document.pdf>\n');
    console.error('Example: npm run groundtruth -- tests/corpus/real/invoice-001.pdf\n');
    process.exit(1);
  }

  const pdfPath = path.resolve(process.cwd(), targetArg);

  if (!fs.existsSync(pdfPath)) {
    console.error(`\nError: PDF document not found at: ${pdfPath}\n`);
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('   PDF TO JSON AGENT — ASSISTED GROUND TRUTH TOOL      ');
  console.log('======================================================');
  console.log('\n⚠️  PRIVACY & SENSITIVITY NOTICE:');
  console.log('   Extraction output may contain sensitive or confidential information.');
  console.log('   Review files before committing, sharing, or including in test suites.\n');

  console.log(`Target Document: ${pdfPath}`);

  const buffer = fs.readFileSync(pdfPath);
  const fileName = path.basename(pdfPath);
  const dirName = path.dirname(pdfPath);
  const baseName = fileName.replace(/\.pdf$/i, '');

  console.log('Running extraction pipeline...');
  const startTime = Date.now();

  // Step 1: Parse PDF
  const idr = await PDFParser.parse(buffer, { fileName });

  // Step 2: Extract Tables
  const tables = TableExtractor.extractTables(idr);
  idr.tables = tables;

  // Step 3: Extract Key-Values & Lists
  const { keyValuePairs, lists, sections } = KVExtractor.extract(idr, tables);
  idr.keyValuePairs = keyValuePairs;
  idr.lists = lists;
  idr.sections = sections;

  // Step 4: Classify Document
  const classification = DocumentClassifier.classify(idr, tables, keyValuePairs);

  // Step 5: Transform Semantically
  const { semanticJson, structuralJson, provenanceMap } = LocalExtractor.transform(
    idr,
    classification.documentType,
    tables,
    keyValuePairs,
    lists,
    sections
  );

  // Step 6: Validate JSON
  const validated = JSONValidator.validateAndRepair(semanticJson);
  const elapsedMs = Date.now() - startTime;

  console.log(`Extraction completed in ${elapsedMs}ms.`);
  console.log(`Detected Type: ${classification.documentType} (Confidence: ${classification.confidence})`);
  console.log(`Extracted: ${Object.keys(semanticJson).length} top-level fields, ${tables.length} tables, ${keyValuePairs.length} key-values.`);

  // 1. Write [basename].actual.json
  const actualPath = path.join(dirName, `${baseName}.actual.json`);
  const actualPayload = {
    _meta: {
      generatedAt: new Date().toISOString(),
      document: fileName,
      elapsedMs,
      classification,
      pageCount: idr.metadata.pageCount,
    },
    semantic: validated.data,
    structural: structuralJson,
    provenance: provenanceMap,
  };
  fs.writeFileSync(actualPath, JSON.stringify(actualPayload, null, 2), 'utf8');
  console.log(`\n✓ Saved raw actual extraction: ${actualPath}`);

  // 2. Build draft expected template [basename].expected.draft.json
  const draftPath = path.join(dirName, `${baseName}.expected.draft.json`);

  // Build draft fields map from semantic output or extracted key values
  const draftFields: Record<string, any> = {};
  if (validated.data && typeof validated.data === 'object') {
    for (const [k, v] of Object.entries(validated.data as Record<string, any>)) {
      if (k === 'document_type' || k === 'confidence' || k === 'metadata') continue;
      if (Array.isArray(v) || (typeof v === 'object' && v !== null)) continue;
      draftFields[k] = v;
    }
  }

  // Build draft tables map
  const draftTables: Record<string, any> = {};
  tables.forEach((t, idx) => {
    const tableName = idx === 0 ? 'items' : `table_${idx + 1}`;
    draftTables[tableName] = {
      expectedRowCount: t.rows.length,
      headers: t.headers,
    };
  });

  const draftTemplate = {
    _instructions: [
      'HUMAN REVIEW REQUIRED: This is an automatically generated draft template.',
      '1. Open this file and verify all fields against the actual PDF content.',
      '2. Correct any misrecognized values, normalize dates/numbers, and adjust table row counts.',
      '3. You may delete unwanted fields or add additional expected fields (partial ground truth is supported).',
      `4. Once reviewed, rename this file from "${baseName}.expected.draft.json" to "${baseName}.expected.json".`,
      '5. Update tests/corpus/real/manifest.json setting groundTruthStatus to "reviewed" or "partial-reviewed".',
    ],
    document_type: classification.documentType,
    fields: draftFields,
    tables: draftTables,
  };

  fs.writeFileSync(draftPath, JSON.stringify(draftTemplate, null, 2), 'utf8');
  console.log(`✓ Saved editable expected draft template: ${draftPath}`);

  console.log('\nNext Steps:');
  console.log(`  1. Review and edit:  ${draftPath}`);
  console.log(`  2. Finalize name to: ${path.join(dirName, `${baseName}.expected.json`)}`);
  console.log('======================================================\n');
}

runGroundTruthTool().catch((err) => {
  console.error('\nFatal Ground Truth Tool Error:', err);
  process.exit(1);
});
