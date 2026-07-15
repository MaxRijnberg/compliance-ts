FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

RUN echo "---- DIST ----" && ls -la /app/dist && ls -la /app/dist/compliance-frontend || true

FROM nginx:alpine AS runtime
COPY --from=build /app/dist/compliance-frontend/browser/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
