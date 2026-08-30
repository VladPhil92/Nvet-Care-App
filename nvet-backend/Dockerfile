# TEMPORARY P0 COMPATIBILITY BRIDGE
#
# Railway production historically pointed at /nvet-backend. PR #26 removed
# that directory when the canonical backend moved to /backend, which caused
# every native Railway deploy to fail before it could build the application.
#
# This image keeps the stale Railway root deployable WITHOUT reintroducing a
# second backend source tree. It downloads the exact Git SHA that triggered
# the Railway deployment, builds that commit's canonical /backend package,
# and runs its fail-closed production predeploy before starting NestJS.
#
# Remove this bridge once Railway source.rootDirectory is permanently changed
# to /backend and a native deployment from that root is verified SUCCESS.

FROM node:22-bookworm-slim

ARG RAILWAY_GIT_COMMIT_SHA

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN test -n "$RAILWAY_GIT_COMMIT_SHA" || (echo "RAILWAY_GIT_COMMIT_SHA is required for the compatibility bridge" && exit 1)

WORKDIR /src

RUN curl --fail --silent --show-error --location \
      "https://codeload.github.com/VladPhil92/Nvet-Care-App/tar.gz/${RAILWAY_GIT_COMMIT_SHA}" \
      --output /tmp/nvet-source.tar.gz \
  && tar -xzf /tmp/nvet-source.tar.gz --strip-components=1 -C /src \
  && rm /tmp/nvet-source.tar.gz

WORKDIR /src/backend

RUN npm install --no-audit --no-fund
RUN DATABASE_URL="postgresql://stub:stub@localhost:5432/stub?schema=public" npm run prisma:generate
RUN npm run build

# Keep the final working directory at the legacy service root semantics so an
# old Railway Start Command such as `npm run start:prod` still executes the
# compatibility package below. That script delegates to /src/backend.
WORKDIR /compat
COPY package.json /compat/package.json

ENV NODE_ENV=production

CMD ["npm", "run", "start:prod"]
