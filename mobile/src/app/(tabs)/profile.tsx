import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { NotificationBell } from '@/components/NotificationBell';
import { usePushMode } from '@/lib/notifications';
import type { PushMode } from '@/lib/notify';
import { Text } from '@/components/Text';
import { Button, Card, Chip, ErrorBox, Field, Loading, Muted, Screen, SectionLabel, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { GENDER_LABEL, PHONE_REGEX, ageOf, formatDay, parseVnDate, toVnDateInput } from '@/lib/format';
import type { Gender, Patient } from '@/lib/types';

const LOCAL_ERRORS: Record<string, string> = {
  dob: 'Ngày sinh không hợp lệ (ngày/tháng/năm)',
  insurance: 'Hạn thẻ BHYT không hợp lệ (ngày/tháng/năm)',
  relativePhone: 'SĐT người nhà gồm 10 chữ số, bắt đầu bằng 0',
};


const PUSH_MODE: Record<PushMode, { title: string; hint: string }> = {
  remote: { title: 'Đang bật: nhận cả khi đã tắt ứng dụng', hint: 'Báo khi đến lượt, khi có kết quả, khi khám xong và nhắc trước giờ hẹn.' },
  local: {
    title: 'Đang bật: báo khi ứng dụng đang mở',
    hint: 'Máy này chưa nhận được tin đẩy từ máy chủ (Expo Go trên Android), nên ứng dụng tự báo khi đang mở. Nhắc lịch hẹn vẫn được đặt sẵn trên máy.',
  },
  off: { title: 'Đang tắt', hint: 'Bật quyền thông báo cho ứng dụng trong Cài đặt của điện thoại để được báo khi đến lượt và nhắc lịch hẹn.' },
};
function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 14.5, color: colors.muted, flexShrink: 0 }}>{label}</Text>
      <Text
        style={{
          fontSize: 14.5,
          fontWeight: '600',
          color: value ? colors.text : colors.faint,
          flexShrink: 1,
          textAlign: 'right',
        }}
      >
        {value || 'Chưa có'}
      </Text>
    </View>
  );
}

/** Hồ sơ bệnh nhân: xem, sửa thông tin hành chính (in lên bệnh án), đăng xuất. */
export default function Profile() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['me', 'patient'],
    queryFn: async () => (await api.get<Patient>('/patients/me')).data,
  });
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
  const [editing, setEditing] = useState(false);

  const fill = (p: Patient) => {
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
  };
  useEffect(() => {
    if (profile.data) fill(profile.data);
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
      setEditing(false);
      queryClient.setQueryData(['me', 'patient'], data);
      Alert.alert('Đã lưu', 'Hồ sơ của bạn đã được cập nhật.');
    },
    onError: (err) => setError(err instanceof Error && err.message in LOCAL_ERRORS ? LOCAL_ERRORS[err.message] : errorMessage(err)),
  });

  const pushMode = usePushMode();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (profile.isLoading)
    return (
      <Screen>
        <Loading />
      </Screen>
    );

  const p = profile.data;
  const name = p?.fullName ?? user?.fullName ?? '';
  const meta = [user?.phone, p ? GENDER_LABEL[p.gender] : null, p?.dateOfBirth ? `${ageOf(p.dateOfBirth)} tuổi` : null].filter(Boolean).join(' · ');

  return (
    <Screen title="Hồ sơ" refreshing={profile.isRefetching} onRefresh={profile.refetch} action={<NotificationBell />}>
      <View style={[styles.row, { gap: 14 }]}>
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: colors.ink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>{name.trim().split(/\s+/).at(-1)?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{name}</Text>
          <Muted>{meta}</Muted>
        </View>
      </View>

      {p?.allergies && !editing ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            backgroundColor: colors.warningSoft,
            borderRadius: 12,
            padding: 12,
          }}
        >
          <Icon name="alert" color={colors.warning} size={20} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.warning }}>Dị ứng: {p.allergies}</Text>
            <Text style={{ fontSize: 13, color: colors.text }}>Bác sĩ sẽ thấy khi kê đơn cho bạn.</Text>
          </View>
        </View>
      ) : null}

      {!editing ? (
        <Card>
          <SectionLabel>THÔNG TIN IN LÊN BỆNH ÁN</SectionLabel>
          <View>
            <InfoRow label="Ngày sinh" value={p?.dateOfBirth ? formatDay(p.dateOfBirth) : null} />
            <InfoRow label="Số CCCD" value={p?.nationalId} />
            <InfoRow label="Nghề nghiệp" value={p?.occupation} />
            <InfoRow label="Dân tộc" value={p?.ethnicity} />
            <InfoRow label="Mã thẻ BHYT" value={p?.insuranceNo} />
            <InfoRow label="BHYT đến" value={p?.insuranceExpiry ? formatDay(p.insuranceExpiry) : null} />
            <InfoRow label="Địa chỉ" value={p?.address} />
            <InfoRow label="Người nhà" value={[p?.relativeName, p?.relativePhone].filter(Boolean).join(' · ')} />
          </View>
          <Button title="Sửa hồ sơ" variant="secondary" onPress={() => setEditing(true)} />
        </Card>
      ) : (
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
          <Field label="Tiền sử dị ứng" value={form.allergies} onChangeText={set('allergies')} placeholder="Ví dụ: Penicillin, hải sản" multiline />
          <Muted>Bác sĩ sẽ thấy thông tin dị ứng khi kê đơn cho bạn.</Muted>
          <ErrorBox message={error} />
          <Button title="Lưu hồ sơ" onPress={() => save.mutate()} loading={save.isPending} />
          <Button title="Hủy" variant="secondary" onPress={() => setEditing(false)} disabled={save.isPending} />
        </Card>
      )}
      {Platform.OS !== 'web' ? (
        <Card>
          <SectionLabel>THÔNG BÁO TRÊN MÁY NÀY</SectionLabel>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{PUSH_MODE[pushMode].title}</Text>
          <Muted>{PUSH_MODE[pushMode].hint}</Muted>
        </Card>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => void logout()} style={{ alignSelf: 'center', padding: 12 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.danger }}>Đăng xuất</Text>
      </Pressable>
    </Screen>
  );
}
