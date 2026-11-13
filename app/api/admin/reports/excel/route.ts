import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { stockholmToday } from '@/lib/admin/dates';
import { loadAdminReport } from '@/lib/admin/report-data';
import { reportExcel } from '@/lib/admin/report-excel';
import { parseBankOre, parseReportFilters } from '@/lib/admin/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard) return guard;
  let filters;
  let bankOre;
  try {
    const params: Record<string, string> = {};
    for (const key of ['from', 'to', 'method', 'fund', 'campaign', 'bank']) {
      const values = req.nextUrl.searchParams.getAll(key);
      if (values.length > 1) throw new Error('Ange varje filter endast en gång.');
      if (values.length) params[key] = values[0];
    }
    filters = parseReportFilters(params, stockholmToday());
    bankOre = parseBankOre(params.bank);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Ogiltiga filter.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const { report, campaigns } = await loadAdminReport(filters);
    const title = filters.campaign ? campaigns.find(c => c.id === filters.campaign)!.title : 'Alla kampanjer';
    const buffer = await reportExcel(report, bankOre, title);
    return new NextResponse(new Uint8Array(buffer), { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="alrahma-rapport-${filters.from || 'alla'}-${filters.to || 'alla'}.xlsx"`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
    } });
  } catch {
    return NextResponse.json({ error: 'Kunde inte skapa en fullständig rapport. Försök igen.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
