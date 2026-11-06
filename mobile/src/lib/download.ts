import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { api, API_URL, getApiToken } from './api';
import { downloadError, EXPORT_TYPES, type ExportFormat } from './record';

/**
 * Tải bệnh án + đơn thuốc (PDF/Word) của một lượt khám.
 *  - Điện thoại: lưu vào bộ nhớ tạm rồi mở bảng chia sẻ (lưu vào Tệp, gửi Zalo, in…).
 *  - Bản web: trình duyệt tải file về như bình thường.
 */
export async function downloadRecord(visitId: string, format: ExportFormat, fileName: string) {
  const path = `/visits/${visitId}/record.${format}`;
  const type = EXPORT_TYPES[format];

  if (Platform.OS === 'web') {
    const res = await api.get<Blob>(path, { responseType: 'blob' });
    const href = URL.createObjectURL(res.data);
    const a = Object.assign(document.createElement('a'), { href, download: fileName });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return;
  }

  const target = new File(Paths.cache, fileName);
  let file: File;
  try {
    file = await File.downloadFileAsync(`${API_URL}${path}`, target, {
      headers: { Authorization: `Bearer ${getApiToken() ?? ''}` },
      idempotent: true,
    });
  } catch (e) {
    // Server trả lỗi (mã HTTP nằm trong thông báo của expo-file-system)
    throw new Error(downloadError(e instanceof Error ? e.message : String(e)));
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Thiết bị không hỗ trợ chia sẻ file');
  await Sharing.shareAsync(file.uri, { mimeType: type.mimeType, UTI: type.uti, dialogTitle: `Bệnh án (${type.label})` });
}
