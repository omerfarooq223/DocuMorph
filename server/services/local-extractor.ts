import {
  IntermediateDocument,
  RawTable,
  KeyValuePair,
  ListItem,
  DocumentSection,
  DocumentType,
  Provenance,
} from '../types.js';

export class LocalExtractor {
  /**
   * Transforms the Intermediate Document Representation into Semantic and Structural JSON outputs
   */
  public static transform(
    doc: IntermediateDocument,
    docType: DocumentType,
    tables: RawTable[],
    kvs: KeyValuePair[],
    lists: ListItem[],
    sections: DocumentSection[],
    options: { includeMetadata?: boolean } = {}
  ): {
    semanticJson: Record<string, any>;
    structuralJson: any;
    provenanceMap: Record<string, Provenance>;
  } {
    const provenanceMap: Record<string, Provenance> = {};

    // 1. Build Structural JSON (always generated for structure preservation)
    const structuralJson = {
      document_type: docType,
      metadata: doc.metadata,
      sections: sections.map((sec) => ({
        heading: sec.heading,
        page: sec.page,
        content: sec.content,
        tables: sec.tables.map((t) => ({
          id: t.id,
          headers: t.headers,
          rows: t.structuredRows || t.rows,
          confidence: t.confidence,
          sourcePages: t.pages,
        })),
        lists: sec.lists.map((l) => l.text),
        key_values: Object.fromEntries(sec.keyValuePairs.map((kv) => [kv.key, kv.value])),
      })),
    };

    // 2. Build Semantic JSON according to detected DocumentType
    let semanticJson: Record<string, any> = {};

    switch (docType) {
      case 'invoice':
        semanticJson = this.buildInvoiceSemantic(doc, tables, kvs, provenanceMap);
        break;
      case 'bank_statement':
        semanticJson = this.buildBankStatementSemantic(doc, tables, kvs, provenanceMap);
        break;
      case 'resume':
        semanticJson = this.buildResumeSemantic(doc, tables, kvs, lists, sections, provenanceMap);
        break;
      case 'receipt':
        semanticJson = this.buildReceiptSemantic(doc, tables, kvs, provenanceMap);
        break;
      default:
        semanticJson = this.buildGenericSemantic(doc, tables, kvs, lists, sections, provenanceMap);
        break;
    }

    // If includeMetadata is enabled, embed provenance map under _metadata key
    if (options.includeMetadata) {
      semanticJson._extraction_metadata = {
        provenance: provenanceMap,
        document_metadata: doc.metadata,
      };
    }

    return {
      semanticJson,
      structuralJson,
      provenanceMap,
    };
  }

  /**
   * Semantic builder for Invoices
   */
  private static buildInvoiceSemantic(
    doc: IntermediateDocument,
    tables: RawTable[],
    kvs: KeyValuePair[],
    provenanceMap: Record<string, Provenance>
  ): Record<string, any> {
    const kvMap: Record<string, KeyValuePair> = {};
    kvs.forEach((kv) => {
      kvMap[kv.key] = kv;
    });

    const findKV = (keys: string[]): KeyValuePair | undefined => {
      for (const k of keys) {
        if (kvMap[k]) return kvMap[k];
        const partial = Object.keys(kvMap).find((existingKey) => existingKey.includes(k));
        if (partial) return kvMap[partial];
      }
      return undefined;
    };

    const invNum = findKV(['invoice_number', 'invoice_no', 'inv_no', 'invoice_id', 'bill_no']);
    const cust = findKV(['customer', 'bill_to', 'client', 'customer_name', 'billed_to', 'to']);
    const date = findKV(['invoice_date', 'date', 'issue_date', 'billing_date']);
    const dueDate = findKV(['due_date', 'payment_due', 'expiry_date']);
    const subtotal = findKV(['subtotal', 'sub_total', 'net_amount']);
    const tax = findKV(['tax', 'vat', 'gst', 'tax_amount']);
    const total = findKV(['total', 'total_amount', 'amount_due', 'grand_total', 'balance_due']);

    if (invNum) provenanceMap['invoice_number'] = invNum.provenance;
    if (cust) provenanceMap['customer'] = cust.provenance;
    if (date) provenanceMap['date'] = date.provenance;
    if (dueDate) provenanceMap['due_date'] = dueDate.provenance;
    if (subtotal) provenanceMap['subtotal'] = subtotal.provenance;
    if (tax) provenanceMap['tax'] = tax.provenance;
    if (total) provenanceMap['total'] = total.provenance;

    // Find items table
    let items: any[] = [];
    const itemTable =
      tables.find((t) =>
        t.headers.some((h) => ['description', 'item', 'details', 'particulars'].includes(h))
      ) || tables[0];

    if (itemTable && itemTable.structuredRows) {
      items = itemTable.structuredRows;
      itemTable.structuredRows.forEach((_, idx) => {
        const rowProv = itemTable.rowProvenance?.[idx];
        provenanceMap[`items[${idx}]`] = {
          page: rowProv?.sourcePage || itemTable.page,
          sourceText: `Table row ${idx + 1}`,
          sourceValue: JSON.stringify(itemTable.structuredRows?.[idx] || {}),
          confidence: itemTable.confidence,
          sourceMethod: 'pdf_text',
          boundingBox: itemTable.boundingBox,
        };
      });
    }

    return {
      document_type: 'invoice',
      invoice_number: invNum ? invNum.value : null,
      customer: cust ? cust.value : null,
      date: date ? date.value : null,
      due_date: dueDate ? dueDate.value : null,
      items,
      subtotal: subtotal ? subtotal.value : null,
      tax: tax ? tax.value : null,
      total: total ? total.value : null,
    };
  }

  /**
   * Semantic builder for Bank Statements
   */
  private static buildBankStatementSemantic(
    doc: IntermediateDocument,
    tables: RawTable[],
    kvs: KeyValuePair[],
    provenanceMap: Record<string, Provenance>
  ): Record<string, any> {
    const kvMap: Record<string, KeyValuePair> = {};
    kvs.forEach((kv) => {
      kvMap[kv.key] = kv;
    });

    const findKV = (keys: string[]): KeyValuePair | undefined => {
      for (const k of keys) {
        if (kvMap[k]) return kvMap[k];
        const partial = Object.keys(kvMap).find((existingKey) => existingKey.includes(k));
        if (partial) return kvMap[partial];
      }
      return undefined;
    };

    const accNum = findKV(['account_number', 'account_no', 'acc_no', 'iban']);
    const accName = findKV(['account_name', 'account_holder', 'name']);
    const period = findKV(['statement_period', 'period', 'date_range']);
    const openBal = findKV(['opening_balance', 'previous_balance', 'start_balance']);
    const closeBal = findKV(['closing_balance', 'current_balance', 'ending_balance', 'new_balance']);

    if (accNum) provenanceMap['account_number'] = accNum.provenance;
    if (accName) provenanceMap['account_holder'] = accName.provenance;
    if (period) provenanceMap['statement_period'] = period.provenance;
    if (openBal) provenanceMap['opening_balance'] = openBal.provenance;
    if (closeBal) provenanceMap['closing_balance'] = closeBal.provenance;

    let transactions: any[] = [];
    const txnTable =
      tables.find((t) =>
        t.headers.some((h) => ['balance', 'debit', 'credit', 'amount', 'transaction'].includes(h))
      ) || tables[0];

    if (txnTable && txnTable.structuredRows) {
      transactions = txnTable.structuredRows;
      txnTable.structuredRows.forEach((_, idx) => {
        const rowProv = txnTable.rowProvenance?.[idx];
        provenanceMap[`transactions[${idx}]`] = {
          page: rowProv?.sourcePage || txnTable.page,
          sourceText: `Transaction row ${idx + 1}`,
          sourceValue: JSON.stringify(txnTable.structuredRows?.[idx] || {}),
          confidence: txnTable.confidence,
          sourceMethod: 'pdf_text',
          boundingBox: txnTable.boundingBox,
        };
      });
    }

    return {
      document_type: 'bank_statement',
      account_holder: accName ? accName.value : null,
      account_number: accNum ? accNum.value : null,
      statement_period: period ? period.value : null,
      opening_balance: openBal ? openBal.value : null,
      closing_balance: closeBal ? closeBal.value : null,
      transactions,
    };
  }

  /**
   * Semantic builder for Resumes
   */
  private static buildResumeSemantic(
    doc: IntermediateDocument,
    tables: RawTable[],
    kvs: KeyValuePair[],
    lists: ListItem[],
    sections: DocumentSection[],
    provenanceMap: Record<string, Provenance>
  ): Record<string, any> {
    const rawText = doc.rawText;

    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = rawText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const firstLine = doc.pages[0]?.lines[0]?.text || null;

    const contact = {
      name: firstLine,
      email: emailMatch ? emailMatch[0] : null,
      phone: phoneMatch ? phoneMatch[0] : null,
    };

    if (emailMatch) {
      const emailLine = doc.pages.flatMap((p) => p.lines).find((l) => l.text.includes(emailMatch[0]));
      provenanceMap['email'] = {
        page: emailLine?.page || 1,
        sourceText: emailLine?.text || emailMatch[0],
        sourceValue: emailMatch[0],
        confidence: 'high',
        sourceMethod: emailLine?.sourceMethod || 'pdf_text',
        coordinateSpace: emailLine?.sourceMethod === 'ocr' ? 'ocr_image' : 'idr_top_left',
        boundingBox: emailLine
          ? {
              x: emailLine.minX,
              y: emailLine.y,
              width: emailLine.maxX - emailLine.minX,
              height: emailLine.height,
            }
          : undefined,
      };
    }

    const sectionEntries: Record<string, any> = {};
    for (const sec of sections) {
      if (sec.heading) {
        const secKey = sec.heading.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        sectionEntries[secKey] = {
          content: sec.content || null,
          items: sec.lists.map((l) => l.text),
        };
      }
    }

    return {
      document_type: 'resume',
      contact_information: contact,
      sections: sectionEntries,
      raw_skills: lists.filter((l) => l.type === 'bullet').map((l) => l.text),
    };
  }

  /**
   * Semantic builder for Receipts
   */
  private static buildReceiptSemantic(
    doc: IntermediateDocument,
    tables: RawTable[],
    kvs: KeyValuePair[],
    provenanceMap: Record<string, Provenance>
  ): Record<string, any> {
    const kvMap: Record<string, KeyValuePair> = {};
    kvs.forEach((kv) => {
      kvMap[kv.key] = kv;
    });

    const total = kvMap['total'] || kvMap['grand_total'] || kvMap['amount_paid'] || null;
    const date = kvMap['date'] || kvMap['time'] || null;
    const merchant = doc.pages[0]?.lines[0]?.text || null;

    if (total) provenanceMap['total'] = total.provenance;
    if (date) provenanceMap['date'] = date.provenance;

    return {
      document_type: 'receipt',
      merchant,
      date: date ? date.value : null,
      items: tables[0]?.structuredRows || [],
      total: total ? total.value : null,
    };
  }

  /**
   * Generic Semantic Fallback
   */
  private static buildGenericSemantic(
    doc: IntermediateDocument,
    tables: RawTable[],
    kvs: KeyValuePair[],
    lists: ListItem[],
    sections: DocumentSection[],
    provenanceMap: Record<string, Provenance>
  ): Record<string, any> {
    const kvMap: Record<string, any> = {};
    kvs.forEach((kv) => {
      kvMap[kv.key] = kv.value;
      provenanceMap[kv.key] = kv.provenance;
    });

    return {
      document: {
        title:
          doc.metadata.title ||
          (doc.pages[0]?.lines[0]?.text ? doc.pages[0].lines[0].text : null),
        document_type: 'generic',
        metadata: {
          file_name: doc.metadata.fileName,
          page_count: doc.metadata.pageCount,
          file_size_bytes: doc.metadata.fileSizeBytes,
        },
        key_values: Object.keys(kvMap).length > 0 ? kvMap : undefined,
        sections: sections.map((sec) => ({
          heading: sec.heading,
          content: sec.content || null,
          tables: sec.tables.map((t) => t.structuredRows || t.rows),
          lists: sec.lists.map((l) => l.text),
        })),
      },
    };
  }
}
