FROM node:20-alpine

WORKDIR /app

# Copie des définitions de paquets et installation minimale
COPY package*.json ./
RUN npm install --production || true

# Copie des sources de l'application
COPY server.js ./
COPY static ./static
COPY data ./data

# Port standard configurable (8080 ou 7860 pour Hugging Face Spaces)
ENV PORT=7860
ENV NODE_ENV=production

EXPOSE 7860
EXPOSE 8080

CMD ["node", "server.js"]
