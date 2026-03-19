# Use a specific minor version tag to avoid unintended updates.
# Verify the digest at: https://hub.docker.com/_/node/tags
FROM node:20-slim

# Set working directory
WORKDIR /usr/src/app

# Copy dependency manifests first (layer-cache optimisation)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Create a non-root user and switch to it (security hardening)
RUN addgroup --system --gid 1001 appgroup \
 && adduser  --system --uid 1001 --ingroup appgroup --no-create-home appuser \
 && chown -R appuser:appgroup /usr/src/app

USER appuser

# Expose the port the app listens on
EXPOSE 8080

# Healthcheck so orchestrators know when the service is ready
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD [ "node", "index.js" ]
