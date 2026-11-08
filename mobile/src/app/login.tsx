import { Link, Redirect, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Button, ErrorBox, Field, colors, styles } from '@/components/ui';
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
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, gap: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 14, marginTop: 32 }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 34, fontWeight: '700', lineHeight: 40 }}>+</Text>
            </View>
            <Text style={{ fontSize: 34, fontWeight: '700', color: colors.text, letterSpacing: -0.4 }}>Phòng khám</Text>
            <Text style={{ fontSize: 16, lineHeight: 24, color: colors.muted }}>Đặt lịch khám, lấy số ở quầy bằng mã QR và xem lại đơn thuốc của bạn.</Text>
          </View>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, gap: 16 }}>
            <Field label="Số điện thoại" icon="phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="09xxxxxxxx" autoComplete="tel" />
            <Field label="Mật khẩu" icon="lock" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
            <ErrorBox message={error} />
            <Button title="Đăng nhập" onPress={submit} loading={submitting} />
            <View style={{ alignItems: 'center' }}>
              <Link href="/forgot-password">
                <Text style={{ color: colors.stamp, fontWeight: '600', fontSize: 15 }}>Quên mật khẩu?</Text>
              </Link>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              <Text style={{ color: colors.muted, fontSize: 15 }}>Chưa có tài khoản?</Text>
              <Link href="/register">
                <Text style={{ color: colors.stamp, fontWeight: '700', fontSize: 15 }}>Đăng ký</Text>
              </Link>
            </View>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18 }}>
            <Text style={{ fontFamily: 'num', fontWeight: '700', fontSize: 40, color: colors.stamp, lineHeight: 44 }}>A07</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Đặt lịch trước, được gọi trước</Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>khi bạn đến đúng giờ hẹn</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
