import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  IntermediateDocument,
  DocumentMetadata,
  TextBlock,
  TextLine,
  TextItem,
  BoundingBox,
  LayoutRegion,
  ElementRole,
} from '../types.js';
import { config } from '../config.js';
import { cleanText } from '../utils/normalizer.js';
import { ocrService } from './ocr-service.js';

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
    const fileSizeBytes = options.fileSizeBytes || buffer.length;

    // Safeguard 1: File size limit check
    const maxSizeBytes = config.maxFileSizeMb * 1024 * 1024;
    if (fileSizeBytes > maxSizeBytes) {
      const err: any = new Error(
        `File size (${Math.round(fileSizeBytes / (1024 * 1024))}MB) exceeds maximum limit of ${config.maxFileSizeMb}MB.`
      );
      err.code = 'PDF_TOO_LARGE';
      throw err;
    }

    // Safeguard 2: Standards-aware PDF header signature check (bounded first 1024 bytes)
    const headerWindow = buffer.subarray(0, Math.min(1024, buffer.length)).toString('latin1');
    if (!headerWindow.includes('%PDF-')) {
      const err: any = new Error('Invalid file format: No valid PDF signature (%PDF-) found in document header.');
      err.code = 'INVALID_PDF';
      throw err;
    }

    const uint8Array = new Uint8Array(buffer);
    let doc: any;

    try {
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        useSystemFonts: true,
        disableFontFace: true,
      });

      loadingTask.onPassword = () => {
        const err: any = new Error('Document is password-protected or encrypted.');
        err.code = 'PDF_PASSWORD_PROTECTED';
        throw err;
      };

      doc = await loadingTask.promise;
    } catch (err: any) {
      if (
        err.code === 'PDF_PASSWORD_PROTECTED' ||
        err.name === 'PasswordException' ||
        err.message?.toLowerCase().includes('password') ||
        err.message?.toLowerCase().includes('encrypted')
      ) {
        const passErr: any = new Error('This PDF is password protected and cannot currently be processed.');
        passErr.code = 'PDF_PASSWORD_PROTECTED';
        throw passErr;
      }
      if (err.name === 'InvalidPDFException' || err.message?.toLowerCase().includes('invalid pdf')) {
        const invErr: any = new Error('Invalid PDF structure or corrupted document header.');
        invErr.code = 'PDF_CORRUPTED';
        throw invErr;
      }
      if (err.code) throw err;
      const genErr: any = new Error(`Failed to parse PDF document: ${err.message || 'Unknown parsing error'}`);
      genErr.code = 'EXTRACTION_FAILED';
      throw genErr;
    }

    const numPages = doc.numPages;

    // Safeguard 3: Page count limit check
    if (numPages > config.maxPdfPages) {
      const pageErr: any = new Error(
        `Document contains ${numPages} pages, exceeding the maximum allowed limit of ${config.maxPdfPages} pages.`
      );
      pageErr.code = 'PDF_PAGE_LIMIT_EXCEEDED';
      throw pageErr;
    }

    let totalChars = 0;
    const pagesData: IntermediateDocument['pages'] = [];
    const allBlocks: TextBlock[] = [];
    let fullTextAccumulator = '';
    let hasScannedPages = false;
    let hasMultiColumnLayout = false;

    // Step 1: Extract all text items and geometry per page
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
          sourceMethod: 'pdf_text',
        });
      }

      // 1. Group raw text items into reconstructed lines
      const reconstructedLines = this.groupItemsIntoLines(textItems, pageNum);

      // 2. Multi-column layout detection
      const layoutAnalysis = this.analyzeLayoutRegions(
        reconstructedLines,
        pageWidth,
        pageHeight,
        pageNum
      );
      const regions = layoutAnalysis.regions;
      let orderedLines = layoutAnalysis.orderedLines;
      const isMultiCol = layoutAnalysis.isMultiCol;

      if (isMultiCol) {
        hasMultiColumnLayout = true;
      }

      // 3. Group lines into logical text blocks
      let blocks = this.groupLinesIntoBlocks(orderedLines, pageNum, pageWidth);

      const pageText = orderedLines.map((l) => l.text).join('\n');
      let pageCharCount = pageText.length;
      totalChars += pageCharCount;
      fullTextAccumulator += (fullTextAccumulator ? '\n\n' : '') + pageText;

      let isScanned = pageCharCount < config.scannedTextDensityThreshold;
      let pageOcrApplied = false;

      // Asynchronous OCR execution if page is scanned and OCR fallback is enabled
      if (isScanned && options.enableOcrFallback !== false) {
        try {
          const imgBuffer = await this.extractPageImageBuffer(page);
          if (imgBuffer) {
            const ocrResult = await ocrService.recognizePage(imgBuffer);
            if (ocrResult.lines && ocrResult.lines.length > 0) {
              const ocrLines: TextLine[] = ocrResult.lines.map((textStr, idx) => {
                const y = Math.round(50 + idx * 24);
                return {
                  text: textStr,
                  y,
                  height: 16,
                  minX: 50,
                  maxX: pageWidth - 50,
                  fontSize: 12,
                  fontName: 'OCR-Extracted',
                  role: 'body',
                  page: pageNum,
                  sourceMethod: 'ocr',
                  coordinateSpace: 'ocr_image',
                  items: [
                    {
                      text: textStr,
                      x: 50,
                      y,
                      width: pageWidth - 100,
                      height: 16,
                      fontSize: 12,
                      fontName: 'OCR-Extracted',
                      page: pageNum,
                      sourceMethod: 'ocr',
                    },
                  ],
                };
              });

              orderedLines = ocrLines;
              blocks = this.groupLinesIntoBlocks(orderedLines, pageNum, pageWidth);
              const ocrText = orderedLines.map((l) => l.text).join('\n');
              fullTextAccumulator += (fullTextAccumulator ? '\n\n' : '') + ocrText;
              pageCharCount = ocrText.length;
              totalChars += pageCharCount;
              pageOcrApplied = true;
              isScanned = false; // Successfully recognized via OCR
            }
          }
        } catch (ocrErr: any) {
          console.warn(`[PDFParser] OCR extraction warning on page ${pageNum}:`, ocrErr.message);
        }
      }

      if (pageOcrApplied || isScanned) {
        hasScannedPages = true;
      }

      const detectedHeadings = blocks
        .filter((b) => b.isHeading)
        .map((b) => b.text.trim());

      pagesData.push({
        pageNumber: pageNum,
        width: pageWidth,
        height: pageHeight,
        textLength: pageCharCount,
        isScanned,
        ocrApplied: pageOcrApplied,
        textItems,
        textBlocks: blocks,
        lines: orderedLines,
        regions,
        detectedHeadings,
        detectedTables: [],
        detectedKeyValues: [],
      });

      allBlocks.push(...blocks);
    }

    // Step 2: Conservative repeated headers and footers detection
    let hasRepeatedHeaders = false;
    let hasRepeatedFooters = false;

    if (numPages >= 2) {
      const headerFooterResult = this.detectRepeatedHeadersAndFooters(pagesData);
      hasRepeatedHeaders = headerFooterResult.hasHeaders;
      hasRepeatedFooters = headerFooterResult.hasFooters;
    }

    // Step 3: Extract metadata
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
      fileSizeBytes,
      pageCount: numPages,
      title: docTitle,
      author: docAuthor,
      creationDate: docCreationDate,
      isScanned: hasScannedPages,
      ocrApplied: false,
      textDensity: numPages > 0 ? Math.round(totalChars / numPages) : 0,
      hasRepeatedHeaders,
      hasRepeatedFooters,
      hasMultiColumnLayout,
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
   * Group text items into lines using font-size baseline proximity
   */
  private static groupItemsIntoLines(items: TextItem[], pageNum: number): TextLine[] {
    if (items.length === 0) return [];

    const yBuckets: Array<{ y: number; fontSize: number; items: TextItem[] }> = [];
    const sortedByY = [...items].sort((a, b) => a.y - b.y);

    for (const item of sortedByY) {
      const itemFontSize = item.fontSize || 12;
      const fontTolerance = Math.max(2.5, itemFontSize * 0.25);

      const matchBucket = yBuckets.find((b) => Math.abs(b.y - item.y) <= fontTolerance);
      if (matchBucket) {
        matchBucket.items.push(item);
        matchBucket.fontSize = Math.max(matchBucket.fontSize, itemFontSize);
      } else {
        yBuckets.push({ y: item.y, fontSize: itemFontSize, items: [item] });
      }
    }

    const lines: TextLine[] = [];
    for (const bucket of yBuckets) {
      lines.push(this.buildLine(bucket.items, bucket.y, pageNum));
    }
    return lines;
  }

  private static buildLine(items: TextItem[], y: number, pageNum: number): TextLine {
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
        const charWidthEst = (curr.fontSize || 12) * 0.25;
        if (gap > Math.max(2, charWidthEst)) {
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
      role: 'body',
      sourceMethod: 'pdf_text',
    };
  }

  /**
   * Multi-column layout detection: identifies vertical whitespace gutters and creates regions
   */
  private static analyzeLayoutRegions(
    lines: TextLine[],
    pageWidth: number,
    pageHeight: number,
    pageNum: number
  ): { regions: LayoutRegion[]; orderedLines: TextLine[]; isMultiCol: boolean } {
    if (lines.length < 3) {
      const fullRegion: LayoutRegion = {
        type: 'full_width',
        boundingBox: { x: 0, y: 0, width: pageWidth, height: pageHeight },
        lines,
        page: pageNum,
      };
      return { regions: [fullRegion], orderedLines: lines, isMultiCol: false };
    }

    // Avoid misclassifying tables with headers or numeric columns as 2-column text articles
    const hasTabularData = lines.some(
      (l) =>
        l.items.length >= 4 ||
        /\$|€|£|\b(qty|unit price|debit|credit|balance|total due|vat\s*\(\d+%\))\b/i.test(l.text)
    );

    let bestSplitX: number | null = null;
    let maxGutterScore = 0;

    if (!hasTabularData) {
      for (let xCut = Math.round(pageWidth * 0.2); xCut <= Math.round(pageWidth * 0.8); xCut += 5) {
        const leftLines = lines.filter((l) => l.maxX < xCut - 5 && l.minX >= 20);
        const rightLines = lines.filter((l) => l.minX > xCut + 5 && l.maxX <= pageWidth - 20);
        const splitLines = lines.filter((l) => {
          const lItems = l.items.filter((it) => it.x + it.width < xCut - 5);
          const rItems = l.items.filter((it) => it.x > xCut + 5);
          return lItems.length > 0 && rItems.length > 0;
        });

        const totalLeft = leftLines.length + splitLines.length;
        const totalRight = rightLines.length + splitLines.length;

        if (totalLeft >= 2 && totalRight >= 2) {
          const score = Math.min(totalLeft, totalRight) * (splitLines.length * 2 + 1);
          if (score > maxGutterScore) {
            maxGutterScore = score;
            bestSplitX = xCut;
          }
        }
      }
    }

    if (bestSplitX !== null) {
      const splitX = bestSplitX;
      const col0Lines: TextLine[] = [];
      const col1Lines: TextLine[] = [];
      const topSpanning: TextLine[] = [];
      const bottomSpanning: TextLine[] = [];

      for (const line of lines) {
        const leftItems = line.items.filter((it) => it.x + it.width < splitX + 5);
        const rightItems = line.items.filter((it) => it.x > splitX - 5);

        if (leftItems.length > 0 && rightItems.length > 0) {
          col0Lines.push(this.buildLine(leftItems, line.y, pageNum));
          col1Lines.push(this.buildLine(rightItems, line.y, pageNum));
        } else if (line.maxX < splitX + 10) {
          col0Lines.push({ ...line, columnIndex: 0 });
        } else if (line.minX > splitX - 10) {
          col1Lines.push({ ...line, columnIndex: 1 });
        } else {
          if (line.y < pageHeight * 0.25) {
            topSpanning.push(line);
          } else {
            bottomSpanning.push(line);
          }
        }
      }

      if (col0Lines.length >= 2 && col1Lines.length >= 2) {
        const col0Bounding: BoundingBox = {
          x: Math.min(...col0Lines.map((l) => l.minX)),
          y: Math.min(...col0Lines.map((l) => l.y)),
          width: Math.max(...col0Lines.map((l) => l.maxX)) - Math.min(...col0Lines.map((l) => l.minX)),
          height: Math.max(...col0Lines.map((l) => l.y + l.height)) - Math.min(...col0Lines.map((l) => l.y)),
        };

        const col1Bounding: BoundingBox = {
          x: Math.min(...col1Lines.map((l) => l.minX)),
          y: Math.min(...col1Lines.map((l) => l.y)),
          width: Math.max(...col1Lines.map((l) => l.maxX)) - Math.min(...col1Lines.map((l) => l.minX)),
          height: Math.max(...col1Lines.map((l) => l.y + l.height)) - Math.min(...col1Lines.map((l) => l.y)),
        };

        const regions: LayoutRegion[] = [
          { type: 'column', index: 0, boundingBox: col0Bounding, lines: col0Lines, page: pageNum },
          { type: 'column', index: 1, boundingBox: col1Bounding, lines: col1Lines, page: pageNum },
        ];

        const orderedLines: TextLine[] = [
          ...topSpanning.sort((a, b) => a.y - b.y),
          ...col0Lines.sort((a, b) => a.y - b.y),
          ...col1Lines.sort((a, b) => a.y - b.y),
          ...bottomSpanning.sort((a, b) => a.y - b.y),
        ];

        return { regions, orderedLines, isMultiCol: true };
      }
    }

    const fullRegion: LayoutRegion = {
      type: 'full_width',
      boundingBox: { x: 0, y: 0, width: pageWidth, height: pageHeight },
      lines,
      page: pageNum,
    };
    return { regions: [fullRegion], orderedLines: lines, isMultiCol: false };
  }

  /**
   * Conservative repeated header & footer detection
   */
  private static detectRepeatedHeadersAndFooters(pages: IntermediateDocument['pages']): {
    hasHeaders: boolean;
    hasFooters: boolean;
  } {
    let hasHeaders = false;
    let hasFooters = false;

    const normalizeFooterTemplate = (t: string) =>
      cleanText(t)
        .toLowerCase()
        .replace(/\b\d+\s*\/\s*\d+\b/g, '')
        .replace(/\bpage\s+\d+(\s+of\s+\d+)?\b/gi, '')
        .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '')
        .replace(/[-\s_]+/g, ' ')
        .trim();

    const topCandidatesByPage: string[][] = [];
    const bottomCandidatesByPage: string[][] = [];

    for (const page of pages) {
      const topZone = page.height * 0.12;
      const bottomZone = page.height * 0.85;

      const topLines = page.lines
        .filter((l) => l.y <= topZone)
        .map((l) => cleanText(l.text).toLowerCase())
        .filter((t) => t.length > 2);

      const bottomLines = page.lines
        .filter((l) => l.y >= bottomZone)
        .map((l) => normalizeFooterTemplate(l.text))
        .filter((t) => t.length > 2);

      topCandidatesByPage.push(topLines);
      bottomCandidatesByPage.push(bottomLines);
    }

    const topFreq: Record<string, number> = {};
    topCandidatesByPage.forEach((lines) => {
      new Set(lines).forEach((line) => {
        topFreq[line] = (topFreq[line] || 0) + 1;
      });
    });

    const bottomFreq: Record<string, number> = {};
    bottomCandidatesByPage.forEach((lines) => {
      new Set(lines).forEach((line) => {
        bottomFreq[line] = (bottomFreq[line] || 0) + 1;
      });
    });

    const isPageNumPattern = (t: string) =>
      /^page\s+\d+(\s+of\s+\d+)?$/i.test(t) ||
      /^\d+\s*\/\s*\d+$/.test(t) ||
      /^-\s*\d+\s*-$/.test(t) ||
      /printed\s+\d+/i.test(t);

    for (const page of pages) {
      const topZone = page.height * 0.12;
      const bottomZone = page.height * 0.85;

      for (const line of page.lines) {
        const cleaned = cleanText(line.text).toLowerCase();
        const footerNorm = normalizeFooterTemplate(line.text);

        if (line.y <= topZone && topFreq[cleaned] >= 2) {
          line.role = 'header';
          hasHeaders = true;
        } else if (
          line.y >= bottomZone &&
          (bottomFreq[footerNorm] >= 2 || isPageNumPattern(cleaned))
        ) {
          line.role = 'footer';
          hasFooters = true;
        }
      }

      for (const block of page.textBlocks) {
        if (block.lines.every((l) => l.role === 'header')) {
          block.role = 'header';
        } else if (block.lines.every((l) => l.role === 'footer')) {
          block.role = 'footer';
        }
      }
    }

    return { hasHeaders, hasFooters };
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

    const allFontSizes = lines
      .flatMap((l) => l.items)
      .map((it) => it.fontSize || 12)
      .filter((fs) => fs > 0);

    const medianFontSize =
      allFontSizes.length > 0
        ? allFontSizes.sort((a, b) => a - b)[Math.floor(allFontSizes.length / 2)]
        : 12;

    const blocks: TextBlock[] = [];
    let currentBlockLines: TextLine[] = [lines[0]];

    for (let i = 1; i < lines.length; i++) {
      const prevLine = lines[i - 1];
      const currLine = lines[i];

      const verticalGap = currLine.y - (prevLine.y + prevLine.height);
      const isFontSizeDifferent =
        Math.abs((currLine.items[0]?.fontSize || 12) - (prevLine.items[0]?.fontSize || 12)) > 2.5;
      const isColumnChanged = currLine.columnIndex !== prevLine.columnIndex;

      if (verticalGap > 14 || isFontSizeDifferent || isColumnChanged || currLine.role !== prevLine.role) {
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
      (fontSize >= medianFontSize * 1.25 ||
        (lines.length === 1 && /^[A-Z0-9\s:_-]{3,50}$/.test(text))) &&
      text.length < 100 &&
      !lines[0].role;

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
      role: lines[0]?.role,
      lines,
    };
  }

  /**
   * Helper to extract raster image buffers from scanned PDF pages for OCR
   */
  public static async extractPageImageBuffer(page: any): Promise<Buffer | null> {
    try {
      const ops = await page.getOperatorList();
      for (let i = 0; i < ops.fnArray.length; i++) {
        const args = ops.argsArray[i];
        if (args && args[0] && typeof args[0] === 'string' && args[0].startsWith('img_')) {
          const imgName = args[0];
          const imgObj = await new Promise((resolve) => {
            page.objs.get(imgName, (obj: any) => resolve(obj));
          }) as any;
          if (imgObj && imgObj.data) {
            const width = imgObj.width;
            const height = imgObj.height;
            const rgbData = Buffer.alloc(width * height * 3);
            if (imgObj.data.length === width * height * 4) {
              for (let p = 0; p < width * height; p++) {
                rgbData[p * 3] = imgObj.data[p * 4];
                rgbData[p * 3 + 1] = imgObj.data[p * 4 + 1];
                rgbData[p * 3 + 2] = imgObj.data[p * 4 + 2];
              }
            } else if (imgObj.data.length === width * height * 3) {
              Buffer.from(imgObj.data).copy(rgbData);
            } else {
              for (let p = 0; p < width * height; p++) {
                const val = imgObj.data[p] || 0;
                rgbData[p * 3] = val;
                rgbData[p * 3 + 1] = val;
                rgbData[p * 3 + 2] = val;
              }
            }
            const ppmHeader = Buffer.from(`P6\n${width} ${height}\n255\n`);
            return Buffer.concat([ppmHeader, rgbData]);
          }
        }
      }
    } catch {
      // Non-critical image extraction failure
    }
    return null;
  }
}

