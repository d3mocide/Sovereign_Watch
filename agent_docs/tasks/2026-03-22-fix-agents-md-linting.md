# Task: Fix AGENTS.md Linting Error (MD032)

## Issue

Markdown linting error `MD032/blanks-around-lists` detected in `AGENTS.md` at line 75.
This rule requires lists to be surrounded by blank lines. While a blank line appeared to be present, inconsistent indentation in nested lists or trailing whitespace may be causing the parser/linter to misinterpret the block boundary.

## Solution

1. Ensure clean blank lines (one exactly) before and after the list.
2. Clean up any potential trailing whitespace or formatting artifacts.
3. Standardize nested list indentation (3 spaces to align with parent item text) to ensure correct block parsing.
4. Consolidate the "loose" list (remove internal blank lines as they are not necessary for readability in this case and can sometimes confuse linters looking for specific block boundaries).

## Changes

- Modified `AGENTS.md` to fix list spacing and indentation in the "Verification Decision Gate" section.

## Verification

- Run `pnpm run lint` or check editor for lint status. (I will check on host if possible).

## Benefits

- Improved documentation quality and consistency.
- Resolution of linting warnings/errors for developers.
