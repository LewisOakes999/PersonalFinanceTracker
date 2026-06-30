# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# OpenSSL is needed by Prisma's engines.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching).
COPY server/package*.json server/
COPY client/package*.json client/
RUN npm install --prefix server && npm install --prefix client

# Copy sources and build.
COPY server server
COPY client client
RUN npm --prefix server run prisma:generate \
    && npm --prefix server run build \
    && npm --prefix client run build

# ---------- Runtime stage ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app/server
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Server runtime: compiled code, deps (incl. Prisma CLI + generated client),
# the schema/migrations, and the built client the server serves.
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/server/prisma ./prisma
COPY --from=build /app/client/dist /app/client/dist

# Hosts inject PORT; default to 4000 for local runs.
ENV PORT=4000
EXPOSE 4000

# Apply any pending migrations, then start the API + client server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
