import { Status } from "https://deno.land/std/http/http_status.ts";
import { load } from "https://deno.land/std/dotenv/mod.ts";
import { fetchFeed } from "./fetching.ts";
import { parseEntries } from "./parsing.ts";
import { generateFeed } from "./generating.ts";

const env = await load();
const port = Number(env["PORT"]) ?? 80;

const ACCEPT_RANGES = {
  "Accept-Ranges": "bytes",
};

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "HEAD") {
    return new Response(null, {
      status: Status.OK,
      headers: ACCEPT_RANGES,
    });
  } else if (request.method === "GET") {
    if (url.pathname === "/podcast/feed.xml") {
      return await serveFeed();
    } else if (url.pathname === "/logo.png") {
      return await serveLogo();
    }
  }

  return new Response(null, { status: Status.NotFound });
}

async function serveFeed() {
  const { newsEntries, podcastEntries } = await fetchFeed();
  const parsedEntries = parseEntries(newsEntries, podcastEntries);
  const feed = generateFeed(parsedEntries);
  const headers = { "Content-Type": "application/rss+xml", ...ACCEPT_RANGES };
  const status = Status.OK;

  return new Response(feed, { headers, status });
}

async function serveLogo() {
  const image = await Deno.readFile("./logo.png");
  const headers = { "Content-Type": "image/png", ...ACCEPT_RANGES };
  const status = Status.OK;

  return new Response(image, { headers, status });
}

Deno.serve({ port }, handler);
