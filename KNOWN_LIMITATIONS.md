# DocuMorph — Known Technical Limitations (V1.0)

**Application Version:** `1.0.0-rc.1` / `1.0.0`  
**Engine Architecture:** 100% Local Heuristic + Spatial Intermediate Document Representation (IDR)  
**Evaluation Evidence Base:** 80 Documents across Synthetic, Stress, and Independent Real-World Corpora (1,482+ Pages)

---

## 1. Scope & Design Trade-Offs

DocuMorph is engineered under a strict **grounded extraction philosophy**:
> *Prefer omission over unsupported inference. Never fabricate, guess, or hallucinate entities.*

The following technical limitations are intentional engineering constraints and known edge behaviors:

---

## 2. Evidence-Backed Limitations

### 1. Complex Form Semantic Association vs. Structural Preservation
- **Behavior:** Densely formatted government and compliance forms (e.g. IRS Form 1040, IRS Form 941, USCIS Form I-9) containing multi-box checkbox clusters, dotted leader lines (`. . . .`), and sub-question instructions are preserved accurately in **Structural JSON** (`sections`, `lines`, `tables`, `blocks`, and raw geometry), but isolated sub-fields may be omitted from specific flat semantic dictionaries.
- **Rationale:** To prevent false key-value associations across unrelated adjacent form boxes, ambiguous fields are safely retained in the structural representation rather than forced into flat key-value pairs.
- **Mitigation:** Use the **Custom Schema** feature to define exact target keys for structured form mapping, or consume the `structuralJson` representation.

### 2. Conservative Document Classification Fallback
- **Behavior:** Documents that do not exhibit dense, co-located, multi-signal evidence for supported domain types (`invoice`, `receipt`, `bank_statement`, `resume`, `contract`, `research_paper`) fall back to the **`generic`** document schema.
- **Rationale:** Multi-hundred-page technical standards, annual reports, survey forms, and complex multi-part filings contain scattered keywords (e.g., "training", "experience", "fees", "receipts") across hundreds of pages. The classifier uses soft length normalization and evidence density to prevent false positive classification.
- **Classification Distribution:** On the 20-document independent real-world corpus, 19/20 non-specific documents safely fall back to `generic` with 0% incorrect classifications.

### 3. OCR Quality and Raster Resolution Dependencies
- **Behavior:** For scanned documents processed through Tesseract.js OCR, recognition accuracy depends on scanner resolution, page contrast, and orientation.
- **Threshold:** The engine automatically routes pages with $< 50$ recognized characters to OCR. Highly degraded scans ($< 100\text{ DPI}$), severe skew ($> 15^\circ$), or significant artifacts will produce partial text recognition.
- **Handwriting:** Handwritten signatures, cursive text, and handwritten form notes are not reliably transcribed by standard printed-text OCR models.

### 4. Password-Protected and Encrypted Documents
- **Behavior:** PDFs encrypted with owner/user passwords cannot be processed without pre-decryption.
- **Response:** The engine halts immediately during header validation and returns a standardized error:
  ```json
  {
    "error": {
      "code": "PDF_PASSWORD_PROTECTED",
      "message": "This PDF is password protected and cannot currently be processed."
    }
  }
  ```

### 5. Custom Font Encodings & Non-Standard ToUnicode CMap
- **Behavior:** A small fraction of legacy or proprietary PDF generators embed fonts with corrupted or missing `ToUnicode` mapping tables. In such rare PDFs, extracted character codes may map to incorrect glyphs.
- **Handling:** PDFParser validates font encodings and falls back to OCR if digital text streams produce non-printable or corrupt character densities.

### 6. Resource Limits & Bounded Workloads
- **Configured Limits:**
  - Maximum File Size: $50\text{ MB}$ (configurable via `MAX_FILE_SIZE_MB`)
  - Maximum Document Pages: $500\text{ pages}$ (configurable via `MAX_PDF_PAGES`)
  - Maximum OCR Pages: $50\text{ pages}$ (configurable via `MAX_OCR_PAGES`)
  - OCR Page Timeout: $30\text{ seconds}$ per page (configurable via `OCR_TIMEOUT_MS`)
  - Custom Schema Max Depth: 10 levels; Max Properties: 500
- **Handling:** Documents exceeding configured boundaries are rejected gracefully with HTTP 413 (`PDF_TOO_LARGE` / `PDF_PAGE_LIMIT_EXCEEDED` / `SCHEMA_TOO_LARGE`).

---

## 3. Privacy & Network Isolation Boundary

- **Local Engine Mode:** In default Local mode, extraction is performed entirely within the local Node.js process using native PDF.js and Tesseract.js. No PDF bytes, extracted text, or metadata are transmitted over the network.
- **Client Assets:** The frontend UI loads standard local styles and icons. If external fonts (e.g. Google Fonts) are fetched by the browser, only standard CSS typography is requested; document contents never leave the user's system.
- **Optional AI Mode:** External AI providers (Ollama, Gemini, OpenAI) are disabled by default and require explicit user configuration and opt-in.
