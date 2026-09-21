import { redirect } from "react-router";
import { SESSION_COOKIE } from "./mail/constants";
import { validSession } from "./auth/session.server";
import type { Env } from "./env.server";

function cookie(request: Request) { return request.headers.get("Cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1); }
export async function requireSession(request: Request, env: Env) { if (!await validSession(cookie(request), env.SESSION_SECRET)) throw redirect("/login"); }
