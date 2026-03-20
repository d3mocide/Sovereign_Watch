# Hide Track Log for AIS Entries

## Issue
The Track Log button was being rendered in the right sidebar for maritime vessels (AIS entries), despite AIS platforms not utilizing that specific log functionally. The user requested it be hidden.

## Solution
Wrapped the generic `TRACK_LOG` action button with an explicit `{!isShip && ( ... )}` condition so that it does not render when an AIS entity is selected.

## Changes
- `frontend/src/components/layouts/SidebarRight.tsx`:
  - Enclosed the Track Log action button in an `{!isShip && (...)}` block inside the bottom action bar.

## Verification
- Verified statically that `isShip` evaluates to true for entities containing an 'S' in their type string, causing the block to be omitted from the React tree. HMR will reload this to verify locally. 

## Benefits
- Reduced UI clutter and disabled non-functional actions for maritime targets.
