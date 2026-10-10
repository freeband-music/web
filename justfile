default:
    @just --list

# Run the web app (http://localhost:5173, also reachable from the LAN)
dev:
    pnpm exec vite --host --port 5173 --strictPort

# Unit tests
test:
    pnpm test

# Tests, type check and production build
check: test
    pnpm exec tsc --noEmit
    pnpm build

# Regenerate protocol types from the protocol repository's openapi.yaml
gen:
    pnpm dlx openapi-typescript@7 "${FREEBAND_PROTOCOL:-../protocol}/openapi.yaml" -o src/protocol/schema.gen.ts
