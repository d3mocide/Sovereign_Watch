import requests
import time
import json
import os

IODA_EVENTS_URL = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events"
now = int(time.time())
from_time = now - (24 * 3600)

print(f"Querying IODA EVENTS from {from_time} to {now}")
try:
    # Remove 'active' if it caused 500
    params = {
        "from": from_time,
        "until": now,
        "entityType": "country"
    }
    resp = requests.get(IODA_EVENTS_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json().get("data", [])
    
    print(f"Total events found: {len(data)}")
    if data:
        print("EVENT SAMPLE:")
        print(json.dumps(data[0], indent=2))
        
        # Check for IR
        ir_events = [e for e in data if e.get("entity", {}).get("code") == "IR"]
        print(f"Found {len(ir_events)} IR events.")
        if ir_events:
             print("IR EVENT SAMPLE:")
             print(json.dumps(ir_events[0], indent=2))

except Exception as e:
    print(f"Error during IODA EVENTS probe: {e}")
