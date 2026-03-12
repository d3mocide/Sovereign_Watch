import requests
import time
import json
import os

IODA_SUMMARY_URL = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/summary"
now = int(time.time())
from_time = now - (24 * 3600)

print(f"Querying IODA SUMMARY from {from_time} to {now}")
try:
    params = {
        "from": from_time,
        "until": now,
        "entityType": "country"
    }
    resp = requests.get(IODA_SUMMARY_URL, params=params, timeout=30)
    resp.raise_for_status()
    raw_data = resp.json()
    
    print("Raw Data JSON keys:", raw_data.keys())
    data = raw_data.get("data", [])
    
    # Let's see the first few entries to understand the schema
    print("Data Sample:", json.dumps(data[:5], indent=2))
    
    countries = []
    if isinstance(data, list):
         for entry in data:
             if isinstance(entry, dict):
                 countries.append(entry.get("code") or entry.get("country_code"))
             elif isinstance(entry, list) and len(entry) > 0:
                 countries.append(entry[0])
    
    print(f"Extracted country codes: {countries}")
    
    for t in ['IR', 'ET']:
        if t in countries:
            print(f"SUCCESS: {t} found in SUMMARY data!")
        else:
            print(f"MISSING: {t} NOT found in SUMMARY data.")

except Exception as e:
    print(f"Error during IODA SUMMARY probe: {e}")
