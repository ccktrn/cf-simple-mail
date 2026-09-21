import { createRequestHandler, RouterContextProvider, type ServerBuild } from "react-router";
import { receiveMail } from "./lib/mail/receiver.server";
import { cloudflareContext } from "./lib/request-context.server";
import type { Env } from "./lib/env.server";

const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build").then(build => build as ServerBuild), import.meta.env.MODE);
export default {
  fetch(request, env, ctx) { const context = new RouterContextProvider(); context.set(cloudflareContext, { env, ctx }); return requestHandler(request, context as never); },
  email: receiveMail,
} satisfies ExportedHandler<Env>;
