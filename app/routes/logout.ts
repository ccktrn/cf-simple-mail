import { redirect } from "react-router";
import { expiredSessionCookie } from "../lib/auth/session.server";
export async function action({ request }: { request: Request }) { throw redirect("/login", { headers: { "Set-Cookie": expiredSessionCookie(new URL(request.url).protocol === "https:") } }); }
