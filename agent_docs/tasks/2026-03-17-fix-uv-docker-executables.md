# 2026-03-17-fix-uv-docker-executables.md

- **Issue**: Python containers (Backend API, Pollers, JS8Call Bridge) were failing to start with `executable not found in $PATH` errors. This was caused by the migration to `uv` for dependency management:
    - Root cause (Backend/Pollers): `uv sync` installs into a virtual environment (`/app/.venv`) which is not automatically in the system `PATH`.
    - Root cause (JS8Call): `uv sync` was being run in a temporary directory which was then deleted, removing the virtual environment entirely.
- **Solution**:
    - For Backend API and Pollers: Updated `Dockerfile`s to include the `.venv/bin` directory in the container's `PATH`. This allows `uvicorn`, `python`, and other utilities to be found naturally.
    - For JS8Call: Changed dependency installation to use `uv pip install --system .`. Since the project provides its own Python environment within the Ubuntu base, installing directly into the system site-packages is the most reliable approach, especially given the existing `entrypoint.sh` logic.
- **Changes**:
    - Modified `backend/api/Dockerfile`
    - Modified `backend/ingestion/aviation_poller/Dockerfile`
    - Modified `backend/ingestion/infra_poller/Dockerfile`
    - Modified `backend/ingestion/maritime_poller/Dockerfile`
    - Modified `backend/ingestion/orbital_pulse/Dockerfile`
    - Modified `backend/ingestion/rf_pulse/Dockerfile`
    - Modified `js8call/Dockerfile`
- **Verification**: Reviewed the `PATH` logic and `uv` commands against standard Dockerized Python patterns. Recommended a full rebuild to clear broken image layers.
- **Benefits**: Restores service functionality while maintaining the reproducibility and speed benefits of the `uv` toolchain.
