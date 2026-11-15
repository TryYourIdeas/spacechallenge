# Builds this Nuxt project (SPA + server API + import worker) for the app and worker services.
# Context must be this directory; backend/docker/compose.yaml sets it.
FROM node:22-alpine AS build
WORKDIR /app
# The lockfile is written by npm 11; node:22 ships npm 10, which rejects it.
RUN npm install -g npm@11.5.1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:server

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/.output ./.output
USER node
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
