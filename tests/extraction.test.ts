import { TestPDFGenerator } from '../server/utils/test-pdf-generator.js';
import { PDFParser } from '../server/services/pdf-parser.js';
import { TableExtractor } from '../server/services/table-extractor.js';
import { KVExtractor } from '../server/services/kv-extractor.js';
import { DocumentClassifier } from '../server/services/document-classifier.js';
import { LocalExtractor } from '../server/services/local-extractor.js';
import { JSONValidator } from '../server/services/json-validator.js';
import { SchemaValidator } from '../server/services/schema-validator.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ [FAIL] ${testName}`);
    if (detail) console.error(`    Detail: ${detail}`);
  }
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('   PDF TO JSON AGENT — CORE EXTRACTION TEST SUITE     ');
  console.log('======================================================\n');

  // ---------------------------------------------------------
  // TEST 1: Invoice PDF Extraction & Table Parsing
  // ---------------------------------------------------------
  console.log('Test Suite 1: Single-Page Invoice PDF Extraction');
  const invoiceBuffer = await TestPDFGenerator.createInvoicePDF();
  const invoiceDoc = await PDFParser.parse(invoiceBuffer, { fileName: 'test_invoice.pdf' });

  assert(invoiceDoc.metadata.pageCount === 1, 'Correct page count (1 page)', `Got ${invoiceDoc.metadata.pageCount}`);
  assert(invoiceDoc.pages[0].lines.length > 5, 'Extracted text lines from invoice');

  const invoiceTables = TableExtractor.extractTables(invoiceDoc);
  assert(invoiceTables.length >= 1, 'Detected at least 1 table in invoice');
  assert(invoiceTables[0].headers.length >= 3, 'Extracted table headers correctly');
  assert((invoiceTables[0].structuredRows?.length || 0) >= 3, 'Extracted 3 line items in table');

  const invoiceKVs = KVExtractor.extract(invoiceDoc, invoiceTables);
  assert(invoiceKVs.keyValuePairs.length >= 3, 'Extracted Key-Value pairs');

  const invoiceClassification = DocumentClassifier.classify(invoiceDoc, invoiceTables, invoiceKVs.keyValuePairs);
  assert(invoiceClassification.documentType === 'invoice', 'Correctly classified as "invoice"');

  const invoiceResult = LocalExtractor.transform(
    invoiceDoc,
    invoiceClassification.documentType,
    invoiceTables,
    invoiceKVs.keyValuePairs,
    invoiceKVs.lists,
    invoiceKVs.sections
  );

  assert(invoiceResult.semanticJson.document_type === 'invoice', 'Semantic JSON has document_type: invoice');
  assert(invoiceResult.semanticJson.invoice_number === 'INV-1024', `Extracted Invoice Number INV-1024 (got: ${invoiceResult.semanticJson.invoice_number})`);
  assert(invoiceResult.semanticJson.date === '2026-08-20', `Normalized Date to 2026-08-20 (got: ${invoiceResult.semanticJson.date})`);
  assert(invoiceResult.semanticJson.total === 121, `Parsed Total as numeric 121 (got: ${invoiceResult.semanticJson.total})`);
  assert(Array.isArray(invoiceResult.semanticJson.items) && invoiceResult.semanticJson.items.length === 3, 'Items table converted to structured object array');

  // ---------------------------------------------------------
  // TEST 2: Multi-Page Bank Statement Extraction
  // ---------------------------------------------------------
  console.log('\nTest Suite 2: Multi-Page Bank Statement PDF Extraction');
  const statementBuffer = await TestPDFGenerator.createMultiPageBankStatement();
  const statementDoc = await PDFParser.parse(statementBuffer, { fileName: 'test_statement.pdf' });

  assert(statementDoc.metadata.pageCount === 2, `Correct page count (2 pages) (got: ${statementDoc.metadata.pageCount})`);

  const stmtTables = TableExtractor.extractTables(statementDoc);
  assert(stmtTables.length >= 1, 'Detected transaction tables across pages');

  const stmtKVs = KVExtractor.extract(statementDoc, stmtTables);
  const stmtClass = DocumentClassifier.classify(statementDoc, stmtTables, stmtKVs.keyValuePairs);
  assert(stmtClass.documentType === 'bank_statement', 'Correctly classified as "bank_statement"');

  const stmtResult = LocalExtractor.transform(
    statementDoc,
    stmtClass.documentType,
    stmtTables,
    stmtKVs.keyValuePairs,
    stmtKVs.lists,
    stmtKVs.sections
  );

  assert(stmtResult.semanticJson.document_type === 'bank_statement', 'Semantic output is bank_statement');
  assert(stmtResult.semanticJson.account_number === '9876-5432-1098', `Extracted Account Number (got: ${stmtResult.semanticJson.account_number})`);
  assert(stmtResult.semanticJson.opening_balance === 5200, `Parsed opening balance as number 5200 (got: ${stmtResult.semanticJson.opening_balance})`);
  assert(stmtResult.semanticJson.closing_balance === 6350, `Parsed closing balance as number 6350 (got: ${stmtResult.semanticJson.closing_balance})`);

  // ---------------------------------------------------------
  // TEST 3: Resume / CV Extraction
  // ---------------------------------------------------------
  console.log('\nTest Suite 3: Resume / CV PDF Extraction');
  const resumeBuffer = await TestPDFGenerator.createResumePDF();
  const resumeDoc = await PDFParser.parse(resumeBuffer, { fileName: 'test_resume.pdf' });

  const resumeTables = TableExtractor.extractTables(resumeDoc);
  const resumeKVs = KVExtractor.extract(resumeDoc, resumeTables);
  const resumeClass = DocumentClassifier.classify(resumeDoc, resumeTables, resumeKVs.keyValuePairs);
  assert(resumeClass.documentType === 'resume', 'Correctly classified as "resume"');

  const resumeResult = LocalExtractor.transform(
    resumeDoc,
    resumeClass.documentType,
    resumeTables,
    resumeKVs.keyValuePairs,
    resumeKVs.lists,
    resumeKVs.sections
  );

  assert(resumeResult.semanticJson.contact_information?.email === 'sarah.jenkins@example.com', 'Extracted contact email correctly');
  assert(resumeResult.semanticJson.raw_skills?.length >= 3, 'Extracted skills list items');

  // ---------------------------------------------------------
  // TEST 4: JSON Validation & Auto-Repair
  // ---------------------------------------------------------
  console.log('\nTest Suite 4: JSON Validation & Auto-Repair');

  // Markdown code fences test
  const fencedJson = '```json\n{\n  "status": "success",\n  "count": 42\n}\n```';
  const val1 = JSONValidator.validateAndRepair(fencedJson);
  assert(val1.isValid && (val1.data as any).count === 42, 'Successfully stripped markdown code fences');

  // Trailing comma and unquoted keys
  const malformedJson = '{\n  "name": "Invoice",\n  "total": 100,\n}';
  const val2 = JSONValidator.validateAndRepair(malformedJson);
  assert(val2.isValid && (val2.data as any).total === 100, 'Repaired trailing comma in JSON');

  // ---------------------------------------------------------
  // TEST 5: Custom Schema Mapping
  // ---------------------------------------------------------
  console.log('\nTest Suite 5: Custom Schema Mapping');
  const customTemplate = {
    invoice_number: '',
    customer: '',
    total: 0,
    items: [],
    custom_missing_field: '',
  };

  const customMapped = SchemaValidator.mapToCustomSchema(
    customTemplate,
    invoiceKVs.keyValuePairs,
    invoiceTables,
    invoiceDoc
  );

  assert(customMapped.invoice_number === 'INV-1024', 'Custom schema mapped invoice_number');
  assert(customMapped.customer === 'ABC Ltd', 'Custom schema mapped customer');
  assert(customMapped.total === 121, 'Custom schema mapped total as number');
  assert(customMapped.custom_missing_field === null, 'Missing fields in custom schema are set to null without hallucination');

  // ---------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------
  console.log('\n======================================================');
  console.log(`   TEST RUN COMPLETED: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('======================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
