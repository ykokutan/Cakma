export interface TabularPreviewData {
  columns: string[];
  rows: string[][];
  totalRows: number;
  truncated: boolean;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

export function detectCsvDelimiter(firstLine: string): ',' | ';' | '\t' {
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  if (tabCount >= semiCount && tabCount > commaCount) return '\t';
  if (semiCount > commaCount) return ';';
  return ',';
}

export function parseCsvPreview(text: string, maxRows = 50): TabularPreviewData {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { columns: [], rows: [], totalRows: 0, truncated: false };
  }
  const delimiter = detectCsvDelimiter(lines[0]);
  const columns = splitCsvLine(lines[0], delimiter);
  const dataLines = lines.slice(1);
  const rows = dataLines.slice(0, maxRows).map((line) => {
    const cells = splitCsvLine(line, delimiter);
    return columns.map((_, idx) => cells[idx] ?? '');
  });
  return {
    columns,
    rows,
    totalRows: dataLines.length,
    truncated: dataLines.length > maxRows,
  };
}

export function parseJsonPreview(text: string, maxRows = 50): TabularPreviewData {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { columns: ['Değer'], rows: [], totalRows: 0, truncated: false };
    }
    if (parsed.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      const colSet = new Set<string>();
      for (const item of parsed.slice(0, maxRows)) {
        for (const key of Object.keys(item as Record<string, unknown>)) {
          if (colSet.size < 16) colSet.add(key);
        }
      }
      const columns = Array.from(colSet);
      const rows = parsed.slice(0, maxRows).map((item) =>
        columns.map((col) => {
          const val = (item as Record<string, unknown>)[col];
          if (val === null || val === undefined) return '';
          return typeof val === 'object' ? JSON.stringify(val) : String(val);
        })
      );
      return {
        columns,
        rows,
        totalRows: parsed.length,
        truncated: parsed.length > maxRows,
      };
    }
    const rows = parsed.slice(0, maxRows).map((v, idx) => [
      String(idx),
      typeof v === 'object' ? JSON.stringify(v) : String(v),
    ]);
    return {
      columns: ['#', 'Değer'],
      rows,
      totalRows: parsed.length,
      truncated: parsed.length > maxRows,
    };
  }

  if (parsed && typeof parsed === 'object') {
    const entries = Object.entries(parsed as Record<string, unknown>);
    const rows = entries.slice(0, maxRows).map(([k, v]) => [
      k,
      typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
    ]);
    return {
      columns: ['Anahtar', 'Değer'],
      rows,
      totalRows: entries.length,
      truncated: entries.length > maxRows,
    };
  }

  return {
    columns: ['Değer'],
    rows: [[String(parsed)]],
    totalRows: 1,
    truncated: false,
  };
}
