import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [index("routes/index.ts"), route("login", "routes/login.tsx"), route("logout", "routes/logout.ts"), route("inbox", "routes/mailbox.tsx"), route("sent", "routes/sent.tsx"), route("compose", "routes/compose.tsx"), route("mails/:type/:id", "routes/mail-detail.tsx")] satisfies RouteConfig;
