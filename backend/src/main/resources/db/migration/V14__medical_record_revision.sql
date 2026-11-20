-- Lịch sử sửa bệnh án: mỗi lần bác sĩ lưu bệnh án có thay đổi thì ghi một bản chụp toàn bộ nội dung để admin tra lại
CREATE TABLE "MedicalRecordRevision" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    -- CREATE = ghi lần đầu, UPDATE = sửa, BASELINE = nội dung đã có trước khi bật lịch sử
    "action" TEXT NOT NULL,
    "editedById" TEXT,
    -- Sửa sau khi lượt khám đã hoàn tất
    "afterDone" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalRecordRevision_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MedicalRecordRevision" ADD CONSTRAINT "MedicalRecordRevision_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicalRecordRevision" ADD CONSTRAINT "MedicalRecordRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "MedicalRecordRevision_recordId_version_key" ON "MedicalRecordRevision"("recordId", "version");
CREATE INDEX "MedicalRecordRevision_visitId_idx" ON "MedicalRecordRevision"("visitId");

-- Bệnh án đã có: lưu nội dung hiện tại làm mốc ban đầu (không biết các lần sửa trước đó)
INSERT INTO "MedicalRecordRevision" ("id", "recordId", "visitId", "version", "action", "editedById", "afterDone", "snapshot", "createdAt")
SELECT gen_random_uuid()::text, r."id", r."visitId", 1, 'BASELINE', d."userId", false,
       json_build_object(
         'reason', r."reason", 'symptoms', r."symptoms", 'personalHistory', r."personalHistory", 'familyHistory', r."familyHistory",
         'pulse', r."pulse", 'temperature', r."temperature", 'bpSystolic', r."bpSystolic", 'bpDiastolic', r."bpDiastolic",
         'respiratoryRate', r."respiratoryRate", 'spo2', r."spo2", 'weight', r."weight", 'height', r."height",
         'generalExam', r."generalExam", 'organExam', r."organExam", 'labSummary', r."labSummary", 'orders', r."orders",
         'diagnosis', r."diagnosis", 'icdCode', r."icdCode", 'secondaryDiagnosis', r."secondaryDiagnosis",
         'secondaryIcdCodes', r."secondaryIcdCodes", 'treatment', r."treatment",
         'followUpDate', to_char(r."followUpDate", 'YYYY-MM-DD')
       )::text,
       r."updatedAt"
FROM "MedicalRecord" r
JOIN "Visit" v ON v."id" = r."visitId"
JOIN "Doctor" d ON d."id" = v."doctorId";
