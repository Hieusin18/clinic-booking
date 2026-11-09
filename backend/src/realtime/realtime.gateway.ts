import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { verifySession } from '../auth/guards/auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const SOCKET_PATH = '/api/socket.io';
export const STAFF_ROOM = 'staff';
export const userRoom = (userId: string) => `user:${userId}`;

@WebSocketGateway({ path: SOCKET_PATH, cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server?: Server;
  private readonly log = new Logger('Realtime');

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth as { token?: unknown } | undefined)?.token;
    try {
      if (typeof token !== 'string' || !token) throw new Error('missing token');
      const { user } = await verifySession(this.jwt, this.prisma, token);
      // Ghi lại phiên bản token để cắt kết nối khi tài khoản đăng xuất mọi máy / đổi mật khẩu / bị khóa
      client.data = { userId: user.sub, ver: user.ver };
      await client.join(user.role === 'PATIENT' ? [userRoom(user.sub)] : [userRoom(user.sub), STAFF_ROOM]);
    } catch {
      client.emit('auth:error', { message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
      client.disconnect(true);
    }
  }

  /** Ngắt các kết nối của một tài khoản, trừ những kết nối đã dùng token phiên bản `keepVer` (máy vừa đổi mật khẩu). */
  async disconnectUser(userId: string, keepVer?: number) {
    if (!this.server) return;
    const sockets = await this.server.in(userRoom(userId)).fetchSockets();
    for (const s of sockets) {
      if (keepVer === undefined || (s.data as { ver?: number }).ver !== keepVer) s.disconnect(true);
    }
  }

  emit(room: string, event: string, payload: object) {
    try {
      this.server?.to(room).emit(event, payload);
    } catch (err) {
      this.log.warn(`Không gửi được ${event}: ${String(err)}`);
    }
  }
}
