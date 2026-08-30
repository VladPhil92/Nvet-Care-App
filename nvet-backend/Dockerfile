# TEMPORARY P0 COMPATIBILITY BRIDGE
#
# Railway production historically pointed at /nvet-backend. PR #26 removed
# that directory when the canonical backend moved to /backend. Some Railway
# services also retain an explicit builder/build command, so this directory
# supports BOTH Dockerfile and Nixpacks/Railpack-style execution while still
# keeping backend/ as the only product source tree.
#
# Remove this bridge once Railway source.rootDirectory is permanently changed
# to /backend and a native deployment from that root is verified SUCCESS.

FROM node:22-bookworm-slim

ARG RAILWAY_GIT_COMMIT_SHA

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN test -n "$RAILWAY_GIT_COMMIT_SHA" || (echo "RAILWAY_GIT_COMMIT_SHA is required for the compatibility bridge" && exit 1)

WORKDIR /compat

COPY package.json bridge.mjs ./
RUN npm install --no-audit --no-fund

# Build the canonical backend from the exact immutable Git SHA associated
# with this Railway deployment. bridge.mjs uses the repository lockfile and
# workspaces after extracting that SHA.
RUN RAILWAY_GIT_COMMIT_SHA="$RAILWAY_GIT_COMMIT_SHA" npm run build

ENV NODE_ENV=production

# Runtime deploy:preflight receives Railway's real DATABASE_URL. It reconciles
# Prisma without --accept-data-loss and applies only idempotent SQL guards.
CMD ["npm", "run", "start:prod"]
