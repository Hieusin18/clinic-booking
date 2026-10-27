import { Link, Redirect, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Button, Card, ErrorBox, Field, Muted, Screen, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { PHONE_REGEX } from '@/lib/format';

export default function Login() {
  const { user, login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Redirect href="/(tabs)" />;

  async function submit() {
    if (!PHONE_REGEX.test(phone.trim())) return setError('Số điện thoại gồm 10 chữ số, bắt đầu bằng 0');
    if (!password) return setError('Nhập mật khẩu');
    setSubmitting(true);
    setError(null);
    try {
      await login(phone.trim(), password);
      router.replace('/(tabs)');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', marginTop: 48, marginBottom: 16, gap: 6 }}>
          <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800' }}>+</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>Phòng khám</Text>
          <Muted>Đặt lịch khám và lấy số ngay trên điện thoại</Muted>
        </View>
        <Card>
          <Field label="Số điện thoại" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="09xxxxxxxx" autoComplete="tel" />
          <Field label="Mật khẩu" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
          <ErrorBox message={error} />
          <Button title="Đăng nhập" onPress={submit} loading={submitting} />
        </Card>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <Muted>Chưa có tài khoản?</Muted>
          <Link href="/register" style={{ color: colors.primary, fontWeight: '600' }}>Đăng ký</Link>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
