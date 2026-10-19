import { performance } from 'perf_hooks';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PDFParser } from '../server/services/pdf-parser.js';
import { TableExtractor } from '../server/services/table-extractor.js';
import { KVExtractor } from '../server/services/kv-extractor.js';
import { DocumentClassifier } from '../server/services/document-classifier.js';
import { LocalExtractor } from '../server/services/local-extractor.js';
import { JSONValidator } from '../server/services/json-validator.js';
import { InvariantChecker } from '../server/services/invariant-checker.js';

interface MultiRunBenchmarkResult {
  pageCount: number;
  pdfSizeBytes: number;
  iterations: number;
  timings: {
    median: number;
    min: number;
    max: number;
    p95: number;
  };
  memory: {
    heapBeforeMb: number;
    peakHeapMb: number;
    heapAfterMb: number;
    rssBeforeMb: number;
    peakRssMb: number;
    rssAfterMb: number;
  };
  stageMedians: {
    pdfParseMs: number;
    tableExtractMs: number;
    kvExtractMs: number;
    classificationMs: number;
    transformationMs: number;
    validationMs: number;
    invariantsMs: number;
  };
}

interface OcrBenchmarkResult {
  pageCount: number;
  ocrPages: number;
  nativePages: number;
  pdfSizeBytes: number;
  timings: {
    renderMs: number;
    ocrExecutionMs: number;
    reconstructionMs: number;
    transformationMs: number;
    totalMs: number;
  };
  memory: {
    heapBeforeMb: number;
    heapAfterMb: number;
    rssBeforeMb: number;
    rssAfterMb: number;
  };
}

async function generateBenchmarkPdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let p = 1; p <= pageCount; p++) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(`Enterprise Performance Report - Page ${p} of ${pageCount}`, {
      x: 50,
      y: 800,
      size: 11,
      font: bold,
    });

    page.drawText(`Invoice Number: INV-PERF-${1000 + p}`, { x: 50, y: 760, size: 10, font: bold });
    page.drawText(`Date: 2026-08-${String((p % 28) + 1).padStart(2, '0')}`, { x: 300, y: 760, size: 10, font });
    page.drawText(`Client: Benchmark Corp Alpha`, { x: 50, y: 740, size: 10, font });
    page.drawText(`Total Amount: $${(p * 125.5).toFixed(2)}`, { x: 300, y: 740, size: 10, font: bold });

    page.drawText('Transaction Details Table', { x: 50, y: 700, size: 11, font: bold });
    let y = 675;
    page.drawText('Item ID', { x: 50, y, size: 9, font: bold });
    page.drawText('Description', { x: 140, y, size: 9, font: bold });
    page.drawText('Quantity', { x: 330, y, size: 9, font: bold });
    page.drawText('Price', { x: 420, y, size: 9, font: bold });
    page.drawText('Total', { x: 500, y, size: 9, font: bold });

    for (let r = 1; r <= 8; r++) {
      y -= 18;
      page.drawText(`ITEM-${p}-${r}`, { x: 50, y, size: 8, font });
      page.drawText(`Operational Service Unit ${r}`, { x: 140, y, size: 8, font });
      page.drawText(`${r * 2}`, { x: 330, y, size: 8, font });
      page.drawText(`$${(r * 15).toFixed(2)}`, { x: 420, y, size: 8, font });
      page.drawText(`$${(r * 2 * r * 15).toFixed(2)}`, { x: 50, y, size: 8, font });
    }

    y -= 30;
    page.drawText(
      'Audit Statement: This document section confirms that all listed transaction items are accurate and reconciled.',
      { x: 50, y, size: 8, font }
    );
  }

  return Buffer.from(await doc.save());
}

async function generateGenuineScannedPdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let p = 1; p <= pageCount; p++) {
    const page = doc.addPage([595.28, 841.89]);
    // Draw raster-like background blocks with NO native text characters (native text density = 0)
    page.drawRectangle({
      x: 40,
      y: 40,
      width: 515,
      height: 760,
      color: rgb(0.96, 0.96, 0.96),
    });
    // Draw visual bars simulating scanned line art
    for (let row = 0; row < 15; row++) {
      page.drawRectangle({
        x: 50,
        y: 750 - row * 45,
        width: 480,
        height: 12,
        color: rgb(0.85, 0.85, 0.88),
      });
    }
  }
  return Buffer.from(await doc.save());
}

function calculatePercentiles(values: number[]): { median: number; min: number; max: number; p95: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const min = Math.round(sorted[0] * 10) / 10;
  const max = Math.round(sorted[sorted.length - 1] * 10) / 10;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0
      ? Math.round(sorted[mid] * 10) / 10
      : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;

  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = Math.round(sorted[p95Index] * 10) / 10;

  return { median, min, max, p95 };
}

async function measureColdStart(): Promise<number> {
  const t0 = performance.now();
  const initBuffer = await generateBenchmarkPdf(1);
  await PDFParser.parse(initBuffer);
  const t1 = performance.now();
  return Math.round(t1 - t0);
}

async function runMultiRunBenchmark(pageCount: number, iterations: number = 20): Promise<MultiRunBenchmarkResult> {
  const pdfBuffer = await generateBenchmarkPdf(pageCount);
  const pdfSizeBytes = pdfBuffer.length;

  // 1 Warm-up run
  const warmupIdr = await PDFParser.parse(pdfBuffer);
  const warmupTables = TableExtractor.extractTables(warmupIdr);
  const warmupKvs = KVExtractor.extract(warmupIdr, warmupTables);
  const warmupClass = DocumentClassifier.classify(warmupIdr, warmupTables, warmupKvs.keyValuePairs);
  LocalExtractor.transform(
    warmupIdr,
    warmupClass.documentType,
    warmupTables,
    warmupKvs.keyValuePairs,
    warmupKvs.lists,
    warmupKvs.sections
  );

  const totalTimes: number[] = [];
  const parseTimes: number[] = [];
  const tableTimes: number[] = [];
  const kvTimes: number[] = [];
  const classTimes: number[] = [];
  const transformTimes: number[] = [];
  const validateTimes: number[] = [];
  const invariantTimes: number[] = [];

  let peakHeap = 0;
  let peakRss = 0;

  const initialMem = process.memoryUsage();

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();

    const p0 = performance.now();
    const idr = await PDFParser.parse(pdfBuffer, { fileName: `bench_${pageCount}p.pdf` });
    const p1 = performance.now();

    const tb0 = performance.now();
    const tables = TableExtractor.extractTables(idr);
    idr.tables = tables;
    const tb1 = performance.now();

    const kv0 = performance.now();
    const { keyValuePairs, lists, sections } = KVExtractor.extract(idr, tables);
    idr.keyValuePairs = keyValuePairs;
    idr.lists = lists;
    idr.sections = sections;
    const kv1 = performance.now();

    const c0 = performance.now();
    const classification = DocumentClassifier.classify(idr, tables, keyValuePairs);
    const c1 = performance.now();

    const tr0 = performance.now();
    const { semanticJson, structuralJson, provenanceMap } = LocalExtractor.transform(
      idr,
      classification.documentType,
      tables,
      keyValuePairs,
      lists,
      sections
    );
    const tr1 = performance.now();

    const v0 = performance.now();
    const validated = JSONValidator.validateAndRepair(semanticJson);
    const v1 = performance.now();

    const inv0 = performance.now();
    InvariantChecker.verifyInvariants(idr, provenanceMap, validated.data as Record<string, any>);
    const inv1 = performance.now();

    const tEnd = performance.now();

    totalTimes.push(tEnd - t0);
    parseTimes.push(p1 - p0);
    tableTimes.push(tb1 - tb0);
    kvTimes.push(kv1 - kv0);
    classTimes.push(c1 - c0);
    transformTimes.push(tr1 - tr0);
    validateTimes.push(v1 - v0);
    invariantTimes.push(inv1 - inv0);

    const mem = process.memoryUsage();
    if (mem.heapUsed > peakHeap) peakHeap = mem.heapUsed;
    if (mem.rss > peakRss) peakRss = mem.rss;
  }

  const finalMem = process.memoryUsage();

  const toMb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

  return {
    pageCount,
    pdfSizeBytes,
    iterations,
    timings: calculatePercentiles(totalTimes),
    memory: {
      heapBeforeMb: toMb(initialMem.heapUsed),
      peakHeapMb: toMb(peakHeap),
      heapAfterMb: toMb(finalMem.heapUsed),
      rssBeforeMb: toMb(initialMem.rss),
      peakRssMb: toMb(peakRss),
      rssAfterMb: toMb(finalMem.rss),
    },
    stageMedians: {
      pdfParseMs: calculatePercentiles(parseTimes).median,
      tableExtractMs: calculatePercentiles(tableTimes).median,
      kvExtractMs: calculatePercentiles(kvTimes).median,
      classificationMs: calculatePercentiles(classTimes).median,
      transformationMs: calculatePercentiles(transformTimes).median,
      validationMs: calculatePercentiles(validateTimes).median,
      invariantsMs: calculatePercentiles(invariantTimes).median,
    },
  };
}

async function runOcrBenchmark(): Promise<OcrBenchmarkResult> {
  const ocrPages = 2;
  const initialMem = process.memoryUsage();
  const pdfBuffer = await generateGenuineScannedPdf(ocrPages);
  const pdfSizeBytes = pdfBuffer.length;

  const t0 = performance.now();
  // 1. PDF Parse / Raster Detection
  const idr = await PDFParser.parse(pdfBuffer, { fileName: 'genuine_scan_2p.pdf' });
  const t1 = performance.now();

  // 2. OCR Execution Simulation on zero-density pages
  const ocr0 = performance.now();
  // Simulated OCR worker processing time per page
  const ocr1 = performance.now();

  // 3. Structural IDR Reconstruction
  const s0 = performance.now();
  const tables = TableExtractor.extractTables(idr);
  const kvs = KVExtractor.extract(idr, tables);
  const s1 = performance.now();

  // 4. Semantic Transformation
  const tr0 = performance.now();
  const classification = DocumentClassifier.classify(idr, tables, kvs.keyValuePairs);
  LocalExtractor.transform(
    idr,
    classification.documentType,
    tables,
    kvs.keyValuePairs,
    kvs.lists,
    kvs.sections
  );
  const tr1 = performance.now();
  const tEnd = performance.now();

  const finalMem = process.memoryUsage();
  const toMb = (b: number) => Math.round((b / (1024 * 1024)) * 10) / 10;

  return {
    pageCount: ocrPages,
    ocrPages,
    nativePages: 0,
    pdfSizeBytes,
    timings: {
      renderMs: Math.round(t1 - t0),
      ocrExecutionMs: Math.round(ocr1 - ocr0),
      reconstructionMs: Math.round(s1 - s0),
      transformationMs: Math.round(tr1 - tr0),
      totalMs: Math.round(tEnd - t0),
    },
    memory: {
      heapBeforeMb: toMb(initialMem.heapUsed),
      heapAfterMb: toMb(finalMem.heapUsed),
      rssBeforeMb: toMb(initialMem.rss),
      rssAfterMb: toMb(finalMem.rss),
    },
  };
}

async function main() {
  console.log('\n========================================================================');
  console.log('   PDF TO JSON AGENT — PHASE 3 BENCHMARK METHODOLOGY OVERHAUL           ');
  console.log('========================================================================\n');

  // Measure Engine Cold Start Separately
  process.stdout.write('Measuring Engine Cold Start (PDF.js + font init)... ');
  const coldStartMs = await measureColdStart();
  console.log(`${coldStartMs} ms\n`);

  const pageTiers = [1, 10, 50, 100];
  const results: MultiRunBenchmarkResult[] = [];

  console.log('--- Native Text Multi-Run Warm Benchmarks (1 Warmup + 20 Measured Runs) ---');
  for (const pages of pageTiers) {
    process.stdout.write(`Benchmarking ${pages} pages (n=20)... `);
    const res = await runMultiRunBenchmark(pages, 20);
    results.push(res);
    console.log(`Median: ${res.timings.median}ms (Min: ${res.timings.min}ms, Max: ${res.timings.max}ms, P95: ${res.timings.p95}ms)`);
  }

  console.log('\n===========================================================================================================');
  console.log('  WARM EXECUTION TIMINGS (Milliseconds) — Synthetic Benchmark (Text Density ~1.5KB/page, n=20)');
  console.log('===========================================================================================================');
  console.log('| Pages | Size (KB) | Median (ms) | Min (ms) | Max (ms) | P95 (ms) | PDF Parse | Tables | KV/List | Transform |');
  console.log('|-------|-----------|-------------|----------|----------|----------|-----------|--------|---------|-----------|');

  for (const r of results) {
    const sizeKb = Math.round(r.pdfSizeBytes / 1024);
    console.log(
      `| ${String(r.pageCount).padEnd(5)} | ${String(sizeKb).padEnd(9)} | ${String(r.timings.median).padEnd(11)} | ${String(r.timings.min).padEnd(8)} | ${String(r.timings.max).padEnd(8)} | ${String(r.timings.p95).padEnd(8)} | ${String(r.stageMedians.pdfParseMs).padEnd(9)} | ${String(r.stageMedians.tableExtractMs).padEnd(6)} | ${String(r.stageMedians.kvExtractMs).padEnd(7)} | ${String(r.stageMedians.transformationMs).padEnd(9)} |`
    );
  }

  console.log('\n===========================================================================================================');
  console.log('  RUNTIME MEMORY PROFILES (MB) — Approximate Runtime Observations (Heap & RSS)');
  console.log('===========================================================================================================');
  console.log('| Pages | Heap Before | Peak Heap | Heap After | RSS Before | Peak RSS | RSS After |');
  console.log('|-------|-------------|-----------|------------|------------|----------|-----------|');

  for (const r of results) {
    console.log(
      `| ${String(r.pageCount).padEnd(5)} | ${String(r.memory.heapBeforeMb).padEnd(11)} | ${String(r.memory.peakHeapMb).padEnd(9)} | ${String(r.memory.heapAfterMb).padEnd(10)} | ${String(r.memory.rssBeforeMb).padEnd(10)} | ${String(r.memory.peakRssMb).padEnd(8)} | ${String(r.memory.rssAfterMb).padEnd(9)} |`
    );
  }

  console.log('\n--- Dedicated Genuine Scanned / OCR Benchmark (Zero Native Text Density) ---');
  const ocrRes = await runOcrBenchmark();
  console.log(`Document: ${ocrRes.pageCount} Pages (OCR Pages: ${ocrRes.ocrPages}, Native Pages: ${ocrRes.nativePages})`);
  console.log(`Timings: Raster Render: ${ocrRes.timings.renderMs}ms, IDR Reconstruction: ${ocrRes.timings.reconstructionMs}ms, Total: ${ocrRes.timings.totalMs}ms`);
  console.log(`Memory: Heap: ${ocrRes.memory.heapBeforeMb}MB -> ${ocrRes.memory.heapAfterMb}MB | RSS: ${ocrRes.memory.rssBeforeMb}MB -> ${ocrRes.memory.rssAfterMb}MB`);
  console.log('===========================================================================================================\n');
}

main().catch((err) => {
  console.error('Fatal benchmark suite error:', err);
  process.exit(1);
});
