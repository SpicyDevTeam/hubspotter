import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;
	if (pathname.startsWith('/api')) return NextResponse.next();
	if (pathname.startsWith('/login')) return NextResponse.next();
	const auth = request.cookies.get('access_code')?.value;
	if (auth === '2406598908') return NextResponse.next();
	const loginUrl = new URL('/login', request.url);
	return NextResponse.redirect(loginUrl);
}

export const config = {
	matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
