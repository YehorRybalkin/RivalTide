# Worker image (also runs the web app if you prefer containers over Vercel).
# Playwright base image includes Chromium and its system dependencies.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    MONITOR_BROWSER_ENABLED=true

COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts

COPY . .

# Build the web app so the same image can serve it (`npm start`).
RUN npm run build

# Run as the unprivileged user provided by the base image.
USER pwuser

# Default: background worker. For the web app: CMD ["npm", "start"]
CMD ["npm", "run", "worker"]
