import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, ErrorBox } from '@/components/ui';
import { API_URL, getApiToken } from '@/lib/api';
import { downloadError } from '@/lib/record';

/**
 * Hiển thị bản xem trước (trang HTML khổ A4 do máy chủ tạo) trong WebView.
 * Trang không có JavaScript nên tắt JavaScript; người dùng chụm hai ngón để phóng to.
 */
export function RecordFrame({ visitId }: { visitId: string }) {
  const [error, setError] = useState<string | null>(null);
  if (error) return <ErrorBox message={error} />;
  return (
    <WebView
      style={{ flex: 1, backgroundColor: '#e5e7eb' }}
      source={{ uri: `${API_URL}/visits/${visitId}/record.html`, headers: { Authorization: `Bearer ${getApiToken() ?? ''}` } }}
      originWhitelist={['http://*', 'https://*']}
      javaScriptEnabled={false}
      scalesPageToFit
      setBuiltInZoomControls
      setDisplayZoomControls={false}
      startInLoadingState
      renderLoading={() => (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}
      onHttpError={(e) => setError(downloadError(String(e.nativeEvent.statusCode)))}
      onError={() => setError(downloadError('network'))}
    />
  );
}
