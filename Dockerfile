FROM node:20-slim

# python3 is needed for the pty spawn trick (makes terminals behave like a real tty)
# util-linux provides nsenter (used to enter host namespaces)
# build-essential is needed to compile native npm modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    util-linux \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["npm", "start"]