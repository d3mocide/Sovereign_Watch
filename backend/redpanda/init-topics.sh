#!/bin/bash
# Idempotent replay budgets. Limits apply PER PARTITION, not per topic.
# Deletion is asynchronous and segment-based; these are not hard disk quotas.
set -euo pipefail
BROKERS="${REDPANDA_BROKERS:-sovereign-redpanda:9092}"
configure_topic() {
    local topic="$1" age="$2" bytes="$3"
    if ! rpk topic list --brokers "$BROKERS" | awk 'NR > 1 {print $1}' | grep -Fxq "$topic"; then
        rpk topic create "$topic" --partitions 1 --replicas 1 --brokers "$BROKERS"
    fi
    rpk topic alter-config "$topic" --brokers "$BROKERS" \
        --set cleanup.policy=delete --set "retention.ms=$age" \
        --set "retention.bytes=$bytes" --set segment.bytes=134217728 \
        --set segment.ms=3600000
}
# One hour orbital replay; other raw feeds retain up to three days.
# Byte caps may shorten these windows during heavy ingest. Watch consumer lag.
configure_topic orbital_raw 3600000 2147483648
configure_topic adsb_raw 259200000 1073741824
configure_topic ais_raw 259200000 1073741824
configure_topic rf_raw 259200000 268435456
configure_topic gdelt_raw 259200000 536870912
configure_topic satnogs_transmitters 259200000 268435456
configure_topic satnogs_observations 259200000 268435456
configure_topic clausal_chains_state_changes 259200000 1073741824
echo "Redpanda topic initialization complete."
