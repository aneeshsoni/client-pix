# =============================================================================
# Nginx Reverse Proxy Dockerfile
# =============================================================================
# Bundles the nginx.conf into the image so it works with deployment platforms
# like Coolify that don't support bind mounts for config files.
# =============================================================================

FROM nginx:alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1
