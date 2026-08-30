import { jsonrepair } from 'jsonrepair';

export interface JSONValidationResult {
  isValid: boolean;
  repaired: boolean;
  data: Record<string, any> | Array<any>;
  rawJsonString: string;
  errors: string[];
}

export class JSONValidator {
  /**
   * Validate, clean, and auto-repair JSON string or object
   */
  public static validateAndRepair(input: string | object): JSONValidationResult {
    let rawStr = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
    const errors: string[] = [];
    let repaired = false;

    // 1. Strip Markdown code fences and surrounding text
    rawStr = this.stripMarkdownFences(rawStr);

    // 2. Direct Parse Attempt
    try {
      const parsed = JSON.parse(rawStr);
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          isValid: true,
          repaired: false,
          data: parsed,
          rawJsonString: JSON.stringify(parsed, null, 2),
          errors: [],
        };
      }
    } catch (parseError: any) {
      errors.push(`Initial parse error: ${parseError.message}`);
    }

    // 3. Attempt JSON Repair using jsonrepair
    try {
      const repairedStr = jsonrepair(rawStr);
      const parsed = JSON.parse(repairedStr);
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          isValid: true,
          repaired: true,
          data: parsed,
          rawJsonString: JSON.stringify(parsed, null, 2),
          errors: [],
        };
      }
    } catch (repairError: any) {
      errors.push(`jsonrepair error: ${repairError.message}`);
    }

    // 4. Secondary fallback: regex heuristics for trailing commas and unescaped newlines
    try {
      let fallbackStr = rawStr
        .replace(/,\s*([\]}])/g, '$1') // Remove trailing commas
        .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '') // Remove comments
        .trim();

      const parsed = JSON.parse(fallbackStr);
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          isValid: true,
          repaired: true,
          data: parsed,
          rawJsonString: JSON.stringify(parsed, null, 2),
          errors: [],
        };
      }
    } catch (secError: any) {
      errors.push(`Secondary repair error: ${secError.message}`);
    }

    // 5. Ultimate Fallback: Wrap in a structured fallback object rather than allowing invalid JSON
    const emergencyObject = {
      error: 'Malformed JSON output repaired to safe document format',
      raw_content: rawStr.substring(0, 1000),
      timestamp: new Date().toISOString(),
    };

    return {
      isValid: false,
      repaired: true,
      data: emergencyObject,
      rawJsonString: JSON.stringify(emergencyObject, null, 2),
      errors,
    };
  }

  /**
   * Strip markdown backticks, e.g. ```json ... ```
   */
  public static stripMarkdownFences(str: string): string {
    if (!str) return '';

    let cleaned = str.trim();

    // Match ```json ... ``` or ``` ... ```
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    } else if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    }

    return cleaned;
  }
}
