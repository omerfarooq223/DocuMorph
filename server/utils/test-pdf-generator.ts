import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export class TestPDFGenerator {
  /**
   * Generates a realistic Invoice PDF with line item table, customer info, totals, and terms
   */
  public static async createInvoicePDF(): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { height } = page.getSize();

    // Header
    page.drawText('INVOICE', {
      x: 50,
      y: height - 50,
      size: 24,
      font: boldFont,
      color: rgb(0.1, 0.2, 0.4),
    });

    page.drawText('Acme Solutions Ltd\n123 Innovation Way, Tech City\ncontact@acmesolutions.com', {
      x: 350,
      y: height - 50,
      size: 10,
      font: timesRomanFont,
      lineHeight: 14,
    });

    // Key-value metadata
    let y = height - 120;
    const kvPairs = [
      ['Invoice Number:', 'INV-1024'],
      ['Date:', '2026-08-20'],
      ['Due Date:', '2026-09-20'],
      ['Customer:', 'ABC Ltd'],
      ['Billing Address:', '456 Commercial Road, London'],
    ];

    kvPairs.forEach(([k, v]) => {
      page.drawText(k, { x: 50, y, size: 10, font: boldFont });
      page.drawText(v, { x: 160, y, size: 10, font: timesRomanFont });
      y -= 18;
    });

    // Table Header
    y -= 20;
    page.drawRectangle({
      x: 50,
      y: y - 5,
      width: 495,
      height: 22,
      color: rgb(0.92, 0.94, 0.98),
    });

    page.drawText('Description', { x: 60, y, size: 10, font: boldFont });
    page.drawText('Quantity', { x: 280, y, size: 10, font: boldFont });
    page.drawText('Unit Price', { x: 380, y, size: 10, font: boldFont });
    page.drawText('Total', { x: 480, y, size: 10, font: boldFont });

    // Table Rows
    const items = [
      ['Product A - Cloud Hosting Subscription', '2', '$10.00', '$20.00'],
      ['Product B - API Gateway License', '1', '$15.00', '$15.00'],
      ['Product C - Technical Support Hours', '3', '$25.00', '$75.00'],
    ];

    items.forEach((item) => {
      y -= 22;
      page.drawText(item[0], { x: 60, y, size: 9, font: timesRomanFont });
      page.drawText(item[1], { x: 290, y, size: 9, font: timesRomanFont });
      page.drawText(item[2], { x: 380, y, size: 9, font: timesRomanFont });
      page.drawText(item[3], { x: 480, y, size: 9, font: timesRomanFont });
    });

    // Totals
    y -= 35;
    page.drawText('Subtotal: $110.00', { x: 400, y, size: 10, font: timesRomanFont });
    y -= 18;
    page.drawText('Tax (10%): $11.00', { x: 400, y, size: 10, font: timesRomanFont });
    y -= 20;
    page.drawText('Total: $121.00', { x: 400, y, size: 12, font: boldFont, color: rgb(0.1, 0.4, 0.2) });

    // Notes / Terms
    y -= 40;
    page.drawText('Notes & Terms:', { x: 50, y, size: 10, font: boldFont });
    y -= 16;
    page.drawText('- Payment is due within 30 days of invoice date.', { x: 50, y, size: 9, font: timesRomanFont });
    y -= 14;
    page.drawText('- Please quote Invoice Number INV-1024 with your bank transfer.', { x: 50, y, size: 9, font: timesRomanFont });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Generates a Multi-page Bank Statement PDF with multiple pages and transaction records
   */
  public static async createMultiPageBankStatement(): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Page 1
    const page1 = pdfDoc.addPage([595.28, 841.89]);
    let y = 790;

    page1.drawText('GLOBAL HORIZON BANK', { x: 50, y, size: 18, font: boldFont, color: rgb(0.05, 0.2, 0.5) });
    y -= 25;
    page1.drawText('ACCOUNT STATEMENT', { x: 50, y, size: 14, font: boldFont });

    y -= 30;
    page1.drawText('Account Holder: Johnathan Doe', { x: 50, y, size: 10, font: timesRoman(font) });
    y -= 18;
    page1.drawText('Account Number: 9876-5432-1098', { x: 50, y, size: 10, font: timesRoman(font) });
    y -= 18;
    page1.drawText('Statement Period: 2026-08-01 to 2026-08-31', { x: 50, y, size: 10, font: timesRoman(font) });
    y -= 18;
    page1.drawText('Opening Balance: $5,200.00', { x: 50, y, size: 10, font: timesRoman(font) });
    y -= 18;
    page1.drawText('Closing Balance: $6,350.00', { x: 50, y, size: 10, font: boldFont });

    // Transactions Table Page 1
    y -= 35;
    page1.drawText('Recent Transactions (Part 1)', { x: 50, y, size: 12, font: boldFont });
    y -= 20;

    page1.drawText('Date', { x: 50, y, size: 10, font: boldFont });
    page1.drawText('Description', { x: 140, y, size: 10, font: boldFont });
    page1.drawText('Debit', { x: 340, y, size: 10, font: boldFont });
    page1.drawText('Credit', { x: 420, y, size: 10, font: boldFont });
    page1.drawText('Balance', { x: 500, y, size: 10, font: boldFont });

    const p1Txns = [
      ['2026-08-02', 'Payroll Direct Deposit', '', '$2,500.00', '$7,700.00'],
      ['2026-08-05', 'Electric Utility Corp', '$120.00', '', '$7,580.00'],
      ['2026-08-10', 'Grocery Supermarket', '$85.50', '', '$7,494.50'],
      ['2026-08-14', 'ATM Cash Withdrawal', '$200.00', '', '$7,294.50'],
    ];

    p1Txns.forEach((tx) => {
      y -= 20;
      page1.drawText(tx[0], { x: 50, y, size: 9, font });
      page1.drawText(tx[1], { x: 140, y, size: 9, font });
      if (tx[2]) page1.drawText(tx[2], { x: 340, y, size: 9, font });
      if (tx[3]) page1.drawText(tx[3], { x: 420, y, size: 9, font });
      page1.drawText(tx[4], { x: 500, y, size: 9, font });
    });

    page1.drawText('Page 1 of 2', { x: 270, y: 30, size: 9, font });

    // Page 2
    const page2 = pdfDoc.addPage([595.28, 841.89]);
    y = 790;

    page2.drawText('GLOBAL HORIZON BANK - STATEMENT CONTINUED', { x: 50, y, size: 12, font: boldFont });
    y -= 30;

    page2.drawText('Date', { x: 50, y, size: 10, font: boldFont });
    page2.drawText('Description', { x: 140, y, size: 10, font: boldFont });
    page2.drawText('Debit', { x: 340, y, size: 10, font: boldFont });
    page2.drawText('Credit', { x: 420, y, size: 10, font: boldFont });
    page2.drawText('Balance', { x: 500, y, size: 10, font: boldFont });

    const p2Txns = [
      ['2026-08-18', 'Online Subscription Software', '$45.00', '', '$7,249.50'],
      ['2026-08-22', 'Freelance Client Transfer', '', '$900.00', '$8,149.50'],
      ['2026-08-28', 'Apartment Rent Payment', '$1,800.00', '', '$6,349.50'],
      ['2026-08-30', 'Bank Interest Earned', '', '$0.50', '$6,350.00'],
    ];

    p2Txns.forEach((tx) => {
      y -= 20;
      page2.drawText(tx[0], { x: 50, y, size: 9, font });
      page2.drawText(tx[1], { x: 140, y, size: 9, font });
      if (tx[2]) page2.drawText(tx[2], { x: 340, y, size: 9, font });
      if (tx[3]) page2.drawText(tx[3], { x: 420, y, size: 9, font });
      page2.drawText(tx[4], { x: 500, y, size: 9, font });
    });

    page2.drawText('Page 2 of 2', { x: 270, y: 30, size: 9, font });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Generates a realistic Resume / CV PDF
   */
  public static async createResumePDF(): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595.28, 841.89]);
    let y = 800;

    page.drawText('Sarah Jenkins', { x: 50, y, size: 22, font: boldFont });
    y -= 20;
    page.drawText('Senior Full-Stack Software Engineer', { x: 50, y, size: 12, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 18;
    page.drawText('Email: sarah.jenkins@example.com | Phone: +1-555-0199 | Location: San Francisco, CA', {
      x: 50,
      y,
      size: 9,
      font,
    });

    y -= 30;
    page.drawText('PROFESSIONAL SUMMARY', { x: 50, y, size: 12, font: boldFont });
    y -= 16;
    page.drawText(
      'Experienced engineer with 8+ years developing high-throughput distributed systems and interactive web applications.',
      { x: 50, y, size: 9, font }
    );

    y -= 25;
    page.drawText('WORK EXPERIENCE', { x: 50, y, size: 12, font: boldFont });
    y -= 18;
    page.drawText('Lead Engineer - Apex Cloud Inc (2022 - Present)', { x: 50, y, size: 10, font: boldFont });
    y -= 14;
    page.drawText('- Designed and deployed microservices processing over 10M transactions daily.', { x: 60, y, size: 9, font });
    y -= 14;
    page.drawText('- Reduced API response latency by 45% using distributed caching and indexing.', { x: 60, y, size: 9, font });

    y -= 20;
    page.drawText('Senior Developer - Nexus Systems (2018 - 2022)', { x: 50, y, size: 10, font: boldFont });
    y -= 14;
    page.drawText('- Built scalable front-end and back-end document parsing pipelines.', { x: 60, y, size: 9, font });
    y -= 14;
    page.drawText('- Mentored 6 junior engineers and improved automated test coverage to 92%.', { x: 60, y, size: 9, font });

    y -= 25;
    page.drawText('SKILLS & COMPETENCIES', { x: 50, y, size: 12, font: boldFont });
    y -= 16;
    page.drawText('- Languages: TypeScript, JavaScript, Python, Go, SQL', { x: 60, y, size: 9, font });
    y -= 14;
    page.drawText('- Frameworks: React, Node.js, Express, Fastify, Next.js', { x: 60, y, size: 9, font });
    y -= 14;
    page.drawText('- Cloud: AWS, Docker, Kubernetes, PostgreSQL, Redis', { x: 60, y, size: 9, font });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}

function timesRoman(f: any) {
  return f;
}
