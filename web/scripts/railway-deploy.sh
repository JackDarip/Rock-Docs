#!/usr/bin/env bash
# One-command rockitdocs launch on Railway.
#
# Needs (as environment variables, never typed into chat or committed):
#   RAILWAY_API_TOKEN     Railway account token (railway.com → Account Settings → Tokens)
#   ANTHROPIC_API_KEY     enables AI reading of bid schedules and supplier quotes
#   SEED_ADMIN_PASSWORD   first admin's password (10+ characters)
# Optional:
#   SEED_ADMIN_EMAIL      first admin's email (default admin@interstaterock.com)
#   PLATFORM_ADMIN_EMAILS who can open /platform to add tenants
#   CUSTOM_DOMAIN         default interstaterock.theanswerai.com
#   PROJECT_NAME          default rockitdocs
#
# Safe to re-run: existing project, database, variables and volume are reused.
# Run from the web/ folder:  bash scripts/railway-deploy.sh
set -euo pipefail

RAILWAY="${RAILWAY_BIN:-npx -y @railway/cli@latest}"
PROJECT_NAME="${PROJECT_NAME:-rockitdocs}"
SERVICE="web"
CUSTOM_DOMAIN="${CUSTOM_DOMAIN:-interstaterock.theanswerai.com}"

need() { [ -n "${!1:-}" ] || { echo "Missing $1. Set it as an environment variable first." >&2; exit 1; }; }
need RAILWAY_API_TOKEN
need ANTHROPIC_API_KEY
need SEED_ADMIN_PASSWORD
[ "${#SEED_ADMIN_PASSWORD}" -ge 10 ] || { echo "SEED_ADMIN_PASSWORD must be at least 10 characters." >&2; exit 1; }
[ -f Dockerfile ] && [ -f railway.json ] || { echo "Run this from the web/ folder." >&2; exit 1; }

step() { printf '\n==> %s\n' "$*"; }

step "Checking Railway login"
$RAILWAY whoami

step "Project"
if $RAILWAY status --json >/dev/null 2>&1; then
  echo "Already linked to a Railway project; reusing it."
else
  $RAILWAY init --name "$PROJECT_NAME" --json
fi

step "Postgres database"
if $RAILWAY service list --json 2>/dev/null | grep -qi '"postgres'; then
  echo "Postgres already exists."
else
  $RAILWAY add --database postgres --json
fi

step "Web service"
if $RAILWAY service list --json 2>/dev/null | grep -q "\"$SERVICE\""; then
  echo "Service '$SERVICE' already exists."
else
  $RAILWAY add --service "$SERVICE" --json
fi
$RAILWAY service link "$SERVICE"

step "Variables (secrets are piped, never echoed)"
$RAILWAY variable set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --service "$SERVICE" --skip-deploys --json >/dev/null
$RAILWAY variable set ROOT_DOMAIN=theanswerai.com DEV_TENANT=interstaterock STORAGE_DIR=/data/storage NODE_ENV=production \
  --service "$SERVICE" --skip-deploys --json >/dev/null
$RAILWAY variable set "SEED_ADMIN_EMAIL=${SEED_ADMIN_EMAIL:-admin@interstaterock.com}" --service "$SERVICE" --skip-deploys --json >/dev/null
[ -n "${PLATFORM_ADMIN_EMAILS:-}" ] && $RAILWAY variable set "PLATFORM_ADMIN_EMAILS=$PLATFORM_ADMIN_EMAILS" --service "$SERVICE" --skip-deploys --json >/dev/null
printf '%s' "$ANTHROPIC_API_KEY" | $RAILWAY variable set ANTHROPIC_API_KEY --stdin --service "$SERVICE" --skip-deploys --json >/dev/null
printf '%s' "$SEED_ADMIN_PASSWORD" | $RAILWAY variable set SEED_ADMIN_PASSWORD --stdin --service "$SERVICE" --skip-deploys --json >/dev/null
echo "Variables set."

step "Storage volume for uploaded plans and quotes (/data)"
if $RAILWAY volume list --json 2>/dev/null | grep -q '/data'; then
  echo "Volume already mounted at /data."
else
  $RAILWAY volume add --service "$SERVICE" --mount-path /data --json
fi

step "Building and deploying (Dockerfile, health check /api/health)"
$RAILWAY up --service "$SERVICE" --ci

step "Domains"
$RAILWAY domain --service "$SERVICE" --json || true
echo
echo "Custom domain $CUSTOM_DOMAIN — add the DNS record shown below at your DNS host (Hostinger):"
$RAILWAY domain "$CUSTOM_DOMAIN" --service "$SERVICE" --port 3000 || true

step "Done"
echo "Sign in at https://$CUSTOM_DOMAIN (after DNS) or the railway.app address above,"
echo "as ${SEED_ADMIN_EMAIL:-admin@interstaterock.com} with the SEED_ADMIN_PASSWORD you set. Change it after first sign-in."
