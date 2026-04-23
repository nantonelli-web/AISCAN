import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// jose is edge-compatible, so we can verify the signature here instead of
// only relying on cookie presence. Keeps the layout check as a second line
// of defence.
async function isValidAdminToken(token: string): Promise<boolean> {
  const raw = process.env.ADMIN_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!raw || raw.length < 32) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(raw));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const session = request.cookies.get("admin_session")?.value;
    if (!session || !(await isValidAdminToken(session))) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
