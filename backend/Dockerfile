# AklatOne API (Express + Prisma). Build: docker build -t aklatone-api ./backend
FROM node:24-bookworm-slim AS build
WORKDIR /app
# bcrypt is a native module: build tools are needed only in this stage.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Dev dependencies stay: the Prisma CLI is needed at start to apply migrations.
RUN npx prisma generate && npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# mariadb-client provides mariadb-dump / mariadb for Settings > Backup and Restore.
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl mariadb-client && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/assets ./assets
COPY --from=build /app/scripts ./scripts
COPY prisma.config.ts package.json ./
ENV BACKUP_DIR=/app/backups COVER_DIR=/app/covers
RUN mkdir -p /app/backups /app/covers && chown node:node /app/backups /app/covers
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fs http://localhost:3000/health || exit 1
# Apply pending migrations (never resets data), make sure the roles exist (idempotent; no test accounts in production), then start.
# Migrations and the role seed need the full-rights user (DATABASE_ADMIN_URL); the server itself runs with DATABASE_URL.
CMD ["sh", "-c", "DATABASE_URL=\"${DATABASE_ADMIN_URL:-$DATABASE_URL}\" npx prisma migrate deploy && DATABASE_URL=\"${DATABASE_ADMIN_URL:-$DATABASE_URL}\" npx tsx prisma/seed.ts && node dist/src/server.js"]
