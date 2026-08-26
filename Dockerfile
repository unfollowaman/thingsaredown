FROM node:20-bookworm-slim

# Install Python 3, FFmpeg, curl, unzip, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Deno for yt-dlp EJS JavaScript challenge solving
RUN curl -fsSL https://deno.land/install.sh | sh \
    && cp /root/.deno/bin/deno /usr/local/bin/deno \
    && chmod a+rx /usr/local/bin/deno

# Install yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy package definition and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy source code and tests
COPY index.html ./
COPY src/ ./src/
COPY server/ ./server/
COPY test/ ./test/

# Expose port and default environment variables
EXPOSE 5173

ENV PORT=5173 \
    NODE_ENV=production

CMD ["npm", "start"]
