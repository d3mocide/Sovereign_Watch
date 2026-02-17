# Development Dockerfile for Frontend
FROM node:20-alpine

WORKDIR /app

# Copy package definition
COPY package*.json ./

# Install dependencies inside the container
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Expose Vite port
EXPOSE 3000

# Start development server with host exposure
CMD ["npm", "run", "dev", "--", "--host"]
