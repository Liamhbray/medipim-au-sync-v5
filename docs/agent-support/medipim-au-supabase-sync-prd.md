# MediPim AU → Supabase Sync PRD

## Overview

**MediPim AU → Supabase Sync** is a lean, two-process integration that mirrors the full MediPim Australia product catalogue into Supabase Postgres nightly. It is designed for pharmacy e-commerce teams that want reliable, queryable product data with minimal infrastructure and cost. The solution uses only two small Fly.io Machines and Supabase.

## Core Features

| Feature                | What it does                                         | How it works                                                                                                     |
| ---------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Nightly Fetch**      | Streams the entire NDJSON feed from MediPim AU       | Fly Machine **Fetcher** streams the POST response to a tus upload in Supabase Storage                            |
| **Idempotent Upsert**  | Inserts or updates records based on `meta.updatedAt` | Fly Machine **Maintainer** reads the NDJSON file, processes line-by-line with `INSERT ... ON CONFLICT DO UPDATE` |
| **Crash-Safe Resumes** | Automatically resumes interrupted jobs               | tus tracks upload offset; upsert logic is idempotent                                                             |
| **Manual Run Hook**    | Trigger `/run` on either service for ad-hoc runs     | Authenticated via `X-ADMIN-KEY` shared secret                                                                    |
| **Basic Health Check** | `/healthz` endpoint for Fly health checks            | Returns `200 OK` for liveness                                                                                    |

## Technical Architecture

| Component      | Runtime / Host                  | Responsibility                                             | Schedule / Trigger                   |
| -------------- | ------------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| **Fetcher**    | Node 20 on Fly Machine (256 MB) | Stream MediPim feed to Supabase Storage as `latest.ndjson` | Nightly at 01:00 AEST, manual `/run` |
| **Maintainer** | Node 20 on Fly Machine          | Read `latest.ndjson` and upsert into `public.products`     | Nightly at 02:00 AEST, manual `/run` |
| **Supabase**   | Managed                         | Host `products` table and `medipim-raw` bucket             |                                      |

### Data Model

```sql
create table if not exists public.products (
  id          text primary key,
  name        text,
  price_cents integer,
  updated_at  timestamptz default now(),
  raw         jsonb
);
```

### Configuration / Secrets

| Env Var                     | Purpose                                 |
| --------------------------- | --------------------------------------- |
| `MEDIPIM_API_KEY`           | MediPim AU bearer token                 |
| `SUPABASE_URL`              | Project endpoint URL                    |
| `SUPABASE_SERVICE_ROLE_KEY` | Full R/W Postgres access                |
| `BUCKET`                    | Storage bucket (default: `medipim-raw`) |
| `ADMIN_KEY`                 | Shared secret for `/run`                |

## Development Roadmap

| Phase                | Done-When                                     | Deliverables                                     |
| -------------------- | --------------------------------------------- | ------------------------------------------------ |
| **1. PoC**           | Feed streamed to local file                   | Node script; verified payload sample             |
| **2. MVP**           | Sync works on schedule to Supabase            | Dockerfiles, `fly.toml`, SQL migration, E2E test |
| **3. Observability** | Basic ops feedback via logs and health checks | `/healthz` endpoint, summary log output          |

## Logical Dependency Chain

1. PoC fetch script
2. Supabase schema & bucket setup
3. Fetcher container and cron
4. Maintainer container and upsert logic
5. End-to-end sync test

## Risks & Mitigations

| Risk                    | Mitigation                                               |
| ----------------------- | -------------------------------------------------------- |
| API schema change       | Validate JSON shape before upsert; fail early            |
| Growing catalogue       | Monitor job duration; upgrade Fly machine size if needed |
| Supabase unavailability | Rerun job manually after service resumes                 |
| Leaked secrets          | Store secrets in Fly vault; rotate periodically          |

## Appendix

* [MediPim AU API Docs](https://platform.au.medipim.com/docs/api/v4/endpoints/products/query.html#response-body)
* [Fly.io Machines & Cron](https://fly.io/docs/machines/guides/cron/)
* [Supabase Storage Uploads](https://supabase.com/docs/guides/storage/resumable-uploads)
