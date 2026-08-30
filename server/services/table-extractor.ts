import {
  RawTable,
  RawTableCell,
  TextLine,
  TextItem,
  BoundingBox,
  IntermediateDocument,
} from '../types.js';
import { parseNumberSafely, cleanText } from '../utils/normalizer.js';

interface ColumnGutter {
  minX: number;
  maxX: number;
}

export class TableExtractor {
  /**
   * Detect and extract tables from intermediate document lines
   */
  public static extractTables(doc: IntermediateDocument): RawTable[] {
    const extractedTables: RawTable[] = [];

    for (const page of doc.pages) {
      const pageLines = page.lines;
      if (pageLines.length < 2) continue;

      const pageTables = this.extractTablesFromPage(pageLines, page.pageNumber);
      extractedTables.push(...pageTables);
    }

    return extractedTables;
  }

  private static extractTablesFromPage(lines: TextLine[], pageNum: number): RawTable[] {
    const tables: RawTable[] = [];
    const usedLineIndices = new Set<number>();

    // Strategy 1: Explicit Pipe / Delimiter-based tables (e.g. "Product A | 2 | £10")
    for (let i = 0; i < lines.length; i++) {
      if (usedLineIndices.has(i)) continue;
      const line = lines[i];

      if (line.text.includes('|') || line.text.includes('\t')) {
        const tableLines: { line: TextLine; idx: number }[] = [];
        let j = i;
        while (j < lines.length && (lines[j].text.includes('|') || lines[j].text.includes('\t') || lines[j].text.match(/^[-\s|+=]{4,}$/))) {
          if (!lines[j].text.match(/^[-\s|+=]{4,}$/)) {
            tableLines.push({ line: lines[j], idx: j });
          }
          usedLineIndices.add(j);
          j++;
        }

        if (tableLines.length >= 2) {
          const delimiter = line.text.includes('|') ? '|' : '\t';
          const rawRows = tableLines.map((tl) =>
            tl.line.text
              .split(delimiter)
              .map((c) => cleanText(c))
              .filter((c, idx, arr) => (idx === 0 && c === '' ? false : idx === arr.length - 1 && c === '' ? false : true))
          );

          const maxCols = Math.max(...rawRows.map((r) => r.length));
          if (maxCols >= 2) {
            const table = this.createTableFromRows(
              rawRows,
              tableLines.map((tl) => tl.line),
              pageNum,
              tables.length
            );
            tables.push(table);
            continue;
          }
        }
      }
    }

    // Strategy 2: Positional / Coordinate-based multi-column alignment
    for (let i = 0; i < lines.length - 1; i++) {
      if (usedLineIndices.has(i)) continue;

      // Check if line i has multi-column items (either multiple text items with gaps or multi-spaced words)
      const colSegments = this.getLineColumnSegments(lines[i]);
      if (colSegments.length < 2) continue;

      const candidateLines: TextLine[] = [lines[i]];
      const candidateIndices: number[] = [i];
      const baselineCols = colSegments;

      let j = i + 1;
      while (j < lines.length && !usedLineIndices.has(j)) {
        const nextLine = lines[j];
        const nextColSegments = this.getLineColumnSegments(nextLine);

        // Check if nextLine aligns with baseline columns
        if (this.doesAlignWithColumns(nextColSegments, baselineCols)) {
          candidateLines.push(nextLine);
          candidateIndices.push(j);
          j++;
        } else {
          // Allow at most 1 line gap if next lines still align
          if (j + 1 < lines.length && !usedLineIndices.has(j + 1)) {
            const peekSegments = this.getLineColumnSegments(lines[j + 1]);
            if (this.doesAlignWithColumns(peekSegments, baselineCols)) {
              candidateLines.push(nextLine);
              candidateIndices.push(j);
              j++;
              continue;
            }
          }
          break;
        }
      }

      // If we found 2 or more aligned rows, check if it's actually a key-value list (e.g. "Key: Value")
      if (candidateLines.length >= 2) {
        const isKeyValueBlock = candidateLines.every((cl) => {
          const segs = this.getLineColumnSegments(cl);
          return segs.length === 2 && (segs[0].text.endsWith(':') || segs[0].text.endsWith(' -') || segs[0].text.endsWith(' ='));
        });

        if (isKeyValueBlock) {
          // Leave for KVExtractor
          continue;
        }

        candidateIndices.forEach((idx) => usedLineIndices.add(idx));

        const table = this.createTableFromAlignedLines(
          candidateLines,
          baselineCols,
          pageNum,
          tables.length
        );
        if (table.rows.length >= 2 && table.headers.length >= 2 && table.hasReliableHeaders) {
          tables.push(table);
          i = j - 1; // Advance outer loop
        }
      }
    }

    return tables;
  }

  /**
   * Split a text line into column segments using item positions or spacing gaps
   */
  private static getLineColumnSegments(line: TextLine): { text: string; x: number; width: number }[] {
    // If the line has distinct text items separated by X gaps > 12px
    if (line.items.length >= 2) {
      const segments: { text: string; x: number; width: number }[] = [];
      let currentSeg = {
        text: line.items[0].text,
        x: line.items[0].x,
        width: line.items[0].width,
      };

      for (let i = 1; i < line.items.length; i++) {
        const item = line.items[i];
        const gap = item.x - (currentSeg.x + currentSeg.width);

        if (gap > 12) {
          segments.push(currentSeg);
          currentSeg = { text: item.text, x: item.x, width: item.width };
        } else {
          currentSeg.text += (gap > 2 ? ' ' : '') + item.text;
          currentSeg.width = item.x + item.width - currentSeg.x;
        }
      }
      segments.push(currentSeg);

      if (segments.length >= 2) {
        return segments;
      }
    }

    // Fallback: Check multi-space gaps in raw text (e.g. 2 or more spaces)
    const spaceSplits = line.text.split(/\s{2,}/);
    if (spaceSplits.length >= 2) {
      const totalWidth = line.maxX - line.minX;
      const avgCharWidth = line.text.length > 0 ? totalWidth / line.text.length : 8;

      let currentX = line.minX;
      return spaceSplits.map((part) => {
        const seg = {
          text: cleanText(part),
          x: currentX,
          width: Math.max(part.length * avgCharWidth, 20),
        };
        currentX += (part.length + 2) * avgCharWidth;
        return seg;
      });
    }

    return [{ text: line.text, x: line.minX, width: line.maxX - line.minX }];
  }

  /**
   * Check if candidate column segments align with established column layout
   */
  private static doesAlignWithColumns(
    testSegments: { text: string; x: number; width: number }[],
    baseSegments: { text: string; x: number; width: number }[]
  ): boolean {
    if (testSegments.length < 2) return false;

    let matchCount = 0;
    for (const test of testSegments) {
      for (const base of baseSegments) {
        // Match if X coordinates are within 25px tolerance
        if (Math.abs(test.x - base.x) <= 25) {
          matchCount++;
          break;
        }
      }
    }

    return matchCount >= Math.min(2, Math.min(testSegments.length, baseSegments.length));
  }

  /**
   * Build Table from aligned TextLines
   */
  private static createTableFromAlignedLines(
    lines: TextLine[],
    colLayout: { text: string; x: number; width: number }[],
    pageNum: number,
    tableIdx: number
  ): RawTable {
    // Determine column X centers/ranges from all lines
    const colStarts = colLayout.map((c) => c.x).sort((a, b) => a - b);
    const numCols = colStarts.length;

    const rawRows: string[][] = [];
    const rawCells: RawTableCell[] = [];

    lines.forEach((line, rowIdx) => {
      const rowCells: string[] = new Array(numCols).fill('');
      const segments = this.getLineColumnSegments(line);

      segments.forEach((seg) => {
        // Find closest column start
        let bestColIdx = 0;
        let minDiff = Infinity;
        colStarts.forEach((colX, cIdx) => {
          const diff = Math.abs(seg.x - colX);
          if (diff < minDiff) {
            minDiff = diff;
            bestColIdx = cIdx;
          }
        });

        rowCells[bestColIdx] = rowCells[bestColIdx]
          ? rowCells[bestColIdx] + ' ' + cleanText(seg.text)
          : cleanText(seg.text);

        rawCells.push({
          text: cleanText(seg.text),
          page: pageNum,
          rowIndex: rowIdx,
          colIndex: bestColIdx,
          boundingBox: {
            x: seg.x,
            y: line.y,
            width: seg.width,
            height: line.height,
          },
        });
      });

      rawRows.push(rowCells);
    });

    return this.createTableFromRows(rawRows, lines, pageNum, tableIdx, rawCells);
  }

  /**
   * Build RawTable and structured objects from string matrix
   */
  private static createTableFromRows(
    rows: string[][],
    lines: TextLine[],
    pageNum: number,
    tableIdx: number,
    precomputedCells?: RawTableCell[]
  ): RawTable {
    const minX = Math.min(...lines.map((l) => l.minX));
    const maxX = Math.max(...lines.map((l) => l.maxX));
    const minY = lines[0].y;
    const maxY = lines[lines.length - 1].y + lines[lines.length - 1].height;

    const boundingBox: BoundingBox = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };

    if (rows.length === 0) {
      return {
        id: `table_p${pageNum}_${tableIdx}`,
        page: pageNum,
        boundingBox,
        headers: [],
        hasReliableHeaders: false,
        rows: [],
        rawCells: [],
      };
    }

    const headerRow = rows[0];
    const isReliableHeader = this.evaluateHeaderReliability(headerRow, rows.slice(1));

    let headers: string[] = [];
    let dataRows: string[][] = [];

    if (isReliableHeader) {
      headers = headerRow.map((h, i) => this.sanitizeHeaderKey(h, i));
      dataRows = rows.slice(1);
    } else {
      // Use indexed column headers without inventing fake names
      const maxColCount = Math.max(...rows.map((r) => r.length));
      headers = Array.from({ length: maxColCount }, (_, i) => `column_${i + 1}`);
      dataRows = rows;
    }

    // Generate structured rows as typed objects
    const structuredRows = dataRows.map((row) => {
      const obj: Record<string, any> = {};
      headers.forEach((header, colIdx) => {
        const cellValue = row[colIdx] !== undefined ? row[colIdx].trim() : '';
        const parsedNum = parseNumberSafely(cellValue);
        
        if (cellValue === '') {
          obj[header] = null;
        } else if (parsedNum !== null) {
          obj[header] = parsedNum;
        } else {
          obj[header] = cellValue;
        }
      });
      return obj;
    });

    const cells: RawTableCell[] = precomputedCells || [];
    if (cells.length === 0) {
      rows.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          cells.push({
            text: cell,
            page: pageNum,
            rowIndex: rIdx,
            colIndex: cIdx,
          });
        });
      });
    }

    return {
      id: `table_p${pageNum}_${tableIdx}`,
      page: pageNum,
      boundingBox,
      headers,
      hasReliableHeaders: isReliableHeader,
      rows: dataRows,
      rawCells: cells,
      structuredRows,
    };
  }

  /**
   * Determine if the first row is a header (textual, distinctive, common header terms)
   */
  private static evaluateHeaderReliability(firstRow: string[], subsequentRows: string[][]): boolean {
    if (firstRow.length < 2) return false;

    // Check if first row contains non-empty strings
    const nonEmptyCount = firstRow.filter((c) => c && c.trim().length > 0).length;
    if (nonEmptyCount < 2) return false;

    // First row should NOT be all numeric values
    const firstRowNumeric = firstRow.filter((c) => parseNumberSafely(c) !== null).length;
    if (firstRowNumeric > firstRow.length / 2) return false;

    const commonHeaderWords = [
      'item', 'description', 'desc', 'qty', 'quantity', 'price', 'unit', 'rate',
      'amount', 'total', 'subtotal', 'tax', 'date', 'balance', 'debit', 'credit',
      'name', 'account', 'transaction', 'reference', 'ref', 'code', 'status',
      'category', 'particulars', 'no', 'num', 'details', 'fee', 'hours', 'cost'
    ];

    // Check if rows appear to be key-value pairs (e.g. "Invoice Number:", "Date:", "Customer:")
    const isKVList = firstRow[0].endsWith(':') || subsequentRows.some((r) => r[0] && r[0].endsWith(':'));
    if (isKVList) {
      return false;
    }

    const hasCommonHeaderKeyword = firstRow.some((cell) => {
      const lower = cell.toLowerCase().trim();
      return commonHeaderWords.some((kw) => lower.includes(kw));
    });

    if (hasCommonHeaderKeyword) return true;

    // Compare first row data types to subsequent rows
    if (subsequentRows.length > 0) {
      const subRowNumericCount = subsequentRows
        .flatMap((r) => r)
        .filter((c) => parseNumberSafely(c) !== null).length;

      // If subsequent rows have numeric values and header has none
      if (subRowNumericCount > 0 && firstRowNumeric === 0) {
        return true;
      }
    }

    // If first row is uppercase or capitalized words
    const isUppercase = firstRow.every((c) => c.length > 0 && (c === c.toUpperCase() || /^[A-Z]/.test(c)));
    return isUppercase;
  }

  private static sanitizeHeaderKey(rawHeader: string, index: number): string {
    const cleaned = cleanText(rawHeader)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return cleaned.length > 0 ? cleaned : `column_${index + 1}`;
  }
}
