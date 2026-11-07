import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { api } from './api';
import { useAuth } from './auth';
import { presentLocally, reminderPlan, targetOf, type AppNotification, type Inbox, type PushMode } from './notify';
import { rememberPushToken } from './pushToken';
import { useSocketEvent } from './realtime';
import type { Appointment } from './types';

const PushModeContext = createContext<PushMode>('off');

/** Máy đang nhận thông báo theo cách nào (hiện ở tab Hồ sơ). */
export const usePushMode = () => useContext(PushModeContext);

/** Hộp thư thông báo của bệnh nhân (số chưa đọc hiện trên chuông và tab Lịch sử). */
export function useInbox() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<Inbox>('/notifications/mine')).data,
    enabled: !!user,
  });
}

const native = Platform.OS !== 'web';

/**
 * Token Expo Push của máy, hoặc null nếu máy này không nhận được tin đẩy:
 *  - Expo Go trên Android không còn hỗ trợ tin đẩy (từ SDK 53), cần bản APK / development build;
 *  - chưa gắn app với dự án EAS (chạy `npx eas init` để có extra.eas.projectId trong app.json);
 *  - bản APK tự build mà chưa cấu hình Firebase (google-services.json).
 */
async function expoPushToken(): Promise<string | null> {
  if (Platform.OS === 'android' && isRunningInExpoGo()) return null;
  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

/** Đặt lại lịch nhắc hẹn trên máy (chế độ local): xóa lịch cũ của app rồi đặt theo danh sách lịch hẹn mới nhất. */
async function syncLocalReminders(appointments: Appointment[]) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { kind?: string } | undefined)?.kind === 'reminder')
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  for (const r of reminderPlan(appointments)) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, data: { url: r.url, kind: 'reminder' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: 'default' },
    });
  }
}

/**
 * Thông báo trên điện thoại bệnh nhân:
 *  - đăng nhập xong thì xin quyền, đăng ký token đẩy với server (nếu máy hỗ trợ);
 *  - tin mới qua WebSocket: cập nhật hộp thư; máy không nhận được tin đẩy thì app tự hiện thông báo;
 *  - máy không nhận được tin đẩy: tự đặt lịch nhắc hẹn trên máy (trước một ngày, trước một giờ);
 *  - bấm vào thông báo: đánh dấu đã đọc và mở đúng màn hình (phiếu số, chi tiết lần khám, lịch hẹn).
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<PushMode>('off');
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const handled = useRef<string | null>(null);

  // Cách hiện thông báo khi app đang mở, kênh thông báo Android, và xử lý khi bấm vào thông báo
  useEffect(() => {
    if (!native) return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync('default', {
        name: 'Thông báo phòng khám',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 300, 200, 300],
      });
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      handled.current = r.notification.request.identifier;
      openNotification(r.notification.request.content.data);
    });
    return () => sub.remove();
  }, []);

  const openNotification = (data: unknown) => {
    const id = (data as { notificationId?: unknown } | null)?.notificationId;
    if (typeof id === 'string') {
      void api
        .post('/notifications/read', { ids: [id] })
        .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
        .catch(() => undefined);
    }
    const url = targetOf(data);
    if (url) router.push(url);
  };

  // Đăng nhập: xin quyền và đăng ký nhận tin đẩy; đăng xuất: bỏ các lịch nhắc đã đặt trên máy
  useEffect(() => {
    if (!userId || !native) {
      setMode('off');
      return;
    }
    let cancelled = false;
    (async (): Promise<PushMode> => {
      const perm = await Notifications.getPermissionsAsync();
      let granted = perm.granted || perm.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      if (!granted && perm.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
      if (!granted) return 'off';
      const token = await expoPushToken();
      if (!token) return 'local';
      await api.post('/notifications/push-token', { token, platform: Platform.OS });
      rememberPushToken(token);
      return 'remote';
    })()
      .catch((): PushMode => 'local')
      .then((m) => {
        if (cancelled) return;
        setMode(m);
        // Mở app bằng cách bấm vào thông báo khi app đang tắt
        const last = Notifications.getLastNotificationResponse();
        if (last && handled.current !== last.notification.request.identifier) {
          handled.current = last.notification.request.identifier;
          openNotification(last.notification.request.content.data);
        }
      });
    return () => {
      cancelled = true;
      void Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
    };
    // openNotification chỉ dùng queryClient (không đổi giữa các lần vẽ)
  }, [userId]);

  // Không nhận được tin đẩy: tự đặt lịch nhắc hẹn trên máy theo lịch hẹn sắp tới
  const upcoming = useQuery({
    queryKey: ['appointments', 'upcoming'],
    queryFn: async () => (await api.get<Appointment[]>('/appointments/mine', { params: { when: 'upcoming' } })).data,
    enabled: !!userId && mode === 'local',
  });
  useEffect(() => {
    if (mode !== 'local' || !upcoming.data) return;
    void syncLocalReminders(upcoming.data).catch(() => undefined);
  }, [mode, upcoming.data]);

  // Tin mới từ server qua WebSocket
  useSocketEvent<AppNotification>('notification:new', (n) => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    if (native && presentLocally(n.type, modeRef.current)) {
      void Notifications.scheduleNotificationAsync({
        content: { title: n.title, body: n.body, data: { url: n.url, notificationId: n.id } },
        trigger: null,
      }).catch(() => undefined);
    }
  });

  return <PushModeContext.Provider value={mode}>{children}</PushModeContext.Provider>;
}

/**
 * Mở màn hình liên quan thì coi như đã xem các tin của lượt khám đó
 * (vd. mở chi tiết lần khám → tin "có kết quả"; mở phiếu số → tin gọi số).
 */
export function useMarkVisitRead(visitId: string | undefined, types: AppNotification['type'][], enabled = true) {
  const inbox = useInbox();
  const queryClient = useQueryClient();
  const key = types.join(',');
  const pending = !!visitId && enabled && !!inbox.data?.items.some((n) => n.visitId === visitId && !n.readAt && types.includes(n.type));
  useEffect(() => {
    if (!pending) return;
    void api
      .post('/notifications/read', { visitId, types: key.split(',') })
      .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
      .catch(() => undefined);
  }, [pending, visitId, key, queryClient]);
}
