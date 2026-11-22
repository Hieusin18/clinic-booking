package com.clinic.service;

import com.clinic.dto.BodyReader;
import com.clinic.dto.PageQuery;
import com.clinic.dto.catalog.SpecialtyPatch;
import com.clinic.dto.catalog.SpecialtyRequest;
import com.clinic.entity.Specialty;
import com.clinic.exception.ApiException;
import com.clinic.repository.DoctorRepository;
import com.clinic.repository.SpecialtyRepository;
import com.clinic.util.DoctorProfile;
import com.clinic.view.Json;
import com.clinic.view.Rows;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SpecialtiesService {
  private final SpecialtyRepository specialties;
  private final DoctorRepository doctors;

  public SpecialtiesService(SpecialtyRepository specialties, DoctorRepository doctors) {
    this.specialties = specialties;
    this.doctors = doctors;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> list(PageQuery q) {
    String term = q.q() == null || q.q().isEmpty() ? null : q.q();
    var pageable = q.pageable(Sort.by("name"));
    Page<Specialty> page = term == null ? specialties.findAll(pageable) : specialties.findByNameContainingIgnoreCase(term, pageable);
    var items = page.getContent().stream().map(s -> {
      Map<String, Object> m = Rows.specialty(s);
      m.put("_count", Json.obj("doctors", doctors.countBySpecialtyId(s.getId())));
      return m;
    }).toList();
    return q.toPage(items, page.getTotalElements());
  }

  @Transactional
  public Map<String, Object> create(SpecialtyRequest dto) {
    ensureNameFree(dto.name(), null);
    Specialty s = new Specialty();
    s.setName(dto.name());
    s.setDescription(dto.description());
    if (dto.symptoms() != null) s.setSymptoms(DoctorProfile.joinExpertise(dto.symptoms()));
    return Rows.specialty(specialties.saveAndFlush(s));
  }

  @Transactional
  public Map<String, Object> update(String id, BodyReader.Patch<SpecialtyPatch> patch) {
    Specialty s = get(id);
    SpecialtyPatch dto = patch.value();
    if (dto.name() != null && !dto.name().isEmpty()) ensureNameFree(dto.name(), id);
    if (patch.set("name")) s.setName(dto.name());
    if (patch.has("description")) s.setDescription(dto.description());
    if (patch.has("symptoms")) s.setSymptoms(dto.symptoms() == null ? null : DoctorProfile.joinExpertise(dto.symptoms()));
    return Rows.specialty(specialties.saveAndFlush(s));
  }

  @Transactional
  public void remove(String id) {
    Specialty s = get(id);
    if (doctors.countBySpecialtyId(id) > 0) throw ApiException.conflict("Không xóa được chuyên khoa còn bác sĩ");
    specialties.delete(s);
  }

  private Specialty get(String id) {
    return specialties.findById(id).orElseThrow(() -> ApiException.notFound("Không tìm thấy chuyên khoa"));
  }

  private void ensureNameFree(String name, String exceptId) {
    for (Specialty dup : specialties.findByNameIgnoreCase(name)) {
      if (!dup.getId().equals(exceptId)) throw ApiException.conflict("Tên chuyên khoa đã tồn tại");
    }
  }
}
