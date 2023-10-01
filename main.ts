import { load } from "https://deno.land/std/dotenv/mod.ts";
import { serve404, serveFeed, serveLogo } from "./serve.ts";

const env = await load();
const port = Number(env["PORT"]) ?? 80;

async function handleRoute(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/podcast/feed.xml") {
    return await serveFeed(request);
  } else if (url.pathname === "/logo.png") {
    return await serveLogo(request);
  } else {
    return serve404()
  }
}

Deno.serve({ port }, handleRoute);
