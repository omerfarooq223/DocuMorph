import {
  KeyValuePair,
  ListItem,
  DocumentSection,
  IntermediateDocument,
  Provenance,
  RawTable,
  TextBlock,
} from '../types.js';
import { parseNumberSafely, parseBooleanSafely, normalizeDateSafely, cleanText } from '../utils/normalizer.js';

export class KVExtractor {
  /**
   * Extract Key-Value Pairs, Lists, and Section Hierarchies from IntermediateDocument
   */
  public static extract(doc: IntermediateDocument, tables: RawTable[]): {
    keyValuePairs: KeyValuePair[];
    lists: ListItem[];
    sections: DocumentSection[];
  } {
    const keyValuePairs: KeyValuePair[] = [];
    const lists: ListItem[] = [];
    const tableBoundingBoxes = tables.map((t) => ({
      page: t.page,
      box: t.boundingBox,
    }));

    // Check if a block or line overlaps with an extracted table
    const overlapsTable = (page: number, y: number, height: number): boolean => {
      return tableBoundingBoxes.some(
        (tb) => tb.page === page && y >= tb.box.y - 5 && y <= tb.box.y + tb.box.height + 5
      );
    };

    // 1. Extract Key-Value Pairs and Lists across all pages
    for (const page of doc.pages) {
      for (const line of page.lines) {
        // Skip lines that are part of detected tables to avoid duplication
        if (overlapsTable(page.pageNumber, line.y, line.height)) {
          continue;
        }

        const trimmedText = line.text.trim();
        if (!trimmedText) continue;

        // Check for Bullet or Numbered Lists
        // e.g. "- Item", "• Item", "* Item", "1. Item", "1) Item"
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

        // Check for compound Key-Value Pairs on one line separated by | or ;
        // e.g. "Email: test@example.com | Phone: +1-555-0199 | Location: CA"
        const lineParts = trimmedText.includes('|') ? trimmedText.split('|') : [trimmedText];
        let foundAnyKV = false;

        for (const part of lineParts) {
          const partTrimmed = part.trim();
          const kvMatch = partTrimmed.match(/^([A-Za-z0-9\s_\-\/\(\)\#\.\&]{2,40})\s*[:\=]\s*(.+)$/);
          if (kvMatch) {
            const rawKey = cleanText(kvMatch[1]);
            const rawValue = cleanText(kvMatch[2]);

            if (
              rawKey.toLowerCase() !== 'http' &&
              rawKey.toLowerCase() !== 'https' &&
              !/^\d+$/.test(rawKey) &&
              rawValue.length > 0
            ) {
              const normalizedKey = this.normalizeKeyName(rawKey);
              const typedValue = this.parseTypedValue(rawValue);

              keyValuePairs.push({
                key: normalizedKey,
                value: typedValue,
                rawKey,
                rawValue,
                provenance: {
                  page: page.pageNumber,
                  sourceText: partTrimmed,
                  boundingBox: {
                    x: line.minX,
                    y: line.y,
                    width: line.maxX - line.minX,
                    height: line.height,
                  },
                },
              });
              foundAnyKV = true;
            }
          }
        }

        if (foundAnyKV) {
          continue;
        }
      }
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

  private static parseTypedValue(rawValue: string): string | number | boolean | null {
    if (!rawValue) return null;

    // Check for boolean
    const bool = parseBooleanSafely(rawValue);
    if (bool !== null) return bool;

    // Check for date
    const date = normalizeDateSafely(rawValue);
    if (date !== null) return date;

    // Check for number / currency
    const num = parseNumberSafely(rawValue);
    if (num !== null) return num;

    return rawValue;
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
        if (block.isHeading) {
          // Push previous section if it contains content
          if (
            currentSection.content.trim().length > 0 ||
            currentSection.tables.length > 0 ||
            currentSection.keyValuePairs.length > 0 ||
            currentSection.lists.length > 0
          ) {
            sections.push(currentSection);
          }

          // Start new section with heading
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

    // Attach tables, KVs, and lists to corresponding sections by page / proximity
    for (const table of tables) {
      const matchSection = sections.find((s) => s.page === table.page) || currentSection;
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

    // If no sections with headings were formed, wrap into a single default section
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
