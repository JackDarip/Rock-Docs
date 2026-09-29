FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN mkdir -p public && npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 STORAGE_DIR=/data/storage
COPY --from=build /app ./
VOLUME ["/data"]
EXPOSE 3000
# Apply migrations, create tenant #1 on first boot (idempotent), then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && npm start"]
