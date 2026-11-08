import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { Button, Card, ErrorBox, Loading, Muted, colors } from './ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { mmss, secondsLeft, smsUrl, spacedCode } from '@/lib/sms';

export interface VerifiedPhone {
  verificationId: string;
  ticket: string;
}

interface Session {
  id: string;
  ticket: string;
  code: string;
  smsTo: string | null;
  smsBody: string;
  expiresAt: string;
  simulator: boolean;
}

/**
 * Xác minh số điện thoại kiểu Zalo: người dùng nhắn "PKXM <mã>" từ chính SIM của số đó tới số của phòng khám.
 * Phòng khám không tốn tiền nhắn tin; kẻ khai số của người khác không gửi được tin từ SIM của họ.
 * Tự hỏi máy chủ mỗi 2 giây; xác minh xong thì gọi onVerified.
 */
export function PhoneVerify({ phone, purpose, onVerified }: { phone: string; purpose: 'REGISTER' | 'RESET_PASSWORD'; onVerified: (v: VerifiedPhone) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(Date.now());
  const start = useMutation({
    mutationFn: async () => (await api.post<Session>('/auth/phone-verifications', { phone, purpose })).data,
    onSuccess: setSession,
  });
  // Bắt đầu một lần khi mở màn
  useEffect(() => start.mutate(), []);

  const left = session ? secondsLeft(session.expiresAt, now) : 0;
  const status = useQuery({
    queryKey: ['phone-verification', session?.id],
    enabled: !!session && left > 0,
    refetchInterval: 2000,
    queryFn: async () => (await api.get<{ status: string }>(`/auth/phone-verifications/${session!.id}`, { params: { ticket: session!.ticket } })).data,
  });
  // Chỉ báo một lần cho mỗi phiên (tránh gọi đăng ký hai lần khi màn vẽ lại)
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (status.data?.status === 'VERIFIED' && session && reported.current !== session.id) {
      reported.current = session.id;
      onVerified({ verificationId: session.id, ticket: session.ticket });
    }
  }, [status.data?.status, session, onVerified]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (start.error) {
    return (
      <Card>
        <ErrorBox message={errorMessage(start.error)} />
        <Button title="Thử lại" variant="secondary" onPress={() => start.mutate()} />
      </Card>
    );
  }
  if (!session) return <Loading />;

  const expired = left === 0 || status.data?.status === 'EXPIRED';
  const canCompose = Platform.OS !== 'web' && !!session.smsTo;

  return (
    <Card>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>Xác minh số {phone}</Text>
      <Muted>
        Nhắn tin từ chính số điện thoại này tới số của phòng khám. Bạn chỉ tốn cước một tin nhắn thường; tin gửi từ số khác sẽ không được chấp nhận.
      </Muted>

      <View style={{ backgroundColor: colors.bg, borderRadius: 14, padding: 14, gap: 8 }}>
        <Row label="Gửi tới" value={session.smsTo ?? 'chưa cấu hình'} />
        <Row label="Nội dung" value={session.smsBody} big />
      </View>

      {canCompose ? (
        <Button title="Mở tin nhắn và gửi" onPress={() => void Linking.openURL(smsUrl(session.smsTo!, session.smsBody, Platform.OS))} disabled={expired} />
      ) : session.smsTo ? (
        <Muted>Mở ứng dụng Tin nhắn trên điện thoại, soạn đúng nội dung trên và gửi tới số {session.smsTo}.</Muted>
      ) : null}
      {!session.smsTo && session.simulator ? (
        <View style={{ backgroundColor: colors.warningSoft, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: colors.warning, fontSize: 14 }}>
            Chế độ demo: phòng khám chưa có số nhận tin. Nhờ quản trị viên mở trang "Tin nhắn xác minh" và bấm Giả lập cho mã {spacedCode(session.code)}.
          </Text>
        </View>
      ) : null}

      {expired ? (
        <>
          <ErrorBox message="Mã đã hết hạn" />
          <Button title="Tạo mã mới" variant="secondary" onPress={() => start.mutate()} loading={start.isPending} />
        </>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLiveRegion="polite">
          <Icon name="clock" color={colors.muted} size={16} />
          <Text style={{ color: colors.muted, fontSize: 14 }}>Đang chờ tin nhắn… còn {mmss(left)}</Text>
        </View>
      )}
    </Card>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <Text style={{ color: colors.muted, fontSize: 14 }}>{label}</Text>
      <Text selectable style={{ fontFamily: 'num', fontWeight: '700', fontSize: big ? 26 : 20, color: colors.text, letterSpacing: 1 }}>
        {value}
      </Text>
    </View>
  );
}
