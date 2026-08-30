# PDF to JSON Agent

An intelligent, local, and privacy-first document extraction application that reads, understands, and converts PDF documents into clean, structured, and validated JSON.

---

## Key Features

- **100% Local & Offline by Default**: Zero account creation, zero cloud dependencies, zero external network calls, and zero API keys required for core document extraction.
- **Intelligent Structure & Table Extraction**: Uses bounding box coordinates, line proximity, and column alignment to extract tabular data into structured arrays of typed objects (`[{ description, quantity, price }]`).
- **Grounded Extraction & Provenance Tracking**: Never hallucinates or fabricates missing information. Retains provenance metadata (page number, bounding box, source text) for extracted entities.
- **Dual Output Modes**:
  - **Semantic JSON**: High-level structured entities tailored to the detected document type (e.g. Invoices, Receipts, Bank Statements, Resumes).
  - **Structural JSON**: Comprehensive layout hierarchy preserving pages, sections, headings, tables, lists, and key-values.
- **Safe Fallback**: If a document cannot be reliably classified (confidence < 0.60), the agent defaults to `"document_type": "generic"` without forcing arbitrary schemas.
- **OCR Fallback for Scanned Documents**: Modular OCR architecture using `tesseract.js` for image-only or low-text pages.
- **JSON Validation & Auto-Repair**: Automated markdown fence stripping, trailing comma fixing, unescaped quote repair, and syntax recovery.
- **Custom Schema Support**: Provide an optional JSON template to extract only requested fields without inventing missing values.
- **Pluggable AI Interface**: Optional AI Agent mode supporting local Ollama (`llama3.2`), Google Gemini, and OpenAI.
- **Modern Bespoke UI**: Dark-first glassmorphic UI built with Vanilla CSS, live 5-step progress stepper, code-editor JSON viewer with syntax highlighting, search/filter, collapsible tree view, and one-click copy/download.

---

## Architecture Overview

```
PDF File Upload
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 1. PDF Parser (pdfjs-dist)                             │
│    - Extracts text items, fonts, coordinates (x, y)    │
│    - Reconstructs lines & paragraphs into blocks       │
│    - Computes text density & detects scanned pages     │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 2. Intermediate Document Representation (IDR)          │
│    - Pages, TextBlocks, Lines, BoundingBoxes           │
│    - Page-by-page OCR fallback via OCRService          │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 3. Structural & Heuristic Extractors                   │
│    - TableExtractor: Column alignment & header check   │
│    - KVExtractor: Key-value pairs & bullet/number list │
│    - DocumentClassifier: Weighted scoring heuristics   │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 4. Semantic Transformation & Custom Schema Mapping     │
│    - LocalExtractor: Builds semantic & structural JSON │
│    - SchemaValidator: Maps to custom schema templates  │
│    - AIService: Pluggable Ollama / Gemini / OpenAI     │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 5. JSON Validator & Auto-Repair                        │
│    - Strips code fences, repairs malformed syntax      │
│    - Enforces typed primitives (numbers, booleans)     │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 6. Interactive UI / Exporters                          │
│    - Code-editor JSON viewer + Collapsible Tree View   │
│    - Copy to clipboard & Download .json file           │
└────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- **Node.js**: v18.0 or later (Node.js 20+ recommended)
- **npm**: v9.0 or later

### Installation

1. Clone or navigate to the repository directory:
   ```bash
   cd "PDF Convertor"
   ```

2. Install backend and frontend dependencies:
   ```bash
   npm install
   npm --prefix client install
   ```

### Running the Application

Start both the backend API server (`localhost:3001`) and Vite frontend (`localhost:5173`) concurrently:

```bash
npm run dev
```

Open your browser and navigate to:
```
http://localhost:5173
```

---

## Running Automated Tests

Run the comprehensive test suite covering multi-page extraction, invoices, transaction tables, resumes, custom schemas, and JSON auto-repair:

```bash
npm test
```

---

## Output Examples

### 1. Invoice PDF Extraction (Semantic Mode)

```json
{
  "document_type": "invoice",
  "invoice_number": "INV-1024",
  "customer": "ABC Ltd",
  "date": "2026-08-20",
  "due_date": "2026-09-20",
  "items": [
    {
      "description": "Product A - Cloud Hosting Subscription",
      "quantity": 2,
      "unit_price": 10,
      "total": 20
    },
    {
      "description": "Product B - API Gateway License",
      "quantity": 1,
      "unit_price": 15,
      "total": 15
    },
    {
      "description": "Product C - Technical Support Hours",
      "quantity": 3,
      "unit_price": 25,
      "total": 75
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
  "account_holder": null,
  "account_number": "9876-5432-1098",
  "statement_period": null,
  "opening_balance": 5200,
  "closing_balance": 6350,
  "transactions": [
    {
      "date": "2026-08-02",
      "description": "Payroll Direct Deposit",
      "debit": null,
      "credit": 2500,
      "balance": 7700
    },
    {
      "date": "2026-08-05",
      "description": "Electric Utility Corp",
      "debit": 120,
      "credit": null,
      "balance": 7580
    }
  ]
}
```

### 3. Generic Document (Fallback Mode)

```json
{
  "document": {
    "title": "Document Title",
    "document_type": "generic",
    "metadata": {
      "file_name": "document.pdf",
      "page_count": 1,
      "file_size_bytes": 14200
    },
    "sections": [
      {
        "heading": "Section 1",
        "content": "Paragraph content...",
        "tables": [],
        "lists": ["Bullet point 1", "Bullet point 2"]
      }
    ]
  }
}
```

---

## Configuration & Optional AI Modes

To configure optional AI providers or custom ports, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Available configuration options in `.env`:
- `PORT`: Server port (default `3001`).
- `DEFAULT_ENGINE`: `local` (default) or `ai`.
- `OLLAMA_BASE_URL`: Local Ollama server URL (e.g. `http://localhost:11434`).
- `OLLAMA_MODEL`: Default model (e.g. `llama3.2`).
- `GEMINI_API_KEY`: Optional Google Gemini API key.
- `OPENAI_API_KEY`: Optional OpenAI API key.

---

## Privacy & Security

- **Zero Cloud Leakage**: When the default **Local Engine** is selected, your PDF documents and extracted data are processed purely inside your local Node runtime and browser.
- **No Hardcoded Secrets**: Secrets and API keys are stored in local environment variables or your browser's private `localStorage`.
