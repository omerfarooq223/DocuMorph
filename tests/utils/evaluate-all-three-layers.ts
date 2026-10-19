import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParser } from '../../server/services/pdf-parser.js';
import { TableExtractor } from '../../server/services/table-extractor.js';
import { KVExtractor } from '../../server/services/kv-extractor.js';
import { DocumentClassifier } from '../../server/services/document-classifier.js';
import { LocalExtractor } from '../../server/services/local-extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function evaluateLayer(layerName: string, dirPath: string, filePattern: RegExp, expectedTypeMap?: Record<string, string>) {
  const files = fs.readdirSync(dirPath).filter(f => filePattern.test(f)).sort();
  console.log(`\n======================================================`);
  console.log(`Evaluating Layer: ${layerName} (${files.length} documents)`);
  console.log(`======================================================`);

  let specificCorrect = 0;
  let genericFallback = 0;
  let incorrectSpecific = 0;

  const results: any[] = [];

  for (const f of files) {
    const filePath = path.join(dirPath, f);
    const buf = fs.readFileSync(filePath);
    try {
      const doc = await PDFParser.parse(buf, { fileName: f, enableOcrFallback: false });
      const tables = TableExtractor.extractTables(doc);
      const kvs = KVExtractor.extract(doc, tables);
      const classification = DocumentClassifier.classify(doc, tables, kvs.keyValuePairs);
      const res = LocalExtractor.transform(doc, classification.documentType, tables, kvs.keyValuePairs, kvs.lists, kvs.sections);

      const expected = expectedTypeMap ? expectedTypeMap[f] : undefined;
      const detected = classification.documentType;

      let outcome = 'unknown';
      if (expected) {
        if (detected === expected) {
          if (detected === 'generic') {
            genericFallback++;
            outcome = 'generic_fallback';
          } else {
            specificCorrect++;
            outcome = 'specific_correct';
          }
        } else {
          if (detected === 'generic') {
            genericFallback++;
            outcome = 'generic_fallback';
          } else {
            incorrectSpecific++;
            outcome = 'incorrect_specific';
          }
        }
      } else {
        if (detected === 'generic') {
          genericFallback++;
          outcome = 'generic_fallback';
        } else {
          specificCorrect++;
          outcome = 'specific_detected';
        }
      }

      console.log(`  ${f.padEnd(45)} -> ${detected.padEnd(16)} (conf: ${classification.confidence.toFixed(2)}) [expected: ${expected || 'N/A'}] => ${outcome}`);
      results.push({
        filename: f,
        detected,
        expected,
        confidence: classification.confidence,
        outcome
      });
    } catch (err: any) {
      console.error(`  ERROR on ${f}:`, err.message);
    }
  }

  console.log(`\nLayer ${layerName} Summary:`);
  console.log(`  Specific Correct / Detected: ${specificCorrect}`);
  console.log(`  Generic Fallback:            ${genericFallback}`);
  console.log(`  Incorrect Specific:          ${incorrectSpecific}`);

  return { layerName, total: files.length, specificCorrect, genericFallback, incorrectSpecific, results };
}

async function main() {
  // Layer 1: Synthetic
  const syntheticExpected: Record<string, string> = {
    '23_document_invoice.pdf': 'invoice',
    '24_document_receipt.pdf': 'receipt',
    '25_document_bank_statement.pdf': 'bank_statement',
    '26_document_resume.pdf': 'resume',
    '27_document_research_paper.pdf': 'research_paper',
    '28_document_business_report.pdf': 'generic',
    '29_document_contract.pdf': 'contract',
    '30_document_form.pdf': 'generic',
    '31_document_academic_transcript.pdf': 'generic',
    '32_document_purchase_order.pdf': 'generic',
  };
  const syntheticRes = await evaluateLayer(
    'Synthetic Corpus',
    path.resolve(__dirname, '../corpus/synthetic'),
    /\.pdf$/,
    syntheticExpected
  );

  // Layer 2: Real Stress Pack
  const realExpected: Record<string, string> = {
    'real_01_invoice_word_export.pdf': 'invoice',
    'real_02_invoice_freelance_billing.pdf': 'invoice',
    'real_03_invoice_multi_item_parts.pdf': 'invoice',
    'real_04_invoice_consulting_services.pdf': 'invoice',
    'real_05_bank_statement_checking.pdf': 'bank_statement',
    'real_06_bank_statement_savings_2pages.pdf': 'bank_statement',
    'real_07_bank_statement_commercial_landscape.pdf': 'bank_statement',
    'real_08_receipt_pos_thermal.pdf': 'receipt',
    'real_09_receipt_restaurant_vat.pdf': 'receipt',
    'real_10_resume_tech_lead_word.pdf': 'resume',
    'real_11_resume_academic_latex.pdf': 'resume',
    'real_12_business_quarterly_report.pdf': 'generic',
    'real_13_operations_metrics_report.pdf': 'generic',
    'real_14_academic_paper_two_column.pdf': 'research_paper',
    'real_15_conference_proceedings_paper.pdf': 'research_paper',
    'real_16_contract_service_level_agreement.pdf': 'contract',
    'real_17_form_vendor_registration.pdf': 'generic',
    'real_18_spreadsheet_export_budget.pdf': 'generic',
    'real_19_scanned_utility_bill_ocr.pdf': 'generic',
    'real_20_scanned_receipt_mobile_photo.pdf': 'generic',
  };
  const realRes = await evaluateLayer(
    'Real Stress Corpus',
    path.resolve(__dirname, '../corpus/real'),
    /\.pdf$/,
    realExpected
  );

  // Layer 3: Phase 5 Independent Real-World Corpus
  const indExpected: Record<string, string> = {
    '01_IRS_Form_W9.pdf': 'generic',
    '02_IRS_Form_1040.pdf': 'generic',
    '03_IRS_Schedule_C.pdf': 'generic',
    '04_USCIS_Form_I9.pdf': 'generic',
    '05_State_Department_DS11_Passport.pdf': 'generic',
    '06_IRS_Form_941.pdf': 'generic',
    '07_Census_ACS_2025_Questionnaire.pdf': 'generic',
    '08_FDA_Form_3500_MedWatch.pdf': 'generic',
    '09_FedEx_Commercial_Invoice.pdf': 'generic',
    '10_NIST_AI_RMF_1_0.pdf': 'generic',
    '11_NIST_Cybersecurity_Framework_2_0.pdf': 'generic',
    '12_NIST_SP_800_53r5.pdf': 'generic',
    '13_NASA_Systems_Engineering_Handbook.pdf': 'generic',
    '14_WHO_RPQ_Annual_Report_2025.pdf': 'generic',
    '15_Apple_2025_Form_10K.pdf': 'generic',
    '16_Berkshire_Hathaway_2025_Annual_Report.pdf': 'generic',
    '17_Attention_Is_All_You_Need.pdf': 'research_paper',
    '18_BERT_Pretraining.pdf': 'generic',
    '19_Deep_Residual_Learning_ResNet.pdf': 'generic',
    '20_LOC_Gettysburg_Address_Scan.pdf': 'generic',
  };
  const indRes = await evaluateLayer(
    'Independent Real-World Corpus',
    path.resolve(__dirname, '../../phase5_real_independent/independent_pdfs'),
    /\.pdf$/,
    indExpected
  );

  console.log(`\n======================================================`);
  console.log(`   THREE-LAYER CLASSIFICATION MATRIX SUMMARY          `);
  console.log(`======================================================`);
  console.log(`Layer                   | Total | Correct Specific | Safe Generic | Incorrect Specific`);
  console.log(`--------------------------------------------------------------------------------------`);
  console.log(`Synthetic Corpus        | ${String(syntheticRes.total).padEnd(5)} | ${String(syntheticRes.specificCorrect).padEnd(16)} | ${String(syntheticRes.genericFallback).padEnd(12)} | ${syntheticRes.incorrectSpecific}`);
  console.log(`Real Stress Corpus      | ${String(realRes.total).padEnd(5)} | ${String(realRes.specificCorrect).padEnd(16)} | ${String(realRes.genericFallback).padEnd(12)} | ${realRes.incorrectSpecific}`);
  console.log(`Independent Real Corpus | ${String(indRes.total).padEnd(5)} | ${String(indRes.specificCorrect).padEnd(16)} | ${String(indRes.genericFallback).padEnd(12)} | ${indRes.incorrectSpecific}`);
}

main().catch(console.error);
