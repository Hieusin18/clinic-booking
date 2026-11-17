package com.clinic.repository;

import java.time.Instant;

/** Thông tin một tệp kết quả, không kèm dữ liệu tệp. */
public record LabFileInfo(String id, String labOrderId, String fileName, String mimeType, int size, Instant createdAt) {}
