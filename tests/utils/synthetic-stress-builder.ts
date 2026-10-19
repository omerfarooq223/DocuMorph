import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYNTHETIC_DIR = path.resolve(__dirname, '../corpus/synthetic');

// Ensure synthetic directory exists
if (!fs.existsSync(SYNTHETIC_DIR)) {
  fs.mkdirSync(SYNTHETIC_DIR, { recursive: true });
}

interface ScenarioDefinition {
  id: string;
  name: string;
  category: 'text_layout' | 'tables' | 'documents' | 'difficult';
  buildPdf: () => Promise<Buffer>;
  expectedJson: Record<string, any>;
  snapshot: {
    expectedPageCount: number;
    expectedMinLines: number;
    expectedTables: number;
    expectedColumns?: number;
    expectedHeadings?: string[];
    expectedHeaders?: boolean;
    expectedFooters?: boolean;
  };
}

export class SyntheticStressBuilder {
  public static async generateAll(): Promise<void> {
    console.log(`[SyntheticStressBuilder] Generating 40 synthetic stress scenarios into: ${SYNTHETIC_DIR}`);
    const scenarios = this.getScenarios();

    for (let i = 0; i < scenarios.length; i++) {
      const s = scenarios[i];
      const pdfBuffer = await s.buildPdf();
      const pdfPath = path.join(SYNTHETIC_DIR, `${s.id}.pdf`);
      const expectedPath = path.join(SYNTHETIC_DIR, `${s.id}.expected.json`);
      const snapshotPath = path.join(SYNTHETIC_DIR, `${s.id}.snapshot.json`);

      fs.writeFileSync(pdfPath, pdfBuffer);
      fs.writeFileSync(expectedPath, JSON.stringify(s.expectedJson, null, 2));
      fs.writeFileSync(snapshotPath, JSON.stringify(s.snapshot, null, 2));

      console.log(`  ✓ [${i + 1}/40] Generated ${s.id}.pdf (${s.category})`);
    }

    console.log(`[SyntheticStressBuilder] All 40 synthetic stress scenarios successfully generated.\n`);
  }

  private static getScenarios(): ScenarioDefinition[] {
    const list: ScenarioDefinition[] = [];

    // -------------------------------------------------------------
    // CATEGORY 1: TEXT LAYOUT (01 - 10)
    // -------------------------------------------------------------

    // 01: Simple One-Column Document
    list.push({
      id: '01_single_column',
      name: 'Single Column Document',
      category: 'text_layout',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const page = doc.addPage([595.28, 841.89]);
        let y = 800;

        page.drawText('Global Climate Policy Brief', { x: 50, y, size: 20, font: bold });
        y -= 30;
        page.drawText('Author: Dr. Elena Vance | Date: 2026-08-20', { x: 50, y, size: 10, font });
        y -= 25;
        page.drawText('Executive Summary', { x: 50, y, size: 14, font: bold });
        y -= 18;
        page.drawText('This brief outlines strategic frameworks for carbon reduction across industrial manufacturing.', { x: 50, y, size: 10, font });
        y -= 16;
        page.drawText('Key policy initiatives must prioritize renewable grid integration and clean transport subsidies.', { x: 50, y, size: 10, font });
        return Buffer.from(await doc.save());
      },
      expectedJson: {
        document_type: 'generic',
        fields: {
          author: 'Dr. Elena Vance',
          date: '2026-08-20',
        },
      },
      snapshot: {
        expectedPageCount: 1,
        expectedMinLines: 4,
        expectedTables: 0,
        expectedHeadings: ['Global Climate Policy Brief', 'Executive Summary'],
      },
    });

    // 02: Two-Column Document
    list.push({
      id: '02_two_column',
      name: 'Two Column Article Layout',
      category: 'text_layout',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const page = doc.addPage([595.28, 841.89]);

        // Spanning title
        page.drawText('Advancements in Machine Learning', { x: 50, y: 800, size: 18, font: bold });

        // Left Column (x: 50..270)
        let yLeft = 750;
        page.drawText('1. Introduction', { x: 50, y: yLeft, size: 12, font: bold });
        yLeft -= 18;
        page.drawText('Left column text paragraph one.', { x: 50, y: yLeft, size: 10, font });
        yLeft -= 16;
        page.drawText('Left column text paragraph two continues here.', { x: 50, y: yLeft, size: 10, font });
        yLeft -= 16;
        page.drawText('Left column summary concluding line.', { x: 50, y: yLeft, size: 10, font });

        // Right Column (x: 320..540)
        let yRight = 750;
        page.drawText('2. Architectural Design', { x: 320, y: yRight, size: 12, font: bold });
        yRight -= 18;
        page.drawText('Right column text describes components.', { x: 320, y: yRight, size: 10, font });
        yRight -= 16;
        page.drawText('Right column data pipelines and telemetry.', { x: 320, y: yRight, size: 10, font });
        yRight -= 16;
        page.drawText('Right column conclusion and benchmarks.', { x: 320, y: yRight, size: 10, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: {
        document_type: 'generic',
      },
      snapshot: {
        expectedPageCount: 1,
        expectedMinLines: 7,
        expectedTables: 0,
        expectedColumns: 2,
      },
    });

    // 03: Three-Column Document
    list.push({
      id: '03_three_column',
      name: 'Three Column Newsletter',
      category: 'text_layout',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Weekly Tech Digest', { x: 50, y: 800, size: 20, font: bold });

        // Col 1
        page.drawText('Column One', { x: 50, y: 750, size: 11, font: bold });
        page.drawText('Updates on AI.', { x: 50, y: 730, size: 9, font });
        page.drawText('New hardware launches.', { x: 50, y: 715, size: 9, font });

        // Col 2
        page.drawText('Column Two', { x: 220, y: 750, size: 11, font: bold });
        page.drawText('Cloud infrastructure.', { x: 220, y: 730, size: 9, font });
        page.drawText('Microservice patterns.', { x: 220, y: 715, size: 9, font });

        // Col 3
        page.drawText('Column Three', { x: 390, y: 750, size: 11, font: bold });
        page.drawText('Security advisories.', { x: 390, y: 730, size: 9, font });
        page.drawText('Vulnerability patches.', { x: 390, y: 715, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 6, expectedTables: 0 },
    });

    // 04: Mixed Font Sizes
    list.push({
      id: '04_mixed_font_sizes',
      name: 'Document with Mixed Font Sizes',
      category: 'text_layout',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('MAIN HERO TITLE', { x: 50, y: 790, size: 28, font: bold });
        page.drawText('Section Subtitle in 16pt', { x: 50, y: 750, size: 16, font: bold });
        page.drawText('Regular paragraph content rendered at standard 10pt size.', { x: 50, y: 720, size: 10, font });
        page.drawText('Fine print legal disclaimer rendered in 7pt font at bottom.', { x: 50, y: 690, size: 7, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 4, expectedTables: 0 },
    });

    // 05: Repeated Headers Across 3 Pages
    list.push({
      id: '05_repeated_headers',
      name: 'Multi-Page Repeated Running Header',
      category: 'text_layout',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);

        for (let p = 1; p <= 3; p++) {
          const page = doc.addPage([595.28, 841.89]);
          // Recurring Header in top 10%
          page.drawText('ACME CORP CONFIDENTIAL REPORT', { x: 50, y: 810, size: 10, font: bold, color: rgb(0.5, 0.5, 0.5) });
          page.drawText(`Page Content Section ${p}`, { x: 50, y: 740, size: 14, font: bold });
          page.drawText(`Detailed operational metrics for chapter ${p} are detailed below.`, { x: 50, y: 710, size: 10, font });
        }

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 3, expectedMinLines: 6, expectedTables: 0, expectedHeaders: true },
    });

    // 06: Repeated Footers Across 3 Pages
    list.push({
      id: '06_repeated_footers',
      name: 'Multi-Page Repeated Footer',
      category: 'text_layout',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);

        for (let p = 1; p <= 3; p++) {
          const page = doc.addPage([595.28, 841.89]);
          page.drawText(`Quarterly Financials Part ${p}`, { x: 50, y: 780, size: 14, font: bold });
          page.drawText('Financial figures for this reporting cycle are audited.', { x: 50, y: 750, size: 10, font });
          // Recurring Footer in bottom 10%
          page.drawText('© 2026 Acme Corp. All rights reserved. Do not distribute.', { x: 50, y: 40, size: 9, font });
        }

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 3, expectedMinLines: 6, expectedTables: 0, expectedFooters: true },
    });

    // 07: Page Numbers
    list.push({
      id: '07_page_numbers',
      name: 'Page Numbers Detection',
      category: 'text_layout',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);

        for (let p = 1; p <= 3; p++) {
          const page = doc.addPage([595.28, 841.89]);
          page.drawText(`Document Chapter ${p}`, { x: 50, y: 780, size: 14, font: bold });
          page.drawText(`Chapter ${p} body text discussion.`, { x: 50, y: 750, size: 10, font });
          page.drawText(`Page ${p} of 3`, { x: 260, y: 35, size: 9, font });
        }

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 3, expectedMinLines: 6, expectedTables: 0 },
    });

    // 08: Large Titles
    list.push({
      id: '08_large_titles',
      name: 'Large Title Banner',
      category: 'text_layout',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('ANNUAL REPORT', { x: 50, y: 770, size: 36, font: bold, color: rgb(0.1, 0.3, 0.6) });
        page.drawText('Acme Corporation Fiscal Year 2026', { x: 50, y: 720, size: 14, font });
        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 2, expectedTables: 0 },
    });

    // 09: Nested Headings
    list.push({
      id: '09_nested_headings',
      name: 'Nested Heading Hierarchy',
      category: 'text_layout',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);
        let y = 800;

        page.drawText('1. Main Heading Level 1', { x: 50, y, size: 18, font: bold });
        y -= 25;
        page.drawText('Introductory text under level 1.', { x: 50, y, size: 10, font });
        y -= 25;
        page.drawText('1.1 Sub-Heading Level 2', { x: 50, y, size: 14, font: bold });
        y -= 20;
        page.drawText('Detailed text under subsection 1.1.', { x: 50, y, size: 10, font });
        y -= 25;
        page.drawText('1.1.1 Deep Heading Level 3', { x: 50, y, size: 11, font: bold });
        y -= 18;
        page.drawText('Deep nested paragraph content.', { x: 50, y, size: 10, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 6, expectedTables: 0 },
    });

    // 10: Bullet and Numbered Lists
    list.push({
      id: '10_bullet_and_numbered_lists',
      name: 'Lists Extraction',
      category: 'text_layout',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);
        let y = 800;

        page.drawText('Key Requirements & Steps', { x: 50, y, size: 14, font: bold });
        y -= 25;
        page.drawText('Bullet Requirements:', { x: 50, y, size: 11, font: bold });
        y -= 18;
        page.drawText('- Requirement Alpha: Fast network throughput', { x: 60, y, size: 10, font });
        y -= 16;
        page.drawText('- Requirement Beta: High security compliance', { x: 60, y, size: 10, font });
        y -= 16;
        page.drawText('- Requirement Gamma: 99.99% availability SLA', { x: 60, y, size: 10, font });

        y -= 30;
        page.drawText('Execution Procedure:', { x: 50, y, size: 11, font: bold });
        y -= 18;
        page.drawText('1. Initialize the deployment cluster', { x: 60, y, size: 10, font });
        y -= 16;
        page.drawText('2. Apply database migrations', { x: 60, y, size: 10, font });
        y -= 16;
        page.drawText('3. Start application gateway workers', { x: 60, y, size: 10, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 8, expectedTables: 0 },
    });

    // -------------------------------------------------------------
    // CATEGORY 2: TABLES (11 - 22)
    // -------------------------------------------------------------

    // 11: Table with Visible Borders
    list.push({
      id: '11_table_visible_borders',
      name: 'Table with Drawn Borders',
      category: 'tables',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Inventory Status Table', { x: 50, y: 790, size: 14, font: bold });

        let y = 750;
        // Draw header background box
        page.drawRectangle({ x: 50, y: y - 5, width: 490, height: 20, color: rgb(0.9, 0.93, 0.98) });
        page.drawText('SKU', { x: 60, y, size: 10, font: bold });
        page.drawText('Item Description', { x: 160, y, size: 10, font: bold });
        page.drawText('In Stock', { x: 380, y, size: 10, font: bold });
        page.drawText('Unit Cost', { x: 460, y, size: 10, font: bold });

        const rows = [
          ['SKU-101', 'Heavy Duty Widget', '150', '$45.00'],
          ['SKU-102', 'Precision Sprocket', '85', '$12.50'],
          ['SKU-103', 'Steel Bearing Unit', '300', '$8.75'],
        ];

        rows.forEach((r) => {
          y -= 22;
          page.drawRectangle({ x: 50, y: y - 5, width: 490, height: 20, color: rgb(0.98, 0.98, 0.98) });
          page.drawText(r[0], { x: 60, y, size: 9, font });
          page.drawText(r[1], { x: 160, y, size: 9, font });
          page.drawText(r[2], { x: 380, y, size: 9, font });
          page.drawText(r[3], { x: 460, y, size: 9, font });
        });

        return Buffer.from(await doc.save());
      },
      expectedJson: {
        document_type: 'generic',
        tables: {
          items: {
            expectedRowCount: 3,
            headers: ['sku', 'item_description', 'in_stock', 'unit_cost'],
          },
        },
      },
      snapshot: { expectedPageCount: 1, expectedMinLines: 4, expectedTables: 1 },
    });

    // 12: Borderless Table
    list.push({
      id: '12_table_borderless',
      name: 'Borderless Multi-Column Table',
      category: 'tables',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Sales Summary', { x: 50, y: 790, size: 14, font: bold });

        let y = 750;
        page.drawText('Product', { x: 50, y, size: 10, font: bold });
        page.drawText('Region', { x: 200, y, size: 10, font: bold });
        page.drawText('Units', { x: 340, y, size: 10, font: bold });
        page.drawText('Revenue', { x: 450, y, size: 10, font: bold });

        const rows = [
          ['Software Enterprise', 'North America', '120', '$24000.00'],
          ['Cloud Analytics', 'Europe EMEA', '85', '$17000.00'],
          ['Developer Pro Pack', 'Asia Pacific', '210', '$31500.00'],
        ];

        rows.forEach((r) => {
          y -= 20;
          page.drawText(r[0], { x: 50, y, size: 9, font });
          page.drawText(r[1], { x: 200, y, size: 9, font });
          page.drawText(r[2], { x: 340, y, size: 9, font });
          page.drawText(r[3], { x: 450, y, size: 9, font });
        });

        return Buffer.from(await doc.save());
      },
      expectedJson: {
        document_type: 'generic',
        tables: {
          items: { expectedRowCount: 3 },
        },
      },
      snapshot: { expectedPageCount: 1, expectedMinLines: 4, expectedTables: 1 },
    });

    // 13: Financial Transaction Table
    list.push({
      id: '13_financial_transaction_table',
      name: 'Financial Ledger Transaction Table',
      category: 'tables',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Account Transaction History', { x: 50, y: 790, size: 14, font: bold });

        let y = 750;
        page.drawText('Date', { x: 50, y, size: 10, font: bold });
        page.drawText('Description', { x: 140, y, size: 10, font: bold });
        page.drawText('Debit', { x: 340, y, size: 10, font: bold });
        page.drawText('Credit', { x: 420, y, size: 10, font: bold });
        page.drawText('Balance', { x: 500, y, size: 10, font: bold });

        const txns = [
          ['2026-08-01', 'Opening Ledger Balance', '', '$5,000.00', '$5,000.00'],
          ['2026-08-05', 'Vendor SaaS Payment', '$250.00', '', '$4,750.00'],
          ['2026-08-12', 'Client Invoice Settled', '', '$1,800.00', '$6,550.00'],
          ['2026-08-18', 'Office Supplies Order', '$120.00', '', '$6,430.00'],
        ];

        txns.forEach((tx) => {
          y -= 20;
          page.drawText(tx[0], { x: 50, y, size: 9, font });
          page.drawText(tx[1], { x: 140, y, size: 9, font });
          if (tx[2]) page.drawText(tx[2], { x: 340, y, size: 9, font });
          if (tx[3]) page.drawText(tx[3], { x: 420, y, size: 9, font });
          page.drawText(tx[4], { x: 500, y, size: 9, font });
        });

        return Buffer.from(await doc.save());
      },
      expectedJson: {
        document_type: 'bank_statement',
        tables: {
          transactions: { expectedRowCount: 4 },
        },
      },
      snapshot: { expectedPageCount: 1, expectedMinLines: 5, expectedTables: 1 },
    });

    // 14: Multi-Page Continuous Table
    list.push({
      id: '14_table_multipage_continuation',
      name: 'Table Continuing onto Next Page',
      category: 'tables',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);

        // Page 1
        const page1 = doc.addPage([595.28, 841.89]);
        page1.drawText('Continuous Audit Table (Page 1)', { x: 50, y: 790, size: 14, font: bold });
        let y1 = 750;
        page1.drawText('Record ID', { x: 50, y: y1, size: 10, font: bold });
        page1.drawText('Transaction Name', { x: 180, y: y1, size: 10, font: bold });
        page1.drawText('Amount', { x: 420, y: y1, size: 10, font: bold });

        for (let i = 1; i <= 6; i++) {
          y1 -= 20;
          page1.drawText(`REC-${100 + i}`, { x: 50, y: y1, size: 9, font });
          page1.drawText(`Audit Item ${i}`, { x: 180, y: y1, size: 9, font });
          page1.drawText(`$${i * 100}.00`, { x: 420, y: y1, size: 9, font });
        }

        // Page 2
        const page2 = doc.addPage([595.28, 841.89]);
        page2.drawText('Continuous Audit Table (Continued)', { x: 50, y: 790, size: 14, font: bold });
        let y2 = 750;
        page2.drawText('Record ID', { x: 50, y: y2, size: 10, font: bold });
        page2.drawText('Transaction Name', { x: 180, y: y2, size: 10, font: bold });
        page2.drawText('Amount', { x: 420, y: y2, size: 10, font: bold });

        for (let i = 7; i <= 12; i++) {
          y2 -= 20;
          page2.drawText(`REC-${100 + i}`, { x: 50, y: y2, size: 9, font });
          page2.drawText(`Audit Item ${i}`, { x: 180, y: y2, size: 9, font });
          page2.drawText(`$${i * 100}.00`, { x: 420, y: y2, size: 9, font });
        }

        return Buffer.from(await doc.save());
      },
      expectedJson: {
        document_type: 'generic',
        tables: {
          items: { expectedRowCount: 12 },
        },
      },
      snapshot: { expectedPageCount: 2, expectedMinLines: 16, expectedTables: 1 },
    });

    // 15: Multiple Tables on One Page
    list.push({
      id: '15_multiple_tables_single_page',
      name: 'Multiple Tables on One Page',
      category: 'tables',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        // Table 1
        page.drawText('Hardware Specifications', { x: 50, y: 800, size: 12, font: bold });
        page.drawText('Device', { x: 50, y: 770, size: 10, font: bold });
        page.drawText('Cores', { x: 250, y: 770, size: 10, font: bold });
        page.drawText('RAM', { x: 400, y: 770, size: 10, font: bold });

        page.drawText('Server Node 1', { x: 50, y: 750, size: 9, font });
        page.drawText('32 Cores', { x: 250, y: 750, size: 9, font });
        page.drawText('128 GB', { x: 400, y: 750, size: 9, font });

        page.drawText('Server Node 2', { x: 50, y: 730, size: 9, font });
        page.drawText('64 Cores', { x: 250, y: 730, size: 9, font });
        page.drawText('256 GB', { x: 400, y: 730, size: 9, font });

        // Table 2
        page.drawText('Network Allocation', { x: 50, y: 670, size: 12, font: bold });
        page.drawText('Interface', { x: 50, y: 640, size: 10, font: bold });
        page.drawText('Bandwidth', { x: 250, y: 640, size: 10, font: bold });
        page.drawText('VLAN', { x: 400, y: 640, size: 10, font: bold });

        page.drawText('eth0 Primary', { x: 50, y: 620, size: 9, font });
        page.drawText('10 Gbps', { x: 250, y: 620, size: 9, font });
        page.drawText('100', { x: 400, y: 620, size: 9, font });

        page.drawText('eth1 Backup', { x: 50, y: 600, size: 9, font });
        page.drawText('1 Gbps', { x: 250, y: 600, size: 9, font });
        page.drawText('200', { x: 400, y: 600, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 8, expectedTables: 2 },
    });

    // 16: Table with Blank Cells
    list.push({
      id: '16_table_blank_cells',
      name: 'Table Containing Blank Cells',
      category: 'tables',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Employee Contacts', { x: 50, y: 790, size: 14, font: bold });
        page.drawText('Name', { x: 50, y: 750, size: 10, font: bold });
        page.drawText('Direct Phone', { x: 200, y: 750, size: 10, font: bold });
        page.drawText('Department', { x: 380, y: 750, size: 10, font: bold });

        // Row 1: all present
        page.drawText('Alice Smith', { x: 50, y: 730, size: 9, font });
        page.drawText('+1-555-0101', { x: 200, y: 730, size: 9, font });
        page.drawText('Engineering', { x: 380, y: 730, size: 9, font });

        // Row 2: blank phone
        page.drawText('Bob Jones', { x: 50, y: 710, size: 9, font });
        page.drawText('Marketing', { x: 380, y: 710, size: 9, font });

        // Row 3: all present
        page.drawText('Carol White', { x: 50, y: 690, size: 9, font });
        page.drawText('+1-555-0103', { x: 200, y: 690, size: 9, font });
        page.drawText('Operations', { x: 380, y: 690, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 4, expectedTables: 1 },
    });

    // 17: Table with Wrapped Text
    list.push({
      id: '17_table_wrapped_text',
      name: 'Table with Multi-line Descriptions',
      category: 'tables',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Project Deliverables', { x: 50, y: 790, size: 14, font: bold });
        page.drawText('Item', { x: 50, y: 750, size: 10, font: bold });
        page.drawText('Scope Description', { x: 150, y: 750, size: 10, font: bold });
        page.drawText('Status', { x: 450, y: 750, size: 10, font: bold });

        page.drawText('Phase 1', { x: 50, y: 725, size: 9, font });
        page.drawText('Architecture discovery and initial framework setup.', { x: 150, y: 725, size: 9, font });
        page.drawText('Completed', { x: 450, y: 725, size: 9, font });

        page.drawText('Phase 2', { x: 50, y: 700, size: 9, font });
        page.drawText('Pipeline implementation with validation and automated tests.', { x: 150, y: 700, size: 9, font });
        page.drawText('In Progress', { x: 450, y: 700, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 3, expectedTables: 1 },
    });

    // 18: Table without Explicit Header
    list.push({
      id: '18_table_without_explicit_header',
      name: 'Borderless Grid Without Headers',
      category: 'tables',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Data Matrix Block', { x: 50, y: 790, size: 12, font });

        page.drawText('Zone Alpha', { x: 50, y: 750, size: 9, font });
        page.drawText('Sensor 1', { x: 200, y: 750, size: 9, font });
        page.drawText('24.5 C', { x: 380, y: 750, size: 9, font });

        page.drawText('Zone Beta', { x: 50, y: 730, size: 9, font });
        page.drawText('Sensor 2', { x: 200, y: 730, size: 9, font });
        page.drawText('21.8 C', { x: 380, y: 730, size: 9, font });

        page.drawText('Zone Gamma', { x: 50, y: 710, size: 9, font });
        page.drawText('Sensor 3', { x: 200, y: 710, size: 9, font });
        page.drawText('19.2 C', { x: 380, y: 710, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 4, expectedTables: 1 },
    });

    // 19: Table with Merged-Looking Cells
    list.push({
      id: '19_table_merged_cells',
      name: 'Table with Category Spanners',
      category: 'tables',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Categorized Pricing Schedule', { x: 50, y: 790, size: 14, font: bold });
        page.drawText('Category', { x: 50, y: 750, size: 10, font: bold });
        page.drawText('Plan Name', { x: 180, y: 750, size: 10, font: bold });
        page.drawText('Price', { x: 420, y: 750, size: 10, font: bold });

        page.drawText('Standard Tier', { x: 50, y: 725, size: 9, font: bold });
        page.drawText('Basic Monthly', { x: 180, y: 725, size: 9, font });
        page.drawText('$19.00', { x: 420, y: 725, size: 9, font });

        page.drawText('Standard Tier', { x: 50, y: 705, size: 9, font: bold });
        page.drawText('Basic Annual', { x: 180, y: 705, size: 9, font });
        page.drawText('$190.00', { x: 420, y: 705, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 3, expectedTables: 1 },
    });

    // 20: Table Containing Negative Values
    list.push({
      id: '20_table_negative_values',
      name: 'Table with Negative Numbers',
      category: 'tables',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Portfolio Net Adjustments', { x: 50, y: 790, size: 14, font: bold });
        page.drawText('Asset', { x: 50, y: 750, size: 10, font: bold });
        page.drawText('Quarterly Change', { x: 250, y: 750, size: 10, font: bold });
        page.drawText('Ending Value', { x: 420, y: 750, size: 10, font: bold });

        page.drawText('Equities Index', { x: 50, y: 725, size: 9, font });
        page.drawText('($150.00)', { x: 250, y: 725, size: 9, font });
        page.drawText('$4,850.00', { x: 420, y: 725, size: 9, font });

        page.drawText('Commodity Fund', { x: 50, y: 705, size: 9, font });
        page.drawText('-$85.50', { x: 250, y: 705, size: 9, font });
        page.drawText('$1,214.50', { x: 420, y: 705, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 3, expectedTables: 1 },
    });

    // 21: Table Containing Multiple Currency Symbols
    list.push({
      id: '21_table_currency_symbols',
      name: 'Multi-Currency Table',
      category: 'tables',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Global FX Conversions', { x: 50, y: 790, size: 14, font: bold });
        page.drawText('Market', { x: 50, y: 750, size: 10, font: bold });
        page.drawText('Local Amount', { x: 220, y: 750, size: 10, font: bold });
        page.drawText('USD Equivalent', { x: 400, y: 750, size: 10, font: bold });

        page.drawText('London UK', { x: 50, y: 725, size: 9, font });
        page.drawText('GBP 500.00', { x: 220, y: 725, size: 9, font });
        page.drawText('$650.00', { x: 400, y: 725, size: 9, font });

        page.drawText('Frankfurt EU', { x: 50, y: 705, size: 9, font });
        page.drawText('EUR 750.00', { x: 220, y: 705, size: 9, font });
        page.drawText('$810.00', { x: 400, y: 705, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 3, expectedTables: 1 },
    });

    // 22: Table Containing Dates
    list.push({
      id: '22_table_dates',
      name: 'Table with Date Variations',
      category: 'tables',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Project Milestone Calendar', { x: 50, y: 790, size: 14, font: bold });
        page.drawText('Milestone', { x: 50, y: 750, size: 10, font: bold });
        page.drawText('Due Date', { x: 240, y: 750, size: 10, font: bold });
        page.drawText('Reviewer', { x: 420, y: 750, size: 10, font: bold });

        page.drawText('Alpha Release', { x: 50, y: 725, size: 9, font });
        page.drawText('2026-09-15', { x: 240, y: 725, size: 9, font });
        page.drawText('Lead QA', { x: 420, y: 725, size: 9, font });

        page.drawText('Beta Testing', { x: 50, y: 705, size: 9, font });
        page.drawText('2026-10-30', { x: 240, y: 705, size: 9, font });
        page.drawText('Security Team', { x: 420, y: 705, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 3, expectedTables: 1 },
    });

    // -------------------------------------------------------------
    // CATEGORY 3: DOCUMENTS (23 - 32)
    // -------------------------------------------------------------

    // 23: Invoice
    list.push({
      id: '23_document_invoice',
      name: 'Commercial Invoice Document',
      category: 'documents',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('TAX INVOICE', { x: 50, y: 790, size: 20, font: bold });
        page.drawText('Invoice Number: INV-8821', { x: 50, y: 750, size: 10, font: bold });
        page.drawText('Invoice Date: 2026-08-22', { x: 50, y: 735, size: 10, font });
        page.drawText('Customer: Vertex Innovations Ltd', { x: 50, y: 720, size: 10, font });

        let y = 670;
        page.drawText('Description', { x: 50, y, size: 10, font: bold });
        page.drawText('Quantity', { x: 280, y, size: 10, font: bold });
        page.drawText('Unit Price', { x: 380, y, size: 10, font: bold });
        page.drawText('Total', { x: 480, y, size: 10, font: bold });

        const items = [
          ['Cloud Infrastructure Plan', '1', '$150.00', '$150.00'],
          ['Data Pipeline Setup Hours', '4', '$50.00', '$200.00'],
        ];

        items.forEach((it) => {
          y -= 20;
          page.drawText(it[0], { x: 50, y, size: 9, font });
          page.drawText(it[1], { x: 280, y, size: 9, font });
          page.drawText(it[2], { x: 380, y, size: 9, font });
          page.drawText(it[3], { x: 480, y, size: 9, font });
        });

        page.drawText('Subtotal: $350.00', { x: 400, y: 600, size: 10, font });
        page.drawText('Tax: $35.00', { x: 400, y: 580, size: 10, font });
        page.drawText('Total: $385.00', { x: 400, y: 560, size: 11, font: bold });

        return Buffer.from(await doc.save());
      },
      expectedJson: {
        document_type: 'invoice',
        fields: {
          invoice_number: 'INV-8821',
          date: '2026-08-22',
          customer: 'Vertex Innovations Ltd',
          total: 385,
        },
        tables: {
          items: { expectedRowCount: 2 },
        },
      },
      snapshot: { expectedPageCount: 1, expectedMinLines: 7, expectedTables: 1 },
    });

    // 24: Receipt
    list.push({
      id: '24_document_receipt',
      name: 'Retail Store Receipt',
      category: 'documents',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('COFFEE & BAKE HOUSE', { x: 50, y: 790, size: 16, font: bold });
        page.drawText('Sales Receipt', { x: 50, y: 765, size: 12, font: bold });
        page.drawText('Date: 2026-08-21', { x: 50, y: 745, size: 10, font });
        page.drawText('Payment Method: Card Ending 1024', { x: 50, y: 730, size: 10, font });
        page.drawText('Total: $14.50', { x: 50, y: 700, size: 12, font: bold });

        return Buffer.from(await doc.save());
      },
      expectedJson: {
        document_type: 'receipt',
        fields: {
          date: '2026-08-21',
          total: 14.5,
        },
      },
      snapshot: { expectedPageCount: 1, expectedMinLines: 5, expectedTables: 0 },
    });

    // 25: Bank Statement
    list.push({
      id: '25_document_bank_statement',
      name: 'Bank Account Statement',
      category: 'documents',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('FIRST METROPOLITAN BANK', { x: 50, y: 790, size: 16, font: bold });
        page.drawText('BANK STATEMENT', { x: 50, y: 765, size: 12, font: bold });
        page.drawText('Account Number: 1122-3344-5566', { x: 50, y: 740, size: 10, font });
        page.drawText('Statement Period: 2026-08-01 to 2026-08-31', { x: 50, y: 725, size: 10, font });
        page.drawText('Opening Balance: $3,400.00', { x: 50, y: 710, size: 10, font });
        page.drawText('Closing Balance: $4,250.00', { x: 50, y: 695, size: 10, font: bold });

        page.drawText('Date', { x: 50, y: 650, size: 10, font: bold });
        page.drawText('Description', { x: 150, y: 650, size: 10, font: bold });
        page.drawText('Debit', { x: 350, y: 650, size: 10, font: bold });
        page.drawText('Credit', { x: 450, y: 650, size: 10, font: bold });

        page.drawText('2026-08-05', { x: 50, y: 630, size: 9, font });
        page.drawText('Payroll Deposit', { x: 150, y: 630, size: 9, font });
        page.drawText('$1,200.00', { x: 450, y: 630, size: 9, font });

        page.drawText('2026-08-15', { x: 50, y: 610, size: 9, font });
        page.drawText('Utility Corp', { x: 150, y: 610, size: 9, font });
        page.drawText('$350.00', { x: 350, y: 610, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: {
        document_type: 'bank_statement',
        fields: {
          account_number: '1122-3344-5566',
          opening_balance: 3400,
          closing_balance: 4250,
        },
      },
      snapshot: { expectedPageCount: 1, expectedMinLines: 7, expectedTables: 1 },
    });

    // 26: Resume
    list.push({
      id: '26_document_resume',
      name: 'Software Engineer Resume',
      category: 'documents',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Marcus Vance', { x: 50, y: 790, size: 20, font: bold });
        page.drawText('Email: marcus.vance@example.com | Phone: +1-555-4099 | San Francisco CA', { x: 50, y: 765, size: 9, font });

        page.drawText('WORK EXPERIENCE', { x: 50, y: 730, size: 12, font: bold });
        page.drawText('Senior Backend Engineer - CloudScale Ltd (2021 - Present)', { x: 50, y: 710, size: 10, font: bold });
        page.drawText('- Scaled microservices architecture handling 50k requests per second.', { x: 60, y: 690, size: 9, font });

        page.drawText('SKILLS & COMPETENCIES', { x: 50, y: 650, size: 12, font: bold });
        page.drawText('- TypeScript, Node.js, Python, PostgreSQL, Redis, Docker, Kubernetes', { x: 60, y: 630, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: {
        document_type: 'resume',
      },
      snapshot: { expectedPageCount: 1, expectedMinLines: 6, expectedTables: 0 },
    });

    // 27: Research Paper
    list.push({
      id: '27_document_research_paper',
      name: 'Academic Research Paper',
      category: 'documents',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Deterministic Layout Parsing for Heterogeneous Documents', { x: 50, y: 790, size: 14, font: bold });
        page.drawText('Abstract', { x: 50, y: 750, size: 12, font: bold });
        page.drawText('This paper presents a geometric coordinate extraction algorithm for structured PDF documents.', { x: 50, y: 730, size: 9, font });

        page.drawText('Methodology', { x: 50, y: 690, size: 12, font: bold });
        page.drawText('We formalize line reconstruction as a 1D spatial clustering problem.', { x: 50, y: 670, size: 9, font });

        page.drawText('References', { x: 50, y: 630, size: 12, font: bold });
        page.drawText('[1] Smith, J. Document Layout Analysis. Journal of Computation, 2024.', { x: 50, y: 610, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'research_paper' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 6, expectedTables: 0 },
    });

    // 28: Business Report
    list.push({
      id: '28_document_business_report',
      name: 'Quarterly Business Report',
      category: 'documents',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Q3 Operational Performance Report', { x: 50, y: 790, size: 16, font: bold });
        page.drawText('Executive Summary', { x: 50, y: 750, size: 12, font: bold });
        page.drawText('Total ARR increased by 28% year-over-year reaching $14.2M.', { x: 50, y: 730, size: 10, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 3, expectedTables: 0 },
    });

    // 29: Contract
    list.push({
      id: '29_document_contract',
      name: 'Legal Service Agreement',
      category: 'documents',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('MASTER SERVICES AGREEMENT', { x: 50, y: 790, size: 14, font: bold });
        page.drawText('This Agreement is entered into by and between Alpha Corp and Beta Ltd.', { x: 50, y: 750, size: 9, font });
        page.drawText('WHEREAS, the Provider possesses specialized technical consulting expertise;', { x: 50, y: 730, size: 9, font });
        page.drawText('IN WITNESS WHEREOF, the parties have executed this Agreement.', { x: 50, y: 700, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'contract' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 4, expectedTables: 0 },
    });

    // 30: Form
    list.push({
      id: '30_document_form',
      name: 'Standard Application Form',
      category: 'documents',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Customer Registration Form', { x: 50, y: 790, size: 16, font: bold });
        page.drawText('Full Name: Samantha Reed', { x: 50, y: 750, size: 10, font });
        page.drawText('Email Address: samantha@example.org', { x: 50, y: 730, size: 10, font });
        page.drawText('Account Tier: Premium Business', { x: 50, y: 710, size: 10, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 4, expectedTables: 0 },
    });

    // 31: Academic Transcript
    list.push({
      id: '31_document_academic_transcript',
      name: 'Official Academic Transcript',
      category: 'documents',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('UNIVERSITY OF SCIENCE AND TECHNOLOGY', { x: 50, y: 790, size: 14, font: bold });
        page.drawText('OFFICIAL TRANSCRIPT', { x: 50, y: 770, size: 12, font: bold });
        page.drawText('Student: Alex Mercer | ID: 9021004', { x: 50, y: 745, size: 10, font });

        let y = 700;
        page.drawText('Course Code', { x: 50, y, size: 10, font: bold });
        page.drawText('Course Title', { x: 150, y, size: 10, font: bold });
        page.drawText('Credits', { x: 380, y, size: 10, font: bold });
        page.drawText('Grade', { x: 480, y, size: 10, font: bold });

        page.drawText('CS-101', { x: 50, y: 680, size: 9, font });
        page.drawText('Computer Science Fundamentals', { x: 150, y: 680, size: 9, font });
        page.drawText('4.0', { x: 380, y: 680, size: 9, font });
        page.drawText('A', { x: 480, y: 680, size: 9, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 5, expectedTables: 1 },
    });

    // 32: Purchase Order
    list.push({
      id: '32_document_purchase_order',
      name: 'Purchase Order Document',
      category: 'documents',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('PURCHASE ORDER', { x: 50, y: 790, size: 18, font: bold });
        page.drawText('PO Number: PO-9004', { x: 50, y: 755, size: 10, font: bold });
        page.drawText('Vendor: Pacific Supply Corp', { x: 50, y: 740, size: 10, font });
        page.drawText('Total: $1,400.00', { x: 50, y: 710, size: 11, font: bold });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 4, expectedTables: 0 },
    });

    // -------------------------------------------------------------
    // CATEGORY 4: DIFFICULT / STRESS SCENARIOS (33 - 40)
    // -------------------------------------------------------------

    // 33: Scanned Mock Low Density
    list.push({
      id: '33_scanned_mock_low_density',
      name: 'Scanned Document Simulation',
      category: 'difficult',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        // Draw image-like background rectangle
        page.drawRectangle({ x: 40, y: 40, width: 515, height: 760, color: rgb(0.96, 0.96, 0.95) });
        // Only minimal text to simulate OCR candidate
        page.drawText('SCAN-DOC', { x: 50, y: 750, size: 8, font });
        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 1, expectedTables: 0 },
    });

    // 34: Mixed Scanned and Native Text PDF
    list.push({
      id: '34_mixed_scanned_and_text',
      name: 'Mixed Native Text and Scanned Pages',
      category: 'difficult',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);

        // Page 1: Native Text
        const p1 = doc.addPage([595.28, 841.89]);
        p1.drawText('Page 1: Native Digital Invoice', { x: 50, y: 780, size: 14, font: bold });
        p1.drawText('Invoice Number: INV-MIXED-01', { x: 50, y: 750, size: 10, font });
        p1.drawText('Subtotal: $500.00', { x: 50, y: 730, size: 10, font });

        // Page 2: Low Text Density Scan
        const p2 = doc.addPage([595.28, 841.89]);
        p2.drawRectangle({ x: 50, y: 50, width: 495, height: 740, color: rgb(0.94, 0.94, 0.94) });
        p2.drawText('P2', { x: 60, y: 750, size: 8, font });

        // Page 3: Native Text
        const p3 = doc.addPage([595.28, 841.89]);
        p3.drawText('Page 3: Terms and Conditions', { x: 50, y: 780, size: 14, font: bold });
        p3.drawText('All contractual obligations remain active for 12 months.', { x: 50, y: 750, size: 10, font });

        // Page 4: Low Text Density Scan
        const p4 = doc.addPage([595.28, 841.89]);
        p4.drawRectangle({ x: 50, y: 50, width: 495, height: 740, color: rgb(0.94, 0.94, 0.94) });
        p4.drawText('P4', { x: 60, y: 750, size: 8, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 4, expectedMinLines: 4, expectedTables: 0 },
    });

    // 35: Low-Resolution Scan
    list.push({
      id: '35_low_resolution_scan',
      name: 'Low Resolution Scan Artifacts',
      category: 'difficult',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);
        page.drawText('LOW_RES_DOC_HEADER', { x: 50, y: 750, size: 9, font });
        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 1, expectedTables: 0 },
    });

    // 36: Shifted Coordinates
    list.push({
      id: '36_shifted_coordinates',
      name: 'Irregular Spacing and Shifted Coordinates',
      category: 'difficult',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Field:', { x: 52.3, y: 780.4, size: 10, font: bold });
        page.drawText('Value One', { x: 145.8, y: 779.8, size: 10, font });

        page.drawText('Second Key:', { x: 50.1, y: 755.2, size: 10, font: bold });
        page.drawText('Value Two', { x: 155.4, y: 754.7, size: 10, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 2, expectedTables: 0 },
    });

    // 37: Selectable Text Over Image
    list.push({
      id: '37_text_over_image',
      name: 'Text Layered Over Graphic Elements',
      category: 'difficult',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([595.28, 841.89]);

        page.drawRectangle({ x: 45, y: 740, width: 500, height: 70, color: rgb(0.2, 0.4, 0.7) });
        page.drawText('PROMOTIONAL BANNER', { x: 60, y: 775, size: 16, font: bold, color: rgb(1, 1, 1) });
        page.drawText('Coupon Code: PROMO-50', { x: 60, y: 750, size: 11, font, color: rgb(1, 1, 1) });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 2, expectedTables: 0 },
    });

    // 38: Unusual Encoding UTF-8
    list.push({
      id: '38_unusual_encoding_utf8',
      name: 'Unicode and Diacritics Representation',
      category: 'difficult',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('International Entity Directory', { x: 50, y: 790, size: 14, font: bold });
        page.drawText('Cafe Societe Generale - Paris Office', { x: 50, y: 750, size: 10, font });
        page.drawText('Munich Tech GMBH - German Division', { x: 50, y: 730, size: 10, font });
        page.drawText('Currency Rate: 1 USD = 0.92 EUR = 0.78 GBP', { x: 50, y: 710, size: 10, font });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 4, expectedTables: 0 },
    });

    // 39: Standard Fonts Variation
    list.push({
      id: '39_standard_fonts_variation',
      name: 'Multi-Font Standard Typeface',
      category: 'difficult',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const helvetica = await doc.embedFont(StandardFonts.Helvetica);
        const times = await doc.embedFont(StandardFonts.TimesRoman);
        const courier = await doc.embedFont(StandardFonts.Courier);
        const page = doc.addPage([595.28, 841.89]);

        page.drawText('Helvetica Sans Headline', { x: 50, y: 790, size: 14, font: helvetica });
        page.drawText('Times Roman editorial paragraph text for formal documentation.', { x: 50, y: 760, size: 11, font: times });
        page.drawText('Courier Monospace CODE BLOCK { id: 100 }', { x: 50, y: 730, size: 10, font: courier });

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 1, expectedMinLines: 3, expectedTables: 0 },
    });

    // 40: Large Multi-Page PDF (10 pages)
    list.push({
      id: '40_large_multipage_document',
      name: '10-Page Long Document Pagination',
      category: 'difficult',
      buildPdf: async () => {
        const doc = await PDFDocument.create();
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const font = await doc.embedFont(StandardFonts.Helvetica);

        for (let p = 1; p <= 10; p++) {
          const page = doc.addPage([595.28, 841.89]);
          page.drawText(`Enterprise System Architecture Spec - Section ${p}`, { x: 50, y: 790, size: 14, font: bold });
          page.drawText(`Document page ${p} provides in-depth technical analysis for module ${p}.`, { x: 50, y: 750, size: 10, font });
          page.drawText(`Page ${p} of 10`, { x: 260, y: 35, size: 9, font });
        }

        return Buffer.from(await doc.save());
      },
      expectedJson: { document_type: 'generic' },
      snapshot: { expectedPageCount: 10, expectedMinLines: 20, expectedTables: 0 },
    });

    return list;
  }
}

// If invoked directly from CLI: generate all
if (process.argv[1] && process.argv[1].endsWith('synthetic-stress-builder.ts')) {
  SyntheticStressBuilder.generateAll().catch((err) => {
    console.error('Failed to generate synthetic stress scenarios:', err);
    process.exit(1);
  });
}
