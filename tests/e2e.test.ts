let passed = 0;
let total = 0;

function check(cond: boolean, name: string, detail?: string) {
  total++;
  if (cond) {
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${name}`);
    if (detail) console.error(`    Detail: ${detail}`);
  }
}

async function runE2E() {
  console.log('\n======================================================');
  console.log('   PDF TO JSON AGENT — END-TO-END INTEGRATION TEST    ');
  console.log('======================================================\n');

  // 1. Frontend Web App HTTP Test
  console.log('E2E Step 1: Testing Frontend HTTP Endpoint (http://localhost:5173)');
  const feRes = await fetch('http://localhost:5173/');
  const feHtml = await feRes.text();
  check(feRes.status === 200, 'Frontend server responded with HTTP 200');
  check(feHtml.includes('PDF to JSON Agent'), 'Frontend HTML includes application title');
  check(feHtml.includes('id="root"'), 'Frontend HTML includes root mounting element');

  // 2. Backend Health Check
  console.log('\nE2E Step 2: Testing Backend Health & Config (http://localhost:3001/api/health)');
  const healthRes = await fetch('http://localhost:3001/api/health');
  const healthData = (await healthRes.json()) as any;
  check(healthData.status === 'ok', 'Server status is OK');
  check(healthData.defaultEngine === 'local', 'Default engine is 100% local');
  check(healthData.privacyNotice.includes('100% Local'), 'Privacy notice is present');

  // 3. Sample PDF Generator & Upload Inspection
  console.log('\nE2E Step 3: Fetching Sample Invoice PDF & Inspecting Upload Info');
  const invoiceSampleRes = await fetch('http://localhost:3001/api/sample/invoice');
  check(invoiceSampleRes.status === 200, 'Sample invoice returned HTTP 200');
  const invoiceArrayBuffer = await invoiceSampleRes.arrayBuffer();
  const invoiceBlob = new Blob([invoiceArrayBuffer], { type: 'application/pdf' });
  check(invoiceBlob.size > 500, `Sample invoice blob size is valid (${invoiceBlob.size} bytes)`);

  const inspectForm = new FormData();
  inspectForm.append('file', invoiceBlob, 'test_invoice.pdf');
  const inspectRes = await fetch('http://localhost:3001/api/upload-info', {
    method: 'POST',
    body: inspectForm,
  });
  const inspectData = (await inspectRes.json()) as any;
  check(inspectData.success === true, 'Upload inspection succeeded');
  check(inspectData.metadata.pageCount === 1, 'Inspected metadata indicates 1 page');
  check(inspectData.metadata.isScanned === false, 'Inspected metadata indicates text-based document');

  // 4. Full Extraction on Invoice PDF
  console.log('\nE2E Step 4: Full Extraction Pipeline on Invoice');
  const extractForm = new FormData();
  extractForm.append('file', invoiceBlob, 'test_invoice.pdf');
  const extractRes = await fetch('http://localhost:3001/api/extract', {
    method: 'POST',
    body: extractForm,
  });
  const extractData = (await extractRes.json()) as any;
  check(extractData.success === true, 'Extraction pipeline executed successfully');
  check(extractData.documentType === 'invoice', `Classified as invoice (confidence: ${extractData.classificationConfidence})`);
  check(extractData.semanticJson.invoice_number === 'INV-1024', `Invoice number: ${extractData.semanticJson.invoice_number}`);
  check(extractData.semanticJson.customer === 'ABC Ltd', `Customer: ${extractData.semanticJson.customer}`);
  check(extractData.semanticJson.total === 121, `Total: ${extractData.semanticJson.total}`);
  check(Array.isArray(extractData.semanticJson.items) && extractData.semanticJson.items.length === 3, 'Items table extracted 3 rows');
  check(extractData.validation.isValidJson === true, 'Result is valid JSON');

  // 5. Multi-Page Extraction
  console.log('\nE2E Step 5: Multi-Page Bank Statement Extraction');
  const multipageRes = await fetch('http://localhost:3001/api/sample/multipage');
  const multipageBlob = new Blob([await multipageRes.arrayBuffer()], { type: 'application/pdf' });
  const multiForm = new FormData();
  multiForm.append('file', multipageBlob, 'statement.pdf');
  const multiExtractRes = await fetch('http://localhost:3001/api/extract', {
    method: 'POST',
    body: multiForm,
  });
  const multiExtractData = (await multiExtractRes.json()) as any;
  check(multiExtractData.metadata.pageCount === 2, `Handled multi-page PDF (2 pages)`);
  check(multiExtractData.documentType === 'bank_statement', `Classified as bank_statement`);
  check(multiExtractData.semanticJson.account_number === '9876-5432-1098', `Account number: ${multiExtractData.semanticJson.account_number}`);
  check(multiExtractData.semanticJson.opening_balance === 5200, `Opening balance: ${multiExtractData.semanticJson.opening_balance}`);

  // 6. Custom Schema Mapping
  console.log('\nE2E Step 6: Custom Schema Mapping Mode');
  const customSchemaForm = new FormData();
  customSchemaForm.append('file', invoiceBlob, 'test_invoice.pdf');
  customSchemaForm.append(
    'options',
    JSON.stringify({
      customSchema: {
        invoice_number: '',
        customer: '',
        total: 0,
        unrelated_missing_field: '',
      },
    })
  );
  const customRes = await fetch('http://localhost:3001/api/extract', {
    method: 'POST',
    body: customSchemaForm,
  });
  const customData = (await customRes.json()) as any;
  check(customData.success === true, 'Custom schema extraction succeeded');
  check(customData.semanticJson.invoice_number === 'INV-1024', `Mapped invoice_number: ${customData.semanticJson.invoice_number}`);
  check(customData.semanticJson.unrelated_missing_field === null, 'Missing schema field is null (no hallucination)');

  // 7. Error Handling on Corrupted Upload
  console.log('\nE2E Step 7: Error Handling with Corrupted File');
  const badBlob = new Blob([Buffer.from('NOT_A_VALID_PDF_HEADER_OR_CONTENT')], { type: 'application/pdf' });
  const badForm = new FormData();
  badForm.append('file', badBlob, 'bad.pdf');
  const badRes = await fetch('http://localhost:3001/api/extract', {
    method: 'POST',
    body: badForm,
  });
  const badData = (await badRes.json()) as any;
  check(badRes.status === 500 || badData.success === false, 'Gracefully rejected corrupted PDF with error response');
  check(typeof badData.error === 'string', `Received user-friendly error message: "${badData.error}"`);

  console.log('\n======================================================');
  console.log(`   E2E RUN COMPLETED: ${passed}/${total} Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runE2E().catch((err) => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
