FROM oven/bun:1-slim

# Install stress tools for testing
RUN apt-get update && apt-get install -y \
    stress-ng \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Copy source
COPY . .

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
