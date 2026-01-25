FROM node:18-bullseye-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Expose port (though host mode makes this redundant, it's good documentation)
EXPOSE 3040

CMD ["node", "src/server.js"]
