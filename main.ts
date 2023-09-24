import { Status } from "https://deno.land/std/http/http_status.ts";

const port = 8080;

const NEWS_FEED_URL =
  "https://radiostudent.si/taxonomy/term/55167/%2A/feed?page=6"; // ?page=0
const PODCAST_FEED_URL =
  "https://radiostudent.si/kultura/pritiskavec-gold/podcast";

const handler = (request: Request): Response => {
  if (request.method !== "GET" || !request.url.endsWith("podcast/feed.xml")) {
    return new Response(null, { status: Status.NotFound });
  }

  const body = `Your user-agent is:\n\n${
    request.headers.get("user-agent") ?? "Unknown"
  }`;

  return new Response(body, { status: Status.OK });
};

console.log(`HTTP server running. Access it at: http://localhost:8080/`);
Deno.serve({ port }, handler);
