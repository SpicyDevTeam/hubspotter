import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	try {
		const { createPool, fetchCompanies } = await import('../../../src/db.js');
		const { ensureSchema, findAllDuplicateCompanies, findHubSpotDuplicatesForCSCartCompanies } = await import('../../../src/hubspot.js');
		
		const { searchParams } = new URL(request.url);
		const method = searchParams.get('method') || 'efficient'; // 'efficient' or 'targeted'
		const batchSize = parseInt(searchParams.get('batchSize') || '10');
		
		const pool = await createPool();
		const client = await ensureSchema();
		
		// Get all CS-Cart companies
		const csCartCompanies = await fetchCompanies(pool, { pageSize: 10000, companyIds: [] });
		
		let duplicates;
		if (method === 'targeted') {
			// Use targeted search approach - better for large datasets
			console.log(`🎯 Using targeted search method with batch size ${batchSize}`);
			duplicates = await findHubSpotDuplicatesForCSCartCompanies(client, csCartCompanies, { batchSize });
		} else {
			// Use efficient filtering approach - gets all HubSpot-only companies at once
			console.log('⚡ Using efficient filtering method');
			duplicates = await findAllDuplicateCompanies(client, csCartCompanies);
		}
		
		await pool.end();

		return NextResponse.json({ 
			ok: true, 
			method,
			count: duplicates.length,
			totalDuplicates: duplicates.reduce((sum, group) => sum + group.count, 0),
			data: duplicates 
		});
	} catch (err: any) {
		return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
	}
}

export async function POST(request: Request) {
	try {
		const body = await request.json();
		
		const { primaryCompany, duplicateCompanies, dryRun = true } = body;

		if (!primaryCompany || !primaryCompany.id) {
			return NextResponse.json({ ok: false, error: 'primaryCompany is required' }, { status: 400 });
		}

		if (!duplicateCompanies || !Array.isArray(duplicateCompanies) || duplicateCompanies.length === 0) {
			return NextResponse.json({ ok: false, error: 'duplicateCompanies array is required' }, { status: 400 });
		}

		// Determine merge type based on company sources
		const allCSCart = [primaryCompany, ...duplicateCompanies].every(c => c.source === 'cs-cart');
		const allHubSpot = [primaryCompany, ...duplicateCompanies].every(c => c.source === 'hubspot');

		if (allCSCart) {
			// CS-Cart merge
			const { createPool, mergeCompanies } = await import('../../../src/db.js');
			const pool = await createPool();
			const result = await mergeCompanies(
				pool, 
				primaryCompany.csCartId, 
				duplicateCompanies.map(c => c.csCartId), 
				{ dryRun }
			);
			await pool.end();
			return NextResponse.json({ ok: true, result, mergeType: 'cs-cart' });
			
		} else if (allHubSpot) {
			// HubSpot-only merge
			const { ensureSchema, mergeHubSpotCompanies } = await import('../../../src/hubspot.js');
			const client = await ensureSchema();
			const result = await mergeHubSpotCompanies(
				client,
				primaryCompany.hubSpotId,
				duplicateCompanies.map(c => c.hubSpotId),
				{ dryRun }
			);
			return NextResponse.json({ ok: true, result, mergeType: 'hubspot' });
			
		} else {
			// Mixed merge - not supported yet
			return NextResponse.json({ 
				ok: false, 
				error: 'Mixed CS-Cart and HubSpot company merging is not supported. Please merge within the same source.' 
			}, { status: 400 });
		}

	} catch (err: any) {
		return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
	}
}
