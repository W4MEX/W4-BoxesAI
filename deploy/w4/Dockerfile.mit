FROM node:24.22.1-bookworm-slim@sha256:f002293d7318ff8f0c798ba004323654c0305e364b76307762cc8a1350533721
RUN apt-get update && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*
ADD runtime.tar /opt/w4/
RUN ln -s /opt/w4/runtime /usr/src/app && ln -s /opt/w4/engine-native /usr/src/node_modules && ln -s /opt/w4/bin/bun /usr/local/bin/bun && ln -s /opt/w4/bin/deno /usr/local/bin/deno
WORKDIR /usr/src/app
ENV NODE_ENV=production AP_EDITION=ce AP_ENVIRONMENT=prod AP_DB_TYPE=POSTGRES AP_REDIS_TYPE=STANDALONE AP_EXECUTION_MODE=SANDBOX_CODE_ONLY AP_DENO_PATH=/usr/local/bin/deno AP_ENGINE_EXECUTABLE_PATH=dist/packages/engine/main.js AP_PORT=80 AP_TELEMETRY_ENABLED=false AP_CLOUD_AUTH_ENABLED=false
RUN mkdir -p /usr/src/app/cache /usr/src/app/tmp && chown -R node:node /usr/src/app/cache /usr/src/app/tmp
USER node
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=5m --retries=5 CMD node -e "fetch('http://127.0.0.1:80/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "deploy/w4/start.cjs"]
LABEL org.opencontainers.image.title="W4-BoxesAI" org.opencontainers.image.version="0.1.0-mit.001" org.opencontainers.image.licenses="MIT AND third-party-notices" org.opencontainers.image.base.name="node:24.22.1-bookworm-slim"
