import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  priority: 'high';
  channelId: string;
}

interface PushTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/** Gọi API Expo Push (miễn phí, không cần tài khoản; có EXPO_ACCESS_TOKEN thì gửi kèm). */
@Injectable()
export class ExpoPushClient {
  endpoint: string;
  private readonly accessToken?: string;

  constructor(config: ConfigService) {
    this.endpoint = String(config.get('EXPO_PUSH_URL') ?? '').trim() || EXPO_PUSH_URL;
    this.accessToken = String(config.get('EXPO_ACCESS_TOKEN') ?? '').trim() || undefined;
  }

  /** Trả về kết quả theo đúng thứ tự tin gửi đi (Expo nhận tối đa 100 tin mỗi lần). */
  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(messages.slice(i, i + 100)),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Expo Push trả về ${res.status}`);
      const json = (await res.json()) as { data?: PushTicket[] };
      tickets.push(...(json.data ?? []));
    }
    return tickets;
  }
}
