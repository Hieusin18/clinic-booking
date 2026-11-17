package com.clinic.service;

import com.clinic.dto.BodyReader;
import com.clinic.dto.PageQuery;
import com.clinic.dto.catalog.MedicinePatch;
import com.clinic.dto.catalog.MedicineRequest;
import com.clinic.entity.Medicine;
import com.clinic.exception.ApiException;
import com.clinic.repository.MedicineRepository;
import com.clinic.view.Rows;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Danh mục thuốc do admin quản lý; bác sĩ tìm thuốc khi kê đơn. */
@Service
public class MedicinesService {
  private final MedicineRepository medicines;

  public MedicinesService(MedicineRepository medicines) {
    this.medicines = medicines;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> list(PageQuery q, boolean includeInactive) {
    String term = q.q() == null ? "" : q.q();
    Page<Medicine> page = medicines.search(term, includeInactive, q.pageable(Sort.by("name")));
    return q.toPage(page.getContent().stream().map(Rows::medicine).toList(), page.getTotalElements());
  }

  @Transactional
  public Map<String, Object> create(MedicineRequest dto) {
    Medicine m = new Medicine();
    m.setName(dto.name());
    m.setActiveIngredient(dto.activeIngredient());
    m.setStrength(dto.strength());
    m.setUnit(dto.unit());
    return Rows.medicine(medicines.saveAndFlush(m));
  }

  @Transactional
  public Map<String, Object> update(String id, BodyReader.Patch<MedicinePatch> patch) {
    Medicine m = medicines.findById(id).orElseThrow(() -> ApiException.notFound("Không tìm thấy thuốc"));
    MedicinePatch dto = patch.value();
    if (patch.set("name")) m.setName(dto.name());
    if (patch.has("activeIngredient")) m.setActiveIngredient(dto.activeIngredient());
    if (patch.has("strength")) m.setStrength(dto.strength());
    if (patch.set("unit")) m.setUnit(dto.unit());
    if (patch.set("isActive")) m.setActive(dto.isActive());
    return Rows.medicine(medicines.saveAndFlush(m));
  }
}
