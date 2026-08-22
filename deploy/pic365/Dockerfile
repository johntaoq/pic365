FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY dist ./dist
COPY server ./server
COPY api ./api
COPY shared ./shared
COPY scripts/create-sqlite-backup.mjs scripts/check-sqlite.mjs scripts/inspect-production-db-safety.mjs ./scripts/

RUN mkdir -p /app/data/generated

EXPOSE 5173
CMD ["node", "server/index.js"]
