# syntax=docker/dockerfile:1

# ---- build -------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Baked into the bundle at build time (Vite inlines import.meta.env.*).
ARG VITE_API_KEY=dev-key-change-me
ARG VITE_API_BASE=/api
# Private, self-hosted image (docker compose): embedding the key is intentional here.
# Never use this for a public deployment (see vite.config.ts guard).
ENV VITE_API_KEY=$VITE_API_KEY VITE_API_BASE=$VITE_API_BASE ALLOW_API_KEY_IN_BUNDLE=1
RUN npm run build

# ---- serve -------------------------------------------------------------
FROM nginx:1.27-alpine AS serve
# Run as the unprivileged nginx user: listen on 8080 and keep temp/pid paths writable.
RUN rm /etc/nginx/conf.d/default.conf \
 && sed -i 's#^pid .*#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
 && sed -i '/^user /d' /etc/nginx/nginx.conf \
 && mkdir -p /var/cache/nginx /tmp/nginx \
 && chown -R nginx:nginx /var/cache/nginx /tmp/nginx /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
