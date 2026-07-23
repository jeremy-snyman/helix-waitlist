# helix.work front doors. Data lives in /data (mount a persistent volume).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs context-pack.md ./
COPY public ./public
EXPOSE 3000
USER node
CMD ["node", "server.mjs"]
