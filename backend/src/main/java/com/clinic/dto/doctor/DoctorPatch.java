package com.clinic.dto.doctor;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Sửa hồ sơ bác sĩ. Bác sĩ tự sửa được phần hồ sơ (bio, practiceSince, expertise, education, career);
 * admin sửa thêm tên, chuyên khoa, học vị, phòng, trạng thái.
 *
 * @param practiceSince năm bắt đầu hành nghề; null = xóa
 * @param education quá trình đào tạo; gửi lên = thay toàn bộ danh sách cũ
 * @param career quá trình công tác đến nay; gửi lên = thay toàn bộ danh sách cũ
 * @param room phòng khám, ví dụ "Phòng 2"; chuỗi rỗng = xóa
 * @param isActive false = khóa tài khoản, bác sĩ không đăng nhập được và không hiện cho bệnh nhân
 */
public record DoctorPatch(
    @Size(max = 2000) String bio,
    @Min(1950) @Max(2100) Integer practiceSince,
    @Size(max = 15) List<@Size(max = 100) String> expertise,
    @Size(max = 20) List<@Valid HistoryEntry> education,
    @Size(max = 20) List<@Valid HistoryEntry> career,
    @Size(min = 2) String fullName,
    String specialtyId,
    String title,
    @Size(max = 40) String room,
    Boolean isActive) {}
