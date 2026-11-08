import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { Button, Card, ErrorBox, Field, Muted, colors } from './ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { LinkStatus } from '@/lib/types';

/**
 * Tài khoản vừa gắn vào hồ sơ có sẵn (lễ tân tạo khi khám vãng lai) mà chưa xác minh: lịch sử khám cũ bị ẩn,
 * thông tin cá nhân bị che. Bệnh nhân nhập mã liên kết in trên phiếu khám / bệnh án, hoặc nhờ lễ tân xác minh.
 */
export function VerifyHistoryCard() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['me', 'link'], queryFn: async () => (await api.get<LinkStatus>('/patients/me/link')).data });
  const [code, setCode] = useState('');
  const [done, setDone] = useState(false);
  const verify = useMutation({
    mutationFn: async () => (await api.post<LinkStatus>('/patients/me/verify', { code })).data,
    onSuccess: () => {
      setCode('');
      setDone(true);
      // Thấy lại lịch sử khám và hồ sơ đầy đủ
      for (const key of [['me'], ['visits'], ['appointments'], ['queue']]) void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  if (done) {
    return (
      <View
        accessibilityRole="alert"
        style={{ backgroundColor: colors.successSoft, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }}
      >
        <Icon name="check" color={colors.success} size={20} />
        <Text style={{ flex: 1, color: colors.success, fontWeight: '600' }}>Đã xác minh. Lịch sử khám và hồ sơ đầy đủ đã hiện lại.</Text>
      </View>
    );
  }
  if (!status.data || status.data.verified) return null;
  const n = status.data.hiddenVisits;
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.warningSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="lock" color={colors.warning} size={18} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
            {n > 0 ? `Bạn có ${n} lần khám trước khi dùng app` : 'Xác minh hồ sơ của bạn'}
          </Text>
          <Muted>
            Để bảo vệ bệnh án, hãy nhập mã liên kết in trên phiếu khám hoặc bệnh án của phòng khám. Không có mã thì mang CCCD đến quầy lễ tân để được xác minh.
          </Muted>
        </View>
      </View>
      <Field
        label="Mã liên kết"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="Ví dụ: K7M 2QX"
        maxLength={9}
      />
      <ErrorBox message={verify.error ? errorMessage(verify.error) : null} />
      <Button title="Xác minh" onPress={() => verify.mutate()} loading={verify.isPending} disabled={code.replace(/\s/g, '').length < 6} />
    </Card>
  );
}
