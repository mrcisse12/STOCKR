# Image du serveur Engram. À construire depuis le dossier engram/ :
#   docker build -f server/Dockerfile -t engram .
#   docker run -p 8787:8787 -v engram-data:/app/server/data -e ANTHROPIC_API_KEY=... engram
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY index.html dossier.html manifest.webmanifest sw.js ./
COPY icons ./icons
COPY decouvrir ./decouvrir
COPY server/*.mjs ./server/
# Comptes, synchronisation et secret des sessions vont dans /app/server/data : montez-y un volume pour les garder
# (docker run -v engram-data:/app/server/data …).
RUN mkdir -p /app/server/data && chown node:node /app/server/data
VOLUME /app/server/data
ENV PORT=8787 NODE_ENV=production
EXPOSE 8787
USER node
CMD ["node", "server/server.mjs"]
