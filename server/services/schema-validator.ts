import { IntermediateDocument, RawTable, KeyValuePair } from '../types.js';

export class SchemaValidator {
  private static readonly MAX_SCHEMA_DEPTH = 10;
  private static readonly MAX_PROPERTY_COUNT = 500;
  private static readonly FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  /**
   * Validates user-supplied custom schema for size, recursion depth, and security hazards
   */
  public static validateSchemaTemplate(template: any, depth = 0): void {
    if (depth > this.MAX_SCHEMA_DEPTH) {
      const err: any = new Error(`Custom schema exceeds maximum allowable nesting depth of ${this.MAX_SCHEMA_DEPTH}.`);
      err.code = 'SCHEMA_TOO_LARGE';
      throw err;
    }

    if (!template || typeof template !== 'object') {
      const err: any = new Error('Custom schema must be a valid non-null JSON object or template.');
      err.code = 'SCHEMA_INVALID';
      throw err;
    }

    const keys = Object.keys(template);
    if (keys.length > this.MAX_PROPERTY_COUNT) {
      const err: any = new Error(`Custom schema exceeds maximum allowable property count of ${this.MAX_PROPERTY_COUNT}.`);
      err.code = 'SCHEMA_TOO_LARGE';
      throw err;
    }

    for (const key of keys) {
      if (this.FORBIDDEN_KEYS.has(key.toLowerCase())) {
        const err: any = new Error(`Custom schema contains forbidden property key: ${key}`);
        err.code = 'SCHEMA_INVALID';
        throw err;
      }
      const val = template[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        this.validateSchemaTemplate(val, depth + 1);
      } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        this.validateSchemaTemplate(val[0], depth + 1);
      }
    }
  }

  /**
   * Maps extracted document content to a user-provided Custom Schema / Template
   */
  public static mapToCustomSchema(
    schemaTemplate: Record<string, any>,
    kvs: KeyValuePair[],
    tables: RawTable[],
    doc: IntermediateDocument
  ): Record<string, any> {
    this.validateSchemaTemplate(schemaTemplate);

    const result: Record<string, any> = Object.create(null);
    const kvMap: Record<string, any> = Object.create(null);

    (kvs || []).forEach((kv) => {
      if (kv && kv.key && !this.FORBIDDEN_KEYS.has(kv.key.toLowerCase())) {
        kvMap[kv.key] = kv.value;
      }
    });

    for (const [key, templateVal] of Object.entries(schemaTemplate)) {
      if (this.FORBIDDEN_KEYS.has(key.toLowerCase())) continue;

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
        if (tables && tables.length > 0 && tables[0].structuredRows) {
          // If template array has a template item schema, e.g. [{ description: "", price: 0 }]
          if (templateVal.length > 0 && typeof templateVal[0] === 'object' && templateVal[0] !== null) {
            const itemSchema = templateVal[0];
            result[key] = tables[0].structuredRows.map((row) => {
              const mappedRow: Record<string, any> = Object.create(null);
              for (const [subKey, subDefault] of Object.entries(itemSchema)) {
                if (this.FORBIDDEN_KEYS.has(subKey.toLowerCase())) continue;
                const normSubKey = subKey.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                const foundColKey = Object.keys(row).find(
                  (rk) => rk.includes(normSubKey) || normSubKey.includes(rk)
                );
                mappedRow[subKey] = foundColKey && row[foundColKey] !== undefined ? row[foundColKey] : null;
              }
              return { ...mappedRow };
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

    return { ...result };
  }
}
