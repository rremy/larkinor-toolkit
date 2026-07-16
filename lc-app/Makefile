# lc-app build / deploy
#
#   make build   — build the userscript bundle into dist/
#   make deploy  — build, then ship dist/ + static/ to the server
#                  (scripts/deploy.sh, connection config from repo-root .env)

.PHONY: build deploy

build:
	npm run build

deploy: build
	bash ../scripts/deploy.sh
