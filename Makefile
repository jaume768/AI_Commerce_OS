.PHONY: help install dev up down logs migrate seed test smoke clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	pnpm install

dev: ## Start all services via docker compose
	docker compose up --build -d

up: ## Start services (no rebuild)
	docker compose up -d

down: ## Stop all services
	docker compose down

logs: ## Tail logs for all services
	docker compose logs -f

logs-api: ## Tail API logs
	docker compose logs -f api-node

logs-worker: ## Tail worker logs
	docker compose logs -f worker

logs-agent: ## Tail agent-service logs
	docker compose logs -f agent-service

logs-dash: ## Tail dashboard logs
	docker compose logs -f dashboard-next

migrate: ## Run database migrations
	docker compose exec api-node node infra/migrations/run.js

seed: ## Seed database with demo data
	DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aicommerce node infra/scripts/seed.js

seed-docker: ## Seed database from within docker network
	docker compose exec api-node node infra/scripts/seed.js

smoke: ## Run smoke tests against local services
	bash infra/scripts/smoke-test.sh

clean: ## Remove volumes and containers
	docker compose down -v --remove-orphans

ps: ## Show running services
	docker compose ps

restart: ## Restart all services
	docker compose restart

rebuild: ## Full rebuild and restart
	docker compose down
	docker compose up --build -d

observability: ## Start with observability stack
	docker compose --profile observability up --build -d

tools: ## Start with tools (pgAdmin)
	docker compose --profile tools up -d

shell-api: ## Open shell in api-node container
	docker compose exec api-node sh

shell-db: ## Open psql shell
	docker compose exec postgres psql -U postgres -d aicommerce
