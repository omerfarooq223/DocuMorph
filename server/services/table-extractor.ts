import {
  RawTable,
  RawTableCell,
  TextLine,
  BoundingBox,
  IntermediateDocument,
  ConfidenceLevel,
  Provenance,
} from '../types.js';
import { parseNumberSafely, cleanText, parseTypedValueWithProvenance } from '../utils/normalizer.js';

export class TableExtractor {
  /**
   * Detect and extract tables from intermediate document lines, including multi-page continuations
   */
  public static extractTables(doc: IntermediateDocument): RawTable[] {
    const pageTables: RawTable[] = [];

    for (const page of doc.pages) {
      // Filter out footer lines, but allow candidate table header lines
      const validLines = page.lines.filter((l) => l.role !== 'footer');
      if (validLines.length < 2) continue;

      const extracted = this.extractTablesFromPage(validLines, page.pageNumber);
      page.detectedTables = extracted;
      pageTables.push(...extracted);
    }

    // Stitch continuous tables across consecutive pages
    const mergedTables = this.stitchMultiPageTables(pageTables);
    return mergedTables;
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
        while (
          j < lines.length &&
          (lines[j].text.includes('|') ||
            lines[j].text.includes('\t') ||
            lines[j].text.match(/^[-\s|+=]{4,}$/))
        ) {
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
              .filter((c, idx, arr) =>
                idx === 0 && c === '' ? false : idx === arr.length - 1 && c === '' ? false : true
              )
          );

          // Check if lines are pipe-separated key-value metadata pairs
          const isPipeKvBlock = rawRows.every((r) =>
            r.some(
              (c) =>
                /[:=]\s*\S+/.test(c) ||
                /\b(invoice|date|due|customer|account|sort code|vat|po|order|ref|total|agreement)\b/i.test(
                  c
                )
            )
          );

          if (isPipeKvBlock) {
            // Free line indices so KV extractor can process them
            for (const tl of tableLines) {
              usedLineIndices.delete(tl.idx);
            }
            continue;
          }

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

      const colSegments = this.getLineColumnSegments(lines[i]);
      if (colSegments.length < 2) continue;

      const candidateLines: TextLine[] = [lines[i]];
      const candidateIndices: number[] = [i];
      const baselineCols = colSegments;
      let j = i + 1;
      while (j < lines.length && !usedLineIndices.has(j)) {
        const nextLine = lines[j];
        const prevLine = candidateLines[candidateLines.length - 1];

        // Vertical gap or intervening heading check
        const lineGap = nextLine.y - prevLine.y;
        const isHeaderOrMajorGap =
          lineGap > Math.max(26, (prevLine.height || 12) * 2.2) ||
          nextLine.role === 'header' ||
          nextLine.role === 'heading';

        const nextColSegments = this.getLineColumnSegments(nextLine);

        if (!isHeaderOrMajorGap && this.doesAlignWithColumns(nextColSegments, baselineCols)) {
          candidateLines.push(nextLine);
          candidateIndices.push(j);
          j++;
        } else {
          // Allow at most 1 line gap if subsequent lines still align and no major gap exists
          if (!isHeaderOrMajorGap && j + 1 < lines.length && !usedLineIndices.has(j + 1)) {
            const peekLine = lines[j + 1];
            const peekGap = peekLine.y - nextLine.y;
            if (peekGap <= 24) {
              const peekSegments = this.getLineColumnSegments(peekLine);
              if (this.doesAlignWithColumns(peekSegments, baselineCols)) {
                candidateLines.push(nextLine);
                candidateIndices.push(j);
                j++;
                continue;
              }
            }
          }
          break;
        }
      }

      if (candidateLines.length >= 2) {
        const isKeyValueBlock =
          // 2-column key-value or summary blocks (e.g. "Subtotal 541.25", "Total 649.50")
          (baselineCols.length <= 2 &&
            candidateLines.some((cl) =>
              /\b(subtotal|total|vat|tax|amount paid|balance due|net total|gross amount|invoice|date|due|customer|account|sort code|po number|agreement)\b/i.test(
                cl.text
              )
            )) ||
          // 4-column alternating label-value metadata headers (e.g. "Invoice Number ... Invoice Date ...")
          (baselineCols.length <= 4 &&
            candidateLines.every((cl) => {
              const segs = this.getLineColumnSegments(cl);
              return (
                segs.length >= 2 &&
                /\b(invoice|date|due|customer|account|sort code|vat|po|order|ref|agreement|currency)\b/i.test(
                  segs[0]?.text || ''
                )
              );
            }));

        const isFormLikeRegion =
          candidateLines.length <= 2 &&
          (candidateLines.some((cl) => /\.{4,}|(?:\.\s+){3,}/.test(cl.text)) ||
            candidateLines.some((cl) => {
              const segs = this.getLineColumnSegments(cl);
              return (
                segs.some((s) => s.text.length > 50 && /[?:]|\binstructions?\b|\bsee\b/i.test(s.text)) ||
                (segs.length >= 2 && /\b(?:check\s+only\s+one|appropriate\s+box|exemptions?)\b/i.test(cl.text))
              );
            }));

        if (isFormLikeRegion) {
          candidateLines.forEach((cl) => {
            cl.role = 'form_region';
          });
          continue;
        }

        if (isKeyValueBlock) {
          continue;
        }

        candidateIndices.forEach((idx) => usedLineIndices.add(idx));

        const table = this.createTableFromAlignedLines(
          candidateLines,
          baselineCols,
          pageNum,
          tables.length
        );

        if (table.rows.length >= 1 && table.headers.length >= 2) {
          tables.push(table);
          i = j - 1;
        }
      }
    }

    return tables;
  }

  /**
   * Split a text line into column segments using item positions or whitespace gaps
   */
  private static getLineColumnSegments(
    line: TextLine
  ): { text: string; x: number; width: number }[] {
    if (line.items.length >= 2) {
      const fontSize = line.items[0]?.fontSize || line.height || 10;
      const adaptiveGutter = Math.max(6, Math.min(12, fontSize * 0.65));

      const segments: { text: string; x: number; width: number }[] = [];
      let currentSeg = {
        text: line.items[0].text,
        x: line.items[0].x,
        width: line.items[0].width,
      };

      for (let i = 1; i < line.items.length; i++) {
        const item = line.items[i];
        const gap = item.x - (currentSeg.x + currentSeg.width);

        if (gap >= adaptiveGutter) {
          segments.push(currentSeg);
          currentSeg = { text: item.text, x: item.x, width: item.width };
        } else {
          currentSeg.text += (gap > 2 ? ' ' : '') + item.text;
          currentSeg.width = item.x + item.width - currentSeg.x;
        }
      }
      segments.push(currentSeg);

      return segments;
    }

    // Fallback: estimate columns via multiple whitespace chunks
    const text = line.text;
    const parts = text.split(/\s{2,}/);
    if (parts.length >= 2) {
      const avgCharWidth = line.height * 0.55;
      const totalEstimatedWidth = text.length * avgCharWidth;
      const scale = totalEstimatedWidth > 0 ? (line.maxX - line.minX) / totalEstimatedWidth : 1;

      let currentX = line.minX;
      return parts.map((part) => {
        const partWidth = part.length * avgCharWidth * scale;
        const seg = {
          text: part.trim(),
          x: currentX,
          width: partWidth,
        };
        currentX += partWidth + 2 * avgCharWidth * scale;
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
    if (testSegments.length < 2 || baseSegments.length < 2) return false;

    // Disallow merging if column counts differ significantly (e.g. 7 cols vs 4 cols)
    const minCols = Math.min(testSegments.length, baseSegments.length);
    const maxCols = Math.max(testSegments.length, baseSegments.length);
    if (maxCols >= 5 && minCols <= maxCols - 2 && minCols / maxCols < 0.7) {
      return false;
    }

    let matchCount = 0;
    for (const test of testSegments) {
      for (const base of baseSegments) {
        if (Math.abs(test.x - base.x) <= 28) {
          matchCount++;
          break;
        }
      }
    }

    const requiredMatches = Math.max(2, Math.floor(minCols * 0.55));
    return matchCount >= requiredMatches;
  }

  /**
   * Build Table from aligned TextLines with cell-level provenance
   */
  private static createTableFromAlignedLines(
    lines: TextLine[],
    colLayout: { text: string; x: number; width: number }[],
    pageNum: number,
    tableIdx: number
  ): RawTable {
    const colStarts = colLayout.map((c) => c.x).sort((a, b) => a - b);
    const numCols = colStarts.length;

    const rawRows: string[][] = [];
    const rawCells: RawTableCell[] = [];

    lines.forEach((line, rowIdx) => {
      const rowCells: string[] = new Array(numCols).fill('');
      const segments = this.getLineColumnSegments(line);

      segments.forEach((seg) => {
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
          sourceText: seg.text,
          sourceValue: seg.text,
          page: pageNum,
          sourcePage: pageNum,
          rowIndex: rowIdx,
          colIndex: bestColIdx,
          boundingBox: {
            x: seg.x,
            y: line.y,
            width: seg.width,
            height: line.height,
          },
          sourceMethod: line.sourceMethod || 'pdf_text',
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
        pages: [pageNum],
        boundingBox,
        headers: [],
        hasReliableHeaders: false,
        confidence: 'low',
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
      const maxColCount = Math.max(...rows.map((r) => r.length));
      headers = Array.from({ length: maxColCount }, (_, i) => `column_${i + 1}`);
      dataRows = rows;
    }

    // Merge wrapped continuation rows (e.g. multi-line descriptions) into logical rows
    const logicalDataRows: string[][] = [];
    const logicalLinesMap: Array<{ lineIndices: number[] }> = [];

    for (let r = 0; r < dataRows.length; r++) {
      const currentRow = dataRows[r];
      const prevLogicalRow = logicalDataRows[logicalDataRows.length - 1];

      const populatedIndices = currentRow
        .map((cell, idx) => (cell && cell.trim().length > 0 ? idx : -1))
        .filter((idx) => idx !== -1);

      let isContinuation = false;
      if (prevLogicalRow && populatedIndices.length === 1) {
        const textColIdx = populatedIndices[0];
        const cellText = currentRow[textColIdx].trim();

        const isNumericOrDate =
          /^(\$|€|£)?\s*-?\d+([.,]\d+)?\s*%?$/.test(cellText) ||
          /^\d{1,4}[-\/\.]\d{1,2}[-\/\.]\d{1,4}$/.test(cellText);

        const prevPopulatedCount = prevLogicalRow.filter((c) => c && c.trim().length > 0).length;

        if (!isNumericOrDate && prevPopulatedCount >= 2 && prevLogicalRow[textColIdx]) {
          isContinuation = true;
          prevLogicalRow[textColIdx] = prevLogicalRow[textColIdx] + ' ' + cellText;
          if (logicalLinesMap.length > 0) {
            logicalLinesMap[logicalLinesMap.length - 1].lineIndices.push(r);
          }
        }
      }

      if (!isContinuation) {
        logicalDataRows.push([...currentRow]);
        logicalLinesMap.push({ lineIndices: [r] });
      }
    }

    // Determine deterministic confidence
    let confidence: ConfidenceLevel = 'low';
    if (isReliableHeader && logicalDataRows.length >= 2) {
      confidence = 'high';
    } else if (logicalDataRows.length >= 2) {
      confidence = 'medium';
    }

    // Row-level and cell-level provenance
    const rowProvenance: RawTable['rowProvenance'] = [];

    // Generate structured rows
    const structuredRows = logicalDataRows.map((row, logIdx) => {
      const obj: Record<string, any> = {};
      const cellsProv: Record<string, Provenance> = {};
      const primaryLineIdx = logicalLinesMap[logIdx]?.lineIndices[0] ?? logIdx;
      const sourceLine = lines[isReliableHeader ? primaryLineIdx + 1 : primaryLineIdx];

      headers.forEach((header, colIdx) => {
        const cellValue = row[colIdx] !== undefined ? row[colIdx].trim() : '';
        const parsedTyped = parseTypedValueWithProvenance(cellValue);

        if (cellValue === '') {
          obj[header] = null;
        } else {
          obj[header] = parsedTyped.value;
        }

        cellsProv[header] = {
          page: pageNum,
          sourceText: cellValue,
          sourceValue: cellValue,
          normalization: parsedTyped.normalization,
          confidence,
          sourceMethod: sourceLine?.sourceMethod || 'pdf_text',
          boundingBox: sourceLine
            ? {
                x: sourceLine.minX,
                y: sourceLine.y,
                width: sourceLine.maxX - sourceLine.minX,
                height: sourceLine.height,
              }
            : undefined,
        };
      });

      rowProvenance.push({
        sourcePage: pageNum,
        cells: cellsProv,
      });

      return obj;
    });

    const cells: RawTableCell[] = precomputedCells || [];
    if (cells.length === 0) {
      rows.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          cells.push({
            text: cell,
            sourceText: cell,
            sourceValue: cell,
            page: pageNum,
            sourcePage: pageNum,
            rowIndex: rIdx,
            colIndex: cIdx,
          });
        });
      });
    }

    return {
      id: `table_p${pageNum}_${tableIdx}`,
      page: pageNum,
      pages: [pageNum],
      boundingBox,
      headers,
      hasReliableHeaders: isReliableHeader,
      confidence,
      rows: logicalDataRows,
      rawCells: cells,
      structuredRows,
      rowProvenance,
    };
  }

  /**
   * Stitch multi-page tables across consecutive pages
   */
  private static stitchMultiPageTables(tables: RawTable[]): RawTable[] {
    if (tables.length < 2) return tables;

    const merged: RawTable[] = [];
    let currentTable = tables[0];

    for (let i = 1; i < tables.length; i++) {
      const nextTable = tables[i];

      const isConsecutivePage = nextTable.page === currentTable.pages[currentTable.pages.length - 1] + 1;
      const matchingHeaderCount =
        currentTable.headers.length === nextTable.headers.length &&
        currentTable.headers.every((h, idx) => h === nextTable.headers[idx]);

      const matchingBoundingX =
        Math.abs(currentTable.boundingBox.x - nextTable.boundingBox.x) <= 35 &&
        Math.abs(currentTable.boundingBox.width - nextTable.boundingBox.width) <= 45;

      if (isConsecutivePage && (matchingHeaderCount || (matchingBoundingX && !nextTable.hasReliableHeaders))) {
        // Merge nextTable into currentTable while preserving sourcePage on rows and cells
        currentTable.pages.push(nextTable.page);
        currentTable.rows.push(...nextTable.rows);
        currentTable.rawCells.push(...nextTable.rawCells);

        if (currentTable.structuredRows && nextTable.structuredRows) {
          currentTable.structuredRows.push(...nextTable.structuredRows);
        }
        if (currentTable.rowProvenance && nextTable.rowProvenance) {
          currentTable.rowProvenance.push(...nextTable.rowProvenance);
        }
      } else {
        merged.push(currentTable);
        currentTable = nextTable;
      }
    }

    merged.push(currentTable);
    return merged;
  }

  /**
   * Determine if the first row is a header
   */
  private static evaluateHeaderReliability(
    firstRow: string[],
    subsequentRows: string[][]
  ): boolean {
    if (firstRow.length < 2) return false;

    const nonEmptyCount = firstRow.filter((c) => c && c.trim().length > 0).length;
    if (nonEmptyCount < 2) return false;

    const firstRowNumeric = firstRow.filter((c) => parseNumberSafely(c) !== null).length;
    if (firstRowNumeric > firstRow.length / 2) return false;

    const commonHeaderWords = [
      'item', 'description', 'desc', 'qty', 'quantity', 'price', 'unit', 'rate',
      'amount', 'total', 'subtotal', 'tax', 'date', 'balance', 'debit', 'credit',
      'name', 'account', 'transaction', 'reference', 'ref', 'code', 'status',
      'category', 'particulars', 'no', 'num', 'details', 'fee', 'hours', 'cost',
    ];

    const isKVList =
      firstRow[0].endsWith(':') || subsequentRows.some((r) => r[0] && r[0].endsWith(':'));
    if (isKVList) {
      return false;
    }

    const hasCommonHeaderKeyword = firstRow.some((cell) => {
      const lower = cell.toLowerCase().trim();
      return commonHeaderWords.some((kw) => lower.includes(kw));
    });

    if (hasCommonHeaderKeyword) return true;

    if (subsequentRows.length > 0) {
      const subRowNumericCount = subsequentRows
        .flatMap((r) => r)
        .filter((c) => parseNumberSafely(c) !== null).length;

      if (subRowNumericCount > 0 && firstRowNumeric === 0) {
        return true;
      }
    }

    const isUppercase = firstRow.every(
      (c) => c.length > 0 && (c === c.toUpperCase() || /^[A-Z]/.test(c))
    );
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
