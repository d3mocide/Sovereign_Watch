#!/bin/bash
# =============================================================================
# init-topics.sh — Idempotent Redpanda topic initialisation
# =============================================================================
# Run once after the broker is healthy (sovereign-redpanda-init service).
# Pattern: create the topic with the desired config; if it already exists
# (exit non-zero), fall through to alter-config so retention is always correct.
#
# Adding a new topic
# ------------------
# Copy the block below, give it a new topic name, and set retention.ms.
# The next `make prod` / `make dev` will pick it up automatically.
# =============================================================================

BROKERS="${REDPANDA_BROKERS:-sovereign-redpanda:9092}"

# --- orbital_raw ---
# High-volume orbital telemetry (~2 200 msg/s). Positions are recomputed on
# demand via SGP4, so 1-hour retention is enough for service-restart replay.
rpk topic create orbital_raw \
    --config retention.ms=3600000 \
    --brokers "$BROKERS" 2>/dev/null \
|| rpk topic alter-config orbital_raw \
    --set retention.ms=3600000 \
    --brokers "$BROKERS"

# --- clausal_chains_state_changes ---
# Narrative state-change events from the TAK clausalizer.
# 3-day retention supports multi-day correlation and replay after an outage.
rpk topic create clausal_chains_state_changes \
    --config retention.ms=259200000 \
    --brokers "$BROKERS" 2>/dev/null \
|| rpk topic alter-config clausal_chains_state_changes \
    --set retention.ms=259200000 \
    --brokers "$BROKERS"

echo "Redpanda topic initialisation complete."
