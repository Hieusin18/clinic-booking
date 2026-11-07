import { Image, Linking, Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { Badge, Card, Muted, SectionLabel, colors, styles } from '@/components/ui';
import { API_URL } from '@/lib/api';
import type { LabOrder } from '@/lib/types';

/** Đường dẫn đầy đủ của tệp kết quả (đã có chữ ký, mở được không cần đăng nhập, hết hạn sau 1 giờ). */
export const labFileUri = (url: string) => `${API_URL}${url}`;

/**
 * Kết quả cận lâm sàng của một lần khám. `pending` = bác sĩ chưa hoàn tất: chỉ hiện tên chỉ định,
 * kết quả hiện sau khi bác sĩ đọc và kết luận.
 */
export function LabResults({ orders, pending }: { orders: LabOrder[]; pending: boolean }) {
  if (orders.length === 0) return null;
  return (
    <Card>
      <SectionLabel>KẾT QUẢ CẬN LÂM SÀNG</SectionLabel>
      {pending ? (
        <View style={{ backgroundColor: colors.stampSoft, borderRadius: 12, padding: 12, gap: 4 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '600', color: colors.text }}>Bác sĩ đang chờ kết quả và sẽ gửi kết luận lên đây</Text>
          <Muted>{orders.map((o) => o.name).join(', ')}</Muted>
        </View>
      ) : (
        orders.map((o, idx) => (
          <View key={o.id} style={{ gap: 6, paddingTop: idx ? 12 : 0, borderTopWidth: idx ? 1 : 0, borderColor: colors.border }}>
            <View style={[styles.row, { justifyContent: 'space-between', gap: 8 }]}>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.text }}>{o.name}</Text>
              {o.doneAt ? <Badge label="Đã có kết quả" tone="success" /> : <Badge label="Chưa có kết quả" />}
            </View>
            {o.resultText ? <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{o.resultText}</Text> : null}
            {o.files.some((f) => f.mimeType !== 'application/pdf') ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {o.files
                  .filter((f) => f.mimeType !== 'application/pdf')
                  .map((f) => (
                    <Pressable key={f.id} accessibilityRole="imagebutton" accessibilityLabel={`Mở ảnh ${f.fileName}`} onPress={() => void Linking.openURL(labFileUri(f.url))}>
                      <Image source={{ uri: labFileUri(f.url) }} style={{ width: 96, height: 96, borderRadius: 10, backgroundColor: colors.seg }} resizeMode="cover" />
                    </Pressable>
                  ))}
              </View>
            ) : null}
            {o.files
              .filter((f) => f.mimeType === 'application/pdf')
              .map((f) => (
                <Pressable
                  key={f.id}
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(labFileUri(f.url))}
                  style={[styles.row, { gap: 8, paddingVertical: 6 }]}
                >
                  <Icon name="download" color={colors.stamp} size={18} strokeWidth={2} />
                  <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: colors.stamp }} numberOfLines={1}>
                    {f.fileName}
                  </Text>
                </Pressable>
              ))}
          </View>
        ))
      )}
    </Card>
  );
}
