# Use Node.js LTS
FROM node:20-slim

# Install dependencies for building native modules and python for the pty trick
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    util-linux \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Build the frontend
RUN npm run build

# Expose the port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the server
CMD ["npm", "start"]