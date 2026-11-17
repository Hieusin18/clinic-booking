package com.clinic.config;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Ngày giờ trong JSON giữ đúng dạng bản cũ (Prisma) để web và app không phải sửa:
 * thời điểm "2026-11-07T01:30:00.000Z", ngày (cột DATE) "2026-11-07T00:00:00.000Z".
 */
@Configuration
public class JacksonConfig {
  public static final DateTimeFormatter ISO_MILLIS =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

  public static String iso(Instant at) {
    return at == null ? null : ISO_MILLIS.format(at);
  }

  public static String iso(LocalDate d) {
    return d == null ? null : d + "T00:00:00.000Z";
  }

  @Bean
  public Jackson2ObjectMapperBuilderCustomizer clinicDates() {
    SimpleModule m = new SimpleModule("clinic-dates");
    m.addSerializer(Instant.class, new JsonSerializer<>() {
      @Override
      public void serialize(Instant v, JsonGenerator g, SerializerProvider p) throws IOException {
        g.writeString(iso(v));
      }
    });
    m.addSerializer(LocalDate.class, new JsonSerializer<>() {
      @Override
      public void serialize(LocalDate v, JsonGenerator g, SerializerProvider p) throws IOException {
        g.writeString(iso(v));
      }
    });
    return b -> b.modulesToInstall(m);
  }
}
