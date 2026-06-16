import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const technicalKeys = new Set(['id', 'organization_id', 'employee_id', 'payroll_period_id', 'transport_job_id', 'created_by', 'updated_by', 'requested_by', 'resolved_by', 'path', 'photo_path', 'receipt_path', 'slip_file_path']);

function cleanRow(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !technicalKeys.has(key) && !key.endsWith('_id') && !key.toLowerCase().includes('path')));
}

function rowsOrEmpty(rows: Record<string, unknown>[]) {
  return rows.length ? rows.map(cleanRow) : [{ Keterangan: 'Tidak ada data' }];
}

function safeFileName(filename: string) {
  return filename.toLowerCase().replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function setWorkbookWidth(worksheet: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
  worksheet['!cols'] = Array.from({ length: range.e.c - range.s.c + 1 }, (_, col) => {
    let width = 12;
    for (let row = range.s.r; row <= range.e.r; row++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
      width = Math.min(38, Math.max(width, String(cell?.v ?? '').length + 2));
    }
    return { wch: width };
  });
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 } as unknown as XLSX.WorkSheet['!freeze'];
}

export function downloadExcel(filename: string, rows: Record<string, unknown>[], sheetName = 'Data') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Rizki Jaya App - Export'],
    ['Dibuat', new Date().toLocaleString('id-ID')],
    ['Total Data', rows.length]
  ]), 'Info');
  const worksheet = XLSX.utils.json_to_sheet(rowsOrEmpty(rows));
  setWorkbookWidth(worksheet);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${safeFileName(filename)}.xlsx`);
}

export function downloadWorkbook(filename: string, sheets: { name: string; rows: Record<string, unknown>[] }[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Rizki Jaya App - Export Lengkap'],
    ['Dibuat', new Date().toLocaleString('id-ID')],
    ['Jumlah Sheet Data', sheets.length]
  ]), 'Info');
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(rowsOrEmpty(sheet.rows));
    setWorkbookWidth(worksheet);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(workbook, `${safeFileName(filename)}.xlsx`);
}

export function downloadPdfTable(title: string, rows: Record<string, unknown>[], filename = title.toLowerCase().replace(/\s+/g, '-')) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  doc.setFontSize(8);
  doc.text(`Dibuat: ${new Date().toLocaleString('id-ID')}`, 40, 54);
  const dataRows = rowsOrEmpty(rows);
  const headers = Object.keys(dataRows[0]);
  const body = dataRows.map((r) => headers.map((h) => String(r[h] ?? '-')));
  autoTable(doc, { startY: 68, head: [headers], body, styles: { fontSize: 8 }, headStyles: { fillColor: [10, 158, 164] } });
  doc.save(`${safeFileName(filename)}.pdf`);
}

export function downloadSlipPdf(title: string, rows: { label: string; value: string }[], filename: string) {
  const doc = new jsPDF({ unit: 'pt' });
  doc.setFontSize(18);
  doc.text(title, 40, 44);
  doc.setFontSize(8);
  doc.text(`Rizki Jaya App • ${new Date().toLocaleString('id-ID')}`, 40, 58);
  autoTable(doc, { startY: 76, body: rows.map((r) => [r.label, r.value]), styles: { fontSize: 11 }, columnStyles: { 0: { fontStyle: 'bold' } } });
  doc.save(`${safeFileName(filename)}.pdf`);
}
