FROM python:3.11-slim

WORKDIR /app

# System dependencies for H3 (if needed for compilation)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run unbuffered for logs
ENV PYTHONUNBUFFERED=1

CMD ["python", "main.py"]
