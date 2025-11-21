# ---- Base Stage ----
FROM node:18-alpine AS base
LABEL maintainer="sgtrading-dev-team"
WORKDIR /usr/src/app
ENV PATH /usr/src/app/node_modules/.bin:$PATH
COPY package*.json ./

# ---- Dependencies Stage ----
FROM base AS dependencies
RUN npm install --frozen-lockfile
COPY . .

# ---- Build Stage ----
FROM dependencies AS build
RUN npm install --frozen-lockfile
RUN npm run build

# ---- Production Stage ----
FROM base AS production
ENV NODE_ENV=production
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
CMD [ "node", "dist/server.js" ]
