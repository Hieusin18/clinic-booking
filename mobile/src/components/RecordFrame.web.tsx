import { useQuery } from '@tanstack/react-query';
import { createElement } from 'react';
import { ErrorBox, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

/** Bản web của app (xem thử trên trình duyệt): nhúng trang xem trước vào iframe cách ly. */
export function RecordFrame({ visitId }: { visitId: string }) {
  const html = useQuery({
    queryKey: ['record-html', visitId],
    gcTime: 0,
    queryFn: async () => (await api.get<string>(`/visits/${visitId}/record.html`, { responseType: 'text' })).data,
  });
  if (html.isLoading) return <Loading />;
  if (!html.data) return <ErrorBox message={html.error ? errorMessage(html.error) : 'Không tải được bản xem trước'} />;
  // sandbox rỗng: không chạy script, không điều hướng; nội dung đã được máy chủ thoát ký tự HTML
  return createElement('iframe', {
    title: 'Bản xem trước bệnh án',
    srcDoc: html.data,
    sandbox: '',
    style: { flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: '#e5e7eb' },
  });
}
