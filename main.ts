import { Status } from "https://deno.land/std/http/http_status.ts";
import { load } from "https://deno.land/std/dotenv/mod.ts";

const env = await load();
const port = Number(env["PORT"]) ?? 80;

const NEWS_FEED_URL =
  "https://radiostudent.si/taxonomy/term/55167/%2A/feed?page=6"; // ?page=0
const PODCAST_FEED_URL =
  "https://radiostudent.si/kultura/pritiskavec-gold/podcast";

const handler = (request: Request): Response => {
  const url = new URL(request.url);

  if (request.method !== "GET" || url.pathname !== "/podcast/feed.xml") {
    return new Response(null, { status: Status.NotFound });
  }

  const body = `Your user-agent is:\n\n${
    request.headers.get("user-agent") ?? "Unknown"
  }`;

  return new Response(body, { status: Status.OK });
};

Deno.serve({ port }, handler);
