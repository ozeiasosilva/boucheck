FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN node ace build

# --- Production image ---
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/build ./
RUN npm ci --omit=dev

EXPOSE 3333

CMD ["node", "bin/server.js"]
