# TEMPORARY P0 COMPATIBILITY BRIDGE
#
# Railway currently builds this Dockerfile with the repository root as the
# Docker build context. Keep every COPY source explicitly rooted under
# nvet-backend/ so the bridge works independently of the Dockerfile location.
#
# Remove this bridge after the canonical monorepo-root Railway cutover is
# verified healthy.

FROM node:22-bookworm-slim

ARG RAILWAY_GIT_COMMIT_SHA

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN test -n "$RAILWAY_GIT_COMMIT_SHA" || (echo "RAILWAY_GIT_COMMIT_SHA is required for the compatibility bridge" && exit 1)

WORKDIR /compat

COPY nvet-backend/package.json nvet-backend/bridge.mjs nvet-backend/runtime-smoke.mjs ./
RUN node --check bridge.mjs \
  && node --check runtime-smoke.mjs \
  && npm install --no-audit --no-fund

# Build the canonical backend from the exact immutable Git SHA associated
# with this Railway deployment. bridge.mjs uses the repository lockfile and
# workspaces after extracting that SHA.
RUN RAILWAY_GIT_COMMIT_SHA="$RAILWAY_GIT_COMMIT_SHA" npm run build

ENV NODE_ENV=production

# Runtime deploy:preflight receives Railway's real DATABASE_URL. After NestJS
# starts, runtime-smoke.mjs verifies readiness and a synthetic /auth/login call.
# Any 5xx/Prisma failure terminates the process so Railway rejects the release.
CMD ["npm", "run", "start:prod"]
