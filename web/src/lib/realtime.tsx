import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, tokenStore } from './api';
import { useAuth } from './auth';

/** Sự kiện loa gọi số (backend/src/realtime/realtime.ts) */
export interface CalledEvent {
  visitId: string;
  label: string;
  room: string | null;
  /** Tên hiển thị, có học vị: "BSCKI Trần Thị Bình" */
  doctorName: string;
  /** Tên không kèm học vị, để loa đọc (giọng đọc đánh vần "BSCKI" thành từng chữ cái) */
  doctorFullName?: string;
  recall: boolean;
}

interface RealtimeState {
  connected: boolean;
  socket: Socket | null;
}

export const RealtimeContext = createContext<RealtimeState>({ connected: false, socket: null });

/** Đường dẫn Socket.IO đi cùng API: baseURL "/api" → "/api/socket.io" trên cùng địa chỉ trang. */
export function socketTarget(baseURL = api.defaults.baseURL ?? '/api', origin = window.location.origin) {
  const u = new URL(baseURL, origin);
  return { url: u.origin, path: `${u.pathname.replace(/\/$/, '')}/socket.io` };
}

/** Dữ liệu mà sự kiện "có gì đổi" làm cũ: gọi lại API để lấy bản mới. */
export const LIVE_KEYS = [['queue'], ['appointments'], ['visit'], ['examined']] as const;

/**
 * Máy chủ ngắt kết nối khi token đang dùng hết hiệu lực (đổi mật khẩu, đăng xuất mọi máy, bị khóa). Socket.IO không tự
 * nối lại trong trường hợp này; nếu máy này vừa nhận token mới (vd. chính nó vừa đổi mật khẩu) thì nối lại bằng token đó.
 */
export function reconnectWithNewToken(
  socket: { on(event: 'disconnect', fn: (reason: string) => void): unknown; connect(): unknown; auth: unknown },
  used: string,
  current: () => string | null,
) {
  let last = used;
  socket.on('disconnect', (reason) => {
    if (reason !== 'io server disconnect') return;
    const token = current();
    if (!token || token === last) return;
    last = token;
    socket.auth = { token };
    socket.connect();
  });
}

/**
 * Kết nối WebSocket cho nhân viên đã đăng nhập. Mỗi khi hàng đợi hoặc lịch hẹn đổi (ở bất kỳ máy nào),
 * các trang đang mở tải lại ngay thay vì chờ tới lần hỏi lại định kỳ. Mất kết nối thì Socket.IO tự nối lại;
 * nối lại xong cũng tải lại một lượt để không sót thay đổi.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<RealtimeState>({ connected: false, socket: null });
  const staff = !!user && user.role !== 'PATIENT';

  useEffect(() => {
    const token = tokenStore.get();
    if (!staff || !token) return;
    const { url, path } = socketTarget();
    const socket = io(url, { path, auth: { token } });
    const refresh = () => LIVE_KEYS.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey: [...queryKey] }));
    socket.on('connect', () => {
      setState({ connected: true, socket });
      refresh();
    });
    socket.on('disconnect', () => setState({ connected: false, socket }));
    reconnectWithNewToken(socket, token, () => tokenStore.get());
    socket.on('queue:changed', refresh);
    return () => {
      socket.disconnect();
      setState({ connected: false, socket: null });
    };
  }, [staff, user?.id, queryClient]);

  return <RealtimeContext.Provider value={state}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);

/** Nghe một sự kiện khi đang kết nối (vd. màn hình quầy nghe "queue:called" để đọc loa). */
export function useRealtimeEvent<T>(event: string, handler: (payload: T) => void) {
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
