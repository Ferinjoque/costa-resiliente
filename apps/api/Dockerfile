FROM python:3.12-slim AS base

WORKDIR /app

# System deps for geospatial libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin \
    libgdal-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV GDAL_CONFIG=/usr/bin/gdal-config

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY src/ src/

# ── Development target (hot-reload via docker-compose.override.yml) ──────────
FROM base AS development
CMD ["uvicorn", "costa_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ── Production target ─────────────────────────────────────────────────────────
FROM base AS production
CMD ["uvicorn", "costa_api.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", "--access-log"]

FROM production
