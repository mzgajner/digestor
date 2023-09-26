import { Status } from "https://deno.land/std/http/http_status.ts";
import { load } from "https://deno.land/std/dotenv/mod.ts";
import { fetchFeed } from "./fetching.ts";
import { parseEntries } from "./parsing.ts";

const env = await load();
const port = Number(env["PORT"]) ?? 80;

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET") {
    if (url.pathname === "/podcast/feed.xml") {
      return await serveFeed()
    } else if (url.pathname === "/logo.png") {
      return await serveLogo()
    }
  }

  return new Response(null, { status: Status.NotFound });
};

async function serveFeed() {
  const rawEntries = await fetchFeed();
  const parsedEntries = parseEntries(rawEntries);
  const body = JSON.stringify(parsedEntries, null, "  ")
  const status = Status.OK

  return new Response(body, { status });
}

async function serveLogo() {
  const image = await Deno.readFile('./logo.png');
  const headers = { 'content-type': 'image/png' }
  const status = Status.OK

  return new Response(image, { headers, status })

}

Deno.serve({ port }, handler);
