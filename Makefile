.PHONY: install lint typecheck test test-gateway test-eval-worker dev-gateway compose-up compose-down

install:
	pnpm install

lint:
	pnpm run lint

typecheck:
	pnpm run typecheck

test:
	pnpm run test

test-gateway:
	pnpm run test:gateway

test-eval-worker:
	pnpm run test:eval-worker

dev-gateway:
	pnpm --filter @igp/gateway dev

compose-up:
	docker compose up -d

compose-down:
	docker compose down
