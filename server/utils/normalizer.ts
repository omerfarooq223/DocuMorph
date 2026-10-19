/**
 * Normalizer utilities for parsing numbers, booleans, dates, and clean strings.
 * Follows strict source preservation: retains sourceValue and normalization type.
 */

export interface NormalizedValue<T = any> {
  value: T;
  sourceValue: string;
  normalization: 'number' | 'date' | 'boolean' | 'currency' | 'none';
  currencySymbol?: string;
}

export function parseNumberSafely(value: string): number | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();

  // Guard: preserve meaningful leading zeros for postal codes, codes, and identifiers (e.g. "001247", "02110")
  if (/^0\d+$/.test(trimmed) && trimmed.length > 1) {
    return null;
  }

  // Accounting negative notation: ($50.00) or (1,250.00)
  const isAccountingNegative = /^\([^\)]+\)$/.test(trimmed);
  let unwrapped = isAccountingNegative ? trimmed.slice(1, -1).trim() : trimmed;

  // Currency symbols and negative sign
  let isNegative = isAccountingNegative || unwrapped.startsWith('-') || unwrapped.endsWith('-');
  unwrapped = unwrapped.replace(/^-/, '').replace(/-$/, '').trim();

  // Clean currency symbols, commas, and whitespace
  // Match standard numbers: 1,234.56 or 1234 or $35.00 or £10 or €500 or ¥1000
  const cleaned = unwrapped
    .replace(/^[\$\£\€\¥\₹\s]+/, '')
    .replace(/[\$\£\€\¥\₹\s]+$/, '')
    .replace(/,/g, '');

  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    if (/^0\d+$/.test(cleaned) && cleaned.length > 1) {
      return null;
    }
    const num = Number(cleaned);
    if (!isNaN(num)) {
      return isNegative ? -num : num;
    }
  }
  return null;
}

export function parseBooleanSafely(value: string): boolean | null {
  if (!value || typeof value !== 'string') return null;
  const lower = value.trim().toLowerCase();
  if (['true', 'yes', 'y', 'enabled', 'checked', '1'].includes(lower)) return true;
  if (['false', 'no', 'n', 'disabled', 'unchecked', '0'].includes(lower)) return false;
  return null;
}

export function normalizeDateSafely(value: string): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();

  // 1. ISO 8601: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. Month name formats like "20 August 2026", "20th Aug 2026", "August 20, 2026"
  const monthMap: Record<string, string> = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12',
  };

  // Day Month Year (e.g. 20 August 2026 or 20-Aug-2026)
  const dmyMatch = trimmed.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-\/]+([a-zA-Z]+)[,\s\-\/]+(\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const monthStr = dmyMatch[2].toLowerCase();
    const month = monthMap[monthStr];
    const year = dmyMatch[3];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // Month Day Year (e.g. August 20, 2026)
  const mdyMatch = trimmed.match(/^([a-zA-Z]+)[\s\-\/]+(\d{1,2})(?:st|nd|rd|th)?[,\s\-\/]+(\d{4})$/);
  if (mdyMatch) {
    const monthStr = mdyMatch[1].toLowerCase();
    const day = mdyMatch[2].padStart(2, '0');
    const month = monthMap[monthStr];
    const year = mdyMatch[3];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // YYYY/MM/DD or YYYY-MM-DD or YYYY.MM.DD
  const ymdMatch = trimmed.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const slashDmyMatch = trimmed.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
  if (slashDmyMatch) {
    const p1 = parseInt(slashDmyMatch[1], 10);
    const p2 = parseInt(slashDmyMatch[2], 10);
    const year = slashDmyMatch[3];
    // If p1 > 12, it must be day
    if (p1 > 12 && p2 <= 12) {
      return `${year}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    // If p2 > 12, p1 must be month
    if (p2 > 12 && p1 <= 12) {
      return `${year}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
    // Default assumption for standard slash dates in international/standard docs: YYYY-MM-DD from DD/MM/YYYY
    return `${year}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
  }

  return null;
}

export function parseTypedValueWithProvenance(rawValue: string): NormalizedValue {
  if (!rawValue) {
    return { value: null, sourceValue: rawValue, normalization: 'none' };
  }

  const trimmed = rawValue.trim();

  // Boolean check
  const bool = parseBooleanSafely(trimmed);
  if (bool !== null) {
    return { value: bool, sourceValue: rawValue, normalization: 'boolean' };
  }

  // Date check
  const date = normalizeDateSafely(trimmed);
  if (date !== null) {
    return { value: date, sourceValue: rawValue, normalization: 'date' };
  }

  // Number / Currency check
  const hasCurrencySymbol = /[\$\£\€\¥\₹]/.test(trimmed);
  const num = parseNumberSafely(trimmed);
  if (num !== null) {
    return {
      value: num,
      sourceValue: rawValue,
      normalization: hasCurrencySymbol ? 'currency' : 'number',
    };
  }

  return { value: rawValue, sourceValue: rawValue, normalization: 'none' };
}

export function cleanText(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
