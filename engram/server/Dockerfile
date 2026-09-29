# Image du serveur Engram. À construire depuis le dossier engram/ :
#   docker build -f server/Dockerfile -t engram .
#   docker run -p 8787:8787 -e ANTHROPIC_API_KEY=... engram
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY index.html dossier.html manifest.webmanifest sw.js ./
COPY icons ./icons
COPY decouvrir ./decouvrir
COPY server/server.mjs server/core.mjs ./server/
ENV PORT=8787 NODE_ENV=production
EXPOSE 8787
USER node
CMD ["node", "server/server.mjs"]
