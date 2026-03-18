FROM python:3.12-slim

# Install uv from the official distroless image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# gcc/python3-dev kept for numpy/sgp4 build fallback on non-wheel platforms
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY pyproject.toml uv.lock ./

# Install production dependencies only, using the exact lock file
ENV UV_SYSTEM_PYTHON=1
RUN uv sync --frozen --no-dev

COPY . .

CMD ["python", "main.py"]
