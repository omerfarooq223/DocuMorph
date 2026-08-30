/**
 * Normalizer utilities for parsing numbers, booleans, dates, and clean strings
 * Follows strict source preservation: only normalizes when confident.
 */

export function parseNumberSafely(value: string): number | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  
  // Clean currency symbols, commas, and whitespace
  // Match standard numbers: 1,234.56 or -1234.56 or 1234 or $35.00 or £10
  const cleaned = trimmed
    .replace(/^[\$\£\€\¥\₹\s]+/, '')
    .replace(/[\$\£\€\¥\₹\s]+$/, '')
    .replace(/,/g, '');

  if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    const num = Number(cleaned);
    return isNaN(num) ? null : num;
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

  // 2. Formats like "20 August 2026", "20th Aug 2026", "August 20, 2026"
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

  // Day Month Year (e.g. 20 August 2026)
  const dmyMatch = trimmed.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)[,\s]+(\d{4})$/);
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
  const mdyMatch = trimmed.match(/^([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,\s]+(\d{4})$/);
  if (mdyMatch) {
    const monthStr = mdyMatch[1].toLowerCase();
    const day = mdyMatch[2].padStart(2, '0');
    const month = monthMap[monthStr];
    const year = mdyMatch[3];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // Numeric formats: DD/MM/YYYY or YYYY/MM/DD
  const slashYmdMatch = trimmed.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/);
  if (slashYmdMatch) {
    return `${slashYmdMatch[1]}-${slashYmdMatch[2].padStart(2, '0')}-${slashYmdMatch[3].padStart(2, '0')}`;
  }

  return null; // Return null if date format is ambiguous
}

export function cleanText(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
