/** Minimum confidence (0–1) to surface a holding pattern as an alert. */
export const HOLD_ALERT_MIN_CONFIDENCE = 0.7;

/** Minimum completed turns to surface an alert. */
export const HOLD_ALERT_MIN_TURNS = 1.0;

/** Minimum pattern duration in seconds before alerting. */
export const HOLD_ALERT_MIN_DURATION_SEC = 120;

/** Turn count at which a hold escalates from "new" to "alert" severity. */
export const HOLD_CRITICAL_TURNS = 5.0;

/** Minimum milliseconds between repeat alerts for the same aircraft. */
export const HOLD_ALERT_RENOTIFY_MS = 20 * 60 * 1000;

/** Properties extracted from a GeoJSON holding pattern feature. */
export interface HoldingPatternProps {
  hex_id?: string;
  callsign?: string;
  altitude?: number | string;
  confidence?: number | string;
  turns_completed?: number | string;
  pattern_duration_sec?: number | string;
}

/**
 * Returns a stable key identifying this aircraft's holding pattern for deduplication,
 * or an empty string if the feature has no usable identifier.
 */
export function getHoldingAlertKey(props: HoldingPatternProps): string {
  return String(props.hex_id || "").toLowerCase();
}

/**
 * Returns true if this holding pattern does NOT meet the minimum thresholds
 * required to surface an alert (suppresses low-confidence or brief patterns).
 */
export function shouldSuppressHoldingAlert(props: HoldingPatternProps): boolean {
  const confidence = Number(props.confidence ?? 0);
  const turnsCompleted = Number(props.turns_completed ?? 0);
  const durationSec = Number(props.pattern_duration_sec ?? 0);
  return (
    confidence < HOLD_ALERT_MIN_CONFIDENCE ||
    turnsCompleted < HOLD_ALERT_MIN_TURNS ||
    durationSec < HOLD_ALERT_MIN_DURATION_SEC
  );
}

/** Returns true if the number of completed turns meets the critical escalation threshold. */
export function isHoldingPatternCritical(props: HoldingPatternProps): boolean {
  return Number(props.turns_completed ?? 0) >= HOLD_CRITICAL_TURNS;
}

/** Builds a human-readable alert message for a detected holding pattern. */
export function buildHoldingAlertMessage(
  props: HoldingPatternProps,
  isCritical: boolean,
): string {
  const label = props.callsign || props.hex_id || "UNKNOWN";
  const alt = props.altitude ? ` (${props.altitude}ft)` : "";
  return `${isCritical ? "ALERT" : "HOLD"}: Active holding pattern detected — ${label}${alt}`;
}
