import {
  DocumentType,
  ClassificationResult,
  IntermediateDocument,
  RawTable,
  KeyValuePair,
} from '../types.js';

export class DocumentClassifier {
  public static classify(
    doc: IntermediateDocument,
    tables: RawTable[],
    kvs: KeyValuePair[]
  ): ClassificationResult {
    const pageCount = Math.max(1, doc.metadata.pageCount || doc.pages.length || 1);
    const pages = doc.pages || [];
    const getPageText = (page?: IntermediateDocument['pages'][0]): string => {
      if (!page) return '';
      return (page.lines || []).map((l) => l.text).join(' \n ');
    };

    const firstPageText = (getPageText(pages[0]) || '').toLowerCase();
    const earlyPagesText = pages.slice(0, 3).map((p) => getPageText(p).toLowerCase()).join(' \n ');
    const fullText = (doc.rawText || '').toLowerCase();

    const kvKeys = (kvs || []).map((k) => (k && k.key ? k.key.toLowerCase() : ''));
    const earlyKvKeys = (kvs || [])
      .filter((k) => !k?.provenance || k.provenance.page <= 3)
      .map((k) => (k && k.key ? k.key.toLowerCase() : ''));

    const scores: Record<DocumentType, { score: number; reasons: string[] }> = {
      invoice: { score: 0, reasons: [] },
      receipt: { score: 0, reasons: [] },
      bank_statement: { score: 0, reasons: [] },
      resume: { score: 0, reasons: [] },
      contract: { score: 0, reasons: [] },
      research_paper: { score: 0, reasons: [] },
      report: { score: 0, reasons: [] },
      form: { score: 0, reasons: [] },
      product_catalogue: { score: 0, reasons: [] },
      academic_document: { score: 0, reasons: [] },
      statement: { score: 0, reasons: [] },
      generic: { score: 0.2, reasons: ['Default baseline'] },
    };

    // Helper: Soft length scaling factor (reduces score gracefully when page count exceeds typical single-record size)
    const getSoftLengthMultiplier = (typicalMaxPages: number): number => {
      if (pageCount <= typicalMaxPages) return 1.0;
      return 1.0 / (1.0 + Math.log(1.0 + (pageCount - typicalMaxPages)) * 0.55);
    };

    // -------------------------------------------------------------
    // 1. Invoice Heuristics
    // -------------------------------------------------------------
    let invoiceSignals = 0;
    const invoiceReasons: string[] = [];

    // Header / Bill-to signal (strongly weighted on early pages)
    if (
      /\b(tax\s+invoice|commercial\s+invoice|proforma\s+invoice|invoice)\b/i.test(earlyPagesText) ||
      /\b(bill\s+to|billed\s+to|invoice\s+to|sold\s+to)\b/i.test(earlyPagesText)
    ) {
      invoiceSignals += 0.35;
      invoiceReasons.push('Contains invoice title / bill-to terminology on early pages');
    }

    // Invoice identifier field
    if (
      earlyKvKeys.some(
        (k) =>
          k.includes('invoice_no') ||
          k.includes('invoice_num') ||
          k.includes('invoice_id') ||
          k.includes('inv_no') ||
          k.includes('invoice_#') ||
          k.includes('invoice_code')
      ) ||
      /\binvoice\s*(?:no|num|number|#|id)\b/i.test(earlyPagesText)
    ) {
      invoiceSignals += 0.35;
      invoiceReasons.push('Found explicit invoice identifier');
    }

    // Invoice financial terms (due date, payment terms, VAT/tax breakdown)
    if (
      earlyKvKeys.some(
        (k) =>
          k.includes('due_date') ||
          k.includes('subtotal') ||
          k.includes('tax_rate') ||
          k.includes('vat') ||
          k.includes('balance_due') ||
          k.includes('payment_terms')
      ) ||
      /\b(due\s+date|payment\s+terms|subtotal|balance\s+due)\b/i.test(earlyPagesText)
    ) {
      invoiceSignals += 0.25;
      invoiceReasons.push('Found invoice financial terms (due date, subtotal, balance due)');
    }

    // Line-item tabular structure
    if (
      tables.some((t) =>
        t.headers.some((h) =>
          ['qty', 'quantity', 'price', 'unit_price', 'item', 'description', 'amount', 'rate'].includes(
            h.toLowerCase()
          )
        )
      )
    ) {
      invoiceSignals += 0.25;
      invoiceReasons.push('Contains itemized line-item table structure');
    }

    const invoiceLenMult = getSoftLengthMultiplier(15);
    scores.invoice.score = invoiceSignals * invoiceLenMult;
    scores.invoice.reasons = invoiceReasons;

    // -------------------------------------------------------------
    // 2. Receipt Heuristics (Point of Sale, transactional)
    // -------------------------------------------------------------
    let receiptSignals = 0;
    const receiptReasons: string[] = [];

    // Early page POS / sales receipt keywords
    if (
      /\b(sales\s+receipt|store\s+receipt|cash\s+receipt|receipt|register\s+#|pos\s+terminal|cashier)\b/i.test(
        firstPageText
      )
    ) {
      receiptSignals += 0.35;
      receiptReasons.push('Contains point-of-sale receipt header / cashier indicator');
    }

    // POS tender & transaction markers
    if (
      /\b(payment\s+method|change\s+due|cash\s+tendered|card\s+ending|auth\s+code|terminal\s+#|merchant\s+id)\b/i.test(
        earlyPagesText
      )
    ) {
      receiptSignals += 0.4;
      receiptReasons.push('Contains POS transaction tender details (change due, card ending, payment method)');
    }

    // Coherence check: receipts require co-located POS signals on short documents
    const receiptLenMult = getSoftLengthMultiplier(3);
    scores.receipt.score = receiptSignals * receiptLenMult;
    scores.receipt.reasons = receiptReasons;

    // -------------------------------------------------------------
    // 3. Bank Statement Heuristics
    // -------------------------------------------------------------
    let bankSignals = 0;
    const bankReasons: string[] = [];

    if (
      /\b(bank\s+statement|account\s+statement|statement\s+of\s+account|monthly\s+statement)\b/i.test(
        earlyPagesText
      )
    ) {
      bankSignals += 0.4;
      bankReasons.push('Contains bank statement title / header');
    }

    if (
      earlyKvKeys.some(
        (k) =>
          k.includes('account_number') ||
          k.includes('account_no') ||
          k.includes('iban') ||
          k.includes('sort_code') ||
          k.includes('statement_period') ||
          k.includes('opening_balance') ||
          k.includes('closing_balance')
      ) ||
      /\b(account\s+number|account\s+no|sort\s+code|iban|statement\s+period|opening\s+balance|closing\s+balance)\b/i.test(
        earlyPagesText
      )
    ) {
      bankSignals += 0.35;
      bankReasons.push('Found banking account identifiers / statement period / balance fields');
    }

    if (
      tables.some((t) =>
        t.headers.some((h) =>
          ['balance', 'debit', 'credit', 'withdrawal', 'deposit', 'transaction', 'paid out', 'paid in'].includes(
            h.toLowerCase()
          )
        )
      )
    ) {
      bankSignals += 0.35;
      bankReasons.push('Contains banking transaction ledger table with balance/debit/credit');
    }

    const bankLenMult = getSoftLengthMultiplier(12);
    scores.bank_statement.score = bankSignals * bankLenMult;
    scores.bank_statement.reasons = bankReasons;

    // -------------------------------------------------------------
    // 4. Resume / CV Heuristics
    // -------------------------------------------------------------
    let resumeSignals = 0;
    const resumeReasons: string[] = [];

    // Check for explicit CV header on page 1
    const hasExplicitCvTitle = /\b(curriculum\s+vitae|resume|resumé)\b/i.test(firstPageText);
    if (hasExplicitCvTitle) {
      resumeSignals += 0.4;
      resumeReasons.push('Contains explicit Curriculum Vitae / Resume title on first page');
    }

    // Check for co-located core resume section headers on page 1 or 2
    const p12Text = pages.slice(0, 2).map((p) => getPageText(p).toLowerCase()).join(' \n ');
    const hasExperienceHeader = /\b(work\s+experience|professional\s+experience|employment\s+history|experience)\b/i.test(
      p12Text
    );
    const hasEducationHeader = /\b(education|academic\s+background|qualifications)\b/i.test(p12Text);
    const hasSkillsHeader = /\b(skills|technical\s+skills|core\s+competencies)\b/i.test(p12Text);

    let sectionHits = 0;
    if (hasExperienceHeader) sectionHits++;
    if (hasEducationHeader) sectionHits++;
    if (hasSkillsHeader) sectionHits++;

    if (sectionHits >= 2) {
      resumeSignals += 0.35;
      resumeReasons.push('Found multiple standard resume sections (experience, education, skills) on early pages');
    }

    // Candidate contact profile (email, phone, linkedin, github) co-located on page 1
    const hasCandidateContact =
      earlyKvKeys.some(
        (k) =>
          k.includes('linkedin') ||
          k.includes('github') ||
          k.includes('portfolio') ||
          k.includes('email') ||
          k.includes('phone')
      ) ||
      /\b(?:linkedin\.com\/in|github\.com)\b/i.test(p12Text) ||
      (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(firstPageText) &&
        /\b(?:phone|tel|mobile|cell|\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/i.test(firstPageText));

    if (hasCandidateContact && (hasExplicitCvTitle || sectionHits >= 1)) {
      resumeSignals += 0.3;
      resumeReasons.push('Found candidate contact profile co-located with resume structure');
    }

    // Multi-page scaling: Resumes are typically 1-4 pages.
    const resumeLenMult = getSoftLengthMultiplier(4);
    scores.resume.score = resumeSignals * resumeLenMult;
    scores.resume.reasons = resumeReasons;

    // -------------------------------------------------------------
    // 5. Contract Heuristics
    // -------------------------------------------------------------
    let contractSignals = 0;
    const contractReasons: string[] = [];

    if (
      /\b(agreement|contract|terms\s+and\s+conditions|memorandum\s+of\s+understanding|non-disclosure\s+agreement)\b/i.test(
        firstPageText
      ) ||
      /\b(in\s+witness\s+whereof|whereas\s*,|now\s+therefore\s*,)\b/i.test(earlyPagesText)
    ) {
      contractSignals += 0.45;
      contractReasons.push('Contains legal agreement / contract preamble and clauses');
    }

    if (
      /\b(party\s+of\s+the\s+first\s+part|governing\s+law|indemnification|severability|authorized\s+signatures?)\b/i.test(
        fullText
      )
    ) {
      contractSignals += 0.35;
      contractReasons.push('Contains formal contract terms and execution clauses');
    }

    const contractLenMult = getSoftLengthMultiplier(20);
    scores.contract.score = contractSignals * contractLenMult;
    scores.contract.reasons = contractReasons;

    // -------------------------------------------------------------
    // 6. Research Paper Heuristics
    // -------------------------------------------------------------
    let paperSignals = 0;
    const paperReasons: string[] = [];

    if (
      /\babstract\b/i.test(firstPageText) &&
      (/\b(introduction|methodology|related\s+work|conclusion)\b/i.test(earlyPagesText) ||
        /\b(references|bibliography)\b/i.test(fullText))
    ) {
      paperSignals += 0.5;
      paperReasons.push('Contains academic paper structure (Abstract, Introduction, References)');
    }

    if (doc.metadata.hasMultiColumnLayout) {
      paperSignals += 0.2;
      paperReasons.push('Uses multi-column academic publication layout');
    }

    const paperLenMult = getSoftLengthMultiplier(30);
    scores.research_paper.score = paperSignals * paperLenMult;
    scores.research_paper.reasons = paperReasons;

    // -------------------------------------------------------------
    // Find Highest Score with 0.60 Confidence Threshold
    // -------------------------------------------------------------
    let bestType: DocumentType = 'generic';
    let highestScore = 0;
    let bestReasons: string[] = ['Preserving document structure without forced classification'];

    for (const [type, data] of Object.entries(scores)) {
      const docType = type as DocumentType;
      if (docType !== 'generic' && data.score > highestScore) {
        highestScore = data.score;
        bestType = docType;
        bestReasons = data.reasons;
      }
    }

    // Conservative threshold (0.60): if evidence is not clearly sufficient, safely return generic
    if (highestScore < 0.6) {
      return {
        documentType: 'generic',
        confidence: Math.round(highestScore * 100) / 100,
        reasons: ['Classification confidence below threshold (0.60); falling back to generic structure'],
        allScores: scores,
      };
    }

    return {
      documentType: bestType,
      confidence: Math.min(Math.round(highestScore * 100) / 100, 0.99),
      reasons: bestReasons,
      allScores: scores,
    };
  }
}
