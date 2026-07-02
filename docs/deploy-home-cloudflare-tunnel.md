# Deploy from your own computer with Cloudflare Tunnel

This setup publishes the web app and API through Cloudflare Tunnel while keeping Postgres
and Redis private inside Docker. You do not need to open router ports; this computer is
the server, so the site is online only while this computer and Docker Desktop are running.

## What you need

- Docker Desktop running on this computer.
- A domain added to Cloudflare.
- A Cloudflare Tunnel token.

Cloudflare's current tunnel flow is: create a `cloudflared` tunnel, publish hostnames, and point each hostname to a local service URL.

References:

- https://developers.cloudflare.com/tunnel/setup/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/

## Cloudflare setup

In Cloudflare Zero Trust, create a Cloudflare Tunnel and choose Docker as the connector.
Use a remotely-managed tunnel. Cloudflare's run parameters support the `TUNNEL_TOKEN`
environment variable for this flow.

Add these public hostnames to the tunnel:

| Public hostname            | Service URL       |
| -------------------------- | ----------------- |
| `vang.your-domain.com`     | `http://web:3000` |
| `api-vang.your-domain.com` | `http://api:4000` |

Copy only the token value from the Docker command Cloudflare gives you. It usually starts with `eyJ...`.

## Local `.env`

Copy `.env.example` to `.env` if you do not already have one, then set these values:

```env
NODE_ENV=production
PUBLIC_WEB_URL=https://vang.your-domain.com
PUBLIC_API_BASE_URL=https://api-vang.your-domain.com/api/v1
NEXT_PUBLIC_API_BASE_URL=https://api-vang.your-domain.com/api/v1
TUNNEL_TOKEN=eyJ...
ADMIN_PASSWORD=replace_with_a_strong_password
```

Keep the existing database and Redis values. The home-server compose file overrides them inside Docker.

`PUBLIC_API_BASE_URL` is used by server-side code. `NEXT_PUBLIC_API_BASE_URL` is baked
into the browser bundle for the admin page and other client-side calls, so it must be the
public HTTPS API URL.

## Run

From the repo root:

```powershell
docker compose --profile tunnel -f infra/docker-compose.home-server.yml up -d
```

Check containers:

```powershell
docker compose -f infra/docker-compose.home-server.yml ps
```

Check logs:

```powershell
docker compose -f infra/docker-compose.home-server.yml logs --tail 80 cloudflared web api worker
```

The first boot runs install, migration, seed, and build in the `app-setup` service, so it
can take a few minutes. If it fails, check:

```powershell
docker compose -f infra/docker-compose.home-server.yml logs --tail 120 app-setup
```

Open:

- `https://vang.your-domain.com`
- `https://api-vang.your-domain.com/api/v1/health`

## Update after code changes

Re-run the setup service so it installs/builds/migrates again, then restart the app services:

```powershell
docker compose -f infra/docker-compose.home-server.yml run --rm app-setup
docker compose --profile tunnel -f infra/docker-compose.home-server.yml up -d --no-deps --force-recreate api worker web cloudflared
```

## Auto deploy with GitHub Actions

The repository includes `.github/workflows/deploy.yml`. It runs after the `CI` workflow
passes on `main`, or manually from the GitHub Actions page.

Use a self-hosted GitHub Actions runner on the production machine. Give the runner a
custom label:

```text
vang-radar-prod
```

The runner must be Windows-based, have Docker Desktop running, and be allowed to run
`docker compose`.

On the production machine, install/authenticate GitHub CLI:

```powershell
winget install --id GitHub.cli --exact
gh auth login --hostname github.com --git-protocol https --web --scopes repo,workflow,admin:repo_hook
```

Then run the setup script from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File infra/scripts/setup-github-actions-runner.ps1 -SetProductionEnvSecret
```

This writes the `PRODUCTION_ENV` secret from the local `.env`, downloads the latest
Windows x64 GitHub Actions runner, registers it for this repository, and starts it in
the current user session.

To install the runner as a Windows service instead, run PowerShell as Administrator:

```powershell
powershell -ExecutionPolicy Bypass -File infra/scripts/setup-github-actions-runner.ps1 -SetProductionEnvSecret -AsService
```

Create a repository secret named `PRODUCTION_ENV` that contains the full production
`.env` content, for example:

```env
NODE_ENV=production
PUBLIC_WEB_URL=https://vang.your-domain.com
PUBLIC_API_BASE_URL=https://api-vang.your-domain.com/api/v1
NEXT_PUBLIC_API_BASE_URL=https://api-vang.your-domain.com/api/v1
TUNNEL_TOKEN=eyJ...
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace_with_a_strong_password
```

Include the provider keys and email settings in the same secret if production needs
them. Do not commit `.env`.

Deploy flow:

1. Push to `main`.
2. `CI` runs `lint`, `typecheck`, `test`, and `build`.
3. If CI passes, `Deploy` runs on the self-hosted runner.
4. The deploy job writes `.env` from `PRODUCTION_ENV`, runs migrations/seed/build through
   `app-setup`, recreates `api`, `worker`, `web`, and `cloudflared`, then checks local
   Web/API health.

## Stop

```powershell
docker compose -f infra/docker-compose.home-server.yml down
```

This stops the site but keeps the Postgres Docker volume.

## Notes

- Do not publish Postgres or Redis ports to the Internet.
- Keep this computer awake and online. If it turns off, the website turns off.
- Enable Docker Desktop start on login if you want the site to recover after reboot.
- Back up the `postgres_data` Docker volume regularly before major changes.
- Cloudflare Tunnel is free to use for this kind of self-hosted HTTP access, but the domain
  itself still needs to be on Cloudflare DNS.
