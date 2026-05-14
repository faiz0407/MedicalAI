import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that do NOT require authentication
const PUBLIC_PATHS = ['/', '/login', '/register', '/blog']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths and static assets
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')

  if (isPublic) return NextResponse.next()

  // Check for token in Authorization cookie (set at login) or query param
  const token =
    request.cookies.get('access_token')?.value ||
    request.headers.get('authorization')?.replace('Bearer ', '')

  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Role-based route protection (basic — full decode requires edge-compatible JWT lib)
  // For MVP: role check happens in page/layout components via useAuthStore
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/doctor/:path*'],
}
