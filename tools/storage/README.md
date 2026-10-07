# Disk writes and SSD endurance

Run on the Linux host/VM, choosing the whole device from `lsblk` (do not add
partition counters to whole-device counters):

```sh
python3 tools/storage/disk-writes.py --device sda --interval 60 --output /var/tmp/sovereign-disk-writes
```

Daily JSONL logs retain 30 days by default. The first sample establishes a
baseline. Session averages restart when the collector restarts. Compare at least
24–72 hours of steady operation with an idle baseline; builds, downloads, swap,
other software, and backups also contribute. This measures host block writes,
not database size growth or NAND writes. Retention reduces stored capacity but
still requires writing incoming data; compression/compaction can add writes.

For an unattended collector, run the command under a user systemd service with
`Restart=on-failure`; avoid logging every sample into journald by redirecting
stdout to `/dev/null`. Keep the JSONL output on persistent storage.

Annual decimal TB = observed bytes / elapsed seconds × 86400 × 365 / 10^12.
Pass `--tbw 600 --lifetime-tb 50` only when these values are known for the physical
SSD. Estimated years to the rated host-write budget = (TBW − lifetime host TB) /
annual host TB. This is a workload projection, not a failure-date prediction.
Do not multiply host writes by guessed NAND write amplification when comparing
with a manufacturer host-write TBW rating.

This deployment exposes a VMware virtual disk. Guest counters measure this VM's
I/O; the hypervisor's physical drive also handles other guests, snapshots, and
storage transformations. Obtain its model, rated TBW, lifetime host writes,
percentage-used/wear indicator, and errors from hypervisor SMART/NVMe telemetry.
A guest cannot establish the physical drive's remaining wear budget.

References: [Linux block counters](https://docs.kernel.org/block/stat.html),
[SSD endurance definitions](https://image-us.samsung.com/SamsungUS/b2b/resource/2016/05/31/WHP-SSD-SSDSMARTATTRIBUTES-APR16J.pdf).

The included `sovereign-disk-writes.service` can be installed under
`~/.config/systemd/user/` and enabled with
`systemctl --user enable --now sovereign-disk-writes.service` after a daemon reload.
It uses `/var/tmp/sovereign-disk-writes` and emits only errors to journald.
User lingering must be enabled by an administrator for collection after logout.

Run `bash tools/storage/live-audit.sh` after startup for volume references,
container restarts/log settings, database policy jobs/chunk ages, and Kafka
settings. It is read-only. Older chunks can overlap the retention cutoff;
inspect job success and chunk boundaries together. Check Kafka group lag before
reducing budgets further. With one partition per topic, configured byte budgets
sum to 6.25 GiB plus active segments/overhead; existing extra partitions multiply
these budgets. All topic settings take effect when the init service runs again.
Logging settings apply only when containers are created/recreated.

PostgreSQL query attribution is enabled by `pg_stat_statements` (migration V007).
After representative usage, run:

```sh
docker exec -i sovereign-timescaledb sh -c 'psql -U postgres -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < tools/storage/query-profile.sql
```

The report shows normalized queries, total/mean execution time, calls, rows,
shared block reads/hits, and temporary writes. Statistics are cumulative since
reset; startup/recovery traffic is not a steady-state baseline. This extension
requires the Compose preload setting and a database restart when first enabled.
