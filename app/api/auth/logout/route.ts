import { NextResponse } from "next/server";
import { clearedSessionCookie, destroySession, sessionTokenFromCookieHeader } from "@/lib/server/app-auth";

async function logout(req: Request) {
  await destroySession(sessionTokenFromCookieHeader(req.headers.get("cookie")));
  const response = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  response.headers.set("Set-Cookie", clearedSessionCookie());
  return response;
}

export async function GET(req: Request) { return logout(req); }
export async function POST(req: Request) { return logout(req); }
