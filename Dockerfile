FROM node:22-slim

# Install stress tools for testing
RUN apt-get update && apt-get install -y \
    stress-ng \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Build
RUN npm run build

EXPOSE 3001

CMD ["npm", "run", "dev"]
