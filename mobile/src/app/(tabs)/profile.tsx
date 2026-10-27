import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Card, Chip, ErrorBox, Field, Loading, Muted, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { GENDER_LABEL, parseVnDate, toVnDateInput } from '@/lib/format';
import type { Gender, Patient } from '@/lib/types';

/** Hồ sơ bệnh nhân: xem, sửa thông tin hành chính, đăng xuất. */
export default function Profile() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['me', 'patient'], queryFn: async () => (await api.get<Patient>('/patients/me')).data });
  const [form, setForm] = useState({ fullName: '', dob: '', nationalId: '', address: '', insuranceNo: '', allergies: '' });
  const [gender, setGender] = useState<Gender>('OTHER');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setForm({
      fullName: p.fullName,
      dob: toVnDateInput(p.dateOfBirth),
      nationalId: p.nationalId ?? '',
      address: p.address ?? '',
      insuranceNo: p.insuranceNo ?? '',
      allergies: p.allergies ?? '',
    });
    setGender(p.gender);
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      const dateOfBirth = parseVnDate(form.dob);
      if (!dateOfBirth) throw new Error('dob');
      const body = {
        fullName: form.fullName.trim(),
        dateOfBirth,
        gender,
        nationalId: form.nationalId.trim() || undefined,
        address: form.address.trim() || undefined,
        insuranceNo: form.insuranceNo.trim() || undefined,
        allergies: form.allergies.trim() || undefined,
      };
      return (await api.patch<Patient>('/patients/me', body)).data;
    },
    onSuccess: (data) => {
      setError(null);
      queryClient.setQueryData(['me', 'patient'], data);
      Alert.alert('Đã lưu', 'Hồ sơ của bạn đã được cập nhật.');
    },
    onError: (err) => setError(err instanceof Error && err.message === 'dob' ? 'Ngày sinh không hợp lệ (ngày/tháng/năm)' : errorMessage(err)),
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (profile.isLoading) return <Screen><Loading /></Screen>;

  return (
    <Screen refreshing={profile.isRefetching} onRefresh={profile.refetch}>
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '700' }}>{user?.fullName}</Text>
        <Muted>Số điện thoại đăng nhập: {user?.phone}</Muted>
      </Card>
      <Card>
        <Field label="Họ và tên" value={form.fullName} onChangeText={set('fullName')} />
        <Field label="Ngày sinh" value={form.dob} onChangeText={set('dob')} placeholder="ngày/tháng/năm" />
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Giới tính</Text>
          <View style={styles.wrap}>
            {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
              <Chip key={g} label={GENDER_LABEL[g]} selected={gender === g} onPress={() => setGender(g)} />
            ))}
          </View>
        </View>
        <Field label="Số CCCD" value={form.nationalId} onChangeText={set('nationalId')} keyboardType="number-pad" maxLength={12} />
        <Field label="Mã thẻ BHYT" value={form.insuranceNo} onChangeText={set('insuranceNo')} autoCapitalize="characters" />
        <Field label="Địa chỉ" value={form.address} onChangeText={set('address')} />
        <Field
          label="Tiền sử dị ứng"
          value={form.allergies}
          onChangeText={set('allergies')}
          placeholder="Ví dụ: Penicillin, hải sản"
          multiline
        />
        <Muted>Bác sĩ sẽ thấy thông tin dị ứng khi kê đơn cho bạn.</Muted>
        <ErrorBox message={error} />
        <Button title="Lưu hồ sơ" onPress={() => save.mutate()} loading={save.isPending} />
      </Card>
      <Button title="Đăng xuất" variant="danger" onPress={() => void logout()} />
    </Screen>
  );
}
