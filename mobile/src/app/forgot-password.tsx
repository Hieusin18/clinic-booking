import { Stack, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { PhoneVerify, type VerifiedPhone } from '@/components/PhoneVerify';
import { Text } from '@/components/Text';
import { Button, Card, ErrorBox, Field, Muted, Screen, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { PHONE_REGEX } from '@/lib/format';
import { passwordChecks, passwordProblem } from '@/lib/password';

/**
 * Quên mật khẩu: (1) nhập số điện thoại → (2) nhắn tin xác minh từ chính số đó → (3) đặt mật khẩu mới.
 * Xong thì đăng nhập luôn; các máy khác đang đăng nhập tài khoản này bị đăng xuất.
 */
export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [step, setStep] = useState<'phone' | 'verify' | 'password'>('phone');
  const [phone, setPhone] = useState('');
  const [verified, setVerified] = useState<VerifiedPhone | null>(null);
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onVerified = useCallback((v: VerifiedPhone) => {
    setVerified(v);
    setStep('password');
  }, []);

  async function save() {
    const weak = passwordProblem(pw.next, phone);
    if (weak) return setError(weak);
    if (pw.next !== pw.confirm) return setError('Mật khẩu nhập lại không khớp');
    setSaving(true);
    setError(null);
    try {
      await resetPassword(verified!, pw.next);
      router.replace('/(tabs)');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Quên mật khẩu' }} />
      {step === 'phone' ? (
        <Card>
          <Muted>Nhập số điện thoại đã đăng ký. Bạn sẽ nhắn một tin từ chính số này để xác minh.</Muted>
          <Field label="Số điện thoại" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={10} autoComplete="tel" />
          <ErrorBox message={error} />
          <Button
            title="Tiếp tục"
            onPress={() => {
              if (!PHONE_REGEX.test(phone.trim())) return setError('Số điện thoại gồm 10 chữ số, bắt đầu bằng 0');
              setError(null);
              setPhone(phone.trim());
              setStep('verify');
            }}
          />
        </Card>
      ) : step === 'verify' ? (
        <>
          <PhoneVerify phone={phone} purpose="RESET_PASSWORD" onVerified={onVerified} />
          <Button title="Đổi số điện thoại" variant="secondary" onPress={() => setStep('phone')} />
        </>
      ) : (
        <Card>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.success }}>Đã xác minh số {phone}</Text>
          <Field label="Mật khẩu mới" value={pw.next} onChangeText={(v) => setPw((p) => ({ ...p, next: v }))} secureTextEntry autoComplete="new-password" />
          <View style={{ gap: 4 }}>
            {passwordChecks(pw.next, phone).map((c) => (
              <Text key={c.label} style={{ fontSize: 13.5, color: c.ok ? colors.success : colors.muted }}>
                {c.ok ? '✓' : '○'} {c.label}
              </Text>
            ))}
          </View>
          <Field
            label="Nhập lại mật khẩu mới"
            value={pw.confirm}
            onChangeText={(v) => setPw((p) => ({ ...p, confirm: v }))}
            secureTextEntry
            autoComplete="new-password"
          />
          <ErrorBox message={error} />
          <Button title="Đặt mật khẩu mới" onPress={save} loading={saving} />
        </Card>
      )}
    </Screen>
  );
}
