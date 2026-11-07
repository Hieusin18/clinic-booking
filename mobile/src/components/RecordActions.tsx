import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, styles } from '@/components/ui';
import { downloadRecord } from '@/lib/download';
import { errorMessage } from '@/lib/errors';
import { exportFileName, type ExportFormat } from '@/lib/record';

/** Hai nút tải bệnh án + đơn thuốc dạng PDF và Word (mở bảng chia sẻ của điện thoại). */
export function RecordActions({ visitId, visitDate }: { visitId: string; visitDate: string }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const download = async (format: ExportFormat) => {
    setBusy(format);
    try {
      await downloadRecord(visitId, format, exportFileName(visitDate, format));
    } catch (e) {
      Alert.alert('Không tải được', e instanceof Error ? e.message : errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={[styles.row, { gap: 10 }]}>
      <View style={{ flex: 1 }}>
        <Button title="Tải PDF" variant="secondary" icon="download" loading={busy === 'pdf'} disabled={!!busy} onPress={() => download('pdf')} />
      </View>
      <View style={{ flex: 1 }}>
        <Button title="Tải Word" variant="secondary" icon="download" loading={busy === 'docx'} disabled={!!busy} onPress={() => download('docx')} />
      </View>
    </View>
  );
}
