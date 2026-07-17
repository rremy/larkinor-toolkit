# lc-app build / deploy
#
#   make dev     — dev server for the userscript UI (vite.config.ts)
#   make dev-db  — dev server for the standalone DB explorer (vite.config.db.ts)
#   make build   — build both the userscript and the DB site into dist/
#   make deploy  — build, then ship dist/ + static/ to the server
#                  (scripts/deploy.sh, connection config from repo-root .env)

.PHONY: dev dev-db build deploy

dev:
	npm run dev

dev-db:
	npm run dev:db

build:
	npm run build

deploy: build
	bash scripts/deploy.sh
