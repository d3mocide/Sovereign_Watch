.PHONY: dev prod build logs ps down

## Start in development mode (Vite HMR, uvicorn --reload, live source mounts)
dev:
	docker compose -f docker-compose.yml -f compose.dev.yml up -d --build

## Start in production mode (static frontend build, no reload)
prod:
	docker compose up -d --build

## Build all images
build:
	docker compose build

## Build dev images
build-dev:
	docker compose -f docker-compose.yml -f compose.dev.yml build

## Tail logs (all services, or pass service= to filter)
logs:
	docker compose logs -f $(service)

## Show running containers
ps:
	docker compose ps

## Stop and remove containers (keeps volumes)
down:
	docker compose down
