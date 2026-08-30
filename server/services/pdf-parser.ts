import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  IntermediateDocument,
  DocumentMetadata,
  TextBlock,
  TextLine,
  TextItem,
  BoundingBox,
} from '../types.js';
import { config } from '../config.js';
import { cleanText } from '../utils/normalizer.js';

export interface ParseOptions {
  fileName?: string;
  fileSizeBytes?: number;
  enableOcrFallback?: boolean;
}

export class PDFParser {
  public static async parse(
    buffer: Buffer,
    options: ParseOptions = {}
  ): Promise<IntermediateDocument> {
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const doc = await loadingTask.promise;
    const numPages = doc.numPages;

    let totalChars = 0;
    const pagesData: IntermediateDocument['pages'] = [];
    const allBlocks: TextBlock[] = [];
    let fullTextAccumulator = '';
    let hasScannedPages = false;

    // First pass: extract all text and layout coordinates from pages
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageWidth = viewport.width;
      const pageHeight = viewport.height;

      const textContent = await page.getTextContent();
      const rawItems = textContent.items as any[];

      const textItems: TextItem[] = [];

      for (const item of rawItems) {
        if (!item.str || item.str.trim().length === 0) continue;

        const transform = item.transform || [1, 0, 0, 1, 0, 0];
        const itemX = transform[4];
        // Convert bottom-left PDF coordinate system to top-left coordinate system
        const itemY = pageHeight - transform[5];
        const itemWidth = item.width || (item.str.length * 6);
        const itemHeight = item.height || Math.abs(transform[3]) || 12;
        const fontSize = Math.abs(transform[0]) || Math.abs(transform[3]) || 12;

        textItems.push({
          text: item.str,
          x: Math.round(itemX * 100) / 100,
          y: Math.round(itemY * 100) / 100,
          width: Math.round(itemWidth * 100) / 100,
          height: Math.round(itemHeight * 100) / 100,
          fontName: item.fontName,
          fontSize: Math.round(fontSize * 10) / 10,
          page: pageNum,
        });
      }

      // Group items into lines
      const lines = this.groupItemsIntoLines(textItems, pageNum);

      // Group lines into blocks
      const blocks = this.groupLinesIntoBlocks(lines, pageNum, pageWidth);

      const pageText = lines.map((l) => l.text).join('\n');
      const pageCharCount = pageText.length;
      totalChars += pageCharCount;
      fullTextAccumulator += (fullTextAccumulator ? '\n\n' : '') + pageText;

      const isScanned = pageCharCount < config.scannedTextDensityThreshold;
      if (isScanned) {
        hasScannedPages = true;
      }

      pagesData.push({
        pageNumber: pageNum,
        width: pageWidth,
        height: pageHeight,
        textLength: pageCharCount,
        isScanned,
        textBlocks: blocks,
        lines,
      });

      allBlocks.push(...blocks);
    }

    // Extract metadata if available
    let docTitle: string | null = null;
    let docAuthor: string | null = null;
    let docCreationDate: string | null = null;

    try {
      const meta = await doc.getMetadata();
      if (meta && meta.info) {
        const info = meta.info as any;
        docTitle = info.Title ? cleanText(info.Title) : null;
        docAuthor = info.Author ? cleanText(info.Author) : null;
        docCreationDate = info.CreationDate ? String(info.CreationDate) : null;
      }
    } catch {
      // Non-critical metadata read failure
    }

    const metadata: DocumentMetadata = {
      fileName: options.fileName || 'document.pdf',
      fileSizeBytes: options.fileSizeBytes || buffer.length,
      pageCount: numPages,
      title: docTitle,
      author: docAuthor,
      creationDate: docCreationDate,
      isScanned: hasScannedPages,
      ocrApplied: false,
      textDensity: numPages > 0 ? Math.round(totalChars / numPages) : 0,
    };

    return {
      metadata,
      pages: pagesData,
      allTextBlocks: allBlocks,
      tables: [],
      keyValuePairs: [],
      lists: [],
      sections: [],
      rawText: fullTextAccumulator,
    };
  }

  /**
   * Group text items into lines based on Y-proximity and sort by X
   */
  private static groupItemsIntoLines(items: TextItem[], pageNum: number): TextLine[] {
    if (items.length === 0) return [];

    // Sort items primarily by Y ascending (top to bottom), then by X ascending
    const sorted = [...items].sort((a, b) => {
      if (Math.abs(a.y - b.y) <= 3.5) {
        return a.x - b.x;
      }
      return a.y - b.y;
    });

    const lines: TextLine[] = [];
    let currentLineItems: TextItem[] = [sorted[0]];
    let currentLineY = sorted[0].y;

    for (let i = 1; i < sorted.length; i++) {
      const item = sorted[i];
      if (Math.abs(item.y - currentLineY) <= 3.5) {
        currentLineItems.push(item);
      } else {
        // Build completed line
        lines.push(this.buildLine(currentLineItems, currentLineY, pageNum));
        currentLineItems = [item];
        currentLineY = item.y;
      }
    }

    if (currentLineItems.length > 0) {
      lines.push(this.buildLine(currentLineItems, currentLineY, pageNum));
    }

    return lines;
  }

  private static buildLine(items: TextItem[], y: number, pageNum: number): TextLine {
    // Sort items by X coordinate
    items.sort((a, b) => a.x - b.x);

    let lineText = '';
    let minX = items[0].x;
    let maxX = items[0].x + items[0].width;
    let maxHeight = items[0].height;

    for (let i = 0; i < items.length; i++) {
      const curr = items[i];
      minX = Math.min(minX, curr.x);
      maxX = Math.max(maxX, curr.x + curr.width);
      maxHeight = Math.max(maxHeight, curr.height);

      if (i > 0) {
        const prev = items[i - 1];
        const gap = curr.x - (prev.x + prev.width);
        // If there's a significant gap between text items, preserve space
        if (gap > 2) {
          lineText += ' ';
        }
      }
      lineText += curr.text;
    }

    return {
      text: lineText.trim(),
      y,
      minX,
      maxX,
      height: maxHeight,
      items,
      page: pageNum,
    };
  }

  /**
   * Group lines into logical text blocks / paragraphs
   */
  private static groupLinesIntoBlocks(
    lines: TextLine[],
    pageNum: number,
    pageWidth: number
  ): TextBlock[] {
    if (lines.length === 0) return [];

    // Calculate median font size for the page to identify headers
    const allFontSizes = lines
      .flatMap((l) => l.items)
      .map((it) => it.fontSize || 12)
      .filter((fs) => fs > 0);

    const medianFontSize = allFontSizes.length > 0
      ? allFontSizes.sort((a, b) => a - b)[Math.floor(allFontSizes.length / 2)]
      : 12;

    const blocks: TextBlock[] = [];
    let currentBlockLines: TextLine[] = [lines[0]];

    for (let i = 1; i < lines.length; i++) {
      const prevLine = lines[i - 1];
      const currLine = lines[i];

      const verticalGap = currLine.y - (prevLine.y + prevLine.height);
      const isFontSizeDifferent = Math.abs(
        (currLine.items[0]?.fontSize || 12) - (prevLine.items[0]?.fontSize || 12)
      ) > 2;

      // Start a new block if gap is large or font size changes significantly
      if (verticalGap > 12 || isFontSizeDifferent) {
        blocks.push(this.buildBlock(currentBlockLines, pageNum, medianFontSize, blocks.length));
        currentBlockLines = [currLine];
      } else {
        currentBlockLines.push(currLine);
      }
    }

    if (currentBlockLines.length > 0) {
      blocks.push(this.buildBlock(currentBlockLines, pageNum, medianFontSize, blocks.length));
    }

    return blocks;
  }

  private static buildBlock(
    lines: TextLine[],
    pageNum: number,
    medianFontSize: number,
    blockIdx: number
  ): TextBlock {
    const text = lines.map((l) => l.text).join('\n');
    let minX = lines[0].minX;
    let maxX = lines[0].maxX;
    const minY = lines[0].y;
    const maxY = lines[lines.length - 1].y + lines[lines.length - 1].height;

    for (const l of lines) {
      minX = Math.min(minX, l.minX);
      maxX = Math.max(maxX, l.maxX);
    }

    const firstItem = lines[0].items[0];
    const fontSize = firstItem?.fontSize || 12;
    const isHeading =
      (fontSize >= medianFontSize * 1.25 || (lines.length === 1 && /^[A-Z0-9\s:_-]{3,50}$/.test(text))) &&
      text.length < 100;

    let headingLevel = 0;
    if (isHeading) {
      if (fontSize >= medianFontSize * 1.8) headingLevel = 1;
      else if (fontSize >= medianFontSize * 1.4) headingLevel = 2;
      else headingLevel = 3;
    }

    return {
      id: `p${pageNum}_b${blockIdx}`,
      text,
      page: pageNum,
      boundingBox: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
      fontSize,
      isHeading,
      headingLevel: isHeading ? headingLevel : undefined,
      lines,
    };
  }
}
