---
name: code-review
description: Comprehensive code review skill to identify unnecessary comments, unused functions, and exposed secrets. Use when the user asks for a code review, audit, or cleanup of the codebase.
---

# Code Review Skill

This skill guides the agent through a systematic code review process.

## Process

### 1. Scan for Unnecessary Comments

Search the codebase for:

- `// TODO` or `// FIXME`
- Commented-out blocks of code
- Redundant or obvious comments

Tools: `grep_search`

### 2. Scan for Unused Functions

Identify functions that are defined but never called.

- Use `view_file_outline` to find function definitions.
- Use `grep_search` to check for usages of those functions.

### 3. Scan for Exposed Secrets

Search for potential API keys, tokens, or secrets.

- Keywords: `api_key`, `secret`, `token`, `password`, `auth`.
- Patterns: High entropy strings (heuristic).

Tools: `grep_search`

### 4. Generate Report

Use the template in `assets/report_template.md` to compile the findings.
