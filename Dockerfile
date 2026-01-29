FROM node:18-slim

# Install ffmpeg and dependencies for audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
# Use npm install instead of npm ci since package-lock.json may not exist yet
RUN npm install

# Copy source code
COPY src/ ./src/

# Copy music files (local MP3 files)
COPY music/ ./music/

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build to reduce image size
RUN npm prune --production

# No port needed - this is a Discord bot without web server
# EXPOSE is not needed

# Start the bot
CMD ["npm", "start"]
