FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

# Runs the test suite against the database service (see docker-compose.yml)
FROM build AS test
WORKDIR /app/server
CMD ["npm", "test"]

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY --from=build /app/server/out server/out
COPY --from=build /app/server/migrations server/migrations
COPY --from=build /app/web/dist web/dist
ENV WEB_DIR=/app/web/dist
USER node
WORKDIR /app/server
EXPOSE 3000
CMD ["npm", "run", "start:docker"]
