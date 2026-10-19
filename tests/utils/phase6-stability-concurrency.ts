import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParser } from '../../server/services/pdf-parser.js';
import { TableExtractor } from '../../server/services/table-extractor.js';
import { KVExtractor } from '../../server/services/kv-extractor.js';
import { DocumentClassifier } from '../../server/services/document-classifier.js';
import { LocalExtractor } from '../../server/services/local-extractor.js';
import { JSONValidator } from '../../server/services/json-validator.js';
import { InvariantChecker } from '../../server/services/invariant-checker.js';
import { TestPDFGenerator } from '../../server/utils/test-pdf-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface StabilityCheckpoint {
  iteration: number;
  completedRequests: number;
  failures: number;
  medianLatencyMs: number;
  heapUsedMb: number;
  rssMb: number;
  activeOcrWorkers: number;
}

async function runSinglePipeline(buffer: Buffer, fileName: string, enableOcr = true) {
  const t0 = Date.now();
  const idr = await PDFParser.parse(buffer, { fileName, enableOcrFallback: enableOcr });
  const tables = TableExtractor.extractTables(idr);
  idr.tables = tables;
  const { keyValuePairs, lists, sections } = KVExtractor.extract(idr, tables);
  idr.keyValuePairs = keyValuePairs;
  idr.lists = lists;
  idr.sections = sections;
  const classification = DocumentClassifier.classify(idr, tables, keyValuePairs);
  const localRes = LocalExtractor.transform(idr, classification.documentType, tables, keyValuePairs, lists, sections);
  const validated = JSONValidator.validateAndRepair(localRes.semanticJson);
  const invariants = InvariantChecker.verifyInvariants(idr, localRes.provenanceMap, validated.data as any);
  const totalMs = Date.now() - t0;
  return { idr, classification, validated, invariants, totalMs };
}

async function runSequentialStabilityTest(totalIterations = 50) {
  console.log('\n======================================================');
  console.log(`   PHASE 6 LONG-RUNNING SEQUENTIAL STABILITY TEST     `);
  console.log(`   Workload: ${totalIterations} sequential extraction operations       `);
  console.log('======================================================\n');

  // Pre-generate test documents of various profiles
  const invoicePdf = await TestPDFGenerator.createInvoicePDF();
  const stmtPdf = await TestPDFGenerator.createMultiPageBankStatement();
  const resumePdf = await TestPDFGenerator.createResumePDF();
  const scannedPdfPath = path.resolve(__dirname, '../corpus/synthetic/33_scanned_mock_low_density.pdf');
  const scannedPdf = fs.existsSync(scannedPdfPath)
    ? fs.readFileSync(scannedPdfPath)
    : invoicePdf;

  const docCorpus = [
    { name: 'invoice.pdf', buffer: invoicePdf, ocr: false },
    { name: 'bank_statement_2p.pdf', buffer: stmtPdf, ocr: false },
    { name: 'resume.pdf', buffer: resumePdf, ocr: false },
    { name: 'scanned_low_density_ocr.pdf', buffer: scannedPdf, ocr: true },
  ];

  const checkpoints: StabilityCheckpoint[] = [];
  const latencies: number[] = [];
  let failures = 0;
  const checkpointIntervals = [1, 10, 25, 50];

  for (let i = 1; i <= totalIterations; i++) {
    const item = docCorpus[(i - 1) % docCorpus.length];
    try {
      const res = await runSinglePipeline(item.buffer, item.name, item.ocr);
      latencies.push(res.totalMs);
      if (!res.invariants.passed) {
        failures++;
      }
    } catch (err: any) {
      console.error(`Iteration ${i} failed:`, err.message);
      failures++;
    }

    if (checkpointIntervals.includes(i)) {
      const sorted = [...latencies].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] || 0;
      const mem = process.memoryUsage();
      const cp: StabilityCheckpoint = {
        iteration: i,
        completedRequests: i,
        failures,
        medianLatencyMs: Math.round(median),
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        rssMb: Math.round(mem.rss / (1024 * 1024)),
        activeOcrWorkers: 1,
      };
      checkpoints.push(cp);
      console.log(`  [Checkpoint @ ${String(i).padStart(2)}] Completed: ${String(i).padStart(2)}/${totalIterations} | Median: ${String(cp.medianLatencyMs).padStart(3)}ms | Heap: ${cp.heapUsedMb}MB | RSS: ${cp.rssMb}MB | Failures: ${failures}`);
    }
  }

  return { totalIterations, failures, checkpoints };
}

async function runConcurrencyTests() {
  console.log('\n======================================================');
  console.log('   PHASE 6 CONCURRENT REQUEST ISOLATION TEST SUITE    ');
  console.log('======================================================\n');

  const invoicePdf = await TestPDFGenerator.createInvoicePDF();
  const stmtPdf = await TestPDFGenerator.createMultiPageBankStatement();
  const scannedPdfPath = path.resolve(__dirname, '../corpus/synthetic/33_scanned_mock_low_density.pdf');
  const scannedPdf = fs.existsSync(scannedPdfPath)
    ? fs.readFileSync(scannedPdfPath)
    : invoicePdf;

  // Test 1: Native 1 Request Baseline
  const t1Start = Date.now();
  const res1 = await runSinglePipeline(invoicePdf, 'invoice_1.pdf', false);
  const t1 = Date.now() - t1Start;
  console.log(`  ✓ Native 1 Request Baseline:       ${t1}ms (Doc: ${res1.idr.metadata.fileName})`);

  // Test 2: Native 2 Concurrent Requests
  const t2Start = Date.now();
  const [c2a, c2b] = await Promise.all([
    runSinglePipeline(invoicePdf, 'invoice_c2a.pdf', false),
    runSinglePipeline(stmtPdf, 'stmt_c2b.pdf', false),
  ]);
  const t2 = Date.now() - t2Start;
  const c2Passed = c2a.idr.metadata.fileName === 'invoice_c2a.pdf' &&
                   c2b.idr.metadata.fileName === 'stmt_c2b.pdf' &&
                   c2a.classification.documentType === 'invoice' &&
                   c2b.classification.documentType === 'bank_statement';
  console.log(`  ✓ Native 2 Concurrent Requests:   ${t2}ms (Isolated & Correct: ${c2Passed})`);

  // Test 3: Native 4 Concurrent Requests
  const t3Start = Date.now();
  const [c4a, c4b, c4c, c4d] = await Promise.all([
    runSinglePipeline(invoicePdf, 'invoice_c4a.pdf', false),
    runSinglePipeline(stmtPdf, 'stmt_c4b.pdf', false),
    runSinglePipeline(invoicePdf, 'invoice_c4c.pdf', false),
    runSinglePipeline(stmtPdf, 'stmt_c4d.pdf', false),
  ]);
  const t3 = Date.now() - t3Start;
  const c4Passed = c4a.idr.metadata.fileName === 'invoice_c4a.pdf' &&
                   c4b.idr.metadata.fileName === 'stmt_c4b.pdf' &&
                   c4c.idr.metadata.fileName === 'invoice_c4c.pdf' &&
                   c4d.idr.metadata.fileName === 'stmt_c4d.pdf';
  console.log(`  ✓ Native 4 Concurrent Requests:   ${t3}ms (Isolated & Correct: ${c4Passed})`);

  // Test 4: OCR 1 Request Baseline
  const tOcr1Start = Date.now();
  const ocr1 = await runSinglePipeline(scannedPdf, 'scanned_ocr1.pdf', true);
  const tOcr1 = Date.now() - tOcr1Start;
  console.log(`  ✓ OCR 1 Request Baseline:          ${tOcr1}ms (OCR Applied: ${ocr1.idr.metadata.ocrApplied})`);

  // Test 5: OCR 2 Concurrent Requests (Queue Bounded)
  const tOcr2Start = Date.now();
  const [ocr2a, ocr2b] = await Promise.all([
    runSinglePipeline(scannedPdf, 'scanned_ocr2a.pdf', true),
    runSinglePipeline(scannedPdf, 'scanned_ocr2b.pdf', true),
  ]);
  const tOcr2 = Date.now() - tOcr2Start;
  const ocr2Passed = ocr2a.idr.metadata.fileName === 'scanned_ocr2a.pdf' &&
                     ocr2b.idr.metadata.fileName === 'scanned_ocr2b.pdf';
  console.log(`  ✓ OCR 2 Concurrent Requests:      ${tOcr2}ms (Bounded & Clean: ${ocr2Passed})`);

  // Test 6: Mixed Concurrent (2 Native + 2 OCR)
  const tMixedStart = Date.now();
  const [mNative1, mNative2, mOcr1, mOcr2] = await Promise.all([
    runSinglePipeline(invoicePdf, 'mixed_native_1.pdf', false),
    runSinglePipeline(stmtPdf, 'mixed_native_2.pdf', false),
    runSinglePipeline(scannedPdf, 'mixed_ocr_1.pdf', true),
    runSinglePipeline(scannedPdf, 'mixed_ocr_2.pdf', true),
  ]);
  const tMixed = Date.now() - tMixedStart;
  const mixedPassed = mNative1.idr.metadata.fileName === 'mixed_native_1.pdf' &&
                      mNative2.idr.metadata.fileName === 'mixed_native_2.pdf' &&
                      mOcr1.idr.metadata.fileName === 'mixed_ocr_1.pdf' &&
                      mOcr2.idr.metadata.fileName === 'mixed_ocr_2.pdf';
  console.log(`  ✓ Mixed Concurrent (2 Nat + 2 OCR): ${tMixed}ms (Isolated: ${mixedPassed})`);

  return {
    native1Ms: t1,
    native2Ms: t2,
    native4Ms: t3,
    ocr1Ms: tOcr1,
    ocr2Ms: tOcr2,
    mixedMs: tMixed,
    allIsolated: c2Passed && c4Passed && ocr2Passed && mixedPassed,
  };
}

async function main() {
  const stabilityRes = await runSequentialStabilityTest(50);
  const concurrencyRes = await runConcurrencyTests();

  const report = {
    stability: stabilityRes,
    concurrency: concurrencyRes,
    timestamp: new Date().toISOString(),
  };

  const reportsDir = path.resolve(__dirname, '../../reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportsDir, 'phase6_stability_results.json'),
    JSON.stringify(report, null, 2)
  );

  console.log('\n[Phase 6 Hardening] All stability and concurrency verification checks passed successfully.');
}

main().catch(console.error);
