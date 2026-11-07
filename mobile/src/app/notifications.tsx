import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';
import { Empty, ErrorBox, Loading, Muted, Screen, colors } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useInbox, usePushMode } from '@/lib/notifications';
import { targetOf, timeAgo, type AppNotification } from '@/lib/notify';

const KIND: Record<AppNotification['type'], { icon: IconName; color: string; soft: string }> = {
  CALLED: { icon: 'qr', color: colors.stamp, soft: colors.stampSoft },
  RESULTS_READY: { icon: 'alert', color: colors.warning, soft: colors.warningSoft },
  VISIT_DONE: { icon: 'check', color: colors.success, soft: colors.successSoft },
  APPOINTMENT_REMINDER: { icon: 'calendar', color: colors.stamp, soft: colors.stampSoft },
};

/** Hộp thư: gọi số, có kết quả, khám xong, nhắc lịch. Bấm một tin để mở màn hình liên quan. */
export default function NotificationsScreen() {
  const inbox = useInbox();
  const mode = usePushMode();
  const queryClient = useQueryClient();
  const read = useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) => api.post('/notifications/read', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const open = (n: AppNotification) => {
    if (!n.readAt) read.mutate({ ids: [n.id] });
    const url = targetOf(n);
    if (url) router.push(url);
  };

  const items = inbox.data?.items ?? [];
  return (
    <Screen refreshing={inbox.isRefetching} onRefresh={inbox.refetch}>
      <ErrorBox message={inbox.error ? errorMessage(inbox.error) : null} />
      {mode === 'off' && Platform.OS !== 'web' ? (
        <Muted>Điện thoại chưa cho phép ứng dụng gửi thông báo. Bạn vẫn xem được các tin ở đây; bật lại trong Cài đặt của máy để được báo khi đến lượt.</Muted>
      ) : null}
      {inbox.data?.unread ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => read.mutate({ all: true })}
          disabled={read.isPending}
          hitSlop={8}
          style={{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Icon name="check" color={colors.stamp} size={18} strokeWidth={2.2} />
          <Text style={{ fontSize: 14.5, fontWeight: '600', color: colors.stamp }}>Đánh dấu đã đọc hết</Text>
        </Pressable>
      ) : null}
      {inbox.isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty title="Chưa có thông báo" hint="Khi đến lượt khám, có kết quả hay sắp tới lịch hẹn, ứng dụng sẽ báo cho bạn ở đây." />
      ) : (
        items.map((n) => {
          const k = KIND[n.type];
          const unread = !n.readAt;
          return (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={`${unread ? 'Chưa đọc. ' : ''}${n.title}. ${n.body}`}
              onPress={() => open(n)}
              style={{
                flexDirection: 'row',
                gap: 12,
                backgroundColor: unread ? colors.card : colors.bg,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: unread ? colors.stamp : colors.border,
                padding: 14,
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: k.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={k.icon} color={k.color} size={20} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: 15.5, fontWeight: unread ? '700' : '600', color: colors.text }}>{n.title}</Text>
                  {unread ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.stamp }} /> : null}
                </View>
                <Text style={{ fontSize: 14.5, lineHeight: 20, color: colors.muted }}>{n.body}</Text>
                <Text style={{ fontSize: 12.5, color: colors.faint }}>{timeAgo(n.createdAt)}</Text>
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
