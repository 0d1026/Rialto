# Deploying Rialto on Railway

Rialto runs as four Railway services in one project on a private network: a
PostgreSQL database with pgvector, the discovery API, the embedding worker, and
the facilitator API. Only discovery and facilitator receive public domains. The
database and the worker stay private.

The whole stack builds from the single root `Dockerfile`. Railway builds its
default final stage (`runtime`), which contains every package, and each service
selects the process it runs through a start command. There is no separate build
per service to maintain.

Keep app sleeping off on every service so a reviewer's request never hits a
cold start.

## Prerequisites

- A Railway project on the trial or Hobby plan.
- The repository connected to Railway (Deploy from GitHub repo, branch `deploy`
  until it merges, then `main`).
- A dedicated testnet facilitator secret key, funded via Friendbot, used only by
  the deployed facilitator.

## Service 1: Postgres

Add a database from the Railway pgvector template.

- Image: `pgvector/pgvector:pg17`
- Public networking: off
- Volume: mounted at `/var/lib/postgresql/data`
- `PGDATA`: a subdirectory of the volume, for example
  `/var/lib/postgresql/data/pgdata`

Railway generates the password and exposes `DATABASE_URL` on the service. The
other services reference it as `${{Postgres.DATABASE_URL}}`.

## Service 2: discovery (public API)

- Source: this repository, root `Dockerfile`
- Start command: `cd packages/discovery && pnpm exec tsx src/index.ts`
- Health check path: `/health`
- Public domain: yes
- Volume: mounted at `/cache/embedding-model` so the local embedding model
  downloads once and survives restarts

Variables:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
PORT=4030
EMBEDDING_CACHE_DIR=/cache/embedding-model
INGEST_TOKEN=<shared secret, same value the facilitator sends>
```

The schema, including `CREATE EXTENSION vector`, is created on first connect, so
no manual migration step is needed. Search answers immediately on lexical
results and upgrades to hybrid as the worker fills in document vectors, so the
service is useful before the backfill finishes.

## Service 3: embed-worker (private background)

- Source: this repository, root `Dockerfile`
- Start command: `cd packages/discovery && pnpm exec tsx src/embedding-worker-cli.ts`
- Health check: none
- Public domain: no
- Volume: mounted at `/cache/embedding-model`

Variables:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
EMBEDDING_CACHE_DIR=/cache/embedding-model
```

## Service 4: facilitator (public API)

- Source: this repository, root `Dockerfile`
- Start command: `cd packages/facilitator && pnpm exec tsx src/index.ts`
- Health check path: `/health`
- Public domain: yes

Variables:

```
FACILITATOR_STELLAR_PRIVATE_KEY=<dedicated testnet secret>
STELLAR_NETWORK=stellar:testnet
MAX_TRANSACTION_FEE_STROOPS=200000
PORT=4022
DISCOVERY_INGEST_URL=http://discovery.railway.internal:4030/internal/settlement-events
INGEST_TOKEN=<same shared secret as discovery>
```

## Bring-up order

1. Deploy Postgres and wait for it to become healthy.
2. Deploy discovery. `GET /health` should return `{"status":"ok","resources":0}`.
3. Deploy embed-worker.
4. Deploy facilitator. `GET /supported` should advertise `exact`,
   `stellar:testnet`, `areFeesSponsored: true`, and the `bazaar` extension.

## Load the real catalog once

After discovery is live, run the ingestion once against the live database so the
public catalog holds real services rather than an empty index. From a machine
with the repository and `DATABASE_URL` pointed at the Railway database:

```
cd packages/discovery && pnpm ingest cdp ~/stellar/cdp
pnpm ingest algovoi
```

`GET /discovery/search?query=weather` then returns real weather services, and
`GET /federation/peers` shows AlgoVoi registered.

## Verify live

```
curl https://<facilitator-domain>/supported
curl https://<discovery-domain>/health
curl "https://<discovery-domain>/discovery/search?query=weather&limit=3"
curl "https://<discovery-domain>/discovery/resources?network=stellar:pubnet&limit=1"
curl https://<discovery-domain>/federation/peers
```

## Credit and uptime

The trial includes 5 dollars of usage over 30 days. Four always-on services draw
that credit faster than 30 days. Watch the credit meter, and upgrade to the 5
dollar Hobby plan before the credit runs out to keep the public URLs answering
through the review window.
