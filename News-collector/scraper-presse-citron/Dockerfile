# Use the latest Puppeteer image as the base
FROM ghcr.io/puppeteer/puppeteer:21.6.1

# Switch to root user to install additional packages
USER root

# Install necessary packages
RUN apt-get update && apt-get install -y \
    postgresql-client \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install all dependencies, including puppeteer, puppeteer-core, and puppeteer-extra
RUN npm install

# Copy the rest of your app's source code from your host to your image filesystem.
COPY . .

# Set proper permissions for the working directory
RUN mkdir -p /usr/src/app/presse-citron-articles && \
    chown -R pptruser:pptruser /usr/src/app && \
    chmod -R 755 /usr/src/app

# Switch back to pptruser for security
USER pptruser

# Expose port 3000
EXPOSE 3000

# Command to run your script
CMD ["node", "scraper-presse-citron.js"]
