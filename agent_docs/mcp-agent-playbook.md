# MCP Agent Playbook

## Goal

Use MCP capabilities to reduce token usage, reduce latency, and improve accuracy. Default to the narrowest semantic tool that can answer the question. Expand to broader search only when the narrower tool cannot answer it.

## Core Rules

1. Prefer semantic tools over repo-wide text search when the question is about a known symbol, file, import, or caller.
2. Ask one tool one precise question. Do not stack overlapping MCP calls unless the first result leaves a real gap.
3. Start local, then expand outward:
   - symbol
   - file
   - direct dependents
   - transitive graph
4. Use graph tools for architecture and impact analysis, not for simple definition lookups.
5. After modifying imports, exports, or signatures, refresh stale graph data before trusting dependency results.

## First-Choice Tool Order

### 1. Symbol lookup and refactors

Use these first when the user names a function, class, method, or variable.

| Need | First Tool | Fallback | Avoid First |
|------|------------|----------|-------------|
| Definition | `go to definition` / language-server definition tool | file read after jump | repo-wide grep |
| All usages | references tool | symbol callers/dependents for richer impact | grep on symbol name |
| Type or docs | hover / docstring | read local file block | scanning whole file |
| Safe rename | rename symbol | manual patch only if rename tool cannot resolve | search/replace across repo |

### 2. Single-file understanding

Use these when the question is “what does this file do?” or “summarize this module.”

| Need | First Tool | Fallback | Notes |
|------|------------|----------|-------|
| Full file overview | `generate_codemap` | `analyze_file_logic` | Best default for one-file comprehension |
| Imports and exports | `analyze_dependencies` | `parse_imports` | Use raw import parsing only when syntax matters |
| Intra-file call flow | `analyze_file_logic` | `get_symbol_graph` | Stay file-local before using cross-file call graphs |

### 3. File-level architecture

Use these when the user asks about module structure, entrypoints, or import relationships.

| Need | First Tool | Fallback | Avoid First |
|------|------------|----------|-------------|
| What this file imports | `analyze_dependencies` | `parse_imports` | manual file scanning |
| Who imports this file | `find_referencing_files` | dependency crawl from entrypoint | grep for relative path strings |
| Entry-point architecture | `crawl_dependency_graph` | `expand_node` | repeated codemap calls across many files |

### 4. Symbol impact and blast radius

Use these before changing signatures, behavior, or deleting exported code.

| Need | First Tool | Fallback | Notes |
|------|------------|----------|-------|
| Quick direct callers | `get_symbol_dependents` or `get_symbol_callers` | references tool | Best first pass before any refactor |
| Full blast radius | `get_impact_analysis` | call graph query | Use transitive mode only when needed |
| Signature break check | `analyze_breaking_changes` | direct caller analysis + manual review | Use when parameters or return types change |
| Dead exported code | `find_unused_symbols` | `verify_dependency_usage` | Treat as candidate cleanup, not automatic delete |

### 5. Execution tracing

Use these only when the user needs runtime-style flow across files.

| Need | First Tool | Fallback | Warning |
|------|------------|----------|---------|
| What does this symbol call? | `query_call_graph` or `trace_function_execution` | file logic analysis | More expensive than direct symbol lookup |
| Deep execution chain | `trace_function_execution` | call graph query with depth | Keep depth low first |

### 6. Python checks and experiments

| Need | First Tool | Fallback | Avoid First |
|------|------------|----------|-------------|
| Run a Python snippet | Pylance run code snippet | terminal Python command | shell quoting on Windows |
| Check environment | Python environment tools | manual shell probing | `python --version` guesswork |
| Clean imports or annotations | Pylance refactoring | manual patch | large hand edits |

### 7. Search when you do not know the symbol yet

Use plain search only after deciding the question is not anchored to a known symbol or file.

| Situation | First Tool | Fallback | Notes |
|----------|------------|----------|-------|
| Exact filename/path | file search | list dir | cheapest option |
| Exact text or regex | grep search | terminal `rg` | keep include pattern narrow |
| Vague concept in repo | semantic search | search subagent | good for “where is auth flow handled?” |
| Broad exploration | Explore subagent | manual multi-file reads | use when likely to require many search hops |

## Token-Efficient Decision Tree

1. If the user names a symbol, use language-server symbol tools first.
2. If the user names a file, use codemap or dependency tools first.
3. If the user asks what will break, use symbol dependents or impact analysis first.
4. If the user asks about architecture, use dependency graph tools first.
5. If the user asks a vague discovery question, use semantic search or Explore.
6. Only use broad grep after the semantic path is unavailable or insufficient.

## Freshness Rules

Refresh dependency data when results could be stale.

1. After editing imports or exports in one file, invalidate that file.
2. After changing shared modules or many files, invalidate all touched files.
3. After branch switches or large refactors, rebuild the full index.
4. If graph results look wrong, check index status before assuming the code is wrong.

## Low-Value Patterns To Avoid

1. Running `grep`, `semantic search`, and `references` for the same symbol question.
2. Using full dependency crawl for a single definition lookup.
3. Jumping straight to transitive impact analysis when direct callers are enough.
4. Reading many entire files before trying codemap or dependencies.
5. Re-running the same graph query after edits without invalidating the cache.

## Recommended Defaults By Task

| Task | Default Path |
|------|--------------|
| “Where is this defined?” | definition -> hover -> targeted file read |
| “Who uses this?” | references or symbol dependents -> impact analysis if needed |
| “What does this file do?” | codemap -> file logic |
| “What imports this module?” | find referencing files |
| “What does this entrypoint touch?” | dependency crawl |
| “Will this signature change break anything?” | analyze breaking changes -> impact analysis |
| “Where is the code for this feature?” | semantic search or Explore -> then switch to semantic tools |

## Practical Principle

Use the cheapest tool that returns ground truth.

- Symbol question: use symbol tools.
- File question: use file tools.
- Blast-radius question: use impact tools.
- Unknown-location question: use search tools.

That ordering is what reduces token usage without reducing coverage.