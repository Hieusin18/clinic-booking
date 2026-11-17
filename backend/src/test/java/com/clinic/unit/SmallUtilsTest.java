package com.clinic.unit;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.config.ApiDocsConfig;
import com.clinic.config.DataSourceConfig;
import com.clinic.exception.UniqueMessages;
import com.clinic.util.QrToken;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("Hàm tiện ích")
class SmallUtilsTest {
  @Nested
  @DisplayName("token QR")
  class Qr {
    long now = System.currentTimeMillis();

    QrToken.Check verify(String token) {
      return QrToken.verify(token, "k", "c1", 60, now);
    }

    @Test
    @DisplayName("chấp nhận token vừa tạo")
    void fresh() {
      assertThat(verify(QrToken.create("c1", "k", now)).ok()).isTrue();
    }

    @Test
    @DisplayName("từ chối token quá 60 giây")
    void expired() {
      assertThat(verify(QrToken.create("c1", "k", now - 61_000))).isEqualTo(new QrToken.Check(false, "expired"));
    }

    @Test
    @DisplayName("từ chối token ký bằng khóa khác")
    void badSignature() {
      assertThat(verify(QrToken.create("c1", "khac", now))).isEqualTo(new QrToken.Check(false, "bad-signature"));
    }

    @Test
    @DisplayName("từ chối token của phòng khám khác")
    void wrongClinic() {
      assertThat(verify(QrToken.create("c2", "k", now))).isEqualTo(new QrToken.Check(false, "wrong-clinic"));
    }

    @Test
    @DisplayName("từ chối chuỗi sai định dạng")
    void malformed() {
      assertThat(verify("abc")).isEqualTo(new QrToken.Check(false, "malformed"));
    }
  }

  @Nested
  @DisplayName("Trang tài liệu API /api/docs")
  class ApiDocs {
    @Test
    @DisplayName("dev thì bật, image Docker (APP_ENV=production) thì tắt")
    void defaults() {
      assertThat(ApiDocsConfig.enabled(Map.of("APP_ENV", "development"))).isTrue();
      assertThat(ApiDocsConfig.enabled(Map.of())).isTrue();
      assertThat(ApiDocsConfig.enabled(Map.of("APP_ENV", "production"))).isFalse();
      assertThat(ApiDocsConfig.enabled(Map.of("APP_ENV", "production", "API_DOCS", ""))).isFalse();
    }

    @Test
    @DisplayName("API_DOCS ghi đè mặc định")
    void override() {
      assertThat(ApiDocsConfig.enabled(Map.of("APP_ENV", "production", "API_DOCS", "true"))).isTrue();
      assertThat(ApiDocsConfig.enabled(Map.of("APP_ENV", "production", "API_DOCS", " TRUE "))).isTrue();
      assertThat(ApiDocsConfig.enabled(Map.of("APP_ENV", "development", "API_DOCS", "false"))).isFalse();
    }
  }

  @Test
  @DisplayName("câu báo trùng dữ liệu theo cột bị trùng")
  void uniqueMessages() {
    assertThat(UniqueMessages.message(List.of("phone"))).isEqualTo("Số điện thoại đã được dùng");
    assertThat(UniqueMessages.message(List.of("doctorId", "startTime"))).isEqualTo("Dữ liệu bị trùng với bản ghi đã có");
    assertThat(UniqueMessages.fieldsFromError("duplicate key value violates unique constraint \"User_email_key\"")).containsExactly("email");
    assertThat(UniqueMessages.fieldsFromError("violates unique constraint \"Schedule_doctorId_startTime_key\"")).containsExactly("doctorId", "startTime");
  }

  @Test
  @DisplayName("DATABASE_URL dạng postgresql:// đổi sang JDBC, giữ tài khoản và mật khẩu")
  void databaseUrl() {
    var info = DataSourceConfig.parse("postgresql://clinic:m%40t@db:5432/clinic?sslmode=disable");
    assertThat(info.url()).isEqualTo("jdbc:postgresql://db:5432/clinic?stringtype=unspecified&sslmode=disable");
    assertThat(info.user()).isEqualTo("clinic");
    assertThat(info.password()).isEqualTo("m@t");
  }
}
