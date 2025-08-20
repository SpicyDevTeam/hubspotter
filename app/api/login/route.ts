import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({} as any));
	const code = String((body as any)?.code || '');
	if (code === '2406598908') {
		const res = NextResponse.json({ ok: true });
		res.cookies.set('access_code', code, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
		return res;
	}
	return NextResponse.json({ ok: false, error: 'Invalid access code' }, { status: 401 });
}


