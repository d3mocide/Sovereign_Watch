FROM python:3.12-slim

RUN pip install --no-cache-dir asyncpg==0.31.0

COPY migrate.py /migrate.py

ENTRYPOINT ["python", "/migrate.py"]
