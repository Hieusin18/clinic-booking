import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { Button, Card, ErrorBox, Field, Muted, Screen, SectionLabel, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { passwordChecks, passwordProblem } from '@/lib/password';

/** Đổi mật khẩu và đăng xuất khỏi mọi thiết bị (tab Hồ sơ → Đổi mật khẩu). */
export default function ChangePassword() {
  const { user, changePassword, logoutAll } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const checks = passwordChecks(form.next, user?.phone);

  async function submit() {
    if (!form.current) return setError('Nhập mật khẩu hiện tại');
    const weak = passwordProblem(form.next, user?.phone);
    if (weak) return setError(weak);
    if (form.next !== form.confirm) return setError('Mật khẩu nhập lại không khớp');
    setSaving(true);
    setError(null);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const confirmLogoutAll = () => {
    const run = () =>
      void logoutAll().then(
        () => router.replace('/login'),
        (err: unknown) => setError(errorMessage(err)),
      );
    if (Platform.OS === 'web') {
      if (window.confirm('Đăng xuất khỏi mọi thiết bị? Máy này cũng phải đăng nhập lại.')) run();
      return;
    }
    Alert.alert('Đăng xuất khỏi mọi thiết bị?', 'Máy này cũng phải đăng nhập lại.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất hết', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <Screen>
      <Card>
        {done ? (
          <View
            accessibilityRole="alert"
            style={{ backgroundColor: colors.successSoft, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}
          >
            <Icon name="check" color={colors.success} size={20} />
            <Text style={{ flex: 1, color: colors.success, fontWeight: '600' }}>Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.</Text>
          </View>
        ) : null}
        <Field label="Mật khẩu hiện tại" value={form.current} onChangeText={set('current')} secureTextEntry autoComplete="current-password" />
        <Field label="Mật khẩu mới" value={form.next} onChangeText={set('next')} secureTextEntry autoComplete="new-password" />
        <View style={{ gap: 4 }} accessibilityLiveRegion="polite">
          {checks.map((c) => (
            <Text key={c.label} style={{ fontSize: 13.5, color: c.ok ? colors.success : colors.muted }}>
              {c.ok ? '✓' : '○'} {c.label}
            </Text>
          ))}
        </View>
        <Field label="Nhập lại mật khẩu mới" value={form.confirm} onChangeText={set('confirm')} secureTextEntry autoComplete="new-password" />
        <ErrorBox message={error} />
        <Button title="Đổi mật khẩu" onPress={submit} loading={saving} />
      </Card>
      <Card>
        <SectionLabel>ĐĂNG XUẤT KHỎI MỌI THIẾT BỊ</SectionLabel>
        <Muted>Dùng khi bạn mất điện thoại cũ hoặc nghi ngờ người khác biết mật khẩu. Máy này cũng sẽ phải đăng nhập lại.</Muted>
        <Pressable accessibilityRole="button" onPress={confirmLogoutAll} style={{ paddingVertical: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.danger }}>Đăng xuất mọi thiết bị</Text>
        </Pressable>
      </Card>
    </Screen>
  );
}
