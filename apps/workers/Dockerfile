FROM python:3.12-slim AS base

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

ENV GDAL_CONFIG=/usr/bin/gdal-config

RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install spaCy Spanish model (separate layer — rarely changes)
RUN pip install --no-cache-dir spacy && \
    python -m spacy download es_core_news_sm

COPY pyproject.toml .
COPY src/ src/
RUN pip install --no-cache-dir .

RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser

CMD ["python", "-m", "costa_workers.flows.schedules"]
