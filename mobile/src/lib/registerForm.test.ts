import { describe, expect, it } from 'vitest';
import { EMPTY_REGISTER, validateRegister } from './registerForm';

const ok = {
  fullName: 'Nguyễn Thị Hoa',
  phone: '0987654321',
  dob: '20/03/1998',
  gender: 'FEMALE',
  nationalId: '001198012345',
  relativeName: 'Nguyễn Văn Tú',
  relativePhone: '0912000111',
  password: 'xuanhoa2026',
  confirm: 'xuanhoa2026',
};

describe('form đăng ký', () => {
  it('đủ thông tin thì hợp lệ', () => expect(validateRegister(ok)).toEqual({}));
  it('form trống: báo lỗi ở mọi ô bắt buộc', () => {
    expect(Object.keys(validateRegister(EMPTY_REGISTER)).sort()).toEqual(
      ['confirm', 'dob', 'fullName', 'gender', 'nationalId', 'password', 'phone', 'relativeName', 'relativePhone'].sort(),
    );
  });
  it('CCCD 12 số, số người thân hợp lệ và khác số của mình', () => {
    expect(validateRegister({ ...ok, nationalId: '12345' }).nationalId).toBe('Số CCCD gồm 12 chữ số');
    expect(validateRegister({ ...ok, relativePhone: '0987654321' }).relativePhone).toBe('Số người thân phải khác số của bạn');
    expect(validateRegister({ ...ok, relativePhone: '123' }).relativePhone).toMatch(/10 chữ số/);
    expect(validateRegister({ ...ok, confirm: 'khac2026' }).confirm).toBe('Mật khẩu nhập lại không khớp');
  });
});
