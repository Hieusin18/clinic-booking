FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# prisma.config.ts bắt buộc có DATABASE_URL; generate không kết nối CSDL nên dùng giá trị giả
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate && npm run build

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
