-- Triệu chứng thường gặp của từng chuyên khoa (mỗi dòng một mục) để gợi ý bệnh nhân chọn đúng khoa
ALTER TABLE "Specialty" ADD COLUMN "symptoms" TEXT;

UPDATE "Specialty" SET "symptoms" = E'Sốt\nMệt mỏi\nĐau đầu\nChóng mặt\nHo kéo dài\nĐau bụng\nBuồn nôn, nôn\nTiêu chảy\nTáo bón\nỢ chua, đầy bụng\nTức ngực, khó thở\nTăng huyết áp\nTiểu đường\nKhám sức khỏe tổng quát' WHERE lower("name") = lower('Nội tổng quát') AND "symptoms" IS NULL;
UPDATE "Specialty" SET "symptoms" = E'Trẻ sốt\nTrẻ ho, sổ mũi\nTrẻ biếng ăn, chậm tăng cân\nTrẻ tiêu chảy, nôn\nTrẻ phát ban\nTư vấn tiêm chủng\nKhám sức khỏe cho trẻ' WHERE lower("name") = lower('Nhi khoa') AND "symptoms" IS NULL;
UPDATE "Specialty" SET "symptoms" = E'Đau họng\nHo\nSổ mũi, nghẹt mũi\nViêm xoang\nĐau tai, ù tai\nChảy máu mũi\nKhàn tiếng\nNgáy khi ngủ' WHERE lower("name") = lower('Tai Mũi Họng') AND "symptoms" IS NULL;
UPDATE "Specialty" SET "symptoms" = E'Mụn\nNgứa\nNổi mẩn, mề đay\nPhát ban\nNấm da\nRụng tóc\nDị ứng da\nNám, tàn nhang' WHERE lower("name") = lower('Da liễu') AND "symptoms" IS NULL;
UPDATE "Specialty" SET "symptoms" = E'Đau răng\nSâu răng\nChảy máu chân răng\nHôi miệng\nMọc răng khôn\nLấy cao răng\nÊ buốt răng\nNhiệt miệng' WHERE lower("name") = lower('Răng Hàm Mặt') AND "symptoms" IS NULL;
