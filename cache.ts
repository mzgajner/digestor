import { ParsedEntry } from "./parse.ts";

const kv = await Deno.openKv();

export async function loadEntriesFromCache() {
  const entries: ParsedEntry[] = [];
  const iter = kv.list<ParsedEntry>({ prefix: ["entries"] });

  for await (const entry of iter) entries.push(entry.value);

  return entries;
}

export async function saveEntriesToCache(entries: ParsedEntry[]) {
  const DAY_IN_MS = 24 * 60 * 60 * 1000;

  const session = kv.atomic();

  entries.forEach((entry) => {
    session.set(["entries"], entry, { expireIn: DAY_IN_MS });
  });

  await session.commit();
}
