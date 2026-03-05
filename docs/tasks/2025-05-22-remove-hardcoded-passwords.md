# Security Fix: Remove Hardcoded Database Passwords

**Date:** 2025-05-22
**Task ID:** security-fix-hardcoded-passwords

## 🎯 What
Removed hardcoded default passwords (`"password"`) from `backend/api/core/config.py` and various scripts in `backend/scripts/`.

## ⚠️ Risk
The use of a hardcoded default password poses a significant security risk, as it could allow unauthorized access to the database if the environment is not properly configured. It also encourages insecure deployment practices.

## 🛡️ Solution
- Modified `backend/api/core/config.py` to remove the default `POSTGRES_PASSWORD`.
- Implemented `DB_DSN` as a property in `Settings` that raises a `ValueError` if `POSTGRES_PASSWORD` is missing and no `DB_DSN` override is provided.
- Updated `backend/scripts/apply_indexes.py`, `backend/scripts/cleanup_timescale.py`, and `backend/scripts/benchmark_search.py` to require `POSTGRES_PASSWORD` and exit with an error message if it's not set.
- Verified that both the application and the scripts correctly handle the absence of the password through targeted simulations and logic checks.
