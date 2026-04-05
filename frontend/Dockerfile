# =============================================================================
# Stage 1 — deps: install pnpm + locked dependencies (shared by all stages)
# =============================================================================
FROM node:20-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 2 — build: compile the production bundle
# VITE_* vars must be supplied as build args — they are baked into the bundle
# at build time and are NOT available at container runtime.
# =============================================================================
FROM deps AS build

ARG VITE_API_URL
ARG VITE_ENABLE_MAPBOX
ARG VITE_MAPBOX_TOKEN
ARG VITE_CENTER_LAT
ARG VITE_CENTER_LON
ARG VITE_COVERAGE_RADIUS_NM
ARG VITE_ENABLE_3D_TERRAIN
ARG VITE_JS8_WS_URL
ARG VITE_JS8_BASE_URL

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ENABLE_MAPBOX=$VITE_ENABLE_MAPBOX
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN
ENV VITE_CENTER_LAT=$VITE_CENTER_LAT
ENV VITE_CENTER_LON=$VITE_CENTER_LON
ENV VITE_COVERAGE_RADIUS_NM=$VITE_COVERAGE_RADIUS_NM
ENV VITE_ENABLE_3D_TERRAIN=$VITE_ENABLE_3D_TERRAIN
ENV VITE_JS8_WS_URL=$VITE_JS8_WS_URL
ENV VITE_JS8_BASE_URL=$VITE_JS8_BASE_URL

COPY . .
RUN pnpm run build

# =============================================================================
# Stage 3 — dev: Vite HMR dev server (used by docker-compose-dev.yml)
# =============================================================================
FROM deps AS dev
COPY . .
EXPOSE 3700
CMD ["pnpm", "run", "dev", "--", "--host"]

# =============================================================================
# Stage 4 (default) — prod: nginx serving the compiled static bundle
# This is the stage built when no --target is specified.
# =============================================================================
FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
