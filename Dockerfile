# Stage 1: Build Stage
FROM node:18-alpine AS builder

# Install necessary packages for Chrome and Selenium
RUN apk add --no-cache chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont

# Set environment variables for Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV CHROME_BIN=/usr/bin/chromium-browser

# Set working directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 2: Production Stage
FROM node:18-alpine

# Install necessary packages for Chrome and Selenium
RUN apk add --no-cache chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont

# Set environment variables for Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV CHROME_BIN=/usr/bin/chromium-browser

# Set working directory
WORKDIR /usr/src/app

# Install only production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy built files from the builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Copy necessary static files (if any)
# COPY --from=builder /usr/src/app/.env ./

# Expose the port
EXPOSE 3000

# Define environment variables (can be overridden by AWS Copilot)
ENV PORT=3000

# Start the application
CMD ["node", "dist/index.js"]
