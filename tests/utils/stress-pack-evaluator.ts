import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFParser } from '../../server/services/pdf-parser.js';
import { TableExtractor } from '../../server/services/table-extractor.js';
import { KVExtractor } from '../../server/services/kv-extractor.js';
import { DocumentClassifier } from '../../server/services/document-classifier.js';
import { LocalExtractor } from '../../server/services/local-extractor.js';
import { JSONValidator } from '../../server/services/json-validator.js';
import { InvariantChecker } from '../../server/services/invariant-checker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALL_12_STRESS_PDFS = [
  { id: 'STRESS-001', fileName: '01_clean_invoice.pdf', path: '/Users/muhammadomerfarooq/Downloads/01_clean_invoice.pdf' },
  { id: 'STRESS-002', fileName: '02_messy_invoice_wrapped.pdf', path: '/Users/muhammadomerfarooq/Downloads/02_messy_invoice_wrapped.pdf' },
  { id: 'STRESS-003', fileName: '03_bank_statement_dense_3pages.pdf', path: '/Users/muhammadomerfarooq/Downloads/03_bank_statement_dense_3pages.pdf' },
  { id: 'STRESS-004', fileName: '04_bank_statement_landscape_continuation.pdf', path: '/Users/muhammadomerfarooq/Downloads/04_bank_statement_landscape_continuation.pdf' },
  { id: 'STRESS-005', fileName: '05_resume_two_column.pdf', path: '/Users/muhammadomerfarooq/Downloads/05_resume_two_column.pdf' },
  { id: 'STRESS-006', fileName: '06_research_paper_two_column.pdf', path: '/Users/muhammadomerfarooq/Downloads/06_research_paper_two_column.pdf' },
  { id: 'STRESS-007', fileName: '07_excel_export_operations_report.pdf', path: '/Users/muhammadomerfarooq/Downloads/07_excel_export_operations_report.pdf' },
  { id: 'STRESS-008', fileName: '08_browser_print_article.pdf', path: '/Users/muhammadomerfarooq/Downloads/08_browser_print_article.pdf' },
  { id: 'STRESS-009', fileName: '09_scanned_receipt_image_only.pdf', path: '/Users/muhammadomerfarooq/Downloads/09_scanned_receipt_image_only.pdf' },
  { id: 'STRESS-010', fileName: '10_phone_scan_supplier_form.pdf', path: '/Users/muhammadomerfarooq/Downloads/10_phone_scan_supplier_form.pdf' },
  { id: 'STRESS-011', fileName: '11_contract_repeated_footer.pdf', path: '/Users/muhammadomerfarooq/Downloads/11_contract_repeated_footer.pdf' },
  { id: 'STRESS-012', fileName: '12_mixed_native_ocr_4pages.pdf', path: '/Users/muhammadomerfarooq/Downloads/12_mixed_native_ocr_4pages.pdf' },
];

async function inspectPdfText(pdfBuffer: Buffer): Promise<Array<{ pageNumber: number; text: string; numItems: number; isNative: boolean }>> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const pageDetails: Array<{ pageNumber: number; text: string; numItems: number; isNative: boolean }> = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as any[];
    const text = items.map((i) => i.str).join(' ');
    pageDetails.push({
      pageNumber: p,
      text,
      numItems: items.length,
      isNative: items.length > 0 && text.trim().length > 0,
    });
  }

  return pageDetails;
}

async function run12PdfEvaluation() {
  console.log('\n========================================================================');
  console.log('   PDF TO JSON AGENT — 12-DOCUMENT COMPLETE STRESS PACK EVALUATION      ');
  console.log('========================================================================\n');

  const results: any[] = [];

  for (const docDef of ALL_12_STRESS_PDFS) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`Evaluating [${docDef.id}] ${docDef.fileName}...`);
    console.log(`Path: ${docDef.path}`);

    if (!fs.existsSync(docDef.path)) {
      console.error(`File not found: ${docDef.path}`);
      continue;
    }

    const buffer = fs.readFileSync(docDef.path);
    const rawPdfPages = await inspectPdfText(buffer);

    const tStart = performance.now();

    // Stage 1: PDF Parsing & OCR Routing
    const tParse0 = performance.now();
    const idr = await PDFParser.parse(buffer, { fileName: docDef.fileName, enableOcrFallback: true });
    const tParse1 = performance.now();

    // Stage 2: OCR Execution Timing (if OCR was applied)
    const ocrMs = idr.metadata.ocrApplied ? Math.round(tParse1 - tParse0) : 0;
    const pdfParsingMs = Math.round(tParse1 - tParse0) - ocrMs;

    // Stage 3: Structural Extraction (Layout Regions, Tables, Key-Values, Lists)
    const tStruct0 = performance.now();
    const tables = TableExtractor.extractTables(idr);
    idr.tables = tables;

    const { keyValuePairs, lists, sections } = KVExtractor.extract(idr, tables);
    idr.keyValuePairs = keyValuePairs;
    idr.lists = lists;
    idr.sections = sections;
    const tStruct1 = performance.now();

    // Stage 4: Classification
    const tClass0 = performance.now();
    const classification = DocumentClassifier.classify(idr, tables, keyValuePairs);
    const tClass1 = performance.now();

    // Stage 5: Semantic Transformation
    const tTrans0 = performance.now();
    const { semanticJson, structuralJson, provenanceMap } = LocalExtractor.transform(
      idr,
      classification.documentType,
      tables,
      keyValuePairs,
      lists,
      sections
    );
    const tTrans1 = performance.now();

    // Stage 6: JSON Validation & Invariants
    const tVal0 = performance.now();
    const validated = JSONValidator.validateAndRepair(semanticJson);
    const invariants = InvariantChecker.verifyInvariants(
      idr,
      provenanceMap,
      validated.data as Record<string, any>
    );
    const tVal1 = performance.now();

    const tEnd = performance.now();
    const totalMs = Math.round((tEnd - tStart) * 10) / 10;

    const timing = {
      totalMs,
      pdfParsingMs: Math.round(pdfParsingMs * 10) / 10,
      ocrMs: Math.round(ocrMs * 10) / 10,
      structuralExtractionMs: Math.round((tStruct1 - tStruct0) * 10) / 10,
      classificationMs: Math.round((tClass1 - tClass0) * 10) / 10,
      semanticExtractionMs: Math.round((tTrans1 - tTrans0) * 10) / 10,
      validationMs: Math.round((tVal1 - tVal0) * 10) / 10,
    };

    // Analyze page OCR vs native routing
    const pageRoutings = idr.pages.map((p) => {
      const rawP = rawPdfPages.find((r) => r.pageNumber === p.pageNumber);
      const isNative = rawP?.isNative || p.textItems.length > 0;
      const sourceMethod = isNative ? 'pdf_text' : 'ocr';
      return {
        pageNumber: p.pageNumber,
        dimensions: { width: p.width, height: p.height },
        lineCount: p.lines.length,
        textItemCount: p.textItems.length,
        isScanned: p.isScanned,
        sourceMethod,
        regionsCount: p.regions.length,
        regions: p.regions.map((r) => ({ type: r.type, index: r.index, lineCount: r.lines.length })),
      };
    });

    const resultEntry = {
      id: docDef.id,
      fileName: docDef.fileName,
      fileSizeBytes: buffer.length,
      pageCount: idr.metadata.pageCount,
      nativePages: pageRoutings.filter((r) => r.sourceMethod === 'pdf_text').length,
      ocrPages: pageRoutings.filter((r) => r.sourceMethod === 'ocr').length,
      timing,
      classification: {
        documentType: classification.documentType,
        confidence: classification.confidence,
        reasons: classification.reasons,
      },
      pageRoutings,
      rawPdfPages,
      idrSummary: {
        totalPages: idr.pages.length,
        textDensity: idr.metadata.textDensity,
        isScanned: idr.metadata.isScanned,
        hasMultiColumnLayout: idr.metadata.hasMultiColumnLayout,
        hasRepeatedHeaders: idr.metadata.hasRepeatedHeaders,
        hasRepeatedFooters: idr.metadata.hasRepeatedFooters,
        linesPerPage: idr.pages.map((p) =>
          p.lines.map((l) => ({ text: l.text, y: l.y, minX: l.minX, maxX: l.maxX, role: l.role }))
        ),
      },
      tablesExtracted: tables.map((t) => ({
        id: t.id,
        page: t.page,
        pages: t.pages,
        headers: t.headers,
        hasReliableHeaders: t.hasReliableHeaders,
        confidence: t.confidence,
        rowCount: t.rows.length,
        structuredRows: t.structuredRows,
        rawRows: t.rows,
        boundingBox: t.boundingBox,
      })),
      keyValuePairs: keyValuePairs.map((kv) => ({
        key: kv.key,
        value: kv.value,
        rawKey: kv.rawKey,
        rawValue: kv.rawValue,
        normalization: kv.normalization,
        confidence: kv.confidence,
        provenance: kv.provenance,
      })),
      listsCount: lists.length,
      sectionsCount: sections.length,
      semanticJson: validated.data,
      invariants: {
        passed: invariants.passed,
        violations: invariants.violations,
      },
    };

    results.push(resultEntry);

    console.log(`✓ Processed in ${totalMs}ms (Parsing: ${timing.pdfParsingMs}ms, Struct: ${timing.structuralExtractionMs}ms, Trans: ${timing.semanticExtractionMs}ms)`);
    console.log(`  Pages: ${idr.metadata.pageCount} (Native: ${resultEntry.nativePages}, OCR: ${resultEntry.ocrPages}, MultiCol: ${idr.metadata.hasMultiColumnLayout})`);
    console.log(`  Classification: ${classification.documentType} (Confidence: ${classification.confidence})`);
    console.log(`  Extracted: ${tables.length} tables, ${keyValuePairs.length} KVs, ${lists.length} lists, ${sections.length} sections`);
    console.log(`  Invariants Passed: ${invariants.passed} (${invariants.violations.length} violations)`);
  }

  // Save intermediate raw diagnostic dump to scratch
  const scratchDir = path.resolve(__dirname, '../../scratch');
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
  const dumpPath = path.join(scratchDir, 'stress_pack_eval_dump_12.json');
  fs.writeFileSync(dumpPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n✓ Saved 12-document evaluation dump to: ${dumpPath}`);
}

run12PdfEvaluation().catch((err) => {
  console.error('Fatal evaluation runner error:', err);
  process.exit(1);
});
