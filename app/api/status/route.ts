import { NextResponse } from 'next/server';
import { syncState } from '../_status';

export const dynamic = 'force-dynamic';

export async function GET() {
	return NextResponse.json({ ok: true, global: syncState.global, companies: Array.from(syncState.companies) });
}


