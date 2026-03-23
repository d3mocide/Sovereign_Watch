# 2026-03-22 Fix TacticalMap TypeScript Problems

## Issue
TypeScript diagnostics in TacticalMap blocked development with strict type errors around nullable geometry handling, mission area prop shape mismatch, callback parameter variance with useAnimationLoop, and unknown event payload handling.

## Solution
Aligned TacticalMap and useMapCamera typings to the actual runtime data model and adapter contracts, while preserving existing behavior.

## Changes
- Updated TacticalMap missionArea prop type to match the controller object passed from App (AOT state + handlers), replacing the incorrect MissionLocation shape.
- Added unknown-to-typed guards for infra pick callbacks used by useAnimationLoop.
- Hardened geometry extraction logic with nullable checks on geometry before branching by type.
- Normalized infra callsign assignment to string conversion for CoTEntity compatibility.
- Added safe numeric narrowing for gdeltToneThreshold before passing into useAnimationLoop.
- Added safe unknown event handling in map onLoad/onMove handlers with typed narrowing before property access.
- Fixed bounds extraction guards to ensure all bound methods exist before invocation.
- Updated useMapCamera mapRef option to accept nullable refs from useRef(null).
- Added a local typed atmosphere-capable map alias in useMapCamera to safely call setAtmosphere when present.

## Verification
- Ran: `cd frontend && pnpm run lint`
- Result: pass (exit code 0)
- Confirmed no file-level TypeScript problems in TacticalMap via Problems diagnostics.

## Benefits
- Restores TacticalMap type safety and editor diagnostics signal.
- Prevents runtime edge-case failures from undefined geometry/event payload fields.
- Keeps map interaction and mission controls behavior unchanged while making contracts explicit.
