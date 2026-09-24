import { requireSession } from "../auth.server";
import { getCloudflareContext } from "../request-context.server";
import { MailStore } from "./store.server";
import type { MailType } from "./types";

export async function loadMailbox(type: MailType, { request, context }: { request: Request; context: ReadonlyMap<unknown, unknown> }) {
  const { env } = getCloudflareContext(context);
  await requireSession(request, env);
  return { type, items: await new MailStore(env.MAIL_KV).list(type) };
}
