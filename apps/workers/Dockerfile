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

# Install spaCy Spanish model
RUN pip install --no-cache-dir spacy && \
    python -m spacy download es_core_news_sm

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY src/ src/

CMD ["python", "-m", "costa_workers.flows.schedules"]
