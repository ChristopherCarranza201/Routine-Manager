// middleware.ts
import { NextResponse } from "next/server";

export function middleware(req: Request) {
    const url = new URL(req.url);
    if (url.pathname.endsWith(".css.map")) {
        // No servimos mapas en dev: evita el 404 sin tocar tu build
        return new NextResponse(null, { status: 200 }); // ✅ 200 sin body
    }
    return NextResponse.next();
}

export const config = {
    matcher: ["/_next/static/css/:path*"],
};
