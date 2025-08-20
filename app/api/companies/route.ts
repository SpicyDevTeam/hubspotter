import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	const { createPool, fetchCompanies } = await import('../../../src/db.js');
	const { config } = await import('../../../src/config.js');
	try {
		const { searchParams } = new URL(request.url);
		const idsStr = searchParams.get('ids') || '';
		const ids = idsStr
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.map((n) => Number(n))
			.filter((n) => Number.isFinite(n));
		const pool = await createPool();
		const companies = await fetchCompanies(pool, { pageSize: config.pageSize, companyIds: ids.length ? ids : undefined });
		await pool.end();
		return NextResponse.json({ ok: true, count: companies.length, data: companies });
	} catch (err: any) {
		return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
	}
}


