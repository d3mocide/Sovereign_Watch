FROM python:3.12-slim

# Install uv from the official distroless image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY pyproject.toml uv.lock ./

# Install production dependencies only, using the exact lock file
ENV UV_SYSTEM_PYTHON=1
RUN uv sync --frozen --no-dev

COPY . .

CMD ["python", "main.py"]
