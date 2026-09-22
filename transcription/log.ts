import { dirname } from 'https://deno.land/std/path/mod.ts'

export type Logger = {
  info(message: string): void
  warn(message: string): void
}

// Logs to the console in the repo's usual style and, when a path is given,
// appends timestamped lines to a file so a long backfill can be reviewed
// later. Writes are synchronous so a crash never loses the last lines.
export function createLogger(filePath?: string): Logger {
  if (filePath) Deno.mkdirSync(dirname(filePath), { recursive: true })

  const append = (level: string, message: string) => {
    if (!filePath) return
    const line = `${new Date().toISOString()} ${level} ${message}\n`
    Deno.writeTextFileSync(filePath, line, { append: true })
  }

  return {
    info(message) {
      console.log(message)
      append('INFO', message)
    },
    warn(message) {
      console.warn(message)
      append('WARN', message)
    },
  }
}
