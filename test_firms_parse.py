import sys
import os
sys.path.insert(0, os.path.abspath("backend/api"))
import routers.firms as firms_router

csv_body = """latitude,longitude,bright_ti4,frp,confidence,satellite,acq_date,acq_time,daynight\n45.5,-122.6,330.1,12.4,h,SNPP,2026-04-14,0402,N\n46.1,-123.0,310.0,0.1,l,SNPP,2026-04-14,0404,D\n"""

rows = firms_router._parse_firms_csv_to_rows(
    csv_body,
    source="VIIRS_SNPP_NRT",
    hours_back=72,
    min_frp=0.5,
    confidence="",
    limit=2000,
)
print("Rows len:", len(rows))
for row in rows:
    print(row)
