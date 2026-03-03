# Antigravity Kit Architecture

> Comprehensive AI Agent Capability Expansion Toolkit

---

## 📋 Overview

Antigravity Kit is a modular system consisting of:

- **16 Specialist Agents** - Role-based AI personas
- **6 Skills** - Domain-specific knowledge modules

---

## 🏗️ Directory Structure

```plaintext
.agent/
├── ARCHITECTURE.md          # This file
├── agents/                  # 16 Specialist Agents
└── skills/                  # 6 Skills
```

---

## 🤖 Agents (16)

Specialist AI personas for different domains.

| Agent                        | Focus                                     | Skills Used                            |
| ---------------------------- | ----------------------------------------- | -------------------------------------- |
| `orchestrator`               | Multi-agent coordination                  | architecture                           |
| `project-planner`            | Discovery, task planning                  | architecture                           |
| `frontend-specialist`        | Web UI/UX                                 | react-patterns                         |
| `backend-specialist`         | API, business logic                       | api-patterns, python-patterns, database-design |
| `database-architect`         | Schema, SQL                               | database-design                        |
| `devops-engineer`            | CI/CD, Docker                             | architecture                           |
| `security-auditor`           | Security compliance                       | architecture                           |
| `penetration-tester`         | Offensive security                        | architecture                           |
| `test-engineer`              | Testing strategies                        | python-patterns, react-patterns        |
| `debugger`                   | Root cause analysis                       | python-patterns, react-patterns        |
| `performance-optimizer`      | Speed, Web Vitals                         | react-patterns, architecture           |
| `documentation-writer`       | Manuals, docs                             | architecture                           |
| `code-archaeologist`         | Legacy code, refactoring                  | architecture                           |
| `explorer-agent`             | Codebase analysis                         | -                                      |
| `data-ingestion-specialist`  | High-velocity data pipelines, Polling     | python-patterns, architecture          |
| `geospatial-specialist`      | Deck.gl, PostGIS, Mapping, Vector         | react-patterns, architecture, geo-fundamentals |

---

## 🧩 Skills (6)

Modular knowledge domains that agents can load on-demand based on task context.

| Skill                | Description                                |
| -------------------- | ------------------------------------------ |
| `api-patterns`       | REST, GraphQL, API architecture            |
| `architecture`       | System design patterns                     |
| `database-design`    | Schema design, optimization, PostGIS       |
| `geo-fundamentals`   | Geospatial logic, mapping, and GenAI       |
| `python-patterns`    | Python standards, FastAPI                  |
| `react-patterns`     | React hooks, state, performance            |

---

## 🎯 Skill Loading Protocol

```plaintext
User Request → Skill Description Match → Load SKILL.md
                                            ↓
                                    Read references/
                                            ↓
                                    Read scripts/
```

### Skill Structure

```plaintext
skill-name/
├── SKILL.md           # (Required) Metadata & instructions
├── scripts/           # (Optional) Python/Bash scripts
├── references/        # (Optional) Templates, docs
└── assets/            # (Optional) Images, logos
```

---

## 📊 Statistics

| Metric              | Value                         |
| ------------------- | ----------------------------- |
| **Total Agents**    | 16                            |
| **Total Skills**    | 6                             |

---

## 🔗 Quick Reference

| Need              | Agent                       | Skills                                |
| ----------------- | --------------------------- | ------------------------------------- |
| Web App / UI      | `frontend-specialist`       | react-patterns                        |
| API / Backend     | `backend-specialist`        | api-patterns, python-patterns         |
| Database / Spatial| `database-architect`        | database-design, geo-fundamentals     |
| Data Ingestion    | `data-ingestion-specialist` | python-patterns, architecture         |
| Geospatial        | `geospatial-specialist`     | react-patterns, geo-fundamentals      |
| Security          | `security-auditor`          | architecture                          |
| Testing           | `test-engineer`             | python-patterns, react-patterns       |
| Debug             | `debugger`                  | python-patterns, react-patterns       |
| Plan              | `project-planner`           | architecture                          |
