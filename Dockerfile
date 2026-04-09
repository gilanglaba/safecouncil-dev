# syntax=docker/dockerfile:1.6
# ---------------------------------------------------------------------------
# SafeCouncil — single-container Dockerfile
#
# Stage 1: build the React frontend with Node → frontend/dist/
# Stage 2: Python 3.11 runtime that runs Flask (via gunicorn) AND serves
#          the built dist/ as static files. One image, one port, one process
#          group. No registry, no compose, no proxy — point a PaaS (Railway,
#          Render, DGX portal) at this repo with runtime=Docker and it works.
#
# Defaults:
#   - DEMO_MODE=auto (runs the deterministic offline provider if no API keys)
#   - PORT=5000 exposed
#   - .env file inside the container is seeded from backend/.env.example so
#     python-dotenv has something to load even on platforms that don't offer
#     env-var injection.
#   - API keys, model overrides, and DEMO_MODE can all be overridden at
#     `docker run` time with `-e KEY=value`.
#
# Local test:
#   docker build -t safecouncil:dev .
#   docker run --rm -p 5000:5000 safecouncil:dev
#   open http://localhost:5000
# ---------------------------------------------------------------------------

# =============================================================================
# Stage 1 — Frontend build
# =============================================================================
FROM node:20-alpine AS frontend-build

WORKDIR /build/frontend

# Install deps first for better layer caching
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy the rest of the frontend source and build
COPY frontend/ ./
RUN npm run build
# Output: /build/frontend/dist

# =============================================================================
# Stage 2 — Backend runtime + compiled static assets
# =============================================================================
FROM python:3.11-slim AS runtime

# Small base hygiene + predictable Python behavior
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOST=0.0.0.0 \
    PORT=5000 \
    FLASK_DEBUG=false \
    DEMO_MODE=auto \
    STATIC_DIR=/app/frontend/dist

# curl is only here so the HEALTHCHECK below can hit /api/health
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first for better layer caching
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy the backend source
COPY backend/ backend/

# Seed a default .env from the example so python-dotenv always has something
# to load, even on PaaS platforms that don't provide env-var injection. All
# keys in the example are intentionally blank → DEMO_MODE=auto kicks in and
# the offline provider powers the whole synthesis pipeline.
RUN cp backend/.env.example backend/.env

# Copy the built frontend from stage 1
COPY --from=frontend-build /build/frontend/dist /app/frontend/dist

# Writable directories that the backend touches at runtime. Declaring them as
# VOLUMEs lets users (or the PaaS) mount persistent storage if they want audit
# logs and uploaded governance YAMLs to survive container restarts.
RUN mkdir -p /app/backend/logs /app/backend/dimensions/custom
VOLUME ["/app/backend/logs", "/app/backend/dimensions/custom"]

EXPOSE 5000

# Run gunicorn from backend/ so wsgi.py is importable and load_dotenv finds
# backend/.env without any extra config.
WORKDIR /app/backend

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:${PORT:-5000}/api/health || exit 1

# --timeout 300: some evaluations (full deliberative with 3 experts) take
# 60-180s. gunicorn's default 30s would kill them.
# --workers 2 --threads 4: the orchestrator already parallelizes experts via
# ThreadPoolExecutor inside one process, so more threads > more workers here.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 2 --threads 4 --timeout 300 wsgi:app"]
