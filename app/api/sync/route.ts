import { NextResponse } from 'next/server';
import { reserveTargets, releaseTargets } from '../_status';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
	const { config } = await import('../../../src/config.js');
	const { runSync } = await import('../../../src/syncRunner.js');
	const body = await request.json().catch(() => ({} as any));
	const dryRun = Boolean((body as any)?.dryRun ?? config.dryRun);
	const companyIds = Array.isArray((body as any)?.companyIds) ? (body as any).companyIds : undefined;
	const events: any[] = [];
	try {
		const r = reserveTargets(companyIds);
		if (!r.ok) {
			return NextResponse.json({ ok: false, error: r.reason, conflicts: r.conflicts }, { status: 409 });
		}
		const result = await runSync({ dryRun, companyIds }, (e: any) => events.push(e));
		return NextResponse.json({ ok: true, result, events });
	} catch (err: any) {
		return NextResponse.json({ ok: false, error: err.message, events }, { status: 500 });
	} finally {
		releaseTargets(companyIds);
	}
}
