---
trigger: always_on
---

# GEMINI.md - Antigravity Kit

> This file defines how the AI behaves in this workspace.

---

## CRITICAL: SOVEREIGN WATCH PROTOCOL (PROJECT RULES)

> **MANDATORY:** These rules override all others. Failure to follow them breaks the build environment.

### 1. The "Container-First" Rule (Environment Protection)

- **🚫 FORBIDDEN**: Do NOT run `npm`, `node`, `python`, `pip`, or `go` directly on the host shell.
- **✅ REQUIRED**: All build/runtime tasks must be executed via **Docker Compose**:
  - `docker compose build <service>`
  - `docker compose run --rm <service> <command>`
  - `docker compose up -d --build <service>` (for dependency updates)

### 2. Architectural Invariants

- **Communication**: All inter-service pipelines must use **TAK Protocol V1 (Protobuf)** via `tak.proto`. No ad-hoc JSON.
- **Rendering**: Hybrid Architecture (WebGL2 for visuals, WebGPU/Workers for compute). Do not downgrade to Leaflet.
- **Ingestion**: Use Redpanda Connect (Benthos) preferentially over custom Python scripts.

### 3. Development Workflow (Live Code Updates)

Both frontend and backend have **Hot Module Replacement (HMR)** enabled:

| Service       | Trigger                      | HMR Method                                               | Notes                                         |
| ------------- | ---------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| **Frontend**  | Save any `.tsx`/`.ts`/`.css` | Vite HMR (polling, 1s interval)                          | No restart needed. Changes reflect instantly. |
| **Backend**   | Save any `.py`               | Uvicorn `--reload` (StatReload)                          | No restart needed. Server auto-restarts.      |
| **Ingestion** | Modify `.yaml` config        | **REQUIRES RESTART:** `docker compose restart ingestion` | Benthos doesn't support hot reload.           |

**Quick Reference Commands:**

```bash
# Start all services (first time or after dependency changes)
docker compose up -d --build

# View logs for a service
docker compose logs -f <service>

# Restart a service (for config changes)
docker compose restart <service>

# Rebuild and restart a service (for Dockerfile/dependency changes)
docker compose up -d --build <service>
```

---

## CRITICAL: AGENT & SKILL PROTOCOL

> **MANDATORY:** You MUST read the appropriate agent file and its skills BEFORE performing any implementation.

### 1. Modular Skill Loading Protocol

Agent activated → Check frontmatter "skills:" → Read SKILL.md (INDEX) → Read specific sections.

### 2. Enforcement Protocol

1. **Activate**: Read Rules → Check Frontmatter → Load SKILL.md → Apply All.
2. **Forbidden**: Never skip reading agent rules or skill instructions.

---

## 📥 REQUEST CLASSIFIER (STEP 1)

**Before ANY action, classify the request:**

| Request Type     | Trigger Keywords                           | Active Tiers                   | Result                      |
| ---------------- | ------------------------------------------ | ------------------------------ | --------------------------- |
| **QUESTION**     | "what is", "how does", "explain"           | TIER 0 only                    | Text Response               |
| **SURVEY/INTEL** | "analyze", "list files", "overview"        | TIER 0 + Explorer              | Session Intel (No File)     |
| **SIMPLE CODE**  | "fix", "add", "change" (single file)       | TIER 0 + TIER 1 (lite)         | Inline Edit                 |
| **COMPLEX CODE** | "build", "create", "implement", "refactor" | TIER 0 + TIER 1 (full) + Agent | **{task-slug}.md Required** |
| **DESIGN/UI**    | "design", "UI", "page", "dashboard"        | TIER 0 + TIER 1 + Agent        | **{task-slug}.md Required** |

---

## TIER 0: UNIVERSAL RULES (Always Active)

### 🧹 Clean Code (Global Mandatory)

**ALL code MUST follow `@[skills/clean-code]` rules.**

- **Code**: Concise, direct, no over-engineering. Self-documenting.
- **Testing**: Mandatory. Pyramid (Unit > Int > E2E).
- **Infra/Safety**: 5-Phase Deployment. Verify secrets security.

### 📁 File Dependency Awareness

1. Check `CODEBASE.md` → File Dependencies.
2. Identify dependent files.
3. Update ALL affected files together.

---

## TIER 1: CODE RULES (When Writing Code)

### 🛑 Global Socratic Gate

**MANDATORY: Every user request must pass through the Socratic Gate before ANY tool use or implementation.**

| Request Type            | Strategy       | Required Action                                     |
| ----------------------- | -------------- | --------------------------------------------------- |
| **New Feature / Build** | Deep Discovery | ASK minimum 3 strategic questions                   |
| **Code Edit / Bug Fix** | Context Check  | Confirm understanding + ask impact questions        |
| **Full Orchestration**  | Gatekeeper     | **STOP** subagents until user confirms plan details |

### 🏁 Final Checklist Protocol

**Trigger:** When user says "final checks", "check my work":

1. **Security** → 2. **Lint** → 3. **Schema** → 4. **Tests** → 5. **UX**

---

## TIER 2: DESIGN RULES (Reference)

| Task         | Read                            |
| ------------ | ------------------------------- |
| Web UI/UX    | `.agent/frontend-specialist.md` |
| Mobile UI/UX | `.agent/mobile-developer.md`    |
