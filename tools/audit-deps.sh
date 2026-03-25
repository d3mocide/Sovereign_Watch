#!/usr/bin/env bash
# audit-deps.sh — Dependency vulnerability audit for all uv + pnpm lockfiles.
#
# Usage:
#   ./tools/audit-deps.sh [OPTIONS]
#
# Options:
#   --components <list>      Comma-separated list of components to audit (default: all)
#   --continue-on-failure    Keep auditing remaining components after a failure
#   --min-severity <level>   Minimum severity to flag: low|moderate|high|critical (default: low)
#   --fix-versions-only      Only report vulnerabilities that have a fix available
#   --help                   Show this help message
#
# Components:
#   frontend, backend-api, aviation-poller, maritime-poller,
#   infra-poller, rf-pulse, js8call
#
# Examples:
#   ./tools/audit-deps.sh
#   ./tools/audit-deps.sh --components backend-api,frontend
#   ./tools/audit-deps.sh --min-severity high --continue-on-failure

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────────
SELECTED_COMPONENTS=""
CONTINUE_ON_FAILURE=false
MIN_SEVERITY="low"
FIX_VERSIONS_ONLY=false

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --components)
            SELECTED_COMPONENTS="$2"; shift 2 ;;
        --continue-on-failure)
            CONTINUE_ON_FAILURE=true; shift ;;
        --min-severity)
            MIN_SEVERITY="$2"; shift 2 ;;
        --fix-versions-only)
            FIX_VERSIONS_ONLY=true; shift ;;
        --help)
            sed -n '2,/^[^#]/p' "$0" | grep '^#' | sed 's/^# \?//'
            exit 0 ;;
        *)
            echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

# ── Component definitions ─────────────────────────────────────────────────────
# Format: "name:type:relative-path"
#   type = uv | pnpm
declare -a ALL_COMPONENTS=(
    "backend-api:uv:backend/api"
    "aviation-poller:uv:backend/ingestion/aviation_poller"
    "maritime-poller:uv:backend/ingestion/maritime_poller"
    "infra-poller:uv:backend/ingestion/infra_poller"
    "rf-pulse:uv:backend/ingestion/rf_pulse"
    "js8call:uv:js8call"
    "frontend:pnpm:frontend"
)

# Components that have pyproject.toml but no uv.lock yet — warn and skip.
declare -a LOCKFILE_MISSING_WARN=(
    "gdelt_pulse:backend/ingestion/gdelt_pulse"
    "space_pulse:backend/ingestion/space_pulse"
)

# ── Helpers ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; GRAY='\033[0;37m'; BOLD='\033[1m'; RESET='\033[0m'

section()  { echo; echo -e "${CYAN}=== $* ===${RESET}"; }
pass()     { echo -e "  ${GREEN}✓ PASS${RESET}  $*"; }
fail()     { echo -e "  ${RED}✗ FAIL${RESET}  $*"; }
warn()     { echo -e "  ${YELLOW}⚠ WARN${RESET}  $*"; }
info()     { echo -e "  ${GRAY}$*${RESET}"; }

check_tool() {
    if ! command -v "$1" &>/dev/null; then
        echo -e "${RED}ERROR: '$1' not found in PATH.${RESET}" >&2
        case "$1" in
            uv)   echo "  Install: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2 ;;
            pnpm) echo "  Install: npm install -g pnpm" >&2 ;;
        esac
        exit 1
    fi
}

# Resolve pnpm audit --audit-level from MIN_SEVERITY
pnpm_audit_level() {
    case "$MIN_SEVERITY" in
        low)      echo "low" ;;
        moderate) echo "moderate" ;;
        high)     echo "high" ;;
        critical) echo "critical" ;;
        *)        echo "low" ;;
    esac
}

# ── Filter components ─────────────────────────────────────────────────────────
if [[ -n "$SELECTED_COMPONENTS" ]]; then
    IFS=',' read -ra REQUESTED <<< "$SELECTED_COMPONENTS"
    COMPONENTS=()
    for entry in "${ALL_COMPONENTS[@]}"; do
        name="${entry%%:*}"
        for req in "${REQUESTED[@]}"; do
            if [[ "$name" == "$req" ]]; then
                COMPONENTS+=("$entry")
                break
            fi
        done
    done
    if [[ ${#COMPONENTS[@]} -eq 0 ]]; then
        echo "No matching components for: $SELECTED_COMPONENTS" >&2
        echo "Valid components: $(IFS=,; for e in "${ALL_COMPONENTS[@]}"; do printf '%s,' "${e%%:*}"; done | sed 's/,$//')" >&2
        exit 1
    fi
else
    COMPONENTS=("${ALL_COMPONENTS[@]}")
fi

# ── Pre-flight ────────────────────────────────────────────────────────────────
check_tool uv

for entry in "${ALL_COMPONENTS[@]}"; do
    name="${entry%%:*}"; rest="${entry#*:}"; type="${rest%%:*}"
    if [[ "$type" == "pnpm" ]]; then
        check_tool pnpm
        break
    fi
done

section "Dependency Audit"
echo -e "  Repository:   ${BOLD}${REPO_ROOT}${RESET}"
echo -e "  Components:   $(IFS=,; for e in "${COMPONENTS[@]}"; do printf '%s,' "${e%%:*}"; done | sed 's/,$//')"
echo -e "  Min severity: ${MIN_SEVERITY}"
echo -e "  Fix-only:     ${FIX_VERSIONS_ONLY}"

# Warn about components without lockfiles
for entry in "${LOCKFILE_MISSING_WARN[@]}"; do
    cname="${entry%%:*}"; cpath="${entry#*:}"
    warn "${cname} (${cpath}): has pyproject.toml but no uv.lock — run 'uv lock' to generate one. Skipping."
done

# ── Audit loop ────────────────────────────────────────────────────────────────
declare -a RESULTS=()   # "name|status|seconds|detail"
OVERALL_EXIT=0

run_uv_audit() {
    local name="$1" dir="$2"
    local lockfile="${dir}/uv.lock"

    if [[ ! -f "$lockfile" ]]; then
        RESULTS+=("${name}|skip|0|no uv.lock found")
        warn "${name}: no uv.lock at ${lockfile}, skipping."
        return
    fi

    info "[${name}] > pip-audit via uv (lockfile: ${dir#"$REPO_ROOT"/}/uv.lock)"

    local t_start; t_start=$(date +%s)
    local output exit_code=0

    # Export pinned requirements from the lockfile, pipe into pip-audit.
    # --no-hashes keeps the requirements file format pip-audit can parse.
    # pip-audit exits 1 when vulnerabilities are found, 0 when clean.
    output=$(
        cd "$dir" && uv export --no-hashes 2>/dev/null \
            | uv tool run pip-audit --requirement /dev/stdin --progress-spinner off 2>&1
    ) || exit_code=$?

    local t_end elapsed
    t_end=$(date +%s)
    elapsed=$(( t_end - t_start ))

    # Distinguish "vulns found" (pip-audit exit 1 + table output) from tool errors
    if [[ $exit_code -eq 0 ]]; then
        pass "${name} (${elapsed}s) — no vulnerabilities found"
        RESULTS+=("${name}|pass|${elapsed}|")
    elif echo "$output" | grep -qE "^(Name\s+Version|[A-Za-z].*[0-9]+\.[0-9]+.*CVE-)"; then
        fail "${name} (${elapsed}s) — vulnerabilities found"
        echo "$output" | sed 's/^/    /'
        RESULTS+=("${name}|fail|${elapsed}|vulnerabilities found")
        OVERALL_EXIT=1
    else
        fail "${name} (${elapsed}s) — audit error"
        echo "$output" | sed 's/^/    /'
        RESULTS+=("${name}|error|${elapsed}|audit tool error")
        OVERALL_EXIT=1
    fi
}

run_pnpm_audit() {
    local name="$1" dir="$2"
    local lockfile="${dir}/pnpm-lock.yaml"

    if [[ ! -f "$lockfile" ]]; then
        RESULTS+=("${name}|skip|0|no pnpm-lock.yaml found")
        warn "${name}: no pnpm-lock.yaml at ${lockfile}, skipping."
        return
    fi

    local level; level=$(pnpm_audit_level)
    local extra_flags=()
    [[ "$FIX_VERSIONS_ONLY" == true ]] && extra_flags+=("--fix")

    info "[${name}] > pnpm audit --audit-level ${level}"

    local t_start; t_start=$(date +%s)
    local output exit_code=0

    output=$(cd "$dir" && pnpm audit --audit-level "$level" "${extra_flags[@]}" 2>&1) || exit_code=$?

    local t_end elapsed
    t_end=$(date +%s)
    elapsed=$(( t_end - t_start ))

    if [[ $exit_code -eq 0 ]]; then
        pass "${name} (${elapsed}s) — no vulnerabilities at or above '${level}' severity"
        RESULTS+=("${name}|pass|${elapsed}|")
    else
        fail "${name} (${elapsed}s) — vulnerabilities found at or above '${level}' severity"
        echo "$output" | sed 's/^/    /'
        RESULTS+=("${name}|fail|${elapsed}|vulnerabilities found")
        OVERALL_EXIT=1
    fi
}

for entry in "${COMPONENTS[@]}"; do
    name="${entry%%:*}"
    rest="${entry#*:}"
    type="${rest%%:*}"
    rel_path="${rest#*:}"
    abs_path="${REPO_ROOT}/${rel_path}"

    section "$name"

    case "$type" in
        uv)   run_uv_audit   "$name" "$abs_path" ;;
        pnpm) run_pnpm_audit "$name" "$abs_path" ;;
    esac

    if [[ $OVERALL_EXIT -ne 0 && "$CONTINUE_ON_FAILURE" == false ]]; then
        # Print partial summary before exiting
        break
    fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
section "Summary"

printf "  %-22s %-8s %-8s %s\n" "Component" "Status" "Time" "Detail"
printf "  %-22s %-8s %-8s %s\n" "---------" "------" "----" "------"

for row in "${RESULTS[@]}"; do
    IFS='|' read -r rname rstatus rsecs rdetail <<< "$row"
    case "$rstatus" in
        pass)  color="$GREEN" ;;
        fail)  color="$RED"   ;;
        error) color="$RED"   ;;
        skip)  color="$YELLOW";;
        *)     color="$RESET" ;;
    esac
    printf "  %-22s ${color}%-8s${RESET} %-8s %s\n" "$rname" "$rstatus" "${rsecs}s" "$rdetail"
done

echo
if [[ $OVERALL_EXIT -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}All audited components are clean.${RESET}"
else
    echo -e "${RED}${BOLD}One or more components have vulnerabilities. Review output above.${RESET}"
fi

exit $OVERALL_EXIT
