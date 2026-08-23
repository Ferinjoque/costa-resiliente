FROM python:3.12-slim AS base

WORKDIR /app

# System deps for geospatial libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin \
    libgdal-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV GDAL_CONFIG=/usr/bin/gdal-config

RUN pip install --no-cache-dir --upgrade pip setuptools wheel

COPY pyproject.toml .
COPY src/ src/
RUN pip install --no-cache-dir -e .

RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser

# ── Development target (hot-reload via docker-compose.override.yml) ──────────
# Dev extras (pytest et al.) belong here and only here — production stays lean.
# Without this the test suite can only run if someone pip-installs pytest into a
# live container by hand, which does not survive a rebuild.
FROM base AS development
USER root
RUN pip install --no-cache-dir -e ".[dev]"
USER appuser
CMD ["uvicorn", "costa_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ── Production target ─────────────────────────────────────────────────────────
FROM base AS production
CMD ["uvicorn", "costa_api.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", "--access-log"]

FROM production
