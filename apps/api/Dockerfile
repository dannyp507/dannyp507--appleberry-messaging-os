# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
RUN apt-get update -y && apt-get install -y openssl ca-certificates git && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN NODE_ENV=development npm install --legacy-peer-deps
# Patch Baileys to expose @lid in onWhatsApp() results.
# WhatsApp migrated users to @lid identifiers; without this, messages sent to
# @s.whatsapp.net JIDs for @lid users fail with "Waiting for this message."
RUN sed -i 's/, id };/, id, lid: node === null || node === void 0 ? void 0 : node.attrs.lid };/' \
      node_modules/@whiskeysockets/baileys/lib/WAUSync/USyncQuery.js && \
    sed -i 's/map(({ contact, id }) => ({ jid: id, exists: contact }))/map(({ contact, id, lid }) => ({ jid: id, exists: contact, lid }))/' \
      node_modules/@whiskeysockets/baileys/lib/Socket/chats.js

FROM base AS build
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema ./prisma/schema.prisma
RUN npm run build

FROM base AS runner
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
ENV PORT=3001
EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
