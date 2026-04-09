# Selection and Sidebar Documentation Pass

## Issue

Even after the UI guide's layer and mode coverage improved, the interaction model was still
under-explained. Hover tooltips, click selection, and the right sidebar's type-specific detail
views were visible in the product but only partially documented.

## Solution

Expanded the UI guide to describe tooltip behavior, dynamic selection handling, and the main
detail-panel patterns used for aircraft, vessels, satellites, clusters, clausal chains, and
infrastructure or hazard objects.

## Changes

- Updated `Documentation/UI_Guide.md` with a tooltip-behavior section under Tactical Map
- Expanded the right-sidebar section to cover satellite, cluster, clausal, and
  infrastructure or hazard detail views
- Clarified shared selection behavior and common follow-on actions such as `CENTER VIEW`

## Verification

Checked editor diagnostics for the modified Markdown files; no errors were reported.

## Benefits

- Operators have a clearer mental model of what hover versus click does
- The sidebar is documented as a dynamic inspector instead of a single generic panel
- More of the shipped interaction surface is now discoverable without reading the code