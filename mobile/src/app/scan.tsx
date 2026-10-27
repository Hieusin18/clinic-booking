import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { Button, Card, Chip, ErrorBox, Field, Loading, Muted, Screen, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { doctorName } from '@/lib/format';
import { NEEDS_DOCTOR } from '@/lib/queue';
import type { Doctor, Page, Visit } from '@/lib/types';

/**
 * Quét mã QR ở quầy. Đã đặt lịch hôm nay → backend tự check-in.
 * Chưa đặt → chọn bác sĩ rồi gửi lại (mã QR có hạn 60 giây, hết hạn thì quét lại).
 */
export default function Scan() {
  const queryClient = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const [token, setToken] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [needDoctor, setNeedDoctor] = useState(false);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const locked = useRef(false);

  const doctors = useQuery({
    queryKey: ['doctors', 'all-active'],
    enabled: needDoctor,
    queryFn: async () => (await api.get<Page<Doctor>>('/doctors', { params: { pageSize: 100 } })).data.items,
  });

  const scan = useMutation({
    mutationFn: async (vars: { token: string; doctorId?: string }) => (await api.post<Visit>('/queue/scan', vars)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      router.replace('/(tabs)/ticket');
    },
    onError: (err) => {
      const msg = err instanceof AxiosError ? (err.response?.data as { message?: string })?.message : undefined;
      if (msg === NEEDS_DOCTOR) setNeedDoctor(true);
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
        <Muted>Bạn chưa đặt lịch hôm nay. Chọn bác sĩ muốn khám để lấy số.</Muted>
        {doctors.isLoading ? <Loading /> : null}
        <View style={{ gap: 8 }}>
          {doctors.data?.map((d) => (
            <Chip key={d.id} label={`${doctorName(d)} · ${d.specialty.name}`} selected={doctorId === d.id} onPress={() => setDoctorId(d.id)} />
          ))}
        </View>
        <ErrorBox message={scan.isError && scan.error && errorMessage(scan.error) !== NEEDS_DOCTOR ? errorMessage(scan.error) : null} />
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
