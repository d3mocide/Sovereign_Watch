import requests
import time
import json
import os

IODA_URL = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts"
# Use UTC time
now = int(time.time())
from_time = now - (24 * 3600)

print(f"Querying IODA from {from_time} to {now} (UTC window)")
try:
    resp = requests.get(f"{IODA_URL}?from={from_time}&until={now}", timeout=30)
    resp.raise_for_status()
    data = resp.json().get("data", [])
    
    print(f"Total alerts in last 24h: {len(data)}")
    
    datasources = set()
    entity_types = set()
    countries = set()
    
    for alert in data:
        datasources.add(alert.get("datasource", ""))
        entity = alert.get("entity", {})
        entity_types.add(entity.get("type", ""))
        
        attrs = entity.get("attrs", {})
        cc = alert.get("country_code", attrs.get("country_code", ""))
        if not cc:
            # Try to infer from entity code if it's a country
            if entity.get("type") == "country":
                cc = entity.get("code")
        
        if cc:
            countries.add(cc)
            
    print(f"Unique datasources found: {datasources}")
    print(f"Unique entity types found: {entity_types}")
    print(f"Unique country codes found: {sorted(list(countries))}")
    
    # Check for Iran (IR) and Ethiopia (ET)
    targets = ['IR', 'ET']
    for t in targets:
        if t in countries:
            print(f"SUCCESS: {t} found in alerts data.")
        else:
            print(f"MISSING: {t} NOT found in alerts data.")
            
    # Sample one alert for Iran if it missed
    if 'IR' not in countries:
        # Check if there are any alerts for Iran in the last WEEK
        week_ago = now - (7 * 24 * 3600)
        print(f"Checking last 7 days for IR...")
        resp_week = requests.get(f"{IODA_URL}?from={week_ago}&until={now}", timeout=30)
        data_week = resp_week.json().get("data", [])
        ir_week = [a for a in data_week if a.get("country_code") == "IR" or a.get("entity", {}).get("code") == "IR"]
        print(f"Found {len(ir_week)} IR alerts in the last 7 days.")

except Exception as e:
    print(f"Error during IODA probe: {e}")
