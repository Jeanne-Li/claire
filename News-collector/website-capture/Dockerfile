# Use an official Node.js image
FROM node:18

# Set the working directory in the container
WORKDIR /app

# Copy the package*.json files
COPY package*.json ./

# Install the dependencies
RUN npm install

# Copy the application code
COPY . .

# Expose the port the server will run on
EXPOSE 3000

# Run the command to start the server when the container launches
CMD [ "node", "server.js" ]
