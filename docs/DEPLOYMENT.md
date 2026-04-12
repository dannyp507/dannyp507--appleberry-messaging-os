# Production deployment (Docker + Nginx)

This guide assumes a machine with Docker Engine and Docker Compose v2 (for example a VPS). All steps are plain shell commands—use whatever access you have to that host (SSH, serial console, provider web terminal, CI, etc.).

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

Validate the compose file (optional):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production config > /dev/null
```

## 2. Build and start

From `infrastructure/docker`:

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

