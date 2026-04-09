# UI Layer Documentation Expansion

## Issue

The UI guide still under-documented several map overlays that are visible in the live layer
controls. In particular, the analysis stack lacked operator guidance for `RISK GRID` and
`TRAJECTORY CLUSTERS`, and some infrastructure overlays were listed without explaining what
they represent or when to use them.

## Solution

Expanded the UI guide's layer-control section to describe the analysis overlays and the most
important infrastructure context layers in operator-facing terms.

## Changes

- Updated `Documentation/UI_Guide.md` layer controls to include `RISK GRID` and
  `TRAJECTORY CLUSTERS`
- Added new UI guide sections for the risk grid and trajectory cluster overlays
- Expanded infrastructure layer descriptions to cover landing stations and FCC towers in
  addition to repeaters, cables, and outages

## Verification

Checked editor diagnostics for the modified Markdown files; no errors were reported.

## Benefits

- Operators can understand what the analysis overlays mean before turning them on
- The UI guide now better matches the actual layer-control surface exposed in the app
- New and infrequent users have clearer guidance on which overlays are entity-focused versus
  context-focused