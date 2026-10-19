import {
  KeyValuePair,
  ListItem,
  DocumentSection,
  IntermediateDocument,
  Provenance,
  RawTable,
  ConfidenceLevel,
} from '../types.js';
import { cleanText, parseTypedValueWithProvenance } from '../utils/normalizer.js';

export class KVExtractor {
  /**
   * Extract Key-Value Pairs, Lists, and Section Hierarchies from IntermediateDocument
   */
  public static extract(
    doc: IntermediateDocument,
    tables: RawTable[]
  ): {
    keyValuePairs: KeyValuePair[];
    lists: ListItem[];
    sections: DocumentSection[];
  } {
    const keyValuePairs: KeyValuePair[] = [];
    const lists: ListItem[] = [];

    // Collect bounding boxes of tables to avoid double extraction
    const tableBoxes: Array<{ pages: number[]; box: any }> = tables.map((t) => ({
      pages: t.pages,
      box: t.boundingBox,
    }));

    const overlapsTable = (page: number, y: number, height: number): boolean => {
      return tableBoxes.some(
        (tb) => tb.pages.includes(page) && y >= tb.box.y - 5 && y <= tb.box.y + tb.box.height + 5
      );
    };

    // 1. Extract Key-Value Pairs and Lists across all pages
    for (const page of doc.pages) {
      const pageKVs: KeyValuePair[] = [];

      for (const line of page.lines) {
        // Skip header/footer lines and lines overlapping detected tables
        if (line.role === 'header' || line.role === 'footer') {
          continue;
        }

        if (overlapsTable(page.pageNumber, line.y, line.height)) {
          continue;
        }

        const trimmedText = line.text.trim();
        if (!trimmedText) continue;

        // Check for Bullet or Numbered Lists
        const bulletMatch = trimmedText.match(/^([\*\-\•\–\—\>])\s+(.+)$/);
        const numberListMatch = trimmedText.match(/^(\d{1,3}[\.\)])\s+(.+)$/);

        if (bulletMatch) {
          lists.push({
            type: 'bullet',
            marker: bulletMatch[1],
            text: cleanText(bulletMatch[2]),
            page: page.pageNumber,
            provenance: {
              page: page.pageNumber,
              sourceText: trimmedText,
              sourceValue: cleanText(bulletMatch[2]),
              normalization: 'none',
              confidence: 'high',
              sourceMethod: line.sourceMethod || 'pdf_text',
              boundingBox: {
                x: line.minX,
                y: line.y,
                width: line.maxX - line.minX,
                height: line.height,
              },
            },
          });
          continue;
        }

        if (numberListMatch) {
          lists.push({
            type: 'numbered',
            marker: numberListMatch[1],
            text: cleanText(numberListMatch[2]),
            page: page.pageNumber,
            provenance: {
              page: page.pageNumber,
              sourceText: trimmedText,
              sourceValue: cleanText(numberListMatch[2]),
              normalization: 'none',
              confidence: 'high',
              sourceMethod: line.sourceMethod || 'pdf_text',
              boundingBox: {
                x: line.minX,
                y: line.y,
                width: line.maxX - line.minX,
                height: line.height,
              },
            },
          });
          continue;
        }

        // Strategy A: Explicit Colon/Equals Delimiter (e.g. "Invoice Number: NS-2026-0841")
        const lineParts = trimmedText.includes('|') ? trimmedText.split('|') : [trimmedText];
        let foundAnyKV = false;

        for (const part of lineParts) {
          const partTrimmed = part.trim();
          const kvMatch = partTrimmed.match(/^([A-Za-z0-9\s_\-\/\(\)\#\.\&]{2,40})\s*[:\=]\s*(.+)$/);

          if (kvMatch) {
            const rawKey = cleanText(kvMatch[1]);
            const rawValue = cleanText(kvMatch[2]);

            // Exclude URLs, timestamps (e.g. "15:00"), print footers, and pure numbers
            const isTimestampOrFooter =
              /^\d+$/.test(rawKey) ||
              /^\d{1,2}$/.test(rawKey) ||
              /printed\s+\d+/i.test(rawKey) ||
              /^\d{2}\/\d{2}\/\d{4}/.test(rawKey) ||
              rawKey.toLowerCase() === 'http' ||
              rawKey.toLowerCase() === 'https';

            if (!isTimestampOrFooter && rawValue.length > 0) {
              const normalizedKey = this.normalizeKeyName(rawKey);
              const typedResult = parseTypedValueWithProvenance(rawValue);
              const confidence: ConfidenceLevel = 'high';

              const kv: KeyValuePair = {
                key: normalizedKey,
                value: typedResult.value,
                rawKey,
                rawValue,
                sourceValue: typedResult.sourceValue,
                normalization: typedResult.normalization,
                confidence,
                provenance: {
                  page: page.pageNumber,
                  sourceText: partTrimmed,
                  sourceValue: typedResult.sourceValue,
                  normalization: typedResult.normalization,
                  confidence,
                  sourceMethod: line.sourceMethod || 'pdf_text',
                  coordinateSpace: line.sourceMethod === 'ocr' ? 'ocr_image' : 'idr_top_left',
                  boundingBox: {
                    x: line.minX,
                    y: line.y,
                    width: line.maxX - line.minX,
                    height: line.height,
                  },
                },
              };

              keyValuePairs.push(kv);
              pageKVs.push(kv);
              foundAnyKV = true;
            }
          }
        }

        if (foundAnyKV) {
          continue;
        }

        // Strategy B: Multi-item positional key-value pairs (e.g. ["Invoice Number", "NS-1024", "Invoice Date", "28 August"])
        if (line.items.length >= 2 && line.items.length % 2 === 0) {
          let allPairsValid = true;
          const candidateKvs: KeyValuePair[] = [];

          for (let k = 0; k < line.items.length; k += 2) {
            const labelItem = line.items[k];
            const valItem = line.items[k + 1];
            const labelText = cleanText(labelItem.text);
            const valText = cleanText(valItem.text);

            const isKnownLabel =
              /^[A-Za-z\s_\-]{2,30}$/.test(labelText) &&
              /\b(invoice|number|date|due|customer|account|sort code|vat|po|order|ref|agreement|currency|total|subtotal|tax|balance)\b/i.test(
                labelText
              );

            if (isKnownLabel && valText.length > 0) {
              const normalizedKey = this.normalizeKeyName(labelText);
              const typedResult = parseTypedValueWithProvenance(valText);
              const confidence: ConfidenceLevel = 'medium';

              candidateKvs.push({
                key: normalizedKey,
                value: typedResult.value,
                rawKey: labelText,
                rawValue: valText,
                sourceValue: typedResult.sourceValue,
                normalization: typedResult.normalization,
                confidence,
                provenance: {
                  page: page.pageNumber,
                  sourceText: `${labelItem.text} ${valItem.text}`,
                  sourceValue: typedResult.sourceValue,
                  normalization: typedResult.normalization,
                  confidence,
                  sourceMethod: line.sourceMethod || 'pdf_text',
                  coordinateSpace: 'idr_top_left',
                  boundingBox: {
                    x: labelItem.x,
                    y: labelItem.y,
                    width: valItem.x + valItem.width - labelItem.x,
                    height: Math.max(labelItem.height, valItem.height),
                  },
                },
              });
            } else {
              allPairsValid = false;
              break;
            }
          }

          if (allPairsValid && candidateKvs.length > 0) {
            candidateKvs.forEach((kv) => {
              keyValuePairs.push(kv);
              pageKVs.push(kv);
            });
            continue;
          }
        }

        // Strategy C: Space-separated summary line (e.g. "Subtotal 541.25", "Total 649.50", "Balance Due 649.50")
        const summaryMatch = trimmedText.match(
          /^([A-Za-z\s_\-]{3,25})\s+((?:\$|€|£)?\s*-?\d+(?:[.,]\d+)?\s*%?)$/i
        );
        if (summaryMatch) {
          const labelText = cleanText(summaryMatch[1]);
          const valText = cleanText(summaryMatch[2]);
          const isKnownSummary =
            /\b(subtotal|total|vat|tax|amount paid|balance due|net total|gross amount)\b/i.test(
              labelText
            );

          if (isKnownSummary) {
            const normalizedKey = this.normalizeKeyName(labelText);
            const typedResult = parseTypedValueWithProvenance(valText);
            const confidence: ConfidenceLevel = 'high';

            const kv: KeyValuePair = {
              key: normalizedKey,
              value: typedResult.value,
              rawKey: labelText,
              rawValue: valText,
              sourceValue: typedResult.sourceValue,
              normalization: typedResult.normalization,
              confidence,
              provenance: {
                page: page.pageNumber,
                sourceText: trimmedText,
                sourceValue: typedResult.sourceValue,
                normalization: typedResult.normalization,
                confidence,
                sourceMethod: line.sourceMethod || 'pdf_text',
                coordinateSpace: 'idr_top_left',
                boundingBox: {
                  x: line.minX,
                  y: line.y,
                  width: line.maxX - line.minX,
                  height: line.height,
                },
              },
            };

            keyValuePairs.push(kv);
            pageKVs.push(kv);
            continue;
          }
        }
      }

      page.detectedKeyValues = pageKVs;
    }

    // 2. Build Document Sections with Headings
    const sections = this.buildSections(doc, tables, keyValuePairs, lists);

    return {
      keyValuePairs,
      lists,
      sections,
    };
  }

  private static normalizeKeyName(rawKey: string): string {
    return cleanText(rawKey)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private static buildSections(
    doc: IntermediateDocument,
    tables: RawTable[],
    keyValuePairs: KeyValuePair[],
    lists: ListItem[]
  ): DocumentSection[] {
    const sections: DocumentSection[] = [];
    let currentSection: DocumentSection = {
      heading: null,
      page: 1,
      content: '',
      tables: [],
      lists: [],
      keyValuePairs: [],
      blocks: [],
    };

    for (const page of doc.pages) {
      for (const block of page.textBlocks) {
        if (block.role === 'header' || block.role === 'footer') {
          continue;
        }

        if (block.isHeading) {
          if (
            currentSection.content.trim().length > 0 ||
            currentSection.tables.length > 0 ||
            currentSection.keyValuePairs.length > 0 ||
            currentSection.lists.length > 0
          ) {
            sections.push(currentSection);
          }

          currentSection = {
            heading: cleanText(block.text),
            headingLevel: block.headingLevel || 1,
            page: page.pageNumber,
            content: '',
            tables: [],
            lists: [],
            keyValuePairs: [],
            blocks: [block],
          };
        } else {
          currentSection.blocks.push(block);
          currentSection.content += (currentSection.content ? '\n\n' : '') + block.text;
        }
      }
    }

    // Attach tables, KVs, and lists
    for (const table of tables) {
      const matchSection = sections.find((s) => table.pages.includes(s.page)) || currentSection;
      matchSection.tables.push(table);
    }

    for (const kv of keyValuePairs) {
      const matchSection = sections.find((s) => s.page === kv.provenance.page) || currentSection;
      matchSection.keyValuePairs.push(kv);
    }

    for (const list of lists) {
      const matchSection = sections.find((s) => s.page === list.page) || currentSection;
      matchSection.lists.push(list);
    }

    if (
      currentSection.content.trim().length > 0 ||
      currentSection.tables.length > 0 ||
      currentSection.keyValuePairs.length > 0 ||
      currentSection.lists.length > 0 ||
      currentSection.heading !== null
    ) {
      sections.push(currentSection);
    }

    if (sections.length === 0 && doc.rawText.trim().length > 0) {
      sections.push({
        heading: doc.metadata.title || 'Document Content',
        page: 1,
        content: doc.rawText,
        tables,
        lists,
        keyValuePairs,
        blocks: doc.allTextBlocks,
      });
    }

    return sections;
  }
}
