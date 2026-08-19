# helix.work front doors. Data lives in /data (mount a persistent volume).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs context-pack.md albion-bank.md helix-bank.md mindlynx-bank.md ./
COPY public ./public
# Host file modes must not leak into the image (600 pages once EACCESed as USER
# node). `chmod 644 /app/public/*` was fine while public/ was flat, but the
# Pressure Index adds public/pressure-index/ -- and 644 on a DIRECTORY makes it
# untraversable, so every per-entry address would 500 as USER node. Walk the
# tree instead: directories 755, files 644.
RUN chmod 644 /app/server.mjs /app/context-pack.md /app/*-bank.md \
 && find /app/public -type d -exec chmod 755 {} + \
 && find /app/public -type f -exec chmod 644 {} +
EXPOSE 3000
USER node
CMD ["node", "server.mjs"]
