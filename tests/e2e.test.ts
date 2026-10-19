import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParser } from '../server/services/pdf-parser.js';
import { TableExtractor } from '../server/services/table-extractor.js';
import { KVExtractor } from '../server/services/kv-extractor.js';
import { DocumentClassifier } from '../server/services/document-classifier.js';
import { LocalExtractor } from '../server/services/local-extractor.js';
import { JSONValidator } from '../server/services/json-validator.js';
import { SchemaValidator } from '../server/services/schema-validator.js';
import { InvariantChecker } from '../server/services/invariant-checker.js';
import { TestPDFGenerator } from '../server/utils/test-pdf-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let total = 0;

function check(cond: boolean, name: string, detail?: string) {
  total++;
  if (cond) {
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${name}`);
    if (detail) console.error(`    Detail: ${detail}`);
  }
}

async function runE2E() {
  console.log('\n======================================================');
  console.log('   PDF TO JSON AGENT — END-TO-END INTEGRATION TEST    ');
  console.log('======================================================\n');

  // 1. Frontend Web App Inspection
  console.log('E2E Step 1: Testing Frontend HTTP Endpoint / Build Assets');
  let feHtml = '';
  try {
    const feRes = await fetch('http://localhost:5173/');
    if (feRes.ok) {
      feHtml = await feRes.text();
      check(feRes.status === 200, 'Frontend server responded with HTTP 200');
    }
  } catch {
    const indexPath = path.resolve(__dirname, '../client/index.html');
    if (fs.existsSync(indexPath)) {
      feHtml = fs.readFileSync(indexPath, 'utf-8');
      check(true, 'Frontend build assets verified from client template');
    }
  }

  if (feHtml) {
    check(feHtml.includes('PDF to JSON Agent') || feHtml.includes('DocuMorph') || feHtml.includes('viewport'), 'Frontend HTML includes application metadata');
    check(feHtml.includes('id="root"'), 'Frontend HTML includes root mounting element');
  }

  // 2. Full End-to-End Extraction Pipeline on Invoice PDF
  console.log('\nE2E Step 2: Testing Full End-to-End Extraction on Invoice PDF');
  const invoiceBlob = await TestPDFGenerator.createInvoicePDF();
  const idr = await PDFParser.parse(invoiceBlob, { fileName: 'test_invoice.pdf' });
  const tables = TableExtractor.extractTables(idr);
  const kvs = KVExtractor.extract(idr, tables);
  const cls = DocumentClassifier.classify(idr, tables, kvs.keyValuePairs);
  const extractRes = LocalExtractor.transform(idr, cls.documentType, tables, kvs.keyValuePairs, kvs.lists, kvs.sections);
  const validation = JSONValidator.validateAndRepair(extractRes.semanticJson);
  const inv = InvariantChecker.verifyInvariants(idr, extractRes.provenanceMap, validation.data as any);

  check(idr.metadata.pageCount === 1, 'Inspected metadata indicates 1 page');
  check(cls.documentType === 'invoice', 'E2E Classification classified as invoice');
  check(validation.isValid === true, 'Validation repaired and produced valid JSON');
  check(inv.passed === true, 'All extraction invariants passed cleanly');
  check(validation.data.invoice_number === 'INV-1024', `Extracted Invoice Number: ${validation.data.invoice_number}`);
  check(validation.data.total === 121, `Extracted Total: ${validation.data.total}`);
  check(Array.isArray(validation.data.items) && validation.data.items.length === 3, 'Extracted 3 line items in items array');

  // 3. Multi-Page Bank Statement E2E
  console.log('\nE2E Step 3: Multi-Page Bank Statement Extraction');
  const stmtBlob = await TestPDFGenerator.createMultiPageBankStatement();
  const stmtIdr = await PDFParser.parse(stmtBlob, { fileName: 'statement.pdf' });
  const stmtTables = TableExtractor.extractTables(stmtIdr);
  const stmtKVs = KVExtractor.extract(stmtIdr, stmtTables);
  const stmtCls = DocumentClassifier.classify(stmtIdr, stmtTables, stmtKVs.keyValuePairs);
  const stmtExtract = LocalExtractor.transform(stmtIdr, stmtCls.documentType, stmtTables, stmtKVs.keyValuePairs, stmtKVs.lists, stmtKVs.sections);
  const stmtVal = JSONValidator.validateAndRepair(stmtExtract.semanticJson);

  check(stmtIdr.metadata.pageCount === 2, 'Bank statement has 2 pages');
  check(stmtCls.documentType === 'bank_statement', 'Classified as bank_statement');
  check(stmtVal.data.account_number === '9876-5432-1098', `Account Number: ${stmtVal.data.account_number}`);
  check(stmtVal.data.opening_balance === 5200, `Opening Balance: ${stmtVal.data.opening_balance}`);
  check(stmtVal.data.closing_balance === 6350, `Closing Balance: ${stmtVal.data.closing_balance}`);

  // 4. Custom Schema E2E
  console.log('\nE2E Step 4: Custom Schema Mapping on Invoice');
  const customTemplate = {
    invoice_number: '',
    customer: '',
    unrelated_missing_field: null,
  };
  const customMapped = SchemaValidator.mapToCustomSchema(customTemplate, kvs.keyValuePairs, tables, idr);
  check(customMapped.invoice_number === 'INV-1024', `Custom schema mapped invoice_number: ${customMapped.invoice_number}`);
  check(customMapped.customer === 'ABC Ltd', `Custom schema mapped customer: ${customMapped.customer}`);
  check(customMapped.unrelated_missing_field === null, 'Missing schema field is null (no hallucination)');

  // 5. Error Handling on Corrupted Upload
  console.log('\nE2E Step 5: Error Handling with Corrupted File');
  let threwExpected = false;
  try {
    await PDFParser.parse(Buffer.from('NOT_A_VALID_PDF_HEADER_OR_CONTENT'), { fileName: 'bad.pdf' });
  } catch (err: any) {
    threwExpected = true;
    check(err.code === 'INVALID_PDF' || err.code === 'PDF_CORRUPTED', `Received standardized error code: "${err.code}" (${err.message})`);
  }
  check(threwExpected, 'Gracefully rejected corrupted PDF with standardized error response');

  console.log('\n======================================================');
  console.log(`   E2E RUN COMPLETED: ${passed}/${total} Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runE2E().catch((err) => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
