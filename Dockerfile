# Build stage
FROM --platform=linux/arm64 node:18-alpine as builder

WORKDIR /app

# Install Chrome and dependencies for Selenium
RUN apk add --no-cache \
    chromium \
    chromium-chromedriver \
    harfbuzz \
    nss \
    freetype \
    ttf-freefont

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript code
RUN npm run build

# Production stage
FROM --platform=linux/arm64 node:18-bullseye-slim

WORKDIR /app

# Install Chrome and dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for Chrome
ENV CHROME_BIN=/usr/bin/chromium \
    CHROME_PATH=/usr/lib/chromium/ \
    CHROME_FLAGS="--headless --no-sandbox --disable-gpu --disable-dev-shm-usage" \
    PORT=3100

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Create a non-root user
RUN groupadd -r appuser && \
    useradd -r -g appuser -G audio,video appuser && \
    mkdir -p /home/appuser && \
    chown -R appuser:appuser /home/appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 3100

# Command to run the application
CMD ["node", "dist/index.js"]
