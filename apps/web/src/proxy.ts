import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const handle = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  if (request.cookies.has('NEXT_LOCALE')) return handle(request);
  const headers = new Headers(request.headers);
  headers.delete('accept-language');
  return handle(new NextRequest(request.url, { headers }));
}

export const config = { matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'] };
