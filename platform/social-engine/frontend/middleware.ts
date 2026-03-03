import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Log all incoming requests
  console.log('[Middleware]', {
    method: request.method,
    pathname,
    timestamp: new Date().toISOString(),
    headers: {
      host: request.headers.get('host'),
      userAgent: request.headers.get('user-agent')?.substring(0, 50)
    }
  })

  return NextResponse.next()
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
