#!/bin/sh
# Builds and uploads dist/ to SiteGround. Server details live in app/.env.deploy (not committed).
set -e
cd "$(dirname "$0")/.."
[ -f .env.deploy ] && . ./.env.deploy
: "${SG_USER:?Set SG_USER in app/.env.deploy}"
: "${SG_HOST:?Set SG_HOST in app/.env.deploy}"
npm run build
rsync -avz --delete -e "ssh -i ${SG_KEY:-$HOME/.ssh/siteground_olmo} -o IdentitiesOnly=yes -p ${SG_PORT:-18765}" dist/ "$SG_USER@$SG_HOST:www/metricas.olmo.agency/public_html/"
