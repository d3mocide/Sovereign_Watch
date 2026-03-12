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
    data = resp.json().get("data", [])
    
    # Check if data is a list or dict
    if isinstance(data, dict):
        data = data.get("outages", [])
        
    print(f"Total summary entries: {len(data)}")
    
    countries = []
    for entry in data:
        # Structure might be [ [cc, score], ... ] or list of dicts
        if isinstance(entry, list):
            countries.append(entry[0])
        elif isinstance(entry, dict):
            countries.append(entry.get("code") or entry.get("country_code"))
            
    print(f"Country codes in SUMMARY: {sorted(countries)}")
    
    for t in ['IR', 'ET']:
        if t in countries:
            print(f"SUCCESS: {t} found in SUMMARY data!")
        else:
            found_any = any(t.lower() in str(c).lower() for c in countries)
            if found_any:
                 print(f"SUCCESS (fuzzy): {t} found in SUMMARY data!")
            else:
                 print(f"MISSING: {t} NOT found in SUMMARY data.")

except Exception as e:
    print(f"Error during IODA SUMMARY probe: {e}")
