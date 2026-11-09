import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Vibration } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { API_URL, getApiToken } from './api';
import { useAuth } from './auth';
import { PATIENT_LIVE_KEYS, reconnectWithNewToken, socketTarget, type VisitCalledEvent } from './socket';

interface RealtimeState {
  connected: boolean;
  socket: Socket | null;
  /** Lần gần nhất bác sĩ gọi số của bệnh nhân này (để hiện thông báo trên phiếu) */
  lastCall: (VisitCalledEvent & { at: number }) | null;
}

const RealtimeContext = createContext<RealtimeState>({ connected: false, socket: null, lastCall: null });

/**
 * WebSocket của bệnh nhân: khi bác sĩ gọi số, chuyển đi cận lâm sàng, có kết quả hay khám xong,
 * phiếu số và lịch sử khám cập nhật ngay (không phải chờ lần hỏi lại định kỳ). Được gọi số thì máy rung.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<RealtimeState>({ connected: false, socket: null, lastCall: null });
  const userId = user?.id;

  useEffect(() => {
    const token = getApiToken();
    if (!userId || !token) return;
    const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
    const { url, path } = socketTarget(API_URL, origin);
    // Điện thoại: dùng thẳng WebSocket; bản web qua proxy của Metro thì để Socket.IO tự lùi về long-polling
    const socket = io(url, { path, auth: { token }, ...(Platform.OS === 'web' ? {} : { transports: ['websocket'] }) });
    const refresh = () => PATIENT_LIVE_KEYS.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey: [...queryKey] }));
    setState((s) => ({ ...s, socket }));
    socket.on('connect', () => {
      setState((s) => ({ ...s, connected: true }));
      refresh();
    });
    socket.on('disconnect', () => setState((s) => ({ ...s, connected: false })));
    reconnectWithNewToken(socket, token, getApiToken);
    socket.on('visit:changed', refresh);
    socket.on('visit:called', (e: VisitCalledEvent) => {
      if (Platform.OS !== 'web') Vibration.vibrate([0, 400, 200, 400]);
      setState((s) => ({ ...s, lastCall: { ...e, at: Date.now() } }));
    });
    return () => {
      socket.disconnect();
      setState({ connected: false, socket: null, lastCall: null });
    };
  }, [userId, queryClient]);

  return <RealtimeContext.Provider value={state}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);

/** Nghe một sự kiện trên kết nối hiện tại (vd. "notification:new"). */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const { socket } = useRealtime();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!socket) return;
    const listener = (p: T) => ref.current(p);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
