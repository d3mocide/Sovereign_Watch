import requests
import time
import json
import os

IODA_SUMMARY_URL = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/summary"
now = int(time.time())
from_time = now - (24 * 3600)

try:
    params = {
        "from": from_time,
        "until": now,
        "entityType": "country"
    }
    resp = requests.get(IODA_SUMMARY_URL, params=params, timeout=30)
    resp.raise_for_status()
    raw_data = resp.json()
    data = raw_data.get("data", [])
    
    if data:
        print("FULL ENTRY SAMPLE:")
        print(json.dumps(data[0], indent=2))
        
        # Also check keys across all entries
        all_keys = set()
        for d in data:
            if isinstance(d, dict):
                all_keys.update(d.keys())
        print("Union of all keys in data:", all_keys)

except Exception as e:
    print(f"Error: {e}")
