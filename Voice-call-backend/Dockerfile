FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Install dependencies (use package-lock if present for reproducible builds)
COPY package*.json ./
RUN npm ci --only=production || npm install --only=production

# Copy source
COPY . .

# Ensure runtime directories exist
RUN mkdir -p /usr/src/app/uploads /usr/src/app/data /usr/src/app/tmp

# Expose port and run
EXPOSE 3001
CMD ["npm", "start"]
