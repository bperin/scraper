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

# Production stage using selenium/standalone-chrome
FROM --platform=linux/arm64 selenium/standalone-chrome:latest

# Set up Node.js
RUN sudo apt-get update &&
    sudo apt-get install -y curl &&
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - &&
    sudo apt-get install -y nodejs &&
    sudo npm install -g npm@latest

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Set environment variables for Chrome
ENV SE_NODE_MAX_SESSIONS=10 \
    SE_NODE_OVERRIDE_MAX_SESSIONS=true \
    SE_NODE_SESSION_TIMEOUT=300 \
    SE_START_XVFB=false \
    CHROME_FLAGS="--headless --no-sandbox --disable-gpu --disable-dev-shm-usage"

EXPOSE 3100

# Command to run the application
CMD ["node", "dist/index.js"]
