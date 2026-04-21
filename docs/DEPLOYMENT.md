# Production deployment (Docker + Nginx)

This guide assumes a machine with Docker Engine and Docker Compose v2 (for example a VPS). All steps are plain shell commands—use whatever access you have to that host (SSH, serial console, provider web terminal, CI, etc.).

## API-only test deploy (no Next.js)

Use this when you only have the Nest API (for example `apps/web` is not in the repo yet). It starts Postgres, Redis, and the API and publishes the API on the host.

```bash
git clone <your-repo-url> appleberry-messaging-os
cd appleberry-messaging-os/infrastructure/docker
cp .env.api-test.example .env.api-test
```

Edit `.env.api-test`: set strong `POSTGRES_PASSWORD` and `JWT_SECRET`, and set `CORS_ORIGIN` to the **exact** origin you use in a browser (scheme + host + port), e.g. `http://203.0.113.10:3001` or `https://api-staging.example.com`. For `API_HTTP_PORT`, pick the host port mapped to the container (default `3001`).

```bash
docker compose -f docker-compose.api-test.yml --env-file .env.api-test config > /dev/null
docker compose -f docker-compose.api-test.yml --env-file .env.api-test up -d --build
```

The API container runs `prisma migrate deploy` on start, then `node dist/main.js`. Smoke test: `curl -sS http://<host>:<API_HTTP_PORT>/`.

## 1. Clone and configure

```bash
git clone <your-repo-url> appleberry-messaging-os
cd appleberry-messaging-os/infrastructure/docker
cp .env.production.example .env.production
```

Edit `.env.production`:

- Set strong `POSTGRES_PASSWORD` and `JWT_SECRET`.
- Set `CORS_ORIGIN` to the **exact** browser origin users use (scheme + host + port if not 80/443), e.g. `https://app.example.com` or `http://203.0.113.10:8080` if you map Nginx to a non-standard port.
- Set `NEXT_PUBLIC_API_URL` to the **browser-visible** API base (same host and port as the app, path `/api`, no trailing slash), e.g. `https://app.example.com/api`.
- If ports **80** or **443** are already in use on the host, set `NGINX_HTTP_PORT` / `NGINX_HTTPS_PORT` (e.g. `8080` and `8443`) and match `CORS_ORIGIN` / `NEXT_PUBLIC_API_URL` to that port.

Optional Google sign-in:

- Google OAuth web clients require HTTPS redirect URIs, and the host cannot be a raw public IP address. Use a real domain or subdomain pointed at the VPS.
- Create a Google OAuth 2.0 Web application client.
- Add the app origin as an authorized JavaScript origin, e.g. `https://app.example.com`.
- Add the API callback as an authorized redirect URI, e.g. `https://app.example.com/api/auth/google/callback` for the Nginx production stack, or `https://api.example.com/auth/google/callback` if the API is served on its own hostname.
- Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `WEB_APP_URL`, and `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1`.

Validate the compose file (optional):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production config > /dev/null
```

## 2. Build and start

From `infrastructure/docker`. This stack expects a Next.js app at `../../apps/web` (see the `web` service in `docker-compose.prod.yml`).

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

The API container runs `prisma migrate deploy` on start, then `node dist/main.js`.

## 3. DNS

Point an `A` record for your hostname (e.g. `app.example.com`) to the VPS public IP.

## 4. HTTPS with Let’s Encrypt

1. Start the stack so Nginx serves HTTP on port 80 (required for HTTP-01).
2. Install certbot on the host (or use the official certbot container).
3. Example using webroot (matches `/.well-known/acme-challenge/` in `nginx/appleberry.conf`):

```bash
docker run --rm \
  -v "$(pwd)/certbot_www:/var/www/certbot" \
  -v "$(pwd)/certbot_conf:/etc/letsencrypt" \
  certbot/certbot certonly --webroot \
  -w /var/www/certbot \
  -d app.example.com \
  --email you@example.com \
  --agree-tos --non-interactive
```

Note: Compose uses **named volumes** for `certbot_www` and `certbot_conf`. To run certbot with `-w /var/www/certbot`, attach the **same** volume names the stack uses (inspect with `docker volume ls` and `docker volume inspect appleberry-prod_certbot_www`), or temporarily use bind mounts in an override file.

1. Uncomment the HTTPS `server` block at the bottom of `infrastructure/docker/nginx/appleberry.conf`, set `server_name` and certificate paths to match your certbot output, then reload Nginx:

```bash
cd appleberry-messaging-os/infrastructure/docker
docker compose -f docker-compose.prod.yml --env-file .env.production exec nginx nginx -s reload
```

1. Enable automatic renewal (cron or systemd timer) with `certbot renew` followed by `nginx -s reload`.

## 5. Routing summary


| Path     | Target                                              |
| -------- | --------------------------------------------------- |
| `/api/*` | Nest API (`/` on container, `/api` prefix stripped) |
| `/*`     | Next.js standalone                                  |


## 6. Security checklist

- API uses Helmet, throttling, and production env validation (`JWT_SECRET`, `DATABASE_URL`).
- Refresh tokens can be stored in `httpOnly` cookies; ensure `CORS_ORIGIN` matches your site and credentials mode stays enabled on the client.
- Set `TRUST_PROXY=1` when behind Nginx so rate limits and secure cookies see correct client IP / scheme.

## 7. Operations

- View logs: `docker compose -f docker-compose.prod.yml logs -f api web nginx`
- Database backup: use `pg_dump` against the `postgres` service (expose port temporarily or run from a sidecar container on the same Docker network).
