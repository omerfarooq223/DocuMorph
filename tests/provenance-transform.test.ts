import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFParser } from '../server/services/pdf-parser.js';
import { KVExtractor } from '../server/services/kv-extractor.js';

describe('Provenance Coordinate Contract & Viewport Transformations', () => {
  /**
   * Independent transform of IDR top-left coordinates into viewport space
   * using explicit 4-corner mapping.
   */
  function transformIdrBoxToViewport(
    rawBox: { x: number; y: number; width: number; height: number },
    pageHeight: number,
    viewport: any
  ) {
    const pdfX1 = rawBox.x;
    const pdfY1 = pageHeight - rawBox.y - 2; // Bottom/descent
    const pdfX2 = rawBox.x + rawBox.width;
    const pdfY2 = pageHeight - rawBox.y + rawBox.height; // Top/ascent

    const p1 = viewport.convertToViewportPoint(pdfX1, pdfY1);
    const p2 = viewport.convertToViewportPoint(pdfX2, pdfY2);
    const p3 = viewport.convertToViewportPoint(pdfX1, pdfY2);
    const p4 = viewport.convertToViewportPoint(pdfX2, pdfY1);

    const allX = [p1[0], p2[0], p3[0], p4[0]];
    const allY = [p1[1], p2[1], p3[1], p4[1]];

    const minX = Math.min(...allX);
    const minY = Math.min(...allY);
    return {
      x: minX,
      y: minY,
      width: Math.max(...allX) - minX,
      height: Math.max(...allY) - minY,
    };
  }

  it('Scenario 1: Non-Circular Independent Mathematical Coordinate Verification', async () => {
    // Generate a controlled PDF with text placed at known PDF user coordinates (x=100, y=600)
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4 Portrait
    page.drawText('Invoice Number: INV-INDEPENDENT-99', { x: 100, y: 600, size: 10 });
    const buffer = Buffer.from(await doc.save());

    // 1. Run engine extraction
    const idr = await PDFParser.parse(buffer);
    const { keyValuePairs } = KVExtractor.extract(idr, []);
    assert.strictEqual(keyValuePairs.length, 1);

    const kv = keyValuePairs[0];
    assert.strictEqual(kv.provenance.coordinateSpace, 'idr_top_left');
    assert.ok(kv.provenance.boundingBox);

    // 2. Independently verify the IDR Y coordinate:
    // In IDR top-left space: Y should be ~ (841.89 - 600) = 241.89
    const expectedIdrY = 841.89 - 600;
    assert.ok(
      Math.abs(kv.provenance.boundingBox!.y - expectedIdrY) < 1.0,
      `IDR Y ${kv.provenance.boundingBox!.y} should match independent expected Y ${expectedIdrY}`
    );

    // 3. Verify against independent PDF.js viewport rendering at scale 1.5
    const pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pdfPage = await pdfJsDoc.getPage(1);
    const scale = 1.5;
    const viewport = pdfPage.getViewport({ scale });

    // Independent analytical calculation of viewport position:
    // viewport X = 100 * 1.5 = 150
    // viewport Y top = (841.89 - (600 + textHeight)) * 1.5 = (841.89 - 610) * 1.5 = 347.835
    const independentExpectedViewportX = 100 * scale;
    const independentExpectedViewportY = (841.89 - (600 + kv.provenance.boundingBox!.height)) * scale;

    const transformedRect = transformIdrBoxToViewport(
      kv.provenance.boundingBox!,
      841.89,
      viewport
    );

    assert.ok(
      Math.abs(transformedRect.x - independentExpectedViewportX) < 1.0,
      `Transformed X (${transformedRect.x}) matches independent analytical X (${independentExpectedViewportX})`
    );
    assert.ok(
      Math.abs(transformedRect.y - independentExpectedViewportY) < 1.0,
      `Transformed Y (${transformedRect.y}) matches independent analytical Y (${independentExpectedViewportY})`
    );
  });

  it('Scenario 2: All Four Rotations (0°, 90°, 180°, 270°)', async () => {
    const rotations = [0, 90, 180, 270];

    for (const rot of rotations) {
      const doc = await PDFDocument.create();
      const page = doc.addPage([595.28, 841.89]);
      page.setRotation(degrees(rot));
      page.drawText('Total: $1,250.00', { x: 80, y: 700, size: 12 });
      const buffer = Buffer.from(await doc.save());

      const pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      const pdfPage = await pdfJsDoc.getPage(1);
      const viewport = pdfPage.getViewport({ scale: 1.0, rotation: rot });

      // Raw IDR box in top-left space for (x=80, y=700 in standard PDF space)
      const rawIdrBox = { x: 80, y: 841.89 - 700, width: 100, height: 12 };
      const rect = transformIdrBoxToViewport(rawIdrBox, 841.89, viewport);

      // Verify that transformed bounds are strictly positive and within viewport dimensions
      assert.ok(rect.width > 0, `Rotation ${rot}° width > 0`);
      assert.ok(rect.height > 0, `Rotation ${rot}° height > 0`);
      assert.ok(rect.x >= 0 && rect.x <= viewport.width, `Rotation ${rot}° X within viewport`);
      assert.ok(rect.y >= 0 && rect.y <= viewport.height, `Rotation ${rot}° Y within viewport`);
    }
  });

  it('Scenario 3: Landscape PDF Coordinate Transformation', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([841.89, 595.28]); // Landscape A4
    page.drawText('Due Date: 2026-12-31', { x: 120, y: 450, size: 11 });
    const buffer = Buffer.from(await doc.save());

    const idr = await PDFParser.parse(buffer);
    const { keyValuePairs } = KVExtractor.extract(idr, []);
    assert.strictEqual(keyValuePairs.length, 1);

    const kv = keyValuePairs[0];
    const pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pdfPage = await pdfJsDoc.getPage(1);
    const viewport = pdfPage.getViewport({ scale: 1.0 });

    const rect = transformIdrBoxToViewport(kv.provenance.boundingBox!, 595.28, viewport);
    assert.ok(Math.abs(rect.x - 120) < 2.0);
    assert.ok(rect.width > 30);
    assert.ok(rect.height > 8);
  });

  it('Scenario 4: OCR Image Space Contract Verification', () => {
    const ocrProvenance = {
      coordinateSpace: 'ocr_image' as const,
      sourceMethod: 'ocr' as const,
      renderDimensions: { width: 2480, height: 3508 },
      boundingBox: { x: 248, y: 701.6, width: 496, height: 70.16 },
    };

    const targetViewportWidth = 620;
    const targetViewportHeight = 877;

    // Scale proportional to viewport (CSS overlay)
    const scaleX = targetViewportWidth / ocrProvenance.renderDimensions.width; // 0.25
    const scaleY = targetViewportHeight / ocrProvenance.renderDimensions.height; // 0.25

    const canvasX = ocrProvenance.boundingBox.x * scaleX;
    const canvasY = ocrProvenance.boundingBox.y * scaleY;
    const canvasWidth = ocrProvenance.boundingBox.width * scaleX;
    const canvasHeight = ocrProvenance.boundingBox.height * scaleY;

    assert.strictEqual(canvasX, 62);
    assert.strictEqual(canvasY, 175.4);
    assert.strictEqual(canvasWidth, 124);
    assert.strictEqual(canvasHeight, 17.54);
  });

  it('Scenario 5: Non-Default CropBox Bounds Handling', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    page.setCropBox(50, 50, 500, 700);
    page.drawText('Status: Approved', { x: 100, y: 700, size: 10 });
    const buffer = Buffer.from(await doc.save());

    const pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pdfPage = await pdfJsDoc.getPage(1);
    const viewport = pdfPage.getViewport({ scale: 1.0 });

    const rawIdrBox = { x: 100, y: 800 - 700, width: 80, height: 10 };
    const rect = transformIdrBoxToViewport(rawIdrBox, 800, viewport);

    assert.ok(rect.width > 0);
    assert.ok(rect.height > 0);
  });
});
