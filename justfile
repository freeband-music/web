default:
    @just --list

# Run the server (port 7000) and the web app (http://localhost:5173, also reachable from the LAN)
dev:
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    pnpm run dev:server &
    pnpm exec vite --host --port 5173 --strictPort

# Unit tests
test:
    pnpm test

# Tests, type checks and production builds of the client and the server
check: test
    pnpm run typecheck
    pnpm build
    pnpm run build:server

# Production builds of the client (dist/) and the server (dist-server/)
build:
    pnpm build
    pnpm run build:server

# Run the production build on port 7000 (needs FREEBAND_SECRET_KEY)
start: build
    NODE_ENV=production pnpm start

# Database migrations: latest (default), up or down (one step)
migrate direction="latest":
    pnpm run migrate {{direction}}

# Regenerate protocol types from the protocol repository's openapi.yaml
gen:
    pnpm dlx openapi-typescript@7 "${FREEBAND_PROTOCOL:-../protocol}/openapi.yaml" -o src/protocol/schema.gen.ts
