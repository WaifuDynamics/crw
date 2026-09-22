FROM node:24-bookworm-slim AS build
WORKDIR /crw
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY scripts/patch-compat.cjs scripts/patch-compat.cjs
RUN npm ci --ignore-scripts
RUN node scripts/patch-compat.cjs
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations
RUN npm run build -w @crw/api
RUN mkdir -p apps/api/node_modules

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /crw/apps/api
COPY --from=build --chown=node:node /crw/node_modules /crw/node_modules
COPY --from=build --chown=node:node /crw/apps/api/node_modules ./node_modules
COPY --from=build --chown=node:node /crw/apps/api/dist ./dist
COPY --from=build --chown=node:node /crw/apps/api/migrations ./migrations
COPY --from=build --chown=node:node /crw/apps/api/package.json ./package.json
# Served at /dev-media/ by the non-production media adapter. Without it every
# seeded avatar and event photo 404s, and the browser reports the JSON error
# body as ERR_BLOCKED_BY_ORB rather than a broken image.
COPY --chown=node:node apps/api/public ./public
# The non-production media adapters create data/uploads under the working
# directory at boot, which WORKDIR leaves owned by root.
RUN mkdir -p ./data/uploads && chown -R node:node /crw/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/index.js"]
