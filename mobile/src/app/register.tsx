import { Stack, router } from 'expo-router';
import { DateField } from '@/components/DateField';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { PhoneVerify, type VerifiedPhone } from '@/components/PhoneVerify';
import { Text } from '@/components/Text';
import { Button, Card, Chip, ErrorBox, Field, FieldLabel, Muted, Screen, SectionLabel, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { GENDER_LABEL, parseVnDate } from '@/lib/format';
import { EMPTY_REGISTER, validateRegister, type RegisterErrors, type RegisterForm } from '@/lib/registerForm';
import type { Gender } from '@/lib/types';
import { finishSignIn } from '@/lib/returnTo';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState<RegisterForm>(EMPTY_REGISTER);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Bước 2: nhắn tin xác minh số điện thoại */
  const [verifying, setVerifying] = useState(false);
  const set = (k: keyof RegisterForm) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    // Sửa ô nào thì bỏ lỗi của ô đó
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };
  const gender = form.gender as Gender | null;

  /** Bước 1: kiểm tra đủ các mục bắt buộc rồi chuyển sang nhắn tin xác minh */
  function next() {
    const e = validateRegister(form);
    setErrors(e);
    if (Object.keys(e).length) return setError('Vui lòng điền đủ và đúng các mục có dấu *');
    setError(null);
    setVerifying(true);
  }

  /** Bước 3: số đã xác minh → tạo tài khoản */
  const finish = useCallback(
    async (v: VerifiedPhone) => {
      setSubmitting(true);
      setError(null);
      try {
        await register({
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          password: form.password,
          dateOfBirth: parseVnDate(form.dob)!,
          gender: gender!,
          nationalId: form.nationalId.trim(),
          relativeName: form.relativeName.trim(),
          relativePhone: form.relativePhone.trim(),
          ...v,
        });
        finishSignIn();
      } catch (err) {
        setError(errorMessage(err));
        setVerifying(false);
      } finally {
        setSubmitting(false);
      }
    },
    [form, gender, register],
  );

  if (verifying) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Xác minh số điện thoại' }} />
        <PhoneVerify phone={form.phone.trim()} purpose="REGISTER" onVerified={finish} />
        {submitting ? <Muted>Đang tạo tài khoản…</Muted> : null}
        <Button title="Quay lại sửa thông tin" variant="secondary" onPress={() => setVerifying(false)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Đăng ký tài khoản' }} />
      <Muted>Nếu bạn đã từng khám tại phòng khám, hãy dùng đúng số điện thoại đã đăng ký để xem lại lịch sử khám.</Muted>
      <Muted>Các mục có dấu * là bắt buộc.</Muted>
      <Card>
        <SectionLabel>THÔNG TIN CÁ NHÂN</SectionLabel>
        <Field label="Họ và tên" required value={form.fullName} onChangeText={set('fullName')} autoCapitalize="words" error={errors.fullName} />
        <Field label="Số điện thoại" required value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={10} error={errors.phone} />
        <DateField label="Ngày sinh" required value={form.dob} onChange={set('dob')} placeholder="Chọn ngày sinh" error={errors.dob} />
        <View style={{ gap: 6 }}>
          <FieldLabel label="Giới tính" required />
          <View style={styles.wrap}>
            {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
              <Chip key={g} label={GENDER_LABEL[g]} selected={gender === g} onPress={() => set('gender')(g)} />
            ))}
          </View>
          {errors.gender ? <Text style={styles.error}>{errors.gender}</Text> : null}
        </View>
        <Field
          label="Số CCCD"
          required
          value={form.nationalId}
          onChangeText={(t) => set('nationalId')(t.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={12}
          placeholder="12 chữ số trên căn cước"
          error={errors.nationalId}
        />
      </Card>
      <Card>
        <SectionLabel>NGƯỜI THÂN LIÊN HỆ</SectionLabel>
        <Muted>Phòng khám liên hệ người thân khi cần báo tin về tình trạng của bạn.</Muted>
        <Field label="Họ tên người thân" required value={form.relativeName} onChangeText={set('relativeName')} autoCapitalize="words" error={errors.relativeName} />
        <Field
          label="Số điện thoại người thân"
          required
          value={form.relativePhone}
          onChangeText={set('relativePhone')}
          keyboardType="phone-pad"
          maxLength={10}
          error={errors.relativePhone}
        />
      </Card>
      <Card>
        <SectionLabel>MẬT KHẨU</SectionLabel>
        <Field label="Mật khẩu" required value={form.password} onChangeText={set('password')} secureTextEntry error={errors.password} />
        {!errors.password ? <Muted>Tối thiểu 8 ký tự, có cả chữ và số.</Muted> : null}
        <Field label="Nhập lại mật khẩu" required value={form.confirm} onChangeText={set('confirm')} secureTextEntry error={errors.confirm} />
        <ErrorBox message={error} />
        <Button title="Tiếp tục: xác minh số điện thoại" onPress={next} />
      </Card>
    </Screen>
  );
}
