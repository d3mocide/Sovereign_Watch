#!/usr/bin/env python3
"""Sample Linux device writes into daily JSONL files; no external dependencies."""
import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path


def counters(device):
    fields = Path(f"/sys/class/block/{device}/stat").read_text().split()
    return int(fields[6]) * 512


def projection(written, elapsed, tbw=None, lifetime_tb=0):
    daily = written / elapsed * 86400 / 1e9
    annual = daily * 365 / 1000
    return {"GB_per_day": daily, "TB_per_year": annual,
            "years_to_rated_TBW": max(0, tbw - lifetime_tb) / annual
            if tbw is not None and annual > 0 else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", default="sda")
    parser.add_argument("--interval", type=float, default=60)
    parser.add_argument("--output", type=Path, default=Path("/tmp/sovereign-disk-writes"))
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--tbw", type=float, help="Physical drive rated host-write TBW")
    parser.add_argument("--lifetime-tb", type=float, default=0,
                        help="Already-written TB from physical drive SMART")
    parser.add_argument("--samples", type=int, default=0, help="0 runs continuously")
    args = parser.parse_args()
    if args.interval <= 0 or args.days < 1 or args.samples < 0:
        parser.error("interval/days must be positive; samples must be nonnegative")
    args.output.mkdir(parents=True, exist_ok=True)
    previous = counters(args.device)
    start = last = time.monotonic()
    total = count = 0
    while args.samples == 0 or count < args.samples:
        time.sleep(args.interval)
        now = time.monotonic()
        current = counters(args.device)
        delta = max(0, current - previous)
        total += delta
        stamp = datetime.now(timezone.utc)
        row = {"time": stamp.isoformat(), "device": args.device,
               "interval_seconds": now - last, "bytes_written": delta,
               "counter_reset": current < previous,
               "session_bytes_written": total, "session_seconds": now - start,
               **projection(total, now - start, args.tbw, args.lifetime_tb)}
        with (args.output / f"{stamp:%Y-%m-%d}.jsonl").open("a") as stream:
            stream.write(json.dumps(row) + "\n")
        print(json.dumps(row), flush=True)
        for path in args.output.glob("????-??-??.jsonl"):
            if stamp.timestamp() - path.stat().st_mtime > args.days * 86400:
                path.unlink()
        previous, last = current, now
        count += 1


if __name__ == "__main__":
    main()
