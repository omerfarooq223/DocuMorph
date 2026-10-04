# DocuMorph

> **Intelligent, Local & Privacy-First PDF-to-Structured-JSON Extraction Engine**

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5%2B-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-v19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-v5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-success)](#1-key-capabilities)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**DocuMorph** is an intelligent, high-accuracy document extraction system that parses, structures, and converts complex PDFs into clean, validated, and provenance-grounded JSON. Built with a strict **grounded extraction philosophy**, DocuMorph extracts real data derived directly from document geometry—without unsupported hallucinations, opaque cloud lock-in, or privacy leaks.

---

## 1. Key Capabilities

- **100% Local & Privacy-First by Default**: Runs entirely within your local Node.js environment. No document text, metadata, or PDF bytes leave your machine when using the default Local Engine. (Optional pluggable AI providers—Ollama, Gemini, OpenAI—can be enabled when explicitly desired).
- **Interactive Visual Provenance & PDF Preview**: Side-by-side split view with interactive PDF.js rendering. Selecting any key, value, or table row in the JSON viewer dynamically projects highlighted coordinate bounding boxes (`[x, y, width, height]`) onto the rendered PDF canvas.
- **Intelligent Spatial & Tabular Extraction**: Uses 2D coordinate geometry, line clustering, and column alignment to reconstruct tabular structures (both bordered and borderless) into structured arrays of typed objects (`[{ description, quantity, price, ... }]`).
- **Deterministic Provenance Tracking**: Every extracted entity retains exact provenance metadata: page number, bounding box coordinates, source text, source value, and extraction confidence score.
- **Dual Output Representations**:
  - **Semantic JSON**: High-level structured entities tailored to supported document types (Invoices, Receipts, Bank Statements, Resumes, Contracts, Research Papers).
  - **Structural JSON**: Comprehensive layout hierarchy preserving pages, sections, headings, tables, lists, and key-value pairs.
- **Conservative Classification & Safe Generic Fallback**: Normalized keyword density, per-page scoping, and soft length scaling. If confidence is below $0.60$, the engine safely defaults to `"document_type": "generic"` rather than forcing an incorrect schema.
- **Form Region Recognition**: Identifies form-like layouts (dotted leader lines, checkbox clusters, sub-question prompts) as `form_region` without over-splitting them into dozens of disconnected micro-tables.
- **Invariant Verification Engine**: Integrated [`InvariantChecker`](server/services/invariant-checker.ts) validates structural and numeric invariants, coordinate boundaries, non-empty outputs, and non-hallucination constraints before responses are finalized.
- **Adaptive OCR Fallback**: Modular OCR pipeline powered by Tesseract.js with bounded concurrency and per-page timeout protection for scanned or low-density image pages.
- **Custom Schema Mapping**: Provide an optional JSON schema template to extract exactly the properties you need without inventing missing values.
- **Modern Glassmorphic Web Client**: Responsive, dark-first React UI featuring live multi-stage progress telemetry, searchable JSON code viewer, collapsible tree nodes, and one-click JSON exports.

---

## 2. Architecture & Pipeline

```
PDF File Upload / Stream
         │
         ▼
┌────────────────────────────────────────────────────────┐
│ 1. PDF Parser (pdfjs-dist)                             │
│    - Validates PDF magic bytes signature               │
│    - Enforces file size, page count & security limits  │
│    - Extracts text items, fonts & coordinates (x, y)   │
│    - Identifies scanned / low-density candidate pages  │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 2. Intermediate Document Representation (IDR)          │
│    - Reconstructs Pages, TextBlocks, Lines & BBoxes    │
│    - Adaptive OCR fallback via TesseractOCRService     │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 3. Structural & Heuristic Extractors                   │
│    - TableExtractor: Column alignment, grid analysis   │
│    - KVExtractor: Key-value pairs, lists & forms       │
│    - DocumentClassifier: Normalized multi-signal score │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 4. Semantic Transformation & Custom Schema Mapping     │
│    - LocalExtractor: Builds semantic & structural JSON │
│    - SchemaValidator: Maps user-defined JSON templates │
│    - AIService: Optional fallback (Ollama/Gemini/OAI)  │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 5. Validation, Auto-Repair & Invariant Verification    │
│    - JSONValidator: Strips code fences, repairs syntax │
│    - InvariantChecker: Verifies coordinates & grounding│
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 6. Interactive UI / REST API Response                  │
│    - Visual canvas bounding-box provenance overlay     │
│    - Filterable code-editor JSON viewer & export       │
└────────────────────────────────────────────────────────┘
```

---

## 3. Project Structure

```
DocuMorph/
├── client/                     # Modern React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── PdfPreview.tsx       # Interactive PDF viewer & canvas provenance overlay
│   │   │   ├── JsonViewer.tsx       # Code-editor style JSON viewer with search/copy
│   │   │   ├── SchemaEditor.tsx     # Custom schema template editor
│   │   │   ├── ProcessingState.tsx  # Multi-stage extraction progress tracker
│   │   │   └── ...
│   │   ├── App.tsx                  # Main client shell & split-view layout
│   │   └── index.css                # Dark-mode design system & animations
│   └── package.json
│
├── server/                     # Express + TypeScript extraction engine
│   ├── services/
│   │   ├── pdf-parser.ts            # PDF.js text stream & coordinate extractor
│   │   ├── table-extractor.ts       # Spatial table detection & cell reconstruction
│   │   ├── kv-extractor.ts          # Key-value, list & form region parser
│   │   ├── document-classifier.ts   # Multi-signal document classifier
│   │   ├── local-extractor.ts       # Semantic domain entity transformer
│   │   ├── ocr-service.ts           # Bounded Tesseract.js OCR fallback
│   │   ├── invariant-checker.ts     # Coordinate boundary & grounding verifier
│   │   ├── schema-validator.ts      # Custom JSON schema matcher
│   │   ├── json-validator.ts        # Syntax repair & validation
│   │   └── ai-service.ts            # Optional external AI providers
│   ├── config.ts                    # Server configuration & resource safeguards
│   ├── index.ts                     # API endpoints & request handlers
│   └── types.ts                     # TypeScript IDR & extraction interfaces
│
├── tests/                      # Automated test suites & evaluation harnesses
│   ├── extraction.test.ts           # Unit tests for spatial & heuristic parsing
│   ├── e2e.test.ts                  # End-to-end API integration tests
│   ├── phase2-reliability.test.ts   # Concurrency, edge case & stress suite
│   ├── provenance-transform.test.ts # Bounding box coordinate space checks
│   ├── evaluation-runner.ts         # Benchmark evaluation harness
│   └── utils/                       # Synthetic builders & benchmark runners
│
├── reports/                    # Benchmark run results & release reports (gitignored)
├── KNOWN_LIMITATIONS.md        # Technical constraints & intentional design trade-offs
├── package.json
└── tsconfig.json
```

---

## 4. Getting Started

### Prerequisites
- **Node.js**: `v18.0.0` or higher (`v20+` recommended)
- **npm**: `v9.0.0` or higher

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/omerfarooq223/DocuMorph.git
cd DocuMorph

# 2. Install server and root dependencies
npm install

# 3. Install client dependencies
npm --prefix client install
```

### Running in Development Mode

Launch both the backend server (port `3001`) and the Vite React client (port `5173`) concurrently:

```bash
npm run dev
```

Open your browser to: **`http://localhost:5173`**

### Running the Production Build

```bash
# Build TypeScript server and Vite client bundle
npm run build

# Start the production server
npm run server
```

---

## 5. Automated Tests & Evaluation

DocuMorph includes a comprehensive test and evaluation suite covering unit logic, coordinate transformations, end-to-end workflows, and concurrency stress testing:

```bash
# Run all core test suites (unit, e2e, reliability, and provenance)
npm test

# Run individual test suites
npm run test:unit          # Spatial table & KV extraction logic
npm run test:e2e           # API endpoints & upload processing
npm run test:reliability   # Edge cases, corrupt buffers & concurrency
npm run test:provenance    # Bounding-box transformations & coordinate spaces

# Regenerate synthetic stress scenarios (40 scenarios)
npm run test:corpus

# Run full evaluation runner against active corpora
npm run test:eval

# Generate an assisted ground-truth draft for a new PDF
npm run groundtruth -- path/to/document.pdf
```

### Reliability & Verification Benchmarks

The DocuMorph engine has been rigorously evaluated across synthetic and authentic real-world corpora:
- **Synthetic Regression Corpus (40 Scenarios)**: 100% pass rate across borderless tables, multi-column articles, wrapped headers, negative values, and mixed-density scans with zero invariant violations.
- **Independent Real-World Corpus (20 Documents, 1,382 Pages)**: Evaluated against unedited external filings from the IRS, USCIS, NIST, NASA, and Apple:
  - **Field Precision**: `100.0%` (zero fabricated entities)
  - **Reviewed Table Logical Rows**: `100.0%` correct row extraction
  - **Provenance Bounding Box Grounding**: `100.0%` verified coordinate mappings
  - **Pipeline Stability**: `0` crashes, memory leaks, or unhandled exceptions across 1,382 pages.

---

## 6. Output Format Examples

### 1. Semantic Extraction Mode (e.g. Invoice)

```json
{
  "document_type": "invoice",
  "invoice_number": "INV-2026-9042",
  "customer": "Apex Web Systems Ltd",
  "date": "2026-08-15",
  "due_date": "2026-09-15",
  "items": [
    {
      "description": "Enterprise Cloud Hosting",
      "quantity": 2,
      "unit_price": 175.00,
      "total": 350.00
    }
  ],
  "subtotal": 350.00,
  "tax": 70.00,
  "total": 420.00
}
```

### 2. Provenance Grounding Metadata

Every field is paired with exact geometric coordinates on the original PDF page:

```json
{
  "invoice_number": {
    "value": "INV-2026-9042",
    "page": 1,
    "confidence": 0.95,
    "boundingBox": {
      "x": 340.5,
      "y": 112.0,
      "width": 115.2,
      "height": 14.8
    }
  }
}
```

---

## 7. REST API Reference

### `POST /api/extract`
Uploads and extracts structured data from a PDF document.

- **Content-Type**: `multipart/form-data`
- **Form Fields**:
  - `file` *(File, required)*: The PDF document binary.
  - `options` *(JSON string, optional)*:
    ```json
    {
      "engine": "local",
      "mode": "both",
      "ocrEnabled": true
    }
    ```
  - `schema` *(JSON string, optional)*: Custom JSON schema mapping template.
- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "documentType": "invoice",
    "classificationConfidence": 0.95,
    "engineUsed": "local",
    "executionTimeMs": 142,
    "metadata": {
      "fileName": "sample_invoice.pdf",
      "fileSizeBytes": 45120,
      "pageCount": 1,
      "isScanned": false
    },
    "semanticJson": { ... },
    "structuralJson": { ... },
    "provenanceMap": { ... },
    "validation": {
      "isValidJson": true,
      "repaired": false
    }
  }
  ```

### `GET /api/health`
Returns system status, active version, configured limits, and available engines.

---

## 8. Configuration & Environment

Environment variables can be configured in a `.env` file in the project root:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3001` | Backend HTTP API port |
| `DEFAULT_ENGINE` | `local` | Default extraction engine (`local` or `ai`) |
| `MAX_FILE_SIZE_MB` | `50` | Maximum allowable upload file size |
| `MAX_PDF_PAGES` | `500` | Maximum page count threshold per document |
| `MAX_OCR_PAGES` | `50` | Maximum scanned pages routed to OCR |
| `OCR_TIMEOUT_MS` | `30000` | OCR timeout safeguard per page (ms) |
| `OLLAMA_BASE_URL`| `http://localhost:11434` | Ollama API endpoint (if using local AI) |
| `GEMINI_API_KEY` | — | Google Gemini API key (optional) |
| `OPENAI_API_KEY` | — | OpenAI API key (optional) |

---

## 9. Known Limitations

Please see [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) for full details on intentional engineering constraints, including:
- Densely structured compliance forms with ambiguous checkbox clusters are preserved hierarchically in `structuralJson` rather than guessed into flat semantic keys.
- Documents lacking dense co-located signatures default to `generic` to prevent false domain classification.
- OCR transcription quality depends on source scan DPI and contrast; handwritten text is not reliably transcribed.
- Password-encrypted PDFs require decryption prior to submission.

---

## 10. License

DocuMorph is open-source software licensed under the [MIT License](LICENSE).
