package com.clinic;

import static org.assertj.core.api.Assertions.assertThat;

import com.clinic.support.IntegrationTest;
import org.junit.jupiter.api.Test;

class HealthTest extends IntegrationTest {
  @Test
  void traOkKhiKetNoiDuocCsdl() {
    var res = api.get("/api/health").expect(200);
    assertThat(res.body().get("status").asText()).isEqualTo("ok");
  }
}
