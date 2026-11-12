import ExcelJS from 'exceljs';
import { FUND_SV, METHOD_SV } from './labels';
import { AdminReport, PLEDGE_BASIS, REPORT_BASIS } from './reports';

// Explicit allow-list: no donor identifiers, free text or payment references.
export async function reportExcel(report: AdminReport, bankOre: number | null, campaignTitle: string, generatedAt = new Date()) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Masjid Al-Rahma';
  workbook.created = generatedAt;
  const summary = workbook.addWorksheet('Sammanfattning');
  summary.columns = [{ width: 34 }, { width: 70 }];
  summary.addRows([
    ['Masjid Al-Rahma – Donationsrapport'],
    ['Skapad (Europe/Stockholm)', generatedAt.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })],
    ['Från', report.filters.from || 'Alla datum'], ['Till', report.filters.to || 'Alla datum'],
    ['Betalsätt', METHOD_SV[report.filters.method] || 'Alla betalsätt'],
    ['Ändamål', FUND_SV[report.filters.fund] || 'Alla ändamål'], ['Kampanj', campaignTitle],
    [], ['Belopp i SEK', 'Värde'],
    ['Mottaget inkl. återbetalda gåvor', report.totals.received],
    ['Återbetalt', report.totals.refunded], ['Netto mottaget', report.totals.net],
    ['Obetalda delbetalningar', report.outstanding], ['Antal transaktioner', report.rows.length],
    [], ['Manuell bankavstämning', 'Värde'],
    ['Bankens netto (manuellt)', bankOre === null ? 'Ej angivet' : bankOre / 100],
    ['Skillnad (bank minus system)', bankOre === null ? 'Ej beräknad' : (bankOre - report.totals.net * 100) / 100],
    [], ['Beräkningsgrund', REPORT_BASIS], ['Löften', PLEDGE_BASIS],
    ['Avstämning', 'Jämför samma period, kampanjer och betalsätt. Avgifter och olika bokföringsdatum kan ge avvikelser. Jämförelsen sparas endast i denna export.'],
    ['Integritet', 'Inga givarnamn, kontaktuppgifter, givar-ID, kvittonummer, meddelanden eller betalreferenser ingår.'],
    ['Ändamål', 'Följer kampanjens nuvarande inställning.']
  ]);
  summary.mergeCells('A1:B1');
  summary.getRow(1).height = 28;
  for (const row of [1, 9, 16]) {
    summary.getRow(row).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summary.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF125D4B' } };
  }
  for (const row of [10, 11, 12, 13, 17, 18]) summary.getCell(row, 2).numFmt = '#,##0.00;[Red]-#,##0.00';
  for (let row = 20; row <= 24; row++) {
    summary.getRow(row).alignment = { wrapText: true, vertical: 'top' };
    summary.getRow(row).height = row === 20 || row === 21 ? 90 : 60;
  }
  const addTable = (name: string, headers: string[], rows: (string | number)[][], numericColumns: number[]) => {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(headers);
    for (const row of rows) sheet.addRow(row);
    sheet.columns.forEach((column, i) => {
      column.width = numericColumns.includes(i + 1) ? 22 : 30;
      if (numericColumns.includes(i + 1)) column.numFmt = '#,##0.00;[Red]-#,##0.00';
    });
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF125D4B' } };
    sheet.getRow(1).height = 30;
    sheet.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: headers.length } };
  };
  for (const [name, groups] of [['Per månad', report.months], ['Per betalsätt', report.methods], ['Per ändamål', report.funds], ['Per kampanj', report.campaigns]] as const) {
    addTable(name, [name, 'Antal', 'Mottaget (SEK)', 'Återbetalt (SEK)', 'Netto (SEK)'], groups.map(g => [g.label, g.count, g.received, g.refunded, g.net]), [3, 4, 5]);
  }
  addTable('Transaktioner', ['Betalningsdatum', 'Kampanj', 'Ändamål', 'Betalsätt', 'Aktuell status', 'Mottaget (SEK)', 'Återbetalt (SEK)', 'Netto (SEK)'], report.rows.map(r => [r.date, r.campaign, r.fund, r.method, r.status, r.received, r.refunded, r.net]), [6, 7, 8]);
  return workbook.xlsx.writeBuffer();
}
