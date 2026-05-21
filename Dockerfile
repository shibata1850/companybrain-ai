# =========================================================
# CompanyBrain AI — single-image production build
# - stage 1: install + build frontend (vite)
# - stage 2: lean runtime with the Hono server + dist/
# =========================================================

# ---------- builder ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install all deps (dev included) — needed for vite build
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy source and build the frontend
COPY . .
RUN npm run build

# Prune devDependencies for the runtime stage
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    SERVER_PORT=3001 \
    SERVER_HOST=0.0.0.0 \
    DB_PATH=/app/data/companybrain.db \
    UPLOAD_DIR=/app/uploads

# Copy production-only artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./package.json

# Persistent state lives under these mount points
RUN mkdir -p /app/data /app/uploads
VOLUME ["/app/data", "/app/uploads"]

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.SERVER_PORT||3001)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
