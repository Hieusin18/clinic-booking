package com.clinic.cli;

import java.util.List;

/** Dữ liệu mẫu cho phát triển và demo (nhân vật hư cấu). */
final class SeedData {
  private SeedData() {}

  record Specialty(String name, String description) {}

  record Step(int fromYear, Integer toYear, String title, String place) {}

  record Doctor(String fullName, String phone, String title, String specialty, String bio, int practiceSince, List<String> expertise,
      List<Step> education, List<Step> career) {}

  record Medicine(String name, String activeIngredient, String strength, String unit) {}

  static final List<Specialty> SPECIALTIES = List.of(
      new Specialty("Nội tổng quát", "Khám và điều trị các bệnh nội khoa thường gặp"),
      new Specialty("Nhi khoa", "Khám sức khỏe và bệnh lý cho trẻ dưới 16 tuổi"),
      new Specialty("Tai Mũi Họng", "Viêm họng, viêm xoang, viêm tai"),
      new Specialty("Da liễu", "Mụn, viêm da, dị ứng da"),
      new Specialty("Răng Hàm Mặt", "Khám răng, nhổ răng, lấy cao răng"));

  // Hồ sơ mẫu (nhân vật hư cấu) để demo trang hồ sơ bác sĩ
  static final List<Doctor> DOCTORS = List.of(
      new Doctor("Nguyễn Văn An", "0910000001", "ThS.BS", "Nội tổng quát",
          "Khám và điều trị các bệnh nội khoa thường gặp ở người lớn, theo dõi bệnh mạn tính lâu dài.",
          2009, List.of("Tăng huyết áp", "Rối loạn mỡ máu", "Viêm dạ dày"),
          List.of(new Step(2013, 2015, "Thạc sĩ Nội khoa", "Đại học Y Hà Nội"), new Step(2003, 2009, "Bác sĩ đa khoa", "Đại học Y Hà Nội")),
          List.of(new Step(2019, null, "Bác sĩ Nội tổng quát", "Phòng khám Đa khoa"),
              new Step(2009, 2019, "Bác sĩ điều trị, khoa Nội", "Bệnh viện Đa khoa tỉnh Hà Nam"))),
      new Doctor("Trần Thị Bình", "0910000002", "BSCKI", "Nội tổng quát",
          "Hơn 10 năm khám bệnh nội khoa, chú trọng tư vấn chế độ ăn và theo dõi đường huyết.",
          2012, List.of("Đái tháo đường", "Tăng huyết áp", "Bệnh tuyến giáp"),
          List.of(new Step(2016, 2018, "Bác sĩ chuyên khoa I Nội khoa", "Đại học Y Hà Nội"), new Step(2006, 2012, "Bác sĩ đa khoa", "Học viện Quân y")),
          List.of(new Step(2021, null, "Phụ trách chuyên môn khoa Nội", "Phòng khám Đa khoa"),
              new Step(2012, 2021, "Bác sĩ điều trị, khoa Nội tiết", "Bệnh viện Thanh Nhàn"))),
      new Doctor("Lê Minh Châu", "0910000003", "BSCKII", "Nhi khoa",
          "Khám và tư vấn cho trẻ dưới 16 tuổi: hô hấp, tiêu hóa, dinh dưỡng và tiêm chủng.",
          2005, List.of("Viêm đường hô hấp ở trẻ", "Tiêu chảy cấp", "Tư vấn dinh dưỡng"),
          List.of(new Step(2012, 2014, "Bác sĩ chuyên khoa II Nhi khoa", "Đại học Y Hà Nội"), new Step(1999, 2005, "Bác sĩ đa khoa", "Đại học Y Thái Bình")),
          List.of(new Step(2020, null, "Trưởng chuyên khoa Nhi", "Phòng khám Đa khoa"),
              new Step(2010, 2020, "Phó trưởng khoa Hô hấp", "Bệnh viện Nhi Trung ương"),
              new Step(2005, 2010, "Bác sĩ điều trị", "Bệnh viện Nhi Trung ương"))),
      new Doctor("Phạm Thu Dung", "0910000004", "ThS.BS", "Tai Mũi Họng",
          "Nội soi và điều trị bệnh tai mũi họng ở người lớn và trẻ em.",
          2014, List.of("Viêm xoang", "Viêm họng mạn", "Nội soi tai mũi họng"),
          List.of(new Step(2017, 2019, "Thạc sĩ Tai Mũi Họng", "Đại học Y Hà Nội"), new Step(2008, 2014, "Bác sĩ đa khoa", "Đại học Y Dược Thái Nguyên")),
          List.of(new Step(2022, null, "Bác sĩ Tai Mũi Họng", "Phòng khám Đa khoa"),
              new Step(2014, 2022, "Bác sĩ điều trị", "Bệnh viện Tai Mũi Họng Trung ương"))),
      new Doctor("Hoàng Quốc Em", "0910000005", "BS", "Da liễu",
          "Khám và điều trị mụn, viêm da, dị ứng da.",
          2019, List.of("Mụn trứng cá", "Viêm da cơ địa"),
          List.of(new Step(2013, 2019, "Bác sĩ đa khoa", "Đại học Y Hà Nội")),
          List.of(new Step(2023, null, "Bác sĩ Da liễu", "Phòng khám Đa khoa"),
              new Step(2019, 2023, "Bác sĩ điều trị", "Bệnh viện Da liễu Trung ương"))),
      new Doctor("Võ Thanh Giang", "0910000006", "BSCKI", "Răng Hàm Mặt",
          "Khám răng định kỳ, nhổ răng, lấy cao răng và điều trị tủy.",
          2013, List.of("Điều trị tủy", "Nhổ răng khôn", "Lấy cao răng"),
          List.of(new Step(2017, 2019, "Bác sĩ chuyên khoa I Răng Hàm Mặt", "Đại học Y Hà Nội"),
              new Step(2007, 2013, "Bác sĩ Răng Hàm Mặt", "Đại học Y Dược TP. Hồ Chí Minh")),
          List.of(new Step(2018, null, "Bác sĩ Răng Hàm Mặt", "Phòng khám Đa khoa"),
              new Step(2013, 2018, "Bác sĩ điều trị", "Bệnh viện Răng Hàm Mặt Trung ương"))));

  static final List<Medicine> MEDICINES = List.of(
      new Medicine("Paracetamol", "Paracetamol", "500mg", "viên"),
      new Medicine("Hapacol 250", "Paracetamol", "250mg", "gói"),
      new Medicine("Ibuprofen", "Ibuprofen", "400mg", "viên"),
      new Medicine("Amoxicillin", "Amoxicillin", "500mg", "viên"),
      new Medicine("Augmentin", "Amoxicillin + Acid clavulanic", "625mg", "viên"),
      new Medicine("Cefuroxim", "Cefuroxim", "500mg", "viên"),
      new Medicine("Azithromycin", "Azithromycin", "250mg", "viên"),
      new Medicine("Loratadin", "Loratadin", "10mg", "viên"),
      new Medicine("Cetirizin", "Cetirizin", "10mg", "viên"),
      new Medicine("Omeprazol", "Omeprazol", "20mg", "viên"),
      new Medicine("Smecta", "Diosmectit", "3g", "gói"),
      new Medicine("Oresol", "Natri clorid, Kali clorid, Glucose", "4,1g", "gói"),
      new Medicine("Vitamin C", "Acid ascorbic", "500mg", "viên"),
      new Medicine("Berberin", "Berberin", "100mg", "viên"),
      new Medicine("Acetylcystein", "Acetylcystein", "200mg", "gói"),
      new Medicine("Natri clorid 0,9%", "Natri clorid", "10ml", "chai"),
      new Medicine("Otrivin", "Xylometazolin", "0,05%", "chai"),
      new Medicine("Fucidin", "Acid fusidic", "2%", "tuýp"),
      new Medicine("Clorhexidin súc miệng", "Clorhexidin", "0,12%", "chai"),
      new Medicine("Metronidazol", "Metronidazol", "250mg", "viên"));
}
