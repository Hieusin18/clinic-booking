import { Stack, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { PhoneVerify, type VerifiedPhone } from '@/components/PhoneVerify';
import { Text } from '@/components/Text';
import { Button, Card, Chip, ErrorBox, Field, Muted, Screen, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { GENDER_LABEL, parseVnDate, PHONE_REGEX } from '@/lib/format';
import { passwordProblem } from '@/lib/password';
import type { Gender } from '@/lib/types';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ fullName: '', phone: '', dob: '', password: '', confirm: '' });
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Bước 2: nhắn tin xác minh số điện thoại */
  const [verifying, setVerifying] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  /** Bước 1: kiểm tra thông tin rồi chuyển sang nhắn tin xác minh */
  function next() {
    const dateOfBirth = parseVnDate(form.dob);
    if (form.fullName.trim().length < 2) return setError('Nhập họ tên');
    if (!PHONE_REGEX.test(form.phone.trim())) return setError('Số điện thoại gồm 10 chữ số, bắt đầu bằng 0');
    if (!dateOfBirth) return setError('Ngày sinh không hợp lệ, nhập theo dạng ngày/tháng/năm, ví dụ 05/03/1998');
    if (!gender) return setError('Chọn giới tính');
    const weak = passwordProblem(form.password, form.phone.trim());
    if (weak) return setError(weak);
    if (form.password !== form.confirm) return setError('Mật khẩu nhập lại không khớp');
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
          ...v,
        });
        router.replace('/(tabs)');
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
      <Card>
        <Field label="Họ và tên" value={form.fullName} onChangeText={set('fullName')} autoCapitalize="words" />
        <Field label="Số điện thoại" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <Field label="Ngày sinh" value={form.dob} onChangeText={set('dob')} placeholder="ngày/tháng/năm" keyboardType="numbers-and-punctuation" />
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Giới tính</Text>
          <View style={styles.wrap}>
            {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
              <Chip key={g} label={GENDER_LABEL[g]} selected={gender === g} onPress={() => setGender(g)} />
            ))}
          </View>
        </View>
        <Field label="Mật khẩu" value={form.password} onChangeText={set('password')} secureTextEntry />
        <Muted>Tối thiểu 8 ký tự, có cả chữ và số.</Muted>
        <Field label="Nhập lại mật khẩu" value={form.confirm} onChangeText={set('confirm')} secureTextEntry />
        <ErrorBox message={error} />
        <Button title="Tiếp tục: xác minh số điện thoại" onPress={next} />
      </Card>
    </Screen>
  );
}
