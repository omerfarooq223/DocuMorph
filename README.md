# PDF to JSON Agent (V1.0)

An intelligent, local, and privacy-first document extraction engine that reads, structures, and converts PDF documents into clean, validated, and provenance-grounded JSON.

---

## 1. Key Capabilities

- **100% Local & Privacy-First by Default**: Document extraction runs entirely within your local Node.js process. Zero PDF bytes, extracted text, or metadata are transmitted externally when using the default Local Engine.
- **Intelligent Spatial & Tabular Extraction**: Uses coordinate geometry, line proximity, and column alignment to reconstruct tabular data into structured arrays of typed objects (`[{ description, quantity, price }]`).
- **Grounded Extraction & Provenance Tracking**: Values are derived directly from document content without unsupported hallucination. Retains full provenance metadata (page number, bounding box coordinates, source text, source value, confidence) for extracted entities.
- **Dual Output Representations**:
  - **Semantic JSON**: High-level structured entities tailored to supported document types (Invoices, Receipts, Bank Statements, Resumes, Contracts, Research Papers).
  - **Structural JSON**: Comprehensive layout hierarchy preserving pages, sections, headings, tables, lists, and key-values.
- **Conservative Classification & Safe Generic Fallback**: Uses normalized keyword density, per-page scoping, and soft length scaling. If confidence is below $0.60$, the engine safely defaults to `"document_type": "generic"` without forcing arbitrary schemas.
- **Form Region Recognition**: Identifies form-like layouts (dotted leader lines, checkbox clusters, sub-question prompts) as `form_region` without over-splitting them into dozens of disconnected micro-tables.
- **Context-Aware Numeric Safety**: Normalizes currencies, dates, and accounting negatives while preserving leading-zero identifiers (e.g. `001247`, `02110`), postal codes, and form codes as strings.
- **OCR Fallback for Scanned Documents**: Modular OCR pipeline powered by Tesseract.js with bounded concurrency and per-page timeout protection for scanned or image-based pages.
- **Custom Schema Mapping**: Provide an optional JSON template to extract only requested fields without inventing missing values.
- **Interactive Bespoke UI**: Dark-first glassmorphic UI, live multi-stage progress indicator, interactive Diagnostic Failure Explorer with canvas bounding box overlays, and one-click JSON download.

---

## 2. Architecture

```
PDF File Upload
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 1. PDF Parser (pdfjs-dist)                             │
│    - Validates PDF magic bytes signature               │
│    - Enforces file size, page count & security limits  │
│    - Extracts text items, fonts, coordinates (x, y)    │
│    - Detects scanned / low-density pages               │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 2. Intermediate Document Representation (IDR)          │
│    - Pages, TextBlocks, Lines, BoundingBoxes           │
│    - Bounded OCR fallback via TesseractOCRService      │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 3. Structural & Heuristic Extractors                   │
│    - TableExtractor: Column alignment, form regions    │
│    - KVExtractor: Key-value pairs & lists              │
│    - DocumentClassifier: Normalized evidence scoring   │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 4. Semantic Transformation & Custom Schema Mapping     │
│    - LocalExtractor: Builds semantic & structural JSON │
│    - SchemaValidator: Maps to custom schema templates  │
│    - AIService: Optional Ollama / Gemini / OpenAI      │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 5. JSON Validator, Auto-Repair & Invariant Verification│
│    - Strips code fences, repairs malformed syntax      │
│    - InvariantChecker: Verifies coordinates & grounding│
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 6. Interactive UI / Export                             │
│    - Code-editor JSON viewer + Diagnostic Explorer     │
│    - Copy to clipboard & sanitized JSON file download  │
└────────────────────────────────────────────────────────┘
```

---

## 3. Reliability & Evaluation Methodology

The engine is evaluated across three distinct, unmerged evaluation layers (80 total documents, 1,482+ pages):

### 1. Synthetic Regression Corpus (40 Scenarios)
- Evaluates isolated structural edge cases: single/multi-column layouts, wrapped table cells, negative currency formats, borderless tables, and mixed scanned pages.
- Results: **100% pass rate** across all 40 scenarios with zero invariant violations.

### 2. Real Stress Pack Corpus (20 Documents)
- Evaluates real-world document variations: freelance invoices, multi-page checking/savings statements, academic papers, and thermal receipts.
- Results: **0.0% incorrect classification rate** (8 specific correct, 12 safe generic fallback).

### 3. Independent Real-World Corpus (20 Documents, 1,382 Pages)
- Evaluates 20 authentic external documents published independently by government agencies (IRS, USCIS, State Dept, Census Bureau, FDA), standards bodies (NIST), research institutions (NASA, arXiv), and corporate filers (Apple, Berkshire Hathaway).
- Measured Performance:
  - **Field Precision**: $\mathbf{100.0\%}\ (64 / 64)$
  - **Field Recall**: $\mathbf{74.4\%}\ (64 / 86)$
  - **Reviewed Table Logical Rows**: $\mathbf{100.0\%}\ (99 / 99)$
  - **Provenance Bounding Box Mappings**: $\mathbf{100.0\%}\ (80 / 80)$
  - **Incorrect Specific Classifications**: $\mathbf{0.0\%}\ (0 / 20)$
  - **Pipeline Crashes / Memory Leaks**: $\mathbf{0}$ across 1,382 pages.

---

## 4. Getting Started

### Prerequisites
- **Node.js**: v18.0 or later (Node.js 20+ recommended)
- **npm**: v9.0 or later

### Installation
```bash
# Clone the repository
git clone https://github.com/omerfarooq223/DocuMorph.git
cd DocuMorph

# Install all dependencies
npm install
npm --prefix client install
```

### Running Development Mode
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Running Production Build
```bash
# Build server and client
npm run build

# Start production server
npm run server
```

---

## 5. Running Automated Tests

```bash
# Run core unit and reliability suites
npm test

# Run three-layer evaluation matrix
npx tsx tests/utils/evaluate-all-three-layers.ts

# Run sequential stability and concurrency tests
npx tsx tests/utils/phase6-stability-concurrency.ts
```

---

## 6. Output Format Examples

### 1. Invoice Extraction (Semantic Mode)
```json
{
  "document_type": "invoice",
  "invoice_number": "INV-1024",
  "customer": "ABC Ltd",
  "date": "2026-08-20",
  "due_date": "2026-09-20",
  "items": [
    {
      "description": "Product A - Cloud Hosting",
      "quantity": 2,
      "unit_price": 10,
      "total": 20
    }
  ],
  "subtotal": 110,
  "tax": 11,
  "total": 121
}
```

### 2. Multi-Page Bank Statement (Semantic Mode)
```json
{
  "document_type": "bank_statement",
  "account_number": "9876-5432-1098",
  "opening_balance": 5200,
  "closing_balance": 6350,
  "transactions": [
    {
      "date": "2026-08-02",
      "description": "Payroll Direct Deposit",
      "credit": 2500,
      "balance": 7700
    }
  ]
}
```

---

## 7. Known Limitations

Please refer to [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) for full details on intentional engineering constraints, including:
- Complex form fields with ambiguous proximity are preserved structurally rather than guessed into flat semantic keys.
- Documents without dense multi-signal signatures default to `generic`.
- OCR transcription quality depends on scan resolution and contrast; handwritten text is not reliably transcribed.
- Password-protected/encrypted PDFs require pre-decryption.

---

## 8. License

MIT License.
