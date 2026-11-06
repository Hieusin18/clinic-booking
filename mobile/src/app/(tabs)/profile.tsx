import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Card, Chip, ErrorBox, Field, Loading, Muted, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { GENDER_LABEL, PHONE_REGEX, parseVnDate, toVnDateInput } from '@/lib/format';
import type { Gender, Patient } from '@/lib/types';

const LOCAL_ERRORS: Record<string, string> = {
  dob: 'Ngày sinh không hợp lệ (ngày/tháng/năm)',
  insurance: 'Hạn thẻ BHYT không hợp lệ (ngày/tháng/năm)',
  relativePhone: 'SĐT người nhà gồm 10 chữ số, bắt đầu bằng 0',
};

/** Hồ sơ bệnh nhân: xem, sửa thông tin hành chính (in lên bệnh án), đăng xuất. */
export default function Profile() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['me', 'patient'], queryFn: async () => (await api.get<Patient>('/patients/me')).data });
  const [form, setForm] = useState({
    fullName: '',
    dob: '',
    nationalId: '',
    address: '',
    insuranceNo: '',
    insuranceExpiry: '',
    allergies: '',
    occupation: '',
    ethnicity: '',
    relativeName: '',
    relativePhone: '',
  });
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
      insuranceExpiry: p.insuranceExpiry ? toVnDateInput(p.insuranceExpiry) : '',
      allergies: p.allergies ?? '',
      occupation: p.occupation ?? '',
      ethnicity: p.ethnicity ?? '',
      relativeName: p.relativeName ?? '',
      relativePhone: p.relativePhone ?? '',
    });
    setGender(p.gender);
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      const dateOfBirth = parseVnDate(form.dob);
      if (!dateOfBirth) throw new Error('dob');
      const insuranceExpiry = form.insuranceExpiry.trim() ? parseVnDate(form.insuranceExpiry) : undefined;
      if (insuranceExpiry === null) throw new Error('insurance');
      const relativePhone = form.relativePhone.trim();
      if (relativePhone && !PHONE_REGEX.test(relativePhone)) throw new Error('relativePhone');
      const body = {
        fullName: form.fullName.trim(),
        dateOfBirth,
        gender,
        nationalId: form.nationalId.trim() || undefined,
        address: form.address.trim() || undefined,
        insuranceNo: form.insuranceNo.trim() || undefined,
        insuranceExpiry,
        allergies: form.allergies.trim() || undefined,
        occupation: form.occupation.trim() || undefined,
        ethnicity: form.ethnicity.trim() || undefined,
        relativeName: form.relativeName.trim() || undefined,
        relativePhone: relativePhone || undefined,
      };
      return (await api.patch<Patient>('/patients/me', body)).data;
    },
    onSuccess: (data) => {
      setError(null);
      queryClient.setQueryData(['me', 'patient'], data);
      Alert.alert('Đã lưu', 'Hồ sơ của bạn đã được cập nhật.');
    },
    onError: (err) => setError(err instanceof Error && err.message in LOCAL_ERRORS ? LOCAL_ERRORS[err.message] : errorMessage(err)),
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
        <Field label="Nghề nghiệp" value={form.occupation} onChangeText={set('occupation')} />
        <Field label="Dân tộc" value={form.ethnicity} onChangeText={set('ethnicity')} placeholder="Kinh" />
        <Field label="Mã thẻ BHYT" value={form.insuranceNo} onChangeText={set('insuranceNo')} autoCapitalize="characters" />
        <Field label="Thẻ BHYT có giá trị đến" value={form.insuranceExpiry} onChangeText={set('insuranceExpiry')} placeholder="ngày/tháng/năm" />
        <Field label="Địa chỉ" value={form.address} onChangeText={set('address')} />
        <Field label="Người nhà cần báo tin" value={form.relativeName} onChangeText={set('relativeName')} placeholder="Họ tên, quan hệ" />
        <Field label="SĐT người nhà" value={form.relativePhone} onChangeText={set('relativePhone')} keyboardType="phone-pad" maxLength={10} />
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
