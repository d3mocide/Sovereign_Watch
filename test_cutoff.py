from datetime import datetime, UTC, timedelta

now_utc = datetime.now(UTC)
cutoff = now_utc - timedelta(hours=72)
acq_dt = datetime.strptime("2026-04-14", "%Y-%m-%d").replace(
                    hour=int("04"),
                    minute=int("02"),
                    tzinfo=UTC,
                )

print(f"now: {now_utc}, cutoff: {cutoff}, acq: {acq_dt}")
print(acq_dt < cutoff)
