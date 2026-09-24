import { redirect } from "react-router";
import { requireSession } from "../auth.server";
import { getCloudflareContext } from "../request-context.server";
import { mailTtl } from "./receiver.server";
import { MailStore } from "./store.server";
import type { MailType } from "./types";

export async function updateMailbox(type: MailType, { request, context }: { request: Request; context: ReadonlyMap<unknown, unknown> }) {
  const { env } = getCloudflareContext(context);
  await requireSession(request, env);
  const form = await request.formData(), id = String(form.get("id") ?? ""), intent = form.get("intent");
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id)) throw new Response("Not found", { status: 404 });
  const store = new MailStore(env.MAIL_KV);
  if (intent === "delete") await store.delete(type, id);
  else if (intent === "retain") await store.retain(type, id);
  else if (intent === "release") await store.release(type, id, mailTtl(env));
  else throw new Response("Bad request", { status: 400 });
  throw redirect(`/${type}`);
}
