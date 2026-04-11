type UnknownRecord = Record<string, unknown>;

export interface ClausalSpaceWeatherPresentation {
  scopeLabel: string;
  linkageReasonLabel: string;
  thresholdLabel: string | null;
  statusLabel: string;
  notes: string | null;
  isAdmitted: boolean;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function humanizeIdentifier(value: string | null): string {
  if (!value) {
    return "Unknown";
  }
  return value
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getClausalSpaceWeatherPresentation(
  detail: Record<string, unknown>,
): ClausalSpaceWeatherPresentation | null {
  const contextScope = asRecord(detail.context_scope);
  const spaceWeatherScope = asRecord(contextScope?.space_weather);
  const spaceWeatherContext = asRecord(detail.space_weather_context);

  if (!spaceWeatherScope && !spaceWeatherContext) {
    return null;
  }

  const scopeLabel = humanizeIdentifier(asString(spaceWeatherScope?.scope));
  const linkageReasonLabel = humanizeIdentifier(
    asString(spaceWeatherScope?.linkage_reason),
  );
  const notes = asString(spaceWeatherScope?.notes);
  const noteParts = notes?.split(": ") ?? null;
  const thresholdLabel =
    asString(spaceWeatherContext?.threshold) ??
    (notes?.includes("kp>=") && noteParts ? noteParts[noteParts.length - 1] ?? null : null);
  const thresholdPassed = spaceWeatherContext?.threshold_passed === true;
  const kpIndex = asNumber(spaceWeatherContext?.kp_index);
  const kpCategory = asString(spaceWeatherContext?.kp_category);

  let statusLabel = "Below threshold; external-driver context omitted";
  if (thresholdPassed && kpIndex !== null) {
    statusLabel = kpCategory
      ? `Admitted external driver: Kp ${kpIndex.toFixed(1)} (${kpCategory})`
      : `Admitted external driver: Kp ${kpIndex.toFixed(1)}`;
  }

  return {
    scopeLabel,
    linkageReasonLabel,
    thresholdLabel,
    statusLabel,
    notes,
    isAdmitted: thresholdPassed,
  };
}