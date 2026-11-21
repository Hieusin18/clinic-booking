/** Kiểm tra form đăng ký (logic thuần để test được): trả lỗi theo từng ô, rỗng = hợp lệ. */
import { parseVnDate, PHONE_REGEX } from './format';
import { passwordProblem } from './password';

export interface RegisterForm {
  fullName: string;
  phone: string;
  dob: string;
  gender: string | null;
  nationalId: string;
  relativeName: string;
  relativePhone: string;
  password: string;
  confirm: string;
}

export type RegisterErrors = Partial<Record<keyof RegisterForm, string>>;

export const EMPTY_REGISTER: RegisterForm = {
  fullName: '',
  phone: '',
  dob: '',
  gender: null,
  nationalId: '',
  relativeName: '',
  relativePhone: '',
  password: '',
  confirm: '',
};

export function validateRegister(f: RegisterForm): RegisterErrors {
  const e: RegisterErrors = {};
  const phone = f.phone.trim();
  if (f.fullName.trim().length < 2) e.fullName = 'Nhập họ và tên';
  if (!phone) e.phone = 'Nhập số điện thoại';
  else if (!PHONE_REGEX.test(phone)) e.phone = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0';
  if (!parseVnDate(f.dob)) e.dob = 'Chọn ngày sinh';
  if (!f.gender) e.gender = 'Chọn giới tính';
  const id = f.nationalId.trim();
  if (!id) e.nationalId = 'Nhập số CCCD';
  else if (!/^\d{12}$/.test(id)) e.nationalId = 'Số CCCD gồm 12 chữ số';
  if (f.relativeName.trim().length < 2) e.relativeName = 'Nhập họ tên người thân';
  const rp = f.relativePhone.trim();
  if (!rp) e.relativePhone = 'Nhập số điện thoại người thân';
  else if (!PHONE_REGEX.test(rp)) e.relativePhone = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0';
  else if (rp === phone) e.relativePhone = 'Số người thân phải khác số của bạn';
  const weak = f.password ? passwordProblem(f.password, phone) : 'Nhập mật khẩu';
  if (weak) e.password = weak;
  if (!f.confirm) e.confirm = 'Nhập lại mật khẩu';
  else if (f.password !== f.confirm) e.confirm = 'Mật khẩu nhập lại không khớp';
  return e;
}
