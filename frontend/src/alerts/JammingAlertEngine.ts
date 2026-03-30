import type { JammingZone } from "../types";

/** Minimum confidence (0–1) to surface a jamming zone as an alert. */
export const JAMMING_ALERT_MIN_CONFIDENCE = 0.6;

/** Minimum milliseconds between repeat alerts for the same H3 zone. */
export const JAMMING_ALERT_RENOTIFY_MS = 15 * 60 * 1000;

/**
 * Assessment types that warrant operator notification.
 * `space_weather` is already surfaced by the Space Weather widget.
 * `equipment` affects a single aircraft and does not warrant a tactical alert.
 */
const ALERTABLE_ASSESSMENTS = new Set<JammingZone["assessment"]>([
  "jamming",
  "mixed",
]);

/**
 * Returns a stable key identifying this jamming zone for deduplication,
 * or an empty string if the zone should not generate an alert.
 */
export function getJammingAlertKey(zone: JammingZone): string {
  if (!ALERTABLE_ASSESSMENTS.has(zone.assessment)) return "";
  if (zone.confidence < JAMMING_ALERT_MIN_CONFIDENCE) return "";
  return `jamming:${zone.h3_index}`;
}

/** Builds a human-readable alert message for a detected jamming zone. */
export function buildJammingAlertMessage(zone: JammingZone): string {
  const pct = Math.round(zone.confidence * 100);
  const aircraft = zone.affected_count;
  if (zone.assessment === "jamming") {
    return `JAMMING: GPS degradation zone active — ${aircraft} aircraft affected (${pct}% confidence)`;
  }
  return `RF ALERT: Mixed GPS integrity anomaly — ${aircraft} aircraft affected (${pct}% confidence)`;
}
