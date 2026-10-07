FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts svelte.config.js tsconfig.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY vendor ./vendor
RUN npm run build

FROM nginx:1.28-alpine
COPY server/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
