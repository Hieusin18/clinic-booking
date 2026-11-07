import { api } from '../../lib/api';
import type { LabFile } from '../../lib/types';

/** Chỉ định hay dùng ở phòng khám đa khoa; bác sĩ vẫn gõ được tên khác. */
export const LAB_PRESETS = [
  'X-quang ngực thẳng',
  'X-quang cột sống thắt lưng',
  'Siêu âm ổ bụng tổng quát',
  'Siêu âm tuyến giáp',
  'Siêu âm tim',
  'Điện tâm đồ',
  'Công thức máu',
  'Sinh hóa máu',
  'Đường huyết',
  'Tổng phân tích nước tiểu',
  'Nội soi tai mũi họng',
  'CT sọ não',
];

export const LAB_ACCEPT = 'image/jpeg,image/png,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024;

/** Lỗi khi chọn tệp, kiểm tra trước khi tải (máy chủ kiểm tra lại theo nội dung tệp). */
export function labFileProblem(file: { type: string; size: number }) {
  if (!LAB_ACCEPT.split(',').includes(file.type)) return 'Chỉ nhận ảnh JPG, PNG hoặc tệp PDF';
  if (file.size > MAX_BYTES) return 'Mỗi tệp tối đa 10 MB';
  return null;
}

/** Đường dẫn đầy đủ mở tệp kết quả (đã có chữ ký, không cần đăng nhập). */
export const labFileUrl = (f: Pick<LabFile, 'url'>) => `${api.defaults.baseURL}${f.url}`;
