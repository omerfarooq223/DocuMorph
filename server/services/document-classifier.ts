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
    const textLower = doc.rawText.toLowerCase();
    const kvKeys = kvs.map((k) => k.key.toLowerCase());

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

    // 1. Invoice heuristics (Requires strong combinations, not just a keyword)
    if (textLower.includes('invoice') || textLower.includes('tax invoice') || textLower.includes('bill to')) {
      scores.invoice.score += 0.3;
      scores.invoice.reasons.push('Contains invoice title / bill-to terminology');
    }
    if (kvKeys.some((k) => k.includes('invoice_no') || k.includes('invoice_num') || k.includes('invoice_id') || k.includes('inv_no'))) {
      scores.invoice.score += 0.35;
      scores.invoice.reasons.push('Found explicit invoice number field');
    }
    if (kvKeys.some((k) => k.includes('due_date') || k.includes('subtotal') || k.includes('tax_rate') || k.includes('vat'))) {
      scores.invoice.score += 0.25;
      scores.invoice.reasons.push('Found invoice financial fields (due date, tax, subtotal)');
    }
    if (tables.some((t) => t.headers.some((h) => ['qty', 'quantity', 'price', 'unit_price', 'item', 'description', 'amount'].includes(h)))) {
      scores.invoice.score += 0.2;
      scores.invoice.reasons.push('Contains line-item table structure');
    }

    // 2. Receipt heuristics
    if (textLower.includes('receipt') || textLower.includes('sales receipt') || textLower.includes('cashier')) {
      scores.receipt.score += 0.35;
      scores.receipt.reasons.push('Contains receipt terminology');
    }
    if (textLower.includes('payment method') || textLower.includes('change due') || textLower.includes('card ending')) {
      scores.receipt.score += 0.35;
      scores.receipt.reasons.push('Contains point-of-sale receipt details');
    }

    // 3. Bank Statement heuristics
    if (textLower.includes('bank statement') || textLower.includes('account statement') || textLower.includes('statement of account')) {
      scores.bank_statement.score += 0.35;
      scores.bank_statement.reasons.push('Contains bank statement header');
    }
    if (kvKeys.some((k) => k.includes('account_number') || k.includes('account_no') || k.includes('iban') || k.includes('sort_code') || k.includes('statement_period'))) {
      scores.bank_statement.score += 0.35;
      scores.bank_statement.reasons.push('Found bank account identification fields');
    }
    if (tables.some((t) => t.headers.some((h) => ['balance', 'debit', 'credit', 'withdrawal', 'deposit', 'transaction'].includes(h)))) {
      scores.bank_statement.score += 0.3;
      scores.bank_statement.reasons.push('Contains banking transaction table headers');
    }

    // 4. Resume / CV heuristics
    if (
      textLower.includes('curriculum vitae') ||
      textLower.includes('resume') ||
      (textLower.includes('experience') && (textLower.includes('education') || textLower.includes('skills') || textLower.includes('summary') || textLower.includes('competencies')))
    ) {
      scores.resume.score += 0.45;
      scores.resume.reasons.push('Contains standard resume sections (experience, skills, summary)');
    }
    if (
      kvKeys.some((k) => k.includes('linkedin') || k.includes('github') || k.includes('portfolio') || k.includes('email') || k.includes('phone')) ||
      textLower.includes('work experience') ||
      textLower.includes('employment history')
    ) {
      scores.resume.score += 0.35;
      scores.resume.reasons.push('Contains career profile markers or contact details');
    }

    // 5. Contract heuristics
    if (textLower.includes('agreement') || textLower.includes('contract') || textLower.includes('terms and conditions') || textLower.includes('whereas') || textLower.includes('in witness whereof')) {
      scores.contract.score += 0.4;
      scores.contract.reasons.push('Contains legal contract terminology');
    }
    if (textLower.includes('party of the first part') || (textLower.includes('governing law') && textLower.includes('signatures'))) {
      scores.contract.score += 0.35;
      scores.contract.reasons.push('Contains legal clauses and signature sections');
    }

    // 6. Research Paper heuristics
    if (textLower.includes('abstract') && (textLower.includes('references') || textLower.includes('bibliography') || textLower.includes('methodology'))) {
      scores.research_paper.score += 0.5;
      scores.research_paper.reasons.push('Contains academic paper structure (abstract, references, methodology)');
    }

    // Find highest score
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

    // Strict rule: If highest confidence is below 0.60, use 'generic'
    if (highestScore < 0.60) {
      return {
        documentType: 'generic',
        confidence: Math.round((1.0 - highestScore) * 100) / 100,
        reasons: ['Classification confidence below threshold (0.60); falling back to generic structure'],
      };
    }

    return {
      documentType: bestType,
      confidence: Math.min(Math.round(highestScore * 100) / 100, 0.99),
      reasons: bestReasons,
    };
  }
}
