import { IntermediateDocument, RawTable, KeyValuePair } from '../types.js';

export class SchemaValidator {
  /**
   * Maps extracted document content to a user-provided Custom Schema / Template
   */
  public static mapToCustomSchema(
    schemaTemplate: Record<string, any>,
    kvs: KeyValuePair[],
    tables: RawTable[],
    doc: IntermediateDocument
  ): Record<string, any> {
    const result: Record<string, any> = {};
    const kvMap: Record<string, any> = {};

    kvs.forEach((kv) => {
      kvMap[kv.key] = kv.value;
    });

    for (const [key, templateVal] of Object.entries(schemaTemplate)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '_');

      // 1. Direct KV match
      if (kvMap[normalizedKey] !== undefined) {
        result[key] = kvMap[normalizedKey];
        continue;
      }

      // 2. Partial key match
      const matchingKey = Object.keys(kvMap).find(
        (k) => k.includes(normalizedKey) || normalizedKey.includes(k)
      );
      if (matchingKey) {
        result[key] = kvMap[matchingKey];
        continue;
      }

      // 3. Array / Table match (e.g. "items", "transactions", "rows")
      if (Array.isArray(templateVal)) {
        if (tables.length > 0 && tables[0].structuredRows) {
          // If template array has a template item schema, e.g. [{ description: "", price: 0 }]
          if (templateVal.length > 0 && typeof templateVal[0] === 'object' && templateVal[0] !== null) {
            const itemSchema = templateVal[0];
            result[key] = tables[0].structuredRows.map((row) => {
              const mappedRow: Record<string, any> = {};
              for (const [subKey, subDefault] of Object.entries(itemSchema)) {
                const normSubKey = subKey.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                const foundColKey = Object.keys(row).find(
                  (rk) => rk.includes(normSubKey) || normSubKey.includes(rk)
                );
                mappedRow[subKey] = foundColKey && row[foundColKey] !== undefined ? row[foundColKey] : null;
              }
              return mappedRow;
            });
          } else {
            result[key] = tables[0].structuredRows;
          }
          continue;
        } else {
          result[key] = [];
          continue;
        }
      }

      // 4. Default to null if field not found in document (strict no hallucination)
      result[key] = null;
    }

    return result;
  }
}
