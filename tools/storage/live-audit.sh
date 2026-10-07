#!/bin/bash
# Read-only runtime audit. Run after the persistence services are healthy.
set -euo pipefail
python3 - <<'PY'
import json, subprocess
volumes = subprocess.check_output(['docker','volume','ls','-q']).decode().splitlines()
ids = subprocess.check_output(['docker','ps','-aq']).decode().splitlines()
containers = json.loads(subprocess.check_output(['docker','inspect',*ids])) if ids else []
used = {}
for container in containers:
    for mount in container['Mounts']:
        if mount['Type'] == 'volume':
            used.setdefault(mount['Name'], []).append(container['Name'].lstrip('/'))
print(f'{len(used)} of {len(volumes)} volumes referenced by existing containers')
for volume, names in sorted(used.items()):
    print(volume, ', '.join(names))
print('Unreferenced volumes are not automatically safe to delete.')
PY
docker inspect sovereign-timescaledb sovereign-redpanda sovereign-frontend \
    --format '{{.Name}} status={{.State.Status}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} logging={{json .HostConfig.LogConfig}}'
docker exec -i sovereign-timescaledb sh -c 'psql -U postgres -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
SELECT * FROM schema_migrations ORDER BY version;
SELECT j.job_id,j.hypertable_name,j.proc_name,j.config,s.last_run_status,
       s.last_successful_finish,s.total_failures,s.next_start
FROM timescaledb_information.jobs j
LEFT JOIN timescaledb_information.job_stats s USING(job_id)
WHERE j.proc_name IN ('policy_retention','policy_compression')
ORDER BY j.hypertable_name,j.proc_name;
SELECT hypertable_name,pg_size_pretty(hypertable_size(format('%I.%I',hypertable_schema,hypertable_name)::regclass)) AS size
FROM timescaledb_information.hypertables ORDER BY hypertable_size(format('%I.%I',hypertable_schema,hypertable_name)::regclass) DESC;
SELECT hypertable_name,min(range_start) AS oldest_chunk,max(range_end) AS newest_chunk,
       count(*) AS chunks,count(*) FILTER(WHERE is_compressed) AS compressed
FROM timescaledb_information.chunks GROUP BY hypertable_name ORDER BY hypertable_name;
SQL
docker exec sovereign-redpanda rpk topic list
for topic in orbital_raw adsb_raw ais_raw rf_raw gdelt_raw satnogs_transmitters satnogs_observations clausal_chains_state_changes; do
    docker exec sovereign-redpanda rpk topic describe "$topic" -c
 done
docker exec sovereign-redpanda rpk group list
