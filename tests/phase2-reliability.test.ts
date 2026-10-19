import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PDFParser } from '../server/services/pdf-parser.js';
import { TableExtractor } from '../server/services/table-extractor.js';
import { KVExtractor } from '../server/services/kv-extractor.js';
import { DocumentClassifier } from '../server/services/document-classifier.js';
import { LocalExtractor } from '../server/services/local-extractor.js';
import { InvariantChecker } from '../server/services/invariant-checker.js';
import { parseNumberSafely, normalizeDateSafely, parseTypedValueWithProvenance } from '../server/utils/normalizer.js';
import { config } from '../server/config.js';

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

async function runPhase2Tests() {
  console.log('\n======================================================');
  console.log('   PDF TO JSON AGENT — PHASE 2 RELIABILITY TEST SUITE ');
  console.log('======================================================\n');

  // -------------------------------------------------------------------
  // TEST SUITE 1: Provenance Strengthening & Source Value Preservation
  // -------------------------------------------------------------------
  console.log('Test Suite 1: Provenance Strengthening & Normalization Invariants');

  // Normalization value vs source value tracking
  const dateVal = parseTypedValueWithProvenance('20/08/2026');
  assert(dateVal.value === '2026-08-20', 'Date normalized to ISO format YYYY-MM-DD');
  assert(dateVal.sourceValue === '20/08/2026', 'Original source date preserved as "20/08/2026"');
  assert(dateVal.normalization === 'date', 'Normalization type accurately identified as "date"');

  const currVal = parseTypedValueWithProvenance('$1,250.00');
  assert(currVal.value === 1250, 'Currency parsed to number 1250');
  assert(currVal.sourceValue === '$1,250.00', 'Original currency string preserved as "$1,250.00"');
  assert(currVal.normalization === 'currency', 'Normalization type accurately identified as "currency"');

  // Negative currency handling
  const accountingNeg = parseNumberSafely('($150.00)');
  assert(accountingNeg === -150, 'Accounting negative ($150.00) parsed to -150');

  const standardNeg = parseNumberSafely('-$85.50');
  assert(standardNeg === -85.5, 'Negative currency -$85.50 parsed to -85.5');

  // -------------------------------------------------------------------
  // TEST SUITE 2: Multi-Column Layout Detection & Reading Order
  // -------------------------------------------------------------------
  console.log('\nTest Suite 2: Multi-Column Layout Detection & Reading Order');

  const twoColDoc = await PDFDocument.create();
  const font = await twoColDoc.embedFont(StandardFonts.Helvetica);
  const bold = await twoColDoc.embedFont(StandardFonts.HelveticaBold);
  const colPage = twoColDoc.addPage([595.28, 841.89]);

  colPage.drawText('Spanning Article Title Banner', { x: 50, y: 800, size: 18, font: bold });
  // Column 1
  colPage.drawText('Column 1 Line 1', { x: 50, y: 750, size: 10, font });
  colPage.drawText('Column 1 Line 2', { x: 50, y: 730, size: 10, font });
  colPage.drawText('Column 1 Line 3', { x: 50, y: 710, size: 10, font });
  // Column 2
  colPage.drawText('Column 2 Line 1', { x: 330, y: 750, size: 10, font });
  colPage.drawText('Column 2 Line 2', { x: 330, y: 730, size: 10, font });
  colPage.drawText('Column 2 Line 3', { x: 330, y: 710, size: 10, font });

  const twoColBytes = await twoColDoc.save();
  const parsedTwoCol = await PDFParser.parse(Buffer.from(twoColBytes));

  assert(parsedTwoCol.metadata.hasMultiColumnLayout === true, 'Detected multi-column layout on page');
  assert(parsedTwoCol.pages[0].regions.length === 2, 'Created 2 distinct column layout regions');
  
  // Verify reading order: Column 1 lines appear BEFORE Column 2 lines in reading order
  const col1LineIdx = parsedTwoCol.pages[0].lines.findIndex((l) => l.text.includes('Column 1 Line 3'));
  const col2LineIdx = parsedTwoCol.pages[0].lines.findIndex((l) => l.text.includes('Column 2 Line 1'));
  assert(
    col1LineIdx < col2LineIdx,
    'Reading order correctly reads down Column 1 before Column 2 (not interleaved horizontally)',
    `col1LineIdx: ${col1LineIdx}, col2LineIdx: ${col2LineIdx}`
  );

  // -------------------------------------------------------------------
  // TEST SUITE 3: Multi-Page Table Continuation with Page Provenance
  // -------------------------------------------------------------------
  console.log('\nTest Suite 3: Multi-Page Table Continuation & Row Page Provenance');

  const mpTableDoc = await PDFDocument.create();
  const mpFont = await mpTableDoc.embedFont(StandardFonts.Helvetica);
  const mpBold = await mpTableDoc.embedFont(StandardFonts.HelveticaBold);

  const p1 = mpTableDoc.addPage([595.28, 841.89]);
  p1.drawText('Ledger Header', { x: 50, y: 790, size: 12, font: mpBold });
  p1.drawText('Date', { x: 50, y: 750, size: 10, font: mpBold });
  p1.drawText('Description', { x: 180, y: 750, size: 10, font: mpBold });
  p1.drawText('Amount', { x: 420, y: 750, size: 10, font: mpBold });
  p1.drawText('2026-08-01', { x: 50, y: 730, size: 9, font: mpFont });
  p1.drawText('Item Page 1', { x: 180, y: 730, size: 9, font: mpFont });
  p1.drawText('$100.00', { x: 420, y: 730, size: 9, font: mpFont });

  const p2 = mpTableDoc.addPage([595.28, 841.89]);
  p2.drawText('Date', { x: 50, y: 750, size: 10, font: mpBold });
  p2.drawText('Description', { x: 180, y: 750, size: 10, font: mpBold });
  p2.drawText('Amount', { x: 420, y: 750, size: 10, font: mpBold });
  p2.drawText('2026-08-02', { x: 50, y: 730, size: 9, font: mpFont });
  p2.drawText('Item Page 2', { x: 180, y: 730, size: 9, font: mpFont });
  p2.drawText('$200.00', { x: 420, y: 730, size: 9, font: mpFont });

  const mpDocParsed = await PDFParser.parse(Buffer.from(await mpTableDoc.save()));
  const mpTables = TableExtractor.extractTables(mpDocParsed);

  assert(mpTables.length === 1, 'Stitched continuous table across 2 pages into 1 logical table');
  assert(mpTables[0] && mpTables[0].pages.length === 2 && mpTables[0].pages[0] === 1 && mpTables[0].pages[1] === 2, 'Table tracks both pages [1, 2]');
  assert(mpTables[0] && mpTables[0].rows.length === 2, 'Contains 2 merged data rows');
  assert(mpTables[0] && mpTables[0].rowProvenance?.[0]?.sourcePage === 1, 'Row 1 retains sourcePage = 1');
  assert(mpTables[0] && mpTables[0].rowProvenance?.[1]?.sourcePage === 2, 'Row 2 retains sourcePage = 2');

  // -------------------------------------------------------------------
  // TEST SUITE 4: Repeated Headers & Footers Detection
  // -------------------------------------------------------------------
  console.log('\nTest Suite 4: Repeated Header and Footer Detection');

  const hfDoc = await PDFDocument.create();
  const hfFont = await hfDoc.embedFont(StandardFonts.Helvetica);
  const hfBold = await hfDoc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 1; i <= 3; i++) {
    const page = hfDoc.addPage([595.28, 841.89]);
    // Top repeated header
    page.drawText('CONFIDENTIAL INTERNAL AUDIT', { x: 50, y: 810, size: 10, font: hfBold });
    page.drawText(`Body content line on page ${i}`, { x: 50, y: 700, size: 10, font: hfFont });
    // Bottom repeated footer
    page.drawText('Page ' + i + ' of 3', { x: 260, y: 35, size: 9, font: hfFont });
  }

  const hfDocParsed = await PDFParser.parse(Buffer.from(await hfDoc.save()));
  assert(hfDocParsed.metadata.hasRepeatedHeaders === true, 'Detected recurring running headers');
  assert(hfDocParsed.metadata.hasRepeatedFooters === true, 'Detected recurring running footers / page numbers');

  const headerLine = hfDocParsed.pages[0].lines.find((l) => l.text.includes('CONFIDENTIAL'));
  const footerLine = hfDocParsed.pages[0].lines.find((l) => l.text.includes('Page 1 of 3'));
  assert(headerLine?.role === 'header', 'Marked top banner line with role="header"');
  assert(footerLine?.role === 'footer', 'Marked bottom footer line with role="footer"');

  // -------------------------------------------------------------------
  // TEST SUITE 5: Mixed Native Text + OCR Document Handling
  // -------------------------------------------------------------------
  console.log('\nTest Suite 5: Mixed Native Text + Scanned Pages Handling');

  const mixedDoc = await PDFDocument.create();
  const mixedFont = await mixedDoc.embedFont(StandardFonts.Helvetica);
  const mixedBold = await mixedDoc.embedFont(StandardFonts.HelveticaBold);

  // Page 1: Native Text
  const m1 = mixedDoc.addPage([595.28, 841.89]);
  m1.drawText('Invoice Number: INV-MIXED-100', { x: 50, y: 780, size: 12, font: mixedBold });
  m1.drawText('Customer: Alpha Group Ltd', { x: 50, y: 760, size: 10, font: mixedFont });

  // Page 2: Scanned Simulation (low text density)
  const m2 = mixedDoc.addPage([595.28, 841.89]);
  m2.drawRectangle({ x: 50, y: 50, width: 495, height: 740, color: rgb(0.95, 0.95, 0.95) });
  m2.drawText('SCANNED_PAGE_2', { x: 60, y: 750, size: 7, font: mixedFont });

  // Page 3: Native Text
  const m3 = mixedDoc.addPage([595.28, 841.89]);
  m3.drawText('Total Amount: $1,200.00', { x: 50, y: 780, size: 12, font: mixedBold });
  m3.drawText('Terms and Conditions: All contractual obligations remain in effect for 12 months.', { x: 50, y: 750, size: 10, font: mixedFont });

  // Page 4: Scanned Simulation
  const m4 = mixedDoc.addPage([595.28, 841.89]);
  m4.drawRectangle({ x: 50, y: 50, width: 495, height: 740, color: rgb(0.95, 0.95, 0.95) });
  m4.drawText('SCANNED_PAGE_4', { x: 60, y: 750, size: 7, font: mixedFont });

  const mixedParsed = await PDFParser.parse(Buffer.from(await mixedDoc.save()));
  assert(mixedParsed.pages[0].isScanned === false, 'Page 1 correctly identified as native digital text');
  assert(mixedParsed.pages[1].isScanned === true, 'Page 2 correctly identified as scanned candidate');
  assert(mixedParsed.pages[2].isScanned === false, 'Page 3 correctly identified as native digital text');
  assert(mixedParsed.pages[3].isScanned === true, 'Page 4 correctly identified as scanned candidate');

  // -------------------------------------------------------------------
  // TEST SUITE 6: Automated Extraction Invariants
  // -------------------------------------------------------------------
  console.log('\nTest Suite 6: Automated Extraction Invariants');

  const invKVs = KVExtractor.extract(mixedParsed, []);
  const invClass = DocumentClassifier.classify(mixedParsed, [], invKVs.keyValuePairs);
  const invTransform = LocalExtractor.transform(
    mixedParsed,
    invClass.documentType,
    [],
    invKVs.keyValuePairs,
    invKVs.lists,
    invKVs.sections
  );

  const invariantResult = InvariantChecker.verifyInvariants(
    mixedParsed,
    invTransform.provenanceMap,
    invTransform.semanticJson
  );

  assert(invariantResult.passed === true, 'All automated invariants passed cleanly (0 violations)');
  assert(invariantResult.violations.length === 0, 'No page, bounding box, grounding, or normalization violations');

  // -------------------------------------------------------------------
  // TEST SUITE 7: Resource Limits & Safeguards
  // -------------------------------------------------------------------
  console.log('\nTest Suite 7: Resource Limits & Safeguards');

  let caughtCorrupted = false;
  try {
    await PDFParser.parse(Buffer.from('CORRUPTED_PDF_HEADER_NOT_VALID'));
  } catch (err: any) {
    caughtCorrupted = true;
    assert(
      err.code === 'INVALID_PDF' || err.code === 'PDF_CORRUPTED' || err.message.includes('Invalid'),
      'Gracefully rejected corrupted PDF with informative error message'
    );
  }
  assert(caughtCorrupted === true, 'Corrupted buffer did not crash the process');

  // Summary
  console.log('\n======================================================');
  console.log(`   PHASE 2 TESTS COMPLETED: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('======================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPhase2Tests().catch((err) => {
  console.error('Fatal Phase 2 test error:', err);
  process.exit(1);
});
