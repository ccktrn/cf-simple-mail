import { redirect } from "react-router";
import { validSession, sessionCookieName } from "./auth/session.server";
import type { Env } from "./env.server";

function cookie(request: Request) { const name = sessionCookieName(new URL(request.url).protocol === "https:"); return request.headers.get("Cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.slice(name.length + 1); }
export async function requireSession(request: Request, env: Env) { if (!await validSession(cookie(request), env.SESSION_SECRET)) throw redirect("/login"); }
