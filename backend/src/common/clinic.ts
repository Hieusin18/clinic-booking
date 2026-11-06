/** Thông tin phòng khám in trên bệnh án và đơn thuốc, đặt trong .env. */
export function clinicInfo() {
  return {
    name: process.env.CLINIC_NAME || 'Phòng khám Đa khoa',
    address: process.env.CLINIC_ADDRESS || '',
    phone: process.env.CLINIC_PHONE || '',
    /** Mã cơ sở khám bệnh, chữa bệnh: 5 ký tự đầu của mã đơn thuốc */
    code: (process.env.CLINIC_CODE || 'PK001').slice(0, 5).padEnd(5, '0'),
  };
}
