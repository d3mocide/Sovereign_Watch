---
description: Release management workflow for version bumping, changelogs, and release notes.
---

# /release - Release Management

$ARGUMENTS

---

## Purpose

Standardized release process: version bump, changelog, release notes, and documentation updates.

---

## checklist

## 1. Analysis & Preparation

- [ ] **State Verification (Mandatory)**: Run `git status` to identify all modified files. If there are untracked or unstaged codebase changes (`.tsx`, `.py`, `.yaml`, `.proto`), you **must** stage and commit them as feat/fix/chore commits _before_ running this release sequence, or explicitly bundle them into the release commit.
- [ ] **Review Changes**: Run `git log` or check recent work since the last tag.
- [ ] **Determine Semantic Version**:
  - **Major (X.0.0)**: Breaking changes (API, Schema, Protocol).
  - **Minor (0.X.0)**: New features (Rendering engine, Ingestion sources).
  - **Patch (0.0.X)**: Bug fixes, performance tuning, or minor UI tweaks.

## 2. Version Updates

- [ ] **Frontend**: Update `"version"` in `frontend/package.json`.
  ```json
  "version": "X.Y.Z"
  ```
- [ ] **Backend (Optional)**: If applicable, check `backend/api/main.py` or equivalent for version strings.

## 3. Changelog Management

- [ ] Open `CHANGELOG.md`.
- [ ] Create a new section for the release:

  ```markdown
  ## [X.Y.Z] - YYYY-MM-DD

  ### Added

  - Feature A

  ### Changed

  - Update B

  ### Fixed

  - Bug C
  ```

- [ ] Move "Unreleased" changes into this new section.

## 4. Release Notes Creation

- [ ] Create or Overwrite `RELEASE_NOTES.md`.
- [ ] Include:
  - **Title**: `# Release - vX.Y.Z - Release Name`
  - **High-Level Summary**: A paragraph for operators/stakeholders describing the _value_ of the update.
  - **Key Features**: Bullet points highlighting major additions.
  - **Technical Details**: Breaking changes, new dependencies, or performance metrics.
  - **Upgrade Instructions**: Commands to pull, rebuild, and restart.

## 5. Verification

- [ ] **Tests**: Run `/test` to execute unit/integration tests.
- [ ] **Build Check**: Run `docker compose build frontend` to ensure `package.json` is valid.
- [ ] **Sanity Check**: Verify links in `RELEASE_NOTES.md` and `README.md`.

## 6. Deployment (Optional)

- [ ] **Deploy**: Run `/deploy` to push to production or staging environments.

## 7. Git Finalization (Manual)

To be executed by the user or agent with explicit permission:

```bash
# 1. Stage documentation and version files
git add frontend/package.json README.md CHANGELOG.md RELEASE_NOTES.md

# 2. Commit
git commit -m "chore(release): vX.Y.Z - Release Name

# 3. Tag (Annotated required for --follow-tags)
git tag -a vX.Y.Z -m "Release vX.Y.Z"

# 4. Push — use --follow-tags to push only the new tag,
# NOT --tags which also tries to re-push old tags (causes harmless
# but noisy "already exists" rejections for every previous release).
git push origin main --follow-tags
```
