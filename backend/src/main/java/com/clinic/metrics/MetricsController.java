package com.clinic.metrics;

import com.clinic.security.Public;
import io.prometheus.metrics.expositionformats.PrometheusTextFormatWriter;
import io.swagger.v3.oas.annotations.Hidden;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@Hidden
@RestController
public class MetricsController {
  private final PrometheusTextFormatWriter writer = new PrometheusTextFormatWriter(false);

  @Public
  @GetMapping("/metrics")
  public ResponseEntity<byte[]> metrics() throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    writer.write(out, Metrics.REGISTRY.scrape());
    return ResponseEntity.ok().header("Content-Type", writer.getContentType()).body(out.toByteArray());
  }
}
