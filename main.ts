/// <reference lib="deno.unstable" />

import { load } from "https://deno.land/std/dotenv/mod.ts";
import { serve404, serveFeed, serveLanding } from "./serve.ts";

const env = await load();
const port = Number(env["PORT"]) ?? 80;

async function handleRoute(request: Request): Promise<Response> {
  const url = new URL(request.url);

  switch (url.pathname) {
    case "/podcast/feed.xml":
      return await serveFeed(request);
    case "/":
    case "/index.htm":
    case "/index.html":
      return await serveLanding(request);
    default:
      return serve404();
  }
}

Deno.serve({ port }, handleRoute);
