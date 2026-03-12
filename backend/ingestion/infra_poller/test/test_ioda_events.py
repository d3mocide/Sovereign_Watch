import requests
import time
import json
import os

IODA_EVENTS_URL = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events"
now = int(time.time())
from_time = now - (24 * 3600)

print(f"Querying IODA EVENTS from {from_time} to {now}")
try:
    # Try fetching events in last 24h
    params = {
        "from": from_time,
        "until": now,
        "active": "true" # Maybe this shows ongoing
    }
    resp = requests.get(IODA_EVENTS_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json().get("data", [])
    
    print(f"Total events found: {len(data)}")
    
    countries = set()
    for event in data:
        # Check structure
        entity = event.get("entity", {})
        cc = entity.get("code") if entity.get("type") == "country" else None
        if not cc:
            cc = event.get("country_code")
        if cc:
            countries.add(cc)
            
    print(f"Unique country codes in EVENTS: {sorted(list(countries))}")
    
    for t in ['IR', 'ET']:
        if t in countries:
            print(f"SUCCESS: {t} found in EVENTS data!")
        else:
            print(f"MISSING: {t} NOT found in EVENTS data.")

except Exception as e:
    print(f"Error during IODA EVENTS probe: {e}")
