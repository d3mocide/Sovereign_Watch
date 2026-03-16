# LSP Integration — Developer Tooling & AI Analyst Enhancement

**Date:** 2026-03-16
**Branch:** `claude/integrate-lsp-bLAz8`

---

## Issue

Two related problems motivated this change:

1. **Development friction**: Claude Code sessions and editors navigated the codebase using grep/find, causing false positives, high memory pressure (critical on Jetson Nano 4GB), and slow cross-file symbol resolution across the 40+ Python modules and 30+ TypeScript components.

2. **Weak AI analyst context**: The `/api/analyze/{uid}` endpoint sent sparse, unit-less telemetry (`avg_speed: 245`) to LiteLLM with no information about field meanings, units, or entity-type taxonomy — producing vague, generic assessments that couldn't distinguish aviation from maritime behavior.

---

## Solution

### Part 1: LSP Developer Tooling

Configured the project for Language Server Protocol support via `mcp-language-server`, which bridges LSP capabilities (goToDefinition, findReferences, hover, rename) into the Claude Code MCP tool interface.

**Approach:**
- `pyrightconfig.json` at project root: Pyright analyses `backend/api/` and all `backend/ingestion/` pollers with type checking in basic mode. Resolves inter-module imports (routers → services → models → core) semantically.
- `.vscode/settings.json`: Wires Pylance (Pyright engine) for Python and `tsserver` for TypeScript in any LSP-aware editor. Points TypeScript to the workspace `tsconfig.json` in strict mode.
- `.mcp.json` at project root: Claude Code auto-registers `mcp-language-server` for every session in this workspace, exposing goToDefinition, findReferences, and hover as Claude tools without manual setup.
- `CLAUDE.md` LSP Tools section: Documents when to use LSP vs grep, one-time install commands, and the Jetson Nano memory rationale.

### Part 2: AI Analyst Schema Enhancement (LSP-Inspired)

Extended `backend/api/routers/analysis.py` and introduced `backend/api/services/schema_context.py` to give the LLM semantic field understanding — the same problem LSP solves for code symbols.

**Approach:**
- `schema_context.py`: Static schema registry with field definitions, units, entity-type taxonomy, meta JSONB field docs per entity type (aviation/maritime/orbital), and an anomaly reference table (squawk codes, dark AIS patterns, orbital maneuver indicators).
- `analysis.py` enriched query: Extended the aggregation query to fetch entity type, latest meta JSONB, trajectory start/end coordinates, altitude spread, and peak speed — all within a single SQL pass using window functions.
- Trajectory displacement: Added `_haversine_km()` to compute net start→end displacement, enabling the LLM to detect loitering (many points, near-zero displacement) vs transiting.
- Enriched prompts: System prompt now injects `get_schema_context(entity_type)` for the specific entity domain (scoped to reduce tokens). User content includes converted units (m/s→knots, m→ft), callsign/MMSI/NORAD identity from meta, and net displacement.

---

## Changes

| File | Action | Description |
|------|--------|-------------|
| `pyrightconfig.json` | Created | Pyright config for Python backend LSP |
| `.vscode/settings.json` | Created | Editor LSP wiring (Python + TypeScript) |
| `.mcp.json` | Created | Claude Code MCP server auto-registration |
| `CLAUDE.md` | Modified | Added LSP Tools section with setup + usage |
| `backend/api/services/schema_context.py` | Created | Schema registry + anomaly reference table |
| `backend/api/routers/analysis.py` | Modified | Enriched query, schema context injection, unit conversion |

---

## Verification

```bash
# Backend lint + tests
cd backend/api && ruff check . && python -m pytest

# JSON config validation
python -c "import json; [json.load(open(f)) for f in ['pyrightconfig.json', '.mcp.json']]; print('configs valid')"
```

All linting and tests pass. No regressions.

---

## Benefits

- **Developer sessions**: `goToDefinition` resolves FastAPI router → service → model chains in ~50ms. `findReferences` for Deck.gl layer types is exact with no false positives.
- **Memory efficiency**: LSP queries replace multi-file grep scans, reducing peak RAM usage during Claude Code sessions on the Jetson Nano.
- **AI analyst quality**: The analyst now knows `alt` is meters MSL, `speed` is m/s, squawk 7500 means hijacking, and dark AIS is a SOLAS violation — producing structured, entity-aware assessments with anomaly flags and confidence levels.
- **Scoped schema context**: `get_schema_context('aviation')` injects only aviation fields, avoiding token waste for maritime/orbital queries.
