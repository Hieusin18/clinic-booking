# Build bằng Maven, chạy bằng JRE 21 (image nhỏ, không có mã nguồn)
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml ./
RUN mvn -B -ntp dependency:go-offline
COPY src ./src
RUN mvn -B -ntp package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
ENV APP_ENV=production
# Chạy bằng tài khoản thường, không phải root
RUN addgroup -S app && adduser -S -G app app
COPY --from=build /app/target/app.jar ./app.jar
# Font tiếng Việt (Tinos, giống Times New Roman) để xuất bệnh án PDF
COPY assets ./assets
USER app
# 3000: API và realtime /api/socket.io (Socket.IO chạy nội bộ ở 127.0.0.1:3002, chuyển tiếp qua cổng 3000)
EXPOSE 3000
# docker compose ps / --wait biết backend đã sẵn sàng (Flyway chạy xong, API trả lời)
HEALTHCHECK --interval=10s --timeout=3s --start-period=90s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" > /dev/null || exit 1
# Khi khởi động, Flyway tự áp dụng migration rồi mới mở API
CMD ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
