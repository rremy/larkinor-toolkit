#!/usr/bin/env bash
#
# deploy.sh — Deploy the built userscript to the Larkinor server.
#
# Copies everything from lc-userscript/dist to the remote server via scp.
# Connection details are read from a git-ignored .env at the repo root
# (copy .env.example to .env and fill it in).

set -euo pipefail

# Resolve paths relative to this script so it works from any working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
DIST_DIR="${REPO_ROOT}/lc-userscript/dist"
STATIC_DIR="${REPO_ROOT}/lc-userscript/static"

# --- Configuration (from .env) -----------------------------------------------
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Error: ${ENV_FILE} not found. Copy .env.example to .env and fill it in." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${REMOTE_USER:?REMOTE_USER not set in .env}"
: "${REMOTE_HOST:?REMOTE_HOST not set in .env}"
: "${REMOTE_DIR:?REMOTE_DIR not set in .env}"

# --- Pre-flight checks -------------------------------------------------------
if [[ ! -d "${DIST_DIR}" ]]; then
  echo "Error: dist directory not found: ${DIST_DIR}" >&2
  exit 1
fi

if [[ -z "$(ls -A "${DIST_DIR}")" ]]; then
  echo "Error: dist directory is empty: ${DIST_DIR}" >&2
  exit 1
fi

# --- Deploy ------------------------------------------------------------------
echo "Deploying ${DIST_DIR}/ -> ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
scp -r "${DIST_DIR}/." "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "Deploying ${STATIC_DIR}/ -> ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
scp -r "${STATIC_DIR}/." "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/static/"

echo "Done."
