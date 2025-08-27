import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
	try {
		const { ensureSchema, cleanupHubSpotDuplicates } = await import('../../../src/hubspot.js');
		const body = await request.json();
		
		const { mergedCompanyIds, dryRun = true } = body;

		if (!mergedCompanyIds || !Array.isArray(mergedCompanyIds) || mergedCompanyIds.length === 0) {
			return NextResponse.json({ 
				ok: false, 
				error: 'mergedCompanyIds array is required' 
			}, { status: 400 });
		}

		const client = await ensureSchema();
		const result = await cleanupHubSpotDuplicates(client, mergedCompanyIds, { dryRun });

		return NextResponse.json({ ok: true, result });
	} catch (err: any) {
		return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
	}
}


