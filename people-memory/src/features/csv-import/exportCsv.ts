// CSV 書き出し時の式注入（CSV injection）対策と RFC4180 エスケープ

const FORMULA_START = /^[=+\-@\t\r]/;

export function sanitizeCell(v: string): string {
  return FORMULA_START.test(v) ? `'${v}` : v;
}

export function escapeCell(v: string): string {
  const s = sanitizeCell(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: string[][]): string {
  // Excel で開けるよう BOM 付き UTF-8 / CRLF
  return '﻿' + rows.map((r) => r.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadText(fileName: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  downloadBlob(fileName, blob);
}

export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
