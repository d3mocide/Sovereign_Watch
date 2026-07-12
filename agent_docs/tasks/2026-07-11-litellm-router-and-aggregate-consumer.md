# LiteLLM Router Fallbacks + hourly_clausal_summaries Consumer

Final follow-ups from
`agent_docs/ai_research/2026-07-10-clausal-chain-pipeline-review.md`
(findings #13 dead LiteLLM config, and the unused continuous aggregate).

## Issue

1. `litellm_config.yaml` declares `router_settings.fallbacks`
   (`public-flash → deep-reasoner`, `secure-core` fail-closed) and
   `litellm_settings` (`drop_params`, Presidio callbacks), but `AIService`
   called `litellm.acompletion()` directly — router settings are only
   consulted by a `litellm.Router` (or the proxy), so the failover chain and
   settings were dead configuration.
2. The `hourly_clausal_summaries` TimescaleDB continuous aggregate refreshed
   hourly with no consumer anywhere in the stack, while
   `/api/stats/clausalizer` bucketed up to 72 h of raw `clausal_chains` rows
   into 1-minute buckets on every request.

## Solution

Build a `litellm.Router` from the config so fallbacks actually apply, apply
the library-mode settings, and surface the proxy-only Presidio limitation
loudly. Point the long-window stats timeline at the continuous aggregate.

## Changes

- `backend/api/services/ai_service.py`:
  - `_build_router()` constructs a `litellm.Router` from the resolved model
    map and `router_settings.fallbacks`. Fallback entries referencing
    disabled models (unset env vars) are filtered with warnings; empty
    fallback lists (fail-closed) are dropped since that is the Router
    default. Router init failure degrades gracefully to direct completions.
  - `_acompletion()` routes through the Router when the active model is
    managed by it; unmanaged model names (custom Redis overrides) still use
    direct `acompletion`. `generate_stream`/`generate_static` share it.
  - `_apply_litellm_settings()` applies `drop_params` and logs a clear
    warning that guardrail callbacks (Presidio PII redaction) are LiteLLM
    *proxy* hooks and are NOT active in library mode — previously this was
    silently ignored.
- `backend/api/routers/stats.py`: `/api/stats/clausalizer` uses
  `hourly_clausal_summaries` (a real-time aggregate: materialized rollups +
  raw top-up for the current hour) for the activity timeline when
  `hours > 24`, with hourly GDELT buckets unioned in; short windows keep the
  1-minute raw query. Response gains `timeline_bucket_minutes` so clients
  know the granularity (the frontend plots generic time labels and needs no
  change).

## Verification

- `backend/api`: 247 passed, ruff clean on changed files.
  - New `test_ai_service_router.py`: Router built with only env-resolved
    models, ghost fallbacks filtered, managed models route through the
    Router, unmanaged models fall back to direct completion.
  - New stats tests: hours=72 hits `hourly_clausal_summaries` with
    `timeline_bucket_minutes=60`; hours=6 keeps 1-minute raw buckets.

## Benefits

- The configured model failover chain (`public-flash → deep-reasoner`)
  actually executes on provider failures/rate limits; `secure-core` stays
  fail-closed by design.
- No more silent pretense of PII redaction — the log states exactly what is
  and is not active.
- Long-window clausalizer dashboards stop scanning 72 h of raw hypertable
  rows per request, and the continuous aggregate finally earns its refresh
  policy.
