# ---- etapa 1: build ----
FROM node:22-alpine AS build
WORKDIR /app
# npm 10 falla resolviendo los peers de vitest 4; .npmrc ya fija legacy-peer-deps
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

# ---- etapa 2: runtime ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/dd_front/browser /usr/share/nginx/html
EXPOSE 80
