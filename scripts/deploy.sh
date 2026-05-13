#!/usr/bin/env bash
# deploy.sh — Bootstrap Costa Resiliente on a fresh Ubuntu 22/24 LTS VPS.
#
# VPS sizing:
#   Minimum (qwen3:8b model):    Hetzner CX32  4 vCPU / 8 GB RAM  / 80 GB SSD  — €11/mo
#   Recommended (gemma4:e4b):    Hetzner CX42  8 vCPU / 16 GB RAM / 240 GB SSD — €17/mo
#   DigitalOcean equivalent:     4 vCPU / 8 GB  → $48/mo  |  8 vCPU / 16 GB → $96/mo
#
# Usage:
#   # 1. SSH into fresh VPS
#   # 2. Copy your .env.production to the server
#   # 3. Run:
#   bash <(curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/costa-resiliente/develop/scripts/deploy.sh)
#
# Or clone first and run locally on the server:
#   git clone -b develop https://github.com/YOUR_ORG/costa-resiliente.git
#   cd costa-resiliente
#   bash scripts/deploy.sh

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/YOUR_ORG/costa-resiliente.git}"
BRANCH="${BRANCH:-develop}"
INSTALL_DIR="${INSTALL_DIR:-/opt/costa-resiliente}"
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:e4b}"   # set to qwen3:8b on 8GB RAM servers

echo "==> Costa Resiliente — production deploy"
echo "    Repo:   ${REPO_URL}"
echo "    Branch: ${BRANCH}"
echo "    Dir:    ${INSTALL_DIR}"
echo "    Model:  ${OLLAMA_MODEL}"
echo ""

# ── 1. System packages ────────────────────────────────────────────────────────
echo "==> Installing system packages..."
apt-get update -q
apt-get install -y -q \
    ca-certificates \
    curl \
    gnupg \
    git \
    ufw \
    fail2ban

# ── 2. Docker (official repo) ─────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    echo "==> Installing Docker..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -q
    apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
    echo "==> Docker installed."
else
    echo "==> Docker already installed, skipping."
fi

# ── 3. Firewall ───────────────────────────────────────────────────────────────
echo "==> Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable
echo "==> Firewall active: SSH + HTTP + HTTPS allowed."

# ── 4. Clone / update repo ────────────────────────────────────────────────────
if [ -d "${INSTALL_DIR}/.git" ]; then
    echo "==> Updating existing repo at ${INSTALL_DIR}..."
    git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
else
    echo "==> Cloning repo to ${INSTALL_DIR}..."
    git clone -b "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"

# ── 5. Environment file ───────────────────────────────────────────────────────
if [ ! -f .env ]; then
    if [ -f .env.production.example ]; then
        cp .env.production.example .env
        echo ""
        echo "==> IMPORTANT: .env copied from .env.production.example"
        echo "    Edit ${INSTALL_DIR}/.env before continuing:"
        echo "      - Set POSTGRES_PASSWORD (strong random value)"
        echo "      - Set APP_SECRET_KEY (strong random value)"
        echo "      - Set MINIO_SECRET_KEY (strong random value)"
        echo "      - Set PUBLIC_DOMAIN (e.g. costa.yourdomain.com)"
        echo "      - Set EARTHDATA_USERNAME / EARTHDATA_PASSWORD"
        echo "      - Set OLLAMA_PRIMARY_MODEL=${OLLAMA_MODEL}"
        echo ""
        read -rp "Press Enter after editing .env to continue, or Ctrl-C to abort..."
    else
        echo "ERROR: No .env or .env.production.example found. Copy your .env first."
        exit 1
    fi
else
    echo "==> .env already exists, using it."
fi

# Verify PUBLIC_DOMAIN is set
source .env 2>/dev/null || true
if [ -z "${PUBLIC_DOMAIN:-}" ]; then
    echo "ERROR: PUBLIC_DOMAIN is not set in .env. Set it to your domain or server IP."
    exit 1
fi
echo "==> PUBLIC_DOMAIN=${PUBLIC_DOMAIN}"

# ── 6. Pull images + build ────────────────────────────────────────────────────
echo "==> Pulling base images..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull \
    postgres redis minio caddy 2>/dev/null || true

echo "==> Building application images (this takes 5-10 min on first run)..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build \
    --no-cache api web prefect-worker

# ── 7. Start stack ────────────────────────────────────────────────────────────
echo "==> Starting stack..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "==> Waiting for services to become healthy (up to 3 min)..."
for i in $(seq 1 36); do
    if docker compose ps | grep -E "(unhealthy|starting)" &>/dev/null; then
        sleep 5
    else
        break
    fi
done
docker compose ps

# ── 8. Pull Ollama model ──────────────────────────────────────────────────────
echo "==> Pulling Ollama model: ${OLLAMA_MODEL}"
echo "    (This can take 10-30 min depending on model size and bandwidth)"
docker exec costa-ollama ollama pull "${OLLAMA_MODEL}" || \
    echo "WARNING: Ollama pull failed. Run manually: docker exec costa-ollama ollama pull ${OLLAMA_MODEL}"

# ── 9. One-time data bootstrap ────────────────────────────────────────────────
echo ""
echo "==> One-time data bootstrap (run manually if first deploy):"
echo "    docker exec costa-prefect-worker python scripts/load_lima_geodata.py"
echo "    docker exec costa-prefect-worker python scripts/load_sigrid.py"
echo "    docker exec costa-prefect-worker prefect deployment run sentinel1-ingest/sentinel1-daily"
echo "    docker exec costa-prefect-worker prefect deployment run imerg-ingest/imerg-hourly"
echo ""

# ── 10. Done ──────────────────────────────────────────────────────────────────
echo "==================================================="
echo "  Costa Resiliente is live!"
echo "  URL: https://${PUBLIC_DOMAIN}"
echo "  API: https://${PUBLIC_DOMAIN}/api/v1/health"
echo "==================================================="
echo ""
echo "Useful commands:"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"
echo "  docker exec costa-ollama ollama list"
