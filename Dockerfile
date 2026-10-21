FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && mkdir -p /app/state/auth_info_baileys /app/state/data \
  && chown -R node:node /app

COPY --chown=node:node . .
USER node

ENV AUTH_DIRECTORY=/app/state/auth_info_baileys
ENV STORAGE_FILE=/app/state/data/store.json

CMD ["node", "index.js"]
