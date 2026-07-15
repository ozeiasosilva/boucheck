FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN node ace build

# --- Production image ---
FROM node:22-slim
WORKDIR /app

COPY --from=builder /app/build ./
RUN npm ci --omit=dev

# Install Playwright Chromium + ALL required system dependencies
RUN npx playwright install --with-deps chromium

EXPOSE 3333

CMD ["node", "bin/server.js"]
