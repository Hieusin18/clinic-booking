package com.clinic.controller;

import com.clinic.entity.enums.Role;
import com.clinic.exception.ValidationException;
import com.clinic.security.Roles;
import com.clinic.service.StatsService;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "stats")
@RestController
@RequestMapping("/stats")
public class StatsController {
  private final StatsService stats;

  public StatsController(StatsService stats) {
    this.stats = stats;
  }

  @Roles(Role.ADMIN)
  @GetMapping("/overview")
  public Map<String, Object> overview(@RequestParam(required = false) String from, @RequestParam(required = false) String to) {
    List<String> errors = new ArrayList<>();
    if (from == null || !from.matches("^\\d{4}-\\d{2}-\\d{2}$")) errors.add("from phải có dạng YYYY-MM-DD");
    if (to == null || !to.matches("^\\d{4}-\\d{2}-\\d{2}$")) errors.add("to phải có dạng YYYY-MM-DD");
    if (!errors.isEmpty()) throw new ValidationException(errors);
    return stats.overview(from, to, Instant.now());
  }
}
