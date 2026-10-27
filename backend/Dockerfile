FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm i --no-save prisma@7
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./
EXPOSE 3000
# Áp dụng migration rồi chạy API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
