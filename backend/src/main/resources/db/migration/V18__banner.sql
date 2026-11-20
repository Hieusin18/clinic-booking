-- Banner trên app bệnh nhân (tab Đặt lịch) do admin quản lý: thông báo vận hành (nghỉ lễ, đổi giờ) và giới thiệu dịch vụ
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    -- NOTICE = dải thông báo chữ, PROMO = ảnh giới thiệu
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    -- Bấm vào mở: đường dẫn trong app (/doctor/<id>) hoặc trang web https://
    "link" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Banner_kind_check" CHECK ("kind" IN ('NOTICE', 'PROMO'))
);

-- Ảnh tách bảng để danh sách banner không phải đọc dữ liệu ảnh
CREATE TABLE "BannerImage" (
    "bannerId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BannerImage_pkey" PRIMARY KEY ("bannerId")
);
ALTER TABLE "BannerImage" ADD CONSTRAINT "BannerImage_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "Banner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
