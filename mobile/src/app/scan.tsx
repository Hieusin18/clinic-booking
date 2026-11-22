import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { Text } from '@/components/Text';
import { Button, Card, Chip, ErrorBox, Field, Loading, Muted, Screen, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { doctorName } from '@/lib/format';
import { NEEDS_DOCTOR } from '@/lib/queue';
import type { Doctor, Page, Specialty, Visit } from '@/lib/types';
import { SymptomPicker } from '@/components/SymptomPicker';
import { withLogin } from '@/components/LoginRequired';

/**
 * Quét mã QR ở quầy. Đã đặt lịch hôm nay → backend tự check-in.
 * Chưa đặt → chọn bác sĩ rồi gửi lại (mã QR có hạn 60 giây, hết hạn thì quét lại).
 */
function Scan() {
  const queryClient = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const [token, setToken] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [needDoctor, setNeedDoctor] = useState(false);
  /** Lý do phải chọn bác sĩ (chưa đặt lịch, hoặc lịch hẹn đã hết hiệu lực vì đến trễ) */
  const [needDoctorReason, setNeedDoctorReason] = useState('');
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const locked = useRef(false);

  /** Lọc bác sĩ theo khoa gợi ý từ triệu chứng (null = mọi bác sĩ) */
  const [specialtyId, setSpecialtyId] = useState<string | null>(null);
  const specialties = useQuery({
    queryKey: ['specialties'],
    enabled: needDoctor,
    queryFn: async () => (await api.get<Page<Specialty>>('/specialties', { params: { pageSize: 100 } })).data.items,
  });
  const doctors = useQuery({
    queryKey: ['doctors', 'all-active'],
    enabled: needDoctor,
    queryFn: async () => (await api.get<Page<Doctor>>('/doctors', { params: { pageSize: 100 } })).data.items,
  });

  // Bác sĩ nào còn nhận khách vãng lai hôm nay (có ca, còn thời gian rảnh)
  const capacity = useQuery({
    queryKey: ['queue', 'capacity'],
    enabled: needDoctor,
    queryFn: async () => (await api.get<{ doctorId: string; accepting: boolean; hasShift: boolean; shiftOver: boolean }[]>('/queue/capacity')).data,
  });
  const capOf = (id: string) => capacity.data?.find((c) => c.doctorId === id);

  const scan = useMutation({
    mutationFn: async (vars: { token: string; doctorId?: string }) => (await api.post<Visit>('/queue/scan', vars)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      router.replace('/(tabs)/ticket');
    },
    onError: (err) => {
      const data = err instanceof AxiosError ? (err.response?.data as { message?: string; code?: string } | undefined) : undefined;
      if (data?.code === 'NEEDS_DOCTOR' || data?.message === NEEDS_DOCTOR) {
        setNeedDoctorReason(data.message && data.message !== NEEDS_DOCTOR ? data.message : '');
        setNeedDoctor(true);
      }
      else {
        setToken(null);
        locked.current = false;
      }
    },
  });

  function onCode(data: string) {
    if (locked.current) return; // camera gọi liên tục khi còn thấy mã: chỉ xử lý lần đầu
    locked.current = true;
    setToken(data);
    scan.mutate({ token: data });
  }

  const showError = scan.error && !needDoctor ? errorMessage(scan.error) : null;

  if (needDoctor && token) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Chọn bác sĩ' }} />
        <Muted>{needDoctorReason || 'Bạn chưa đặt lịch hôm nay. Chọn bác sĩ muốn khám để lấy số.'}</Muted>
        <SymptomPicker specialties={specialties.data ?? []} pickedSpecialtyId={specialtyId} onPick={setSpecialtyId} />
        {doctors.isLoading ? <Loading /> : null}
        {specialtyId ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 14, color: colors.muted }}>
              Bác sĩ khoa {specialties.data?.find((x) => x.id === specialtyId)?.name ?? ''}
            </Text>
            <Chip label="Xem tất cả bác sĩ" onPress={() => setSpecialtyId(null)} />
          </View>
        ) : null}
        <View style={{ gap: 8 }}>
          {/* Bác sĩ hết chỗ hôm nay vẫn hiện nhưng không chọn được, xếp xuống cuối */}
          {[...(doctors.data ?? [])]
            .filter((d) => !specialtyId || d.specialty.id === specialtyId)
            .sort((a, b) => Number(capOf(a.id)?.accepting === false) - Number(capOf(b.id)?.accepting === false))
            .map((d) => {
              const c = capOf(d.id);
              const closed = c?.accepting === false;
              const why = !closed ? '' : !c.hasShift ? ' · không có ca hôm nay' : c.shiftOver ? ' · đã hết ca' : ' · đã kín lịch';
              return (
                <Chip
                  key={d.id}
                  label={`${doctorName(d)} · ${d.specialty.name}${why}`}
                  selected={doctorId === d.id}
                  disabled={closed}
                  onPress={() => setDoctorId(d.id)}
                />
              );
            })}
        </View>
        <ErrorBox
          message={scan.isError && scan.error && ![NEEDS_DOCTOR, needDoctorReason].includes(errorMessage(scan.error)) ? errorMessage(scan.error) : null}
        />
        <Button title="Lấy số" disabled={!doctorId} loading={scan.isPending} onPress={() => scan.mutate({ token, doctorId: doctorId! })} />
        <Button
          title="Quét lại mã"
          variant="secondary"
          onPress={() => {
            setNeedDoctor(false);
            setToken(null);
            locked.current = false;
            scan.reset();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={Platform.OS === 'web'}>
      <Stack.Screen options={{ title: 'Quét mã QR' }} />
      {Platform.OS === 'web' ? (
        // Bản web (chỉ để xem thử, không có camera): dán mã đọc được từ màn hình quầy
        <Card>
          <Field label="Mã QR (bản web thử nghiệm)" value={manual} onChangeText={setManual} placeholder="Dán chuỗi mã" />
          <Button title="Gửi mã" disabled={!manual} loading={scan.isPending} onPress={() => onCode(manual.trim())} />
        </Card>
      ) : !permission ? (
        <Loading />
      ) : !permission.granted ? (
        <Card>
          <Text style={styles.title}>Cần quyền dùng camera</Text>
          <Muted>Ứng dụng dùng camera để quét mã QR trên màn hình ở quầy lễ tân.</Muted>
          {permission.canAskAgain ? (
            <Button title="Cho phép dùng camera" onPress={requestPermission} />
          ) : (
            <>
              <Muted>Bạn đã từ chối quyền camera. Hãy bật lại trong Cài đặt của điện thoại.</Muted>
              <Button title="Mở Cài đặt" onPress={() => void Linking.openSettings()} />
            </>
          )}
        </Card>
      ) : (
        <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scan.isPending ? undefined : ({ data }) => onCode(data)}
          />
          <View style={{ position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 16, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
              Hướng camera vào mã QR trên màn hình quầy
            </Text>
          </View>
        </View>
      )}
      {scan.isPending ? <Text style={{ textAlign: 'center', color: colors.muted }}>Đang lấy số…</Text> : null}
      <ErrorBox message={showError} />
    </Screen>
  );
}

export default withLogin(Scan, { reason: 'Đăng nhập để lấy số bằng mã QR' });
