import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecordActions } from '@/components/RecordActions';
import { RecordFrame } from '@/components/RecordFrame';
import { colors, Muted } from '@/components/ui';

/** Xem trước bệnh án + đơn thuốc đúng như bản in, rồi mới tải PDF/Word. */
export default function PreviewScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Xem trước bản điện tử' }} />
      <View style={{ flex: 1 }}>
        <RecordFrame visitId={id} />
      </View>
      <View style={{ padding: 12, paddingBottom: 12 + insets.bottom, gap: 6, backgroundColor: '#fff', borderTopWidth: 1, borderColor: colors.border }}>
        <Muted>Chụm hai ngón tay để phóng to. Tải về để lưu, in hoặc gửi cho người khác.</Muted>
        <RecordActions visitId={id} visitDate={date ?? new Date().toISOString()} />
      </View>
    </View>
  );
}
