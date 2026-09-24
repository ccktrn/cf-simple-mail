import { createContext } from "react-router";
import type { Env } from "./env.server";

export const cloudflareContext = createContext<{ env: Env; ctx: ExecutionContext }>();
export function getCloudflareContext(context: ReadonlyMap<unknown, unknown>) { return context.get(cloudflareContext) as { env: Env; ctx: ExecutionContext }; }
