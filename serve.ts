import { Status } from "https://deno.land/std/http/http_status.ts";

import { fetchFeed } from "./fetch.ts";
import { parseEntries } from "./parse.ts";
import { generateFeed } from "./generate.ts";

export const NOT_FOUND_RESPONSE = new Response(null, {
  status: Status.NotFound,
});
const LOGO_IMAGE = await Deno.readFile("./logo.png");
const LANDING_PAGE = await Deno.readFile("./index.html");

export async function serveFeed(request: Request) {
  const { newsEntries, podcastEntries } = await fetchFeed();
  const parsedEntries = parseEntries(newsEntries, podcastEntries);
  const feed = generateFeed(parsedEntries);

  return generateResponse(feed, request, "application/rss+xml");
}

export function serveLogo(request: Request) {
  return generateResponse(LOGO_IMAGE, request, "image/png");
}

export function serveLanding(request: Request) {
  return generateResponse(LANDING_PAGE, request, "text/html");
}

export const serve404 = () => NOT_FOUND_RESPONSE;

function generateResponse(
  payload: BodyInit,
  request: Request,
  contentType: string,
) {
  if (!["GET", "HEAD"].includes(request.method)) return NOT_FOUND_RESPONSE;

  const body = request.method === "HEAD" ? null : payload;
  const headers = {
    "Accept-Ranges": "bytes",
    "Content-Type": contentType,
  };
  const status = Status.OK;

  return new Response(body, { headers, status });
}
