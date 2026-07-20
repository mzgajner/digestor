FROM denoland/deno:2.9.2

WORKDIR /app

# Copy the app (source + the static assets we serve) and pre-cache the
# dependency graph so startup doesn't pay for it.
COPY . .
RUN deno cache main.ts

# Dokku sets $PORT and expects the app to listen on it; main.ts reads it.
EXPOSE 8080

CMD ["deno", "run", "--allow-read", "--allow-net", "--allow-env", "main.ts"]
