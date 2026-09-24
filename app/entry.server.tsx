import type { EntryContext, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";
import { renderToReadableStream } from "react-dom/server";

export default async function handleRequest(request: Request, status: number, headers: Headers, context: EntryContext, _loadContext: RouterContextProvider) {
  const body = await renderToReadableStream(<ServerRouter context={context} url={request.url} />);
  headers.set("Content-Type", "text/html");
  return new Response(body, { status, headers });
}
