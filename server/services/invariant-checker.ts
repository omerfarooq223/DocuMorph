import {
  IntermediateDocument,
  ExtractionResult,
  InvariantsCheckResult,
  Provenance,
} from '../types.js';

export class InvariantChecker {
  public static verifyInvariants(
    doc: IntermediateDocument,
    provenanceMap: Record<string, Provenance>,
    semanticJson: Record<string, any>
  ): InvariantsCheckResult {
    const violations: string[] = [];
    const maxPages = doc.metadata.pageCount;

    // 1. Page Invariant: Provenance page number must exist within the source PDF
    for (const [key, prov] of Object.entries(provenanceMap)) {
      if (prov.page < 1 || prov.page > maxPages) {
        violations.push(
          `[Page Invariant] Field '${key}' has invalid page number ${prov.page} (document page count is ${maxPages}).`
        );
      }

      // 2. Bounding-box Invariant: Coordinates must lie inside page boundaries
      if (prov.boundingBox) {
        const pageData = doc.pages.find((p) => p.pageNumber === prov.page);
        if (pageData) {
          const bbox = prov.boundingBox;
          if (bbox.x < 0 || bbox.y < 0) {
            violations.push(
              `[Bounding-box Invariant] Field '${key}' has negative coordinates (x: ${bbox.x}, y: ${bbox.y}).`
            );
          }
          if (bbox.x > pageData.width + 10 || bbox.y > pageData.height + 10) {
            violations.push(
              `[Bounding-box Invariant] Field '${key}' bounding box exceeds page boundaries.`
            );
          }
        }
      }

      // 3. Normalization Invariant: If normalization occurred, sourceValue must be retained
      if (prov.normalization && prov.normalization !== 'none' && !prov.sourceValue) {
        violations.push(
          `[Normalization Invariant] Field '${key}' was normalized with '${prov.normalization}' but lacks 'sourceValue'.`
        );
      }

      // 4. Grounding Invariant: Source text must not be empty
      if (!prov.sourceText || prov.sourceText.trim().length === 0) {
        violations.push(
          `[Grounding Invariant] Field '${key}' has empty sourceText.`
        );
      }
    }

    // 5. Table Invariant: Every structured table row must originate from a detected raw table row
    for (const table of doc.tables) {
      if (table.structuredRows && table.structuredRows.length > 0) {
        if (table.rows.length !== table.structuredRows.length) {
          violations.push(
            `[Table Invariant] Table '${table.id}' structured row count (${table.structuredRows.length}) does not match raw row count (${table.rows.length}).`
          );
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }
}
