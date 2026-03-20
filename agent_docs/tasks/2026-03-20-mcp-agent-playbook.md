# 2026-03-20 - Add MCP Agent Playbook

## Issue
The repository had MCP setup and readiness documentation, but it did not have a compact playbook telling agents which MCP capability to use first for common tasks. That gap increases token waste through overlapping searches, repeated file reads, and unnecessary graph queries.

## Solution
Added a dedicated MCP agent playbook with strict first-choice tools, fallback order, cache freshness rules, and anti-pattern guidance. Added short pointers from the always-loaded agent instructions so future sessions can discover the playbook without duplicating the full guidance in core prompt files.

## Changes
- Added `agent_docs/mcp-agent-playbook.md`:
  - Defines first-choice MCP tools by task category.
  - Adds a token-efficient decision tree.
  - Documents cache invalidation and rebuild rules.
  - Lists low-value overlapping tool patterns to avoid.
- Updated `AGENTS.md`:
  - Added a short pointer to the MCP playbook for token-efficient semantic analysis.
- Updated `CLAUDE.md`:
  - Added a short pointer to the MCP playbook and freshness rule reminder.

## Verification
- Reviewed the current `.mcp.json`, `CLAUDE.md`, and `Documentation/Development.md` MCP guidance to ensure the playbook matches the active wrapper-based setup.
- Verified the new guidance only adds references in always-loaded docs, keeping the detailed rules in a dedicated document to avoid prompt bloat.

## Benefits
- Lowers token usage by making tool choice deterministic.
- Reduces duplicated search passes across MCP, grep, and manual file reads.
- Improves refactor safety by standardizing when to use callers, dependents, impact, and breaking-change analysis.
- Keeps core agent instructions concise while preserving a richer reusable workflow document.