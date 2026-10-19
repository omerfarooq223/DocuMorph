import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { PDFParser } from '../server/services/pdf-parser.js';
import { TableExtractor } from '../server/services/table-extractor.js';
import { KVExtractor } from '../server/services/kv-extractor.js';
import { DocumentClassifier } from '../server/services/document-classifier.js';
import { LocalExtractor } from '../server/services/local-extractor.js';
import { InvariantChecker } from '../server/services/invariant-checker.js';
import { JSONValidator } from '../server/services/json-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type EvaluationDiscrepancyType =
  | 'FIELD_MISSING'
  | 'FIELD_INCORRECT'
  | 'FIELD_UNEXPECTED'
  | 'TABLE_MISSING'
  | 'TABLE_ROW_MISSING'
  | 'TABLE_ROW_UNEXPECTED'
  | 'DOCUMENT_TYPE_INCORRECT';

export type RootCauseTaxonomy =
  | 'LINE_ORDER'
  | 'COLUMN_ORDER'
  | 'TABLE_NOT_DETECTED'
  | 'TABLE_COLUMN_SPLIT'
  | 'TABLE_ROW_MERGE'
  | 'HEADER_FALSE_POSITIVE'
  | 'FOOTER_FALSE_POSITIVE'
  | 'KEY_VALUE_ASSOCIATION'
  | 'DOCUMENT_MISCLASSIFICATION'
  | 'OCR_CHARACTER_ERROR'
  | 'OCR_LAYOUT_ERROR'
  | 'DATE_NORMALIZATION'
  | 'CURRENCY_NORMALIZATION'
  | 'READING_ORDER'
  | 'ENCODING'
  | 'UNKNOWN';

export interface RecordedDiscrepancy {
  documentId: string;
  fileName: string;
  discrepancy: EvaluationDiscrepancyType;
  fieldOrTable?: string;
  expectedValue?: any;
  actualValue?: any;
  suggestedRootCause: RootCauseTaxonomy;
  confirmedRootCause: RootCauseTaxonomy | null;
  notes?: string;
}

export interface CorpusEvaluationSummary {
  corpusType: 'Synthetic Stress Scenarios' | 'Real-World Evaluation Corpus';
  totalDocuments: number;
  reviewedDocuments: number;
  unreviewedDocuments: number;
  fieldMetrics: {
    expected: number;
    correct: number;
    incorrect: number;
    missing: number;
    unexpected: number;
    precision: number;
    precisionFormatted: string;
    recall: number;
    recallFormatted: string;
  };
  tableMetrics: {
    expectedTables: number;
    detectedTables: number;
    expectedRows: number;
    extractedRows: number;
    matchedRows: number;
    missingRows: number;
    matchRateFormatted: string;
  };
  classificationMetrics: {
    totalChecked: number;
    correct: number;
    incorrect: number;
    genericFallback: number;
    accuracyFormatted: string;
  };
  invariantsMetrics: {
    totalChecked: number;
    passed: number;
    violationsCount: number;
    passRateFormatted: string;
  };
  discrepancies: RecordedDiscrepancy[];
  documentResults: Array<{
    fileName: string;
    docType: string;
    expectedType?: string;
    groundTruthStatus: 'synthetic' | 'reviewed' | 'partial-reviewed' | 'draft' | 'none';
    isEvaluatedForAccuracy: boolean;
    fieldsPassed: number;
    fieldsTotal: number;
    tableRowsExtracted: number;
    tableRowsExpected: number;
    invariantsPassed: boolean;
    violations: string[];
    executionTimeMs: number;
  }>;
}

export class EvaluationRunner {
  public static getGitCommitHash(): string {
    try {
      return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unversioned';
    }
  }

  public static async runCorpusEvaluation(
    corpusDir: string,
    corpusName: 'Synthetic Stress Scenarios' | 'Real-World Evaluation Corpus'
  ): Promise<CorpusEvaluationSummary> {
    const summary: CorpusEvaluationSummary = {
      corpusType: corpusName,
      totalDocuments: 0,
      reviewedDocuments: 0,
      unreviewedDocuments: 0,
      fieldMetrics: {
        expected: 0,
        correct: 0,
        incorrect: 0,
        missing: 0,
        unexpected: 0,
        precision: 100,
        precisionFormatted: '100.0% (0 / 0)',
        recall: 100,
        recallFormatted: '100.0% (0 / 0)',
      },
      tableMetrics: {
        expectedTables: 0,
        detectedTables: 0,
        expectedRows: 0,
        extractedRows: 0,
        matchedRows: 0,
        missingRows: 0,
        matchRateFormatted: '100.0% (0 / 0)',
      },
      classificationMetrics: {
        totalChecked: 0,
        correct: 0,
        incorrect: 0,
        genericFallback: 0,
        accuracyFormatted: '100.0% (0 / 0)',
      },
      invariantsMetrics: {
        totalChecked: 0,
        passed: 0,
        violationsCount: 0,
        passRateFormatted: '100.0% (0 / 0)',
      },
      discrepancies: [],
      documentResults: [],
    };

    if (!fs.existsSync(corpusDir)) {
      return summary;
    }

    // Read manifest if available in directory
    const manifestPath = path.join(corpusDir, 'manifest.json');
    let manifestMap: Record<string, any> = {};
    if (fs.existsSync(manifestPath)) {
      try {
        const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (Array.isArray(manifestData.documents)) {
          manifestData.documents.forEach((d: any) => {
            if (d.fileName) manifestMap[d.fileName] = d;
            if (d.id) manifestMap[d.id] = d;
          });
        }
      } catch {}
    }

    const files = fs.readdirSync(corpusDir);
    const pdfFiles = files.filter((f) => f.endsWith('.pdf')).sort();
    summary.totalDocuments = pdfFiles.length;

    console.log(`\n======================================================`);
    console.log(`  EVALUATING: ${corpusName.toUpperCase()}`);
    console.log(`  Directory: ${corpusDir}`);
    console.log(`  Total PDF Documents: ${pdfFiles.length}`);
    console.log(`======================================================\n`);

    if (pdfFiles.length === 0) {
      console.log(`  [Notice] No documents found in ${corpusDir}.`);
      console.log(`  Status: Real-world validation infrastructure complete (0 real documents added).`);
      return summary;
    }

    const isSynthetic = corpusName === 'Synthetic Stress Scenarios';

    for (const pdfFile of pdfFiles) {
      const baseName = pdfFile.replace(/\.pdf$/, '');
      const expectedJsonPath = path.join(corpusDir, `${baseName}.expected.json`);
      const snapshotPath = path.join(corpusDir, `${baseName}.snapshot.json`);
      const pdfPath = path.join(corpusDir, pdfFile);

      const manifestEntry = manifestMap[pdfFile] || manifestMap[baseName];
      let groundTruthStatus: 'synthetic' | 'reviewed' | 'partial-reviewed' | 'draft' | 'none' = isSynthetic
        ? 'synthetic'
        : manifestEntry?.groundTruthStatus || 'none';

      let expectedJson: any = null;
      if (fs.existsSync(expectedJsonPath)) {
        try {
          expectedJson = JSON.parse(fs.readFileSync(expectedJsonPath, 'utf8'));
          if (!isSynthetic && groundTruthStatus === 'none') {
            groundTruthStatus = 'reviewed';
          }
        } catch {}
      }

      const isEvaluatedForAccuracy =
        isSynthetic || groundTruthStatus === 'reviewed' || groundTruthStatus === 'partial-reviewed';

      if (isEvaluatedForAccuracy && expectedJson) {
        summary.reviewedDocuments++;
      } else {
        summary.unreviewedDocuments++;
      }

      const fileBuffer = fs.readFileSync(pdfPath);
      const startTime = Date.now();

      try {
        // Step 1: PDF Parsing
        const idr = await PDFParser.parse(fileBuffer, { fileName: pdfFile });
        // Step 2: Tables
        const tables = TableExtractor.extractTables(idr);
        idr.tables = tables;
        // Step 3: Key-Values & Lists
        const { keyValuePairs, lists, sections } = KVExtractor.extract(idr, tables);
        idr.keyValuePairs = keyValuePairs;
        idr.lists = lists;
        idr.sections = sections;
        // Step 4: Classification
        const classification = DocumentClassifier.classify(idr, tables, keyValuePairs);
        // Step 5: Transformation
        const { semanticJson, structuralJson, provenanceMap } = LocalExtractor.transform(
          idr,
          classification.documentType,
          tables,
          keyValuePairs,
          lists,
          sections
        );
        // Step 6: Validation
        const validated = JSONValidator.validateAndRepair(semanticJson);
        const execTimeMs = Date.now() - startTime;

        // Step 7: Invariants Verification
        const invariants = InvariantChecker.verifyInvariants(
          idr,
          provenanceMap,
          validated.data as Record<string, any>
        );

        summary.invariantsMetrics.totalChecked++;
        if (invariants.passed) {
          summary.invariantsMetrics.passed++;
        } else {
          summary.invariantsMetrics.violationsCount += invariants.violations.length;
        }

        let docFieldsExpected = 0;
        let docFieldsCorrect = 0;
        let docExpectedRows = 0;
        let docExtractedRows = 0;

        // Discrepancy checks against ground truth (ONLY for reviewed ground truth)
        if (isEvaluatedForAccuracy && expectedJson) {
          // 1. Classification check
          if (expectedJson.document_type) {
            summary.classificationMetrics.totalChecked++;
            if (classification.documentType === expectedJson.document_type) {
              summary.classificationMetrics.correct++;
            } else if (classification.documentType === 'generic') {
              summary.classificationMetrics.genericFallback++;
              if (expectedJson.document_type !== 'generic') {
                summary.discrepancies.push({
                  documentId: baseName,
                  fileName: pdfFile,
                  discrepancy: 'DOCUMENT_TYPE_INCORRECT',
                  expectedValue: expectedJson.document_type,
                  actualValue: classification.documentType,
                  suggestedRootCause: 'DOCUMENT_MISCLASSIFICATION',
                  confirmedRootCause: null,
                });
              }
            } else {
              summary.classificationMetrics.incorrect++;
              summary.discrepancies.push({
                documentId: baseName,
                fileName: pdfFile,
                discrepancy: 'DOCUMENT_TYPE_INCORRECT',
                expectedValue: expectedJson.document_type,
                actualValue: classification.documentType,
                suggestedRootCause: 'DOCUMENT_MISCLASSIFICATION',
                confirmedRootCause: null,
              });
            }
          }

          // 2. Field accuracy check
          if (expectedJson.fields && typeof expectedJson.fields === 'object') {
            for (const [fKey, fExpectedVal] of Object.entries(expectedJson.fields)) {
              docFieldsExpected++;
              summary.fieldMetrics.expected++;

              const actualVal =
                (validated.data as any)[fKey] !== undefined
                  ? (validated.data as any)[fKey]
                  : (validated.data as any).document?.key_values?.[fKey];

              if (actualVal !== undefined && actualVal !== null) {
                const isMatch = this.semanticValuesMatch(actualVal, fExpectedVal);
                if (isMatch) {
                  docFieldsCorrect++;
                  summary.fieldMetrics.correct++;
                } else {
                  summary.fieldMetrics.incorrect++;
                  summary.discrepancies.push({
                    documentId: baseName,
                    fileName: pdfFile,
                    discrepancy: 'FIELD_INCORRECT',
                    fieldOrTable: fKey,
                    expectedValue: fExpectedVal,
                    actualValue: actualVal,
                    suggestedRootCause: typeof fExpectedVal === 'number' ? 'CURRENCY_NORMALIZATION' : 'KEY_VALUE_ASSOCIATION',
                    confirmedRootCause: null,
                  });
                }
              } else {
                summary.fieldMetrics.missing++;
                summary.discrepancies.push({
                  documentId: baseName,
                  fileName: pdfFile,
                  discrepancy: 'FIELD_MISSING',
                  fieldOrTable: fKey,
                  expectedValue: fExpectedVal,
                  actualValue: null,
                  suggestedRootCause: 'KEY_VALUE_ASSOCIATION',
                  confirmedRootCause: null,
                });
              }
            }
          }

          // 3. Table accuracy check
          if (expectedJson.tables && typeof expectedJson.tables === 'object') {
            for (const [tKey, tDef] of Object.entries(expectedJson.tables as Record<string, any>)) {
              summary.tableMetrics.expectedTables++;
              if (tDef.expectedRowCount !== undefined) {
                docExpectedRows += tDef.expectedRowCount;
                summary.tableMetrics.expectedRows += tDef.expectedRowCount;
              }

              const extractedTotalRows = tables.reduce((acc, t) => acc + t.rows.length, 0);
              docExtractedRows = extractedTotalRows;
              summary.tableMetrics.extractedRows += extractedTotalRows;

              if (tDef.expectedRowCount !== undefined) {
                const matched = Math.min(extractedTotalRows, tDef.expectedRowCount);
                summary.tableMetrics.matchedRows += matched;
                if (extractedTotalRows < tDef.expectedRowCount) {
                  const missingCount = tDef.expectedRowCount - extractedTotalRows;
                  summary.tableMetrics.missingRows += missingCount;
                  summary.discrepancies.push({
                    documentId: baseName,
                    fileName: pdfFile,
                    discrepancy: 'TABLE_ROW_MISSING',
                    fieldOrTable: tKey,
                    expectedValue: tDef.expectedRowCount,
                    actualValue: extractedTotalRows,
                    suggestedRootCause: 'TABLE_ROW_MERGE',
                    confirmedRootCause: null,
                    notes: `Missing ${missingCount} expected table rows`,
                  });
                }
              }
            }
          }
        }

        summary.documentResults.push({
          fileName: pdfFile,
          docType: classification.documentType,
          expectedType: expectedJson?.document_type,
          groundTruthStatus,
          isEvaluatedForAccuracy,
          fieldsPassed: docFieldsCorrect,
          fieldsTotal: docFieldsExpected,
          tableRowsExtracted: docExtractedRows,
          tableRowsExpected: docExpectedRows,
          invariantsPassed: invariants.passed,
          violations: invariants.violations,
          executionTimeMs: execTimeMs,
        });

        const statusTag = !isEvaluatedForAccuracy
          ? '[UNREVIEWED]'
          : invariants.passed && (docFieldsExpected === 0 || docFieldsCorrect === docFieldsExpected)
          ? '✓ [PASS]'
          : '⚠ [CHECK]';

        console.log(
          `  ${statusTag} ${pdfFile} -> ${classification.documentType} (${execTimeMs}ms) ` +
            (isEvaluatedForAccuracy
              ? `[Fields: ${docFieldsCorrect}/${docFieldsExpected}, Tables: ${docExtractedRows} rows]`
              : `(Ground Truth: ${groundTruthStatus})`)
        );
      } catch (err: any) {
        console.error(`  ✗ [FAIL] ${pdfFile}: ${err.message}`);
        summary.documentResults.push({
          fileName: pdfFile,
          docType: 'error',
          groundTruthStatus,
          isEvaluatedForAccuracy,
          fieldsPassed: 0,
          fieldsTotal: 0,
          tableRowsExtracted: 0,
          tableRowsExpected: 0,
          invariantsPassed: false,
          violations: [err.message],
          executionTimeMs: Date.now() - startTime,
        });
      }
    }

    // Compute Metrics with explicit (num / den) formatting
    const correctF = summary.fieldMetrics.correct;
    const totalActualF = correctF + summary.fieldMetrics.incorrect + summary.fieldMetrics.unexpected;
    summary.fieldMetrics.precision = totalActualF > 0 ? Math.round((correctF / totalActualF) * 1000) / 10 : 100;
    summary.fieldMetrics.precisionFormatted = `${summary.fieldMetrics.precision}% (${correctF} / ${totalActualF})`;

    summary.fieldMetrics.recall = summary.fieldMetrics.expected > 0 ? Math.round((correctF / summary.fieldMetrics.expected) * 1000) / 10 : 100;
    summary.fieldMetrics.recallFormatted = `${summary.fieldMetrics.recall}% (${correctF} / ${summary.fieldMetrics.expected})`;

    const expRows = summary.tableMetrics.expectedRows;
    const matchRows = summary.tableMetrics.matchedRows;
    const rowRate = expRows > 0 ? Math.round((matchRows / expRows) * 1000) / 10 : 100;
    summary.tableMetrics.matchRateFormatted = `${rowRate}% (${matchRows} / ${expRows})`;

    const totalClass = summary.classificationMetrics.totalChecked;
    const correctClass = summary.classificationMetrics.correct;
    const classAcc = totalClass > 0 ? Math.round((correctClass / totalClass) * 1000) / 10 : 100;
    summary.classificationMetrics.accuracyFormatted = `${classAcc}% (${correctClass} / ${totalClass})`;

    const totalInv = summary.invariantsMetrics.totalChecked;
    const passedInv = summary.invariantsMetrics.passed;
    const invRate = totalInv > 0 ? Math.round((passedInv / totalInv) * 1000) / 10 : 100;
    summary.invariantsMetrics.passRateFormatted = `${invRate}% (${passedInv} / ${totalInv})`;

    this.printSummary(summary);
    return summary;
  }

  private static semanticValuesMatch(actual: any, expected: any): boolean {
    if (actual === expected) return true;
    if (typeof actual === 'number' && typeof expected === 'number') {
      return Math.abs(actual - expected) < 0.01;
    }
    if (typeof actual === 'string' && typeof expected === 'string') {
      return actual.trim().toLowerCase() === expected.trim().toLowerCase();
    }
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  private static printSummary(s: CorpusEvaluationSummary): void {
    console.log(`\n======================================================`);
    console.log(`  EVALUATION SUMMARY: ${s.corpusType.toUpperCase()}`);
    console.log(`======================================================`);
    console.log(`  Documents in Corpus: ${s.totalDocuments}`);
    console.log(`  Reviewed for Metrics: ${s.reviewedDocuments}`);
    console.log(`  Unreviewed / Draft:   ${s.unreviewedDocuments}`);

    if (s.reviewedDocuments === 0 && s.corpusType === 'Real-World Evaluation Corpus') {
      console.log(`\n  [Status Note]: Real-world validation infrastructure complete.`);
      console.log(`  No reviewed independently produced PDFs in corpus yet.`);
      console.log(`======================================================\n`);
      return;
    }

    console.log(`\n  --- Field Extraction ---`);
    console.log(`  Expected Fields:     ${s.fieldMetrics.expected}`);
    console.log(`  Correct Fields:      ${s.fieldMetrics.correct}`);
    console.log(`  Incorrect Fields:    ${s.fieldMetrics.incorrect}`);
    console.log(`  Missing Fields:      ${s.fieldMetrics.missing}`);
    console.log(`  Field Precision:     ${s.fieldMetrics.precisionFormatted}`);
    console.log(`  Field Recall:        ${s.fieldMetrics.recallFormatted}`);

    console.log(`\n  --- Table Extraction ---`);
    console.log(`  Expected Tables:     ${s.tableMetrics.expectedTables}`);
    console.log(`  Expected Rows:       ${s.tableMetrics.expectedRows}`);
    console.log(`  Extracted Rows:      ${s.tableMetrics.extractedRows}`);
    console.log(`  Matched Rows:        ${s.tableMetrics.matchedRows}`);
    console.log(`  Missing Rows:        ${s.tableMetrics.missingRows}`);
    console.log(`  Row Match Rate:      ${s.tableMetrics.matchRateFormatted}`);

    console.log(`\n  --- Classification ---`);
    console.log(`  Correct:             ${s.classificationMetrics.correct}`);
    console.log(`  Generic Fallback:    ${s.classificationMetrics.genericFallback}`);
    console.log(`  Incorrect:           ${s.classificationMetrics.incorrect}`);
    console.log(`  Accuracy:            ${s.classificationMetrics.accuracyFormatted}`);

    console.log(`\n  --- Invariant Verification ---`);
    console.log(`  Invariant Pass Rate: ${s.invariantsMetrics.passRateFormatted} (${s.invariantsMetrics.violationsCount} violations)`);
    console.log(`======================================================\n`);
  }
}

// CLI runner
async function main() {
  const syntheticDir = path.resolve(__dirname, 'corpus/synthetic');
  const realDir = path.resolve(__dirname, 'corpus/real');

  const gitCommit = EvaluationRunner.getGitCommitHash();
  const timestamp = new Date().toISOString();

  console.log('\n======================================================');
  console.log('   PDF TO JSON AGENT — GROUND TRUTH EVALUATION RUNNER  ');
  console.log(`   Timestamp: ${timestamp} | Git Commit: ${gitCommit}`);
  console.log('======================================================\n');

  // 1. Synthetic Stress Corpus Run
  const syntheticSummary = await EvaluationRunner.runCorpusEvaluation(
    syntheticDir,
    'Synthetic Stress Scenarios'
  );

  // 2. Real-World Evaluation Corpus Run
  const realSummary = await EvaluationRunner.runCorpusEvaluation(
    realDir,
    'Real-World Evaluation Corpus'
  );

  const totalViolations =
    syntheticSummary.invariantsMetrics.violationsCount + realSummary.invariantsMetrics.violationsCount;
  if (totalViolations > 0) {
    console.warn(`[Evaluation] Completed with ${totalViolations} invariant violations.`);
  } else {
    console.log('[Evaluation] All invariant assertions verified cleanly.');
  }
}

if (process.argv[1] && process.argv[1].endsWith('evaluation-runner.ts')) {
  main().catch((err) => {
    console.error('Fatal evaluation runner error:', err);
    process.exit(1);
  });
}
