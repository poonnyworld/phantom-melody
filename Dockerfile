FROM node:20-slim

# Install ffmpeg, curl, yt-dlp, and deps for @discordjs/opus native build (arm64 needs compile)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
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
