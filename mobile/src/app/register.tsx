import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Chip, ErrorBox, Field, Muted, Screen, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { GENDER_LABEL, parseVnDate, PHONE_REGEX } from '@/lib/format';
import type { Gender } from '@/lib/types';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ fullName: '', phone: '', dob: '', password: '', confirm: '' });
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    const dateOfBirth = parseVnDate(form.dob);
    if (form.fullName.trim().length < 2) return setError('Nhập họ tên');
    if (!PHONE_REGEX.test(form.phone.trim())) return setError('Số điện thoại gồm 10 chữ số, bắt đầu bằng 0');
    if (!dateOfBirth) return setError('Ngày sinh không hợp lệ, nhập theo dạng ngày/tháng/năm, ví dụ 05/03/1998');
    if (!gender) return setError('Chọn giới tính');
    if (form.password.length < 6) return setError('Mật khẩu tối thiểu 6 ký tự');
    if (form.password !== form.confirm) return setError('Mật khẩu nhập lại không khớp');

    setSubmitting(true);
    setError(null);
    try {
      await register({ fullName: form.fullName.trim(), phone: form.phone.trim(), password: form.password, dateOfBirth, gender });
      router.replace('/(tabs)');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
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
        <Field label="Nhập lại mật khẩu" value={form.confirm} onChangeText={set('confirm')} secureTextEntry />
        <ErrorBox message={error} />
        <Button title="Đăng ký" onPress={submit} loading={submitting} />
      </Card>
    </Screen>
  );
}
