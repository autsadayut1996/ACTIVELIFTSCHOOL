# ActiveLift School server: Node 22 + built-in SQLite, no npm dependencies.
ARG NODE_IMAGE=node:22-slim
FROM ${NODE_IMAGE}

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/activelift.db \
    BACKUP_DIR=/data/backups \
    TRUST_PROXY=1

COPY package.json index.html ./
COPY css ./css
COPY js ./js
COPY landing ./landing
COPY admin ./admin
COPY server ./server

# The database lives on a mounted volume at /data; run as the unprivileged node user.
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
