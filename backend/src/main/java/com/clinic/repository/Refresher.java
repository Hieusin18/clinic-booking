package com.clinic.repository;

import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Component;

/** Nạp lại một entity vừa ghi để có các quan hệ (bác sĩ, bệnh nhân…) khi dựng dữ liệu trả về. */
@Component
public class Refresher {
  private final EntityManager em;

  public Refresher(EntityManager em) {
    this.em = em;
  }

  public <T> T refresh(T entity) {
    em.flush();
    em.refresh(entity);
    return entity;
  }
}
