# Agent Consistency & Model Alignment Report

> **Date:** 2026-02-20
> **Scope:** `.agent/rules/GEMINI.md` + all 19 agent files in `.agent/agents/`
> **Branch:** `claude/review-gemini-models-T5n5w`

---

## Executive Summary

After reviewing `GEMINI.md` and all agent definition files, **21 issues** were identified across four categories: critical structural bugs, cross-file inconsistencies, rule contradictions that drive behavioral drift, and token-efficiency opportunities. The most impactful issues are a **phantom agent reference**, a **missing agent file**, and **redundant inline rules** that expand context windows needlessly on every request.

---

## Issue Index

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| 1 | 🔴 Critical | Missing fields | `debugger` agent missing `model:` and `tools:` frontmatter |
| 2 | 🔴 Critical | Phantom reference | `api-designer` referenced in orchestrator does not exist |
| 3 | 🔴 Critical | Missing file | `game-developer` agent referenced but file absent |
| 4 | 🔴 Critical | Registry mismatch | `product-owner` agent file exists but not in ARCHITECTURE.md |
| 5 | 🔴 Critical | Missing skill | `refactoring-patterns` used by `code-archaeologist`, not in registry |
| 6 | 🟠 High | Wrong path | GEMINI.md TIER 2 references incorrect agent file paths |
| 7 | 🟠 High | Wrong path | `security-auditor` uses wrong script path |
| 8 | 🟠 High | Contradiction | Plan file storage location conflicts across three files |
| 9 | 🟠 High | Drift | Orchestrator Phase 0 contradicts GEMINI.md Socratic Gate |
| 10 | 🟠 High | Overlap | `product-manager` and `product-owner` are near-identical |
| 11 | 🟡 Medium | Count mismatch | Script count discrepancy: GEMINI.md says 12, ARCHITECTURE.md says 18 |
| 12 | 🟡 Medium | Token waste | Socratic Gate duplicated verbatim in every agent |
| 13 | 🟡 Medium | Token waste | `mobile-developer` mandates 9 skill file reads before any task |
| 14 | 🟡 Medium | Token waste | Quality control loop duplicated across 7+ agents |
| 15 | 🟡 Medium | Token waste | `frontend-specialist` duplicates Deep Design Thinking section |
| 16 | 🟡 Medium | Inconsistency | Orchestrator's agent table differs from ARCHITECTURE.md |
| 17 | 🟡 Medium | Inconsistency | GEMINI.md Quick Reference lists `game-developer`, not `product-owner` |
| 18 | 🟢 Low | Ambiguity | Request Classifier boundary between SIMPLE vs COMPLEX CODE is vague |
| 19 | 🟢 Low | Ambiguity | GEMINI.md has two separate "Socratic Gate" sections at different TIER levels |
| 20 | 🟢 Low | Inconsistency | `seo-specialist` duplicates Core Web Vitals table already in `performance-optimizer` |
| 21 | 🟢 Low | Inconsistency | `project-planner` Step 3 references `@[skills/brainstorming]` but Step 6 uses inline rule |

---

## Detailed Findings

---

### Issue 1 — `debugger` Agent Missing `model:` and `tools:` Frontmatter
**Severity:** 🔴 Critical
**File:** `.agent/agents/debugger.md`

**Current frontmatter:**
```yaml
---
name: debugger
description: Expert in systematic debugging...
skills: clean-code, systematic-debugging
---
```

**All other agents have:**
```yaml
---
name: <name>
description: ...
tools: Read, Grep, Glob, Bash, Edit, Write
model: inherit
skills: ...
---
```

`debugger` is the only agent without `model:` or `tools:`. Without `tools:`, the runtime cannot know what operations are permitted. Without `model:`, it cannot inherit correctly. This could result in undefined behavior depending on the framework's fallback handling.

**Fix:** Add `tools: Read, Grep, Glob, Bash, Edit, Write` and `model: inherit` to the frontmatter.

---

### Issue 2 — Phantom `api-designer` Agent in Orchestrator
**Severity:** 🔴 Critical
**File:** `.agent/agents/orchestrator.md` (line ~115)

The orchestrator's "Available Agents" table lists `api-designer` as a routeable agent:

```
| `api-designer` | API Design | REST, GraphQL, OpenAPI |
```

And it appears in the Agent Boundary Enforcement table:
```
| `api-designer` | API specs, OpenAPI, GraphQL schema | ❌ UI code |
```

**No `api-designer.md` file exists** in `.agent/agents/`. ARCHITECTURE.md does not list it either. When the orchestrator attempts to invoke this agent for API design tasks, it will fail silently or fall through to a generic handler, causing untracked, unspecialized work.

**Fix:** Either create `.agent/agents/api-designer.md` or remove `api-designer` from the orchestrator's tables and route API design to `backend-specialist`.

---

### Issue 3 — `game-developer` Referenced But File Absent
**Severity:** 🔴 Critical
**Files:** `GEMINI.md` (Quick Reference), `ARCHITECTURE.md` (Agent table), `orchestrator.md` (Available Agents)

Three files reference `game-developer`:
- `GEMINI.md` lists it in the "Masters" quick reference
- `ARCHITECTURE.md` lists it in the agents table with skills `game-development`
- `orchestrator.md` lists it in Available Agents

**No `game-developer.md` exists in `.agent/agents/`.**

Meanwhile, `.agent/agents/product-owner.md` exists but is registered nowhere (see Issue 4). It appears `product-owner` was added and `game-developer` was removed, but neither the ARCHITECTURE.md nor GEMINI.md nor orchestrator were updated.

**Fix:** Add `game-developer.md` if the skill is needed, OR remove all three references and add `product-owner` to the registries.

---

### Issue 4 — `product-owner` Exists But Is Not Registered
**Severity:** 🔴 Critical
**Files:** `.agent/agents/product-owner.md` (exists), `ARCHITECTURE.md` (absent)

`product-owner.md` is a fully-formed agent with frontmatter, skills, and detailed content. However:
- It is absent from the ARCHITECTURE.md agents table
- It is absent from the GEMINI.md Quick Reference
- The orchestrator does not list it as a routable agent

The result is that this agent can never be auto-selected or invoked by the orchestrator, and its behavior is entirely undiscoverable from the routing documents. Token budget is spent loading a dead agent.

**Fix:** Add `product-owner` to ARCHITECTURE.md, GEMINI.md Quick Reference, and orchestrator's Available Agents table. Simultaneously resolve duplication with `product-manager` (Issue 10).

---

### Issue 5 — `refactoring-patterns` Skill Not in Registry
**Severity:** 🔴 Critical
**File:** `.agent/agents/code-archaeologist.md` frontmatter

```yaml
skills: clean-code, refactoring-patterns, code-review-checklist
```

`refactoring-patterns` is not listed in ARCHITECTURE.md's skills table (36 skills listed). If the skill loader resolves skills by directory name, it will fail to find `.agent/skills/refactoring-patterns/`. If it fails silently, the agent operates with degraded capability without alerting anyone.

**Fix:** Either create the `refactoring-patterns` skill directory with a `SKILL.md`, or remove it from the agent's frontmatter and map its intent to `clean-code` or `code-review-checklist`.

---

### Issue 6 — Wrong Agent File Paths in GEMINI.md TIER 2
**Severity:** 🟠 High
**File:** `.agent/rules/GEMINI.md` (TIER 2 section)

```markdown
| Web UI/UX    | `.agent/frontend-specialist.md` |
| Mobile UI/UX | `.agent/mobile-developer.md`    |
```

**Actual paths:**
```
.agent/agents/frontend-specialist.md
.agent/agents/mobile-developer.md
```

The `/agents/` subdirectory is missing from both paths. Any agent or human following these links will not find the file.

**Fix:** Update to `.agent/agents/frontend-specialist.md` and `.agent/agents/mobile-developer.md`.

---

### Issue 7 — Wrong Script Path in `security-auditor`
**Severity:** 🟠 High
**File:** `.agent/agents/security-auditor.md` (Validation section)

```bash
python scripts/security_scan.py <project_path> --output summary
```

**Correct path used everywhere else (GEMINI.md, project-planner.md):**
```bash
python .agent/skills/vulnerability-scanner/scripts/security_scan.py .
```

The relative path `scripts/security_scan.py` resolves from the project root and does not exist. The script will error on invocation. This means the security-auditor's mandatory post-review validation step silently fails.

**Fix:** Update to `python .agent/skills/vulnerability-scanner/scripts/security_scan.py <project_path> --output summary`.

---

### Issue 8 — Plan File Storage Location Conflicts in Three Places
**Severity:** 🟠 High
**Files:** `project-planner.md`, `orchestrator.md`, `GEMINI.md`

Three different locations are specified for plan files:

| Source | Stated Location |
|--------|----------------|
| `project-planner.md` (main rule) | `./{task-slug}.md` (project root) |
| `project-planner.md` (Best Practices row #8) | `docs/PLAN-{task-slug}.md` |
| `orchestrator.md` (Step 0 and Checkpoint) | `docs/PLAN.md` |

This creates three incompatible conventions. The orchestrator checks `Read docs/PLAN.md` and stops if not found, but project-planner writes to the project root. The orchestrator will always trigger its "PLAN.md NOT FOUND" stop condition even when a valid plan exists at root.

**Fix:** Standardize on one location. Recommended: `./{task-slug}.md` at project root (already the primary instruction), and update orchestrator's Step 0 to use `Read ./{task-slug}.md`. Remove the contradictory row #8 in project-planner Best Practices.

---

### Issue 9 — Orchestrator Phase 0 Contradicts GEMINI.md Socratic Gate
**Severity:** 🟠 High
**Files:** `GEMINI.md` (TIER 1 Socratic Gate), `orchestrator.md` (Phase 0)

**GEMINI.md Socratic Gate (TIER 1 — binding on all):**
> MANDATORY: Every user request must pass through the Socratic Gate before ANY tool use.
> New Feature/Build → ASK minimum 3 strategic questions
> Even if answers are given → ask 2 "Edge Case" questions

**orchestrator.md Phase 0:**
> If request is clear: Proceed directly
> If major ambiguity: Ask 1-2 quick questions, then proceed
> ⚠️ Don't over-ask: If the request is reasonably clear, start working.

These are directly contradictory. The orchestrator explicitly overrides the mandatory gate in the global rules. Because the orchestrator is used for complex multi-domain tasks (exactly the tasks that need the gate most), this causes the most consequential drift.

**Fix:** Either (a) make the Socratic Gate configurable per agent (e.g., a frontmatter `socratic: minimal` flag), or (b) align orchestrator Phase 0 to require 2-3 targeted questions for complex/build requests, while adding a carve-out in GEMINI.md for clearly-scoped orchestration tasks.

---

### Issue 10 — `product-manager` and `product-owner` Are Near-Identical
**Severity:** 🟠 High
**Files:** `product-manager.md`, `product-owner.md`

Both agents share:
- Identical `tools`: `Read, Grep, Glob, Bash`
- Identical `skills`: `plan-writing, brainstorming, clean-code`
- Same core role (requirements → user stories → acceptance criteria)
- Same anti-patterns
- Same output formats (PRD, Gherkin AC)

Differences are cosmetic (Product Owner adds RICE prioritization, MoSCoW is in both). Having two agents with near-identical capabilities and no clear routing differentiation causes the orchestrator and auto-selection to make arbitrary choices. It also means both agent files are loaded during similar requests, doubling the prompt overhead for no specialization gain.

**Fix:** Merge into one agent (`product-manager`) with a note on optional RICE vs MoSCoW mode, or give each a clearly distinct scope (e.g., Product Owner = backlog/sprint focus; Product Manager = strategy/PRD focus) and update routing triggers accordingly.

---

### Issue 11 — Script Count Discrepancy
**Severity:** 🟡 Medium
**Files:** `GEMINI.md` (Final Checklist), `ARCHITECTURE.md` (Statistics)

- `GEMINI.md` states: "Available Scripts (12 total)" and lists 12
- `ARCHITECTURE.md` Statistics table states: "Total Scripts: 2 (master) + 18 (skill-level)"

Either the GEMINI.md list is incomplete (missing 6 scripts), or the ARCHITECTURE.md count is wrong. This matters because agents referencing "available scripts" get an incomplete picture.

**Fix:** Audit actual script files, reconcile the count, and update whichever is wrong.

---

### Issue 12 — Socratic Gate Duplicated Verbatim in Every Agent
**Severity:** 🟡 Medium (Token efficiency)
**Files:** `backend-specialist.md`, `frontend-specialist.md`, `mobile-developer.md`, `orchestrator.md`, `project-planner.md`, `database-architect.md`

Every code-producing agent independently embeds a full "CLARIFY BEFORE CODING" or "ASK BEFORE ASSUMING" section that mirrors the global Socratic Gate already defined in GEMINI.md TIER 1. For example, backend-specialist has a 6-row "You MUST ask before proceeding" table that replicates the gate.

**Token cost:** Each duplicate section is ~300–500 tokens. For a 6-agent orchestration run, that's up to 3,000 tokens of repeated rules before any task begins.

**Fix:** Remove inline Socratic sections from individual agents. Add a single line: `> Socratic Gate applies. See GEMINI.md TIER 1 for protocol.` The global rule already has P0 priority.

---

### Issue 13 — `mobile-developer` Mandates 9 Skill File Reads Before Any Task
**Severity:** 🟡 Medium (Token efficiency)
**File:** `mobile-developer.md`

The "MANDATORY: Read Skill Files Before Working!" section lists 9 files marked CRITICAL that must be read before any mobile code is written. Seven of them are in the `mobile-design` skill alone:

```
mobile-design-thinking.md   ← CRITICAL FIRST
SKILL.md                    ← CRITICAL
touch-psychology.md         ← CRITICAL
mobile-performance.md       ← CRITICAL
mobile-backend.md           ← CRITICAL
mobile-testing.md           ← CRITICAL
mobile-debugging.md         ← CRITICAL
+ platform-ios.md (if iOS)
+ platform-android.md (if Android)
```

This pre-loads potentially irrelevant content (e.g., debugging docs for a styling task). This violates the Selective Reading rule in GEMINI.md: *"DO NOT read ALL files in a skill folder. Read SKILL.md first, then only read sections matching the user's request."*

**Fix:** Follow the selective protocol. Only `SKILL.md` and `mobile-design-thinking.md` should be pre-reads. Others should be conditional: *"If working with lists → read mobile-performance.md; if debugging → read mobile-debugging.md."*

---

### Issue 14 — Quality Control Loop Duplicated Across 7+ Agents
**Severity:** 🟡 Medium (Token efficiency)
**Files:** `backend-specialist.md`, `frontend-specialist.md`, `mobile-developer.md`, `database-architect.md`, `devops-engineer.md`, `test-engineer.md`, `performance-optimizer.md`

Every agent has a "Quality Control Loop (MANDATORY)" section with near-identical content:
```
1. Run validation: npm run lint && npx tsc --noEmit
2. Security check
3. Type check
4. Test
5. Report complete only after checks pass
```

This is the same pattern repeated in 7+ files, each consuming ~100–150 tokens. GEMINI.md TIER 0 already mandates `clean-code` globally.

**Fix:** Remove from individual agents. Keep one canonical Quality Control Loop in `GEMINI.md TIER 1` or in the `clean-code` skill, and reference it by name from agents that need to emphasize it.

---

### Issue 15 — `frontend-specialist` Duplicates Deep Design Thinking Section
**Severity:** 🟡 Medium (Token efficiency + Clarity)
**File:** `frontend-specialist.md`

The "Deep Design Thinking" protocol appears **twice** in the same file:
1. First at line ~73 as "🧠 DEEP DESIGN THINKING (MANDATORY - BEFORE ANY DESIGN)" with a full multi-step flow
2. Again at line ~113 as "🧠 DEEP DESIGN THINKING (PHASE 1 - MANDATORY)" with overlapping but slightly different content

The second instance references "PHASE 1" implying a phased structure, but the first doesn't reference phases. A reader (or AI parsing the file) receives contradictory structural signals and may apply both redundantly.

**Fix:** Merge into a single, clearly-phased section. Remove the duplicate.

---

### Issue 16 — Orchestrator Available Agents Table Differs from ARCHITECTURE.md
**Severity:** 🟡 Medium
**Files:** `orchestrator.md`, `ARCHITECTURE.md`

**In orchestrator.md:**
- Lists `api-designer` (does not exist — Issue 2)
- Does not list `product-owner` (exists — Issue 4)
- Does not list `code-archaeologist`
- Does not list `seo-specialist` in some routing paths

**In ARCHITECTURE.md:**
- Lists `game-developer` (no file — Issue 3)
- Does not list `product-owner` (exists)

The orchestrator is the primary routing agent. Its knowledge of available agents must be accurate. An incomplete or phantom agent list causes systematic misrouting.

**Fix:** After resolving Issues 2–4, audit and synchronize the orchestrator's agent table, ARCHITECTURE.md agent table, and the actual files in `.agent/agents/`.

---

### Issue 17 — GEMINI.md Quick Reference Lists Stale Agents
**Severity:** 🟡 Medium
**File:** `GEMINI.md` (Quick Reference section)

```
Masters: orchestrator, project-planner, security-auditor, backend-specialist,
         frontend-specialist, mobile-developer, debugger, game-developer
```

`game-developer` is listed; `product-owner`, `code-archaeologist`, `qa-automation-engineer`, `seo-specialist` are absent despite being fully implemented agents with distinct domains.

**Fix:** Update Quick Reference to reflect the actual agent roster.

---

### Issue 18 — Request Classifier Boundary Is Ambiguous
**Severity:** 🟢 Low
**File:** `GEMINI.md` (REQUEST CLASSIFIER section)

The line between SIMPLE CODE ("fix", "add", "change (single file)") and COMPLEX CODE ("build", "create", "implement", "refactor") is ambiguous. A request like "add authentication to all API routes" could match either. When misclassified as SIMPLE CODE, the orchestrator and task-slug plan file creation are skipped, causing large multi-file changes to proceed without a plan anchor.

**Fix:** Add an explicit rule: "If the request touches 3+ files OR crosses domain boundaries (e.g., frontend + backend), always treat as COMPLEX CODE regardless of verb."

---

### Issue 19 — Two Separate Socratic Gate Sections in GEMINI.md
**Severity:** 🟢 Low
**File:** `GEMINI.md` (TIER 1 section)

GEMINI.md TIER 1 contains:
1. A "🛑 Socratic Gate" sub-heading within the Project Type Routing section
2. Immediately followed by a "🛑 GLOBAL SOCRATIC GATE (TIER 0)" heading — but this is nested under TIER 1 content

The second section calls itself "TIER 0" but is embedded inside "TIER 1: CODE RULES". This creates structural confusion about which tier the gate belongs to and why there are two separate gate headings. Combined with Issue 9, agents receive contradictory signals about when and how many questions to ask.

**Fix:** Merge into one "Global Socratic Gate" section with clear per-context question counts, and place it correctly under TIER 0.

---

### Issue 20 — Core Web Vitals Table Duplicated in Two Agents
**Severity:** 🟢 Low
**Files:** `performance-optimizer.md`, `seo-specialist.md`

Both agents embed an identical Core Web Vitals table (LCP/INP/CLS thresholds). This is not a critical issue but adds redundant token usage and creates a maintenance risk if thresholds change (one file gets updated, one doesn't).

**Fix:** Move the authoritative table to the `performance-profiling` skill's `SKILL.md` and reference it from both agents.

---

### Issue 21 — `project-planner` Skill Reference vs Inline Rule Inconsistency
**Severity:** 🟢 Low
**File:** `project-planner.md`

Step 3 says: *"Full protocol in `@[skills/brainstorming]`"* — deferring to the skill for the Socratic Gate.
Step 6 then contains an inline EXIT GATE rule block that duplicates plan-creation enforcement already stated earlier in the file.

The file alternates between referencing external skills and embedding rules inline without a clear principle. This makes the document longer and harder to maintain.

---

## Summary of Alignment Issues by Agent

| Agent | Has `model:` | Has `tools:` | Correct paths | Skills in registry | Redundant sections |
|-------|:-----------:|:------------:|:-------------:|:-----------------:|:-----------------:|
| orchestrator | ✅ | ✅ | ✅ | ✅ | Socratic inline |
| backend-specialist | ✅ | ✅ | ✅ | ✅ | Socratic + QC loop |
| frontend-specialist | ✅ | ✅ | ✅ | ✅ | 2× Deep Design, Socratic, QC |
| security-auditor | ✅ | ✅ | ❌ (script path) | ✅ | — |
| **debugger** | ❌ | ❌ | ✅ | ✅ | — |
| mobile-developer | ✅ | ✅ | ✅ | ✅ | 9 forced reads, QC |
| devops-engineer | ✅ | ✅ | ✅ | ✅ | QC loop |
| database-architect | ✅ | ✅ | ✅ | ✅ | Socratic + QC |
| penetration-tester | ✅ | ✅ | ✅ | ✅ | — |
| project-planner | ✅ | ✅ | ✅ | ✅ | Contradictory plan path |
| performance-optimizer | ✅ | ✅ | ✅ | ✅ | Duplicate CWV table |
| test-engineer | ✅ | ✅ | ✅ | ✅ | QC loop |
| qa-automation-engineer | ✅ | ✅ | ✅ | ✅ | — |
| documentation-writer | ✅ | ✅ | ✅ | ✅ | — |
| explorer-agent | ✅ | ✅ | ✅ | ✅ | — |
| **code-archaeologist** | ✅ | ✅ | ✅ | ❌ (`refactoring-patterns`) | — |
| product-manager | ✅ | ✅ | ✅ | ✅ | Overlaps product-owner |
| **product-owner** | ✅ | ✅ | ✅ | ✅ | Unregistered, overlaps PM |
| seo-specialist | ✅ | ✅ | ✅ | ✅ | Duplicate CWV table |

---

## Recommendations: Keeping Agents Aligned and Reducing Drift

### 1. Introduce a "Canonical Rules Index"
Every rule that appears in GEMINI.md should be referenced by name in agent files, not duplicated. Agent files should contain only agent-specific additions. Example:
```
> Socratic Gate: See GEMINI.md §GLOBAL-SOCRATIC-GATE
> QC Loop: See GEMINI.md §QUALITY-CONTROL-LOOP
```
This reduces the agent files to domain-specific knowledge only, cutting per-agent token load by an estimated 20–35%.

### 2. Enforce a Frontmatter Schema
Define a required frontmatter schema and lint it:
```yaml
# Required fields for all agents
name: string
description: string
tools: [Read, Grep, Glob, Bash, Edit, Write]  # subset allowed
model: inherit | flash | pro
skills: [skill-name, ...]
```
A simple CI check (or checklist.py extension) that validates every agent's frontmatter would catch Issues 1 and 5 automatically.

### 3. Maintain a Single Source of Truth Registry
`ARCHITECTURE.md` should be the authoritative agent registry. Enforce that:
- Adding an agent file → requires updating ARCHITECTURE.md
- Referencing an agent by name anywhere → must exist in ARCHITECTURE.md
- GEMINI.md Quick Reference and orchestrator agent tables are generated from ARCHITECTURE.md (or at minimum, reviewed on every agent addition)

### 4. Differentiate `product-manager` and `product-owner` or Merge
Given the near-identical content, merge into one file. If separation is desired, establish non-overlapping triggers:
- `product-owner` → backlog, sprint, story-level refinement
- `product-manager` → strategy, PRD, stakeholder communication

### 5. Make Skill Reads Conditional in `mobile-developer`
Replace the 9-file mandatory read list with a conditional read protocol keyed to task type:
- All tasks: `SKILL.md`, `mobile-design-thinking.md`
- List/data tasks: + `mobile-performance.md`
- Auth/storage tasks: + `mobile-backend.md`
- Debugging: + `mobile-debugging.md`
- Shipping: + `mobile-testing.md`, platform files

### 6. Standardize Plan File Location
Pick one: project root (`./{task-slug}.md`) and update orchestrator to match. Add a redirect note in Best Practices rather than a contradictory alternative.

### 7. Resolve Phantom and Missing Agents in One Pass
Before the next orchestration session, do a reconciliation pass:
1. Remove `api-designer` and `game-developer` from all registries (or add their files)
2. Register `product-owner` everywhere
3. Run a grep for agent names used in orchestrator.md and verify each has a corresponding file

---

## Estimated Token Savings from Redundancy Reduction

| Change | Estimated Savings per Request |
|--------|-------------------------------|
| Remove inline Socratic Gates from 6 agents | ~300–500 tokens each = 1,800–3,000 tokens for multi-agent runs |
| Remove duplicate QC loops from 7 agents | ~150 tokens each = 1,050 tokens |
| Reduce mobile-developer mandatory reads (9→2 base) | ~2,000–4,000 tokens per mobile task |
| Remove `frontend-specialist` duplicate Design Thinking | ~600 tokens |
| **Total estimate per complex orchestration run** | **~5,000–8,000 tokens** |

For a project with frequent multi-agent orchestration, this can meaningfully reduce costs and context pressure on 8K–32K context window sessions.

---

*Report generated by review of GEMINI.md and all 19 agent files. No code was modified.*
