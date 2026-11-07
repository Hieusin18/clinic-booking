import { CheckOutlined, DeleteOutlined, FilePdfOutlined, PlusOutlined, UndoOutlined, UploadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, AutoComplete, Button, Card, Empty, Flex, Image, Input, Popconfirm, Tag, Typography, Upload } from 'antd';
import { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { formatTime } from '../../lib/format';
import { C } from '../../lib/theme';
import type { LabFile, LabOrder } from '../../lib/types';
import { LAB_ACCEPT, LAB_PRESETS, labFileProblem, labFileUrl } from './labFiles';

/** Danh sách tệp: ảnh xem phóng to được, PDF mở ở thẻ mới. */
export function LabFiles({ files, onRemove }: { files: LabFile[]; onRemove?: (id: string) => void }) {
  if (files.length === 0) return null;
  const images = files.filter((f) => f.mimeType !== 'application/pdf');
  const pdfs = files.filter((f) => f.mimeType === 'application/pdf');
  return (
    <Flex vertical gap={8}>
      {images.length > 0 && (
        <Image.PreviewGroup>
          <Flex gap={8} wrap>
            {images.map((f) => (
              <div key={f.id} style={{ position: 'relative' }}>
                <Image src={labFileUrl(f)} alt={f.fileName} width={96} height={96} style={{ objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.line}` }} />
                {onRemove && (
                  <Popconfirm title="Xóa ảnh này?" okText="Xóa" cancelText="Hủy" onConfirm={() => onRemove(f.id)}>
                    <Button size="small" shape="circle" icon={<DeleteOutlined />} aria-label={`Xóa ${f.fileName}`} style={{ position: 'absolute', top: 4, right: 4 }} />
                  </Popconfirm>
                )}
              </div>
            ))}
          </Flex>
        </Image.PreviewGroup>
      )}
      {pdfs.map((f) => (
        <Flex key={f.id} align="center" gap={8}>
          <FilePdfOutlined style={{ color: C.amber }} />
          <Typography.Link href={labFileUrl(f)} target="_blank" rel="noreferrer">
            {f.fileName}
          </Typography.Link>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {Math.max(1, Math.round(f.size / 1024))} KB
          </Typography.Text>
          {onRemove && (
            <Popconfirm title="Xóa tệp này?" okText="Xóa" cancelText="Hủy" onConfirm={() => onRemove(f.id)}>
              <Button size="small" type="text" icon={<DeleteOutlined />} aria-label={`Xóa ${f.fileName}`} />
            </Popconfirm>
          )}
        </Flex>
      ))}
    </Flex>
  );
}

/** Một chỉ định: ghi mô tả, kết luận, tải tệp, trả kết quả. */
function OrderItem({ order, visitId, readOnly }: { order: LabOrder; visitId: string; readOnly: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [text, setText] = useState(order.resultText ?? '');
  const [busy, setBusy] = useState(false);
  const done = !!order.doneAt;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['visit', visitId] });

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) message.success(ok);
      await refresh();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const save = (done?: boolean) => run(() => api.patch(`/lab-orders/${order.id}`, { resultText: text, ...(done === undefined ? {} : { done }) }), done ? 'Đã trả kết quả' : done === false ? undefined : 'Đã lưu');

  return (
    <div style={{ border: `1px solid ${done ? '#BFDCCB' : C.line}`, background: done ? C.goodSoft : '#fff', borderRadius: 12, padding: 14 }}>
      <Flex justify="space-between" align="start" gap={8} wrap>
        <div>
          <Typography.Text strong style={{ fontSize: 15 }}>
            {order.name}
          </Typography.Text>
          {order.note && <Typography.Text type="secondary"> · {order.note}</Typography.Text>}
          <div>
            {done ? (
              <Tag color="success">Đã có kết quả · {formatTime(order.doneAt!)}</Tag>
            ) : (
              <Tag color="warning">Chờ kết quả</Tag>
            )}
          </div>
        </div>
        {!readOnly && !done && order.files.length === 0 && !order.resultText && (
          <Popconfirm title="Xóa chỉ định này?" okText="Xóa" cancelText="Hủy" onConfirm={() => run(() => api.delete(`/lab-orders/${order.id}`))}>
            <Button size="small" type="text" icon={<DeleteOutlined />} aria-label={`Xóa chỉ định ${order.name}`} />
          </Popconfirm>
        )}
      </Flex>

      {readOnly || done ? (
        order.resultText && <Typography.Paragraph style={{ margin: '8px 0', whiteSpace: 'pre-wrap' }}>{order.resultText}</Typography.Paragraph>
      ) : (
        <Input.TextArea
          aria-label={`Kết quả ${order.name}`}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          placeholder="Mô tả và kết luận, ví dụ: Đám mờ thùy dưới phổi phải. Kết luận: viêm phổi thùy"
          style={{ margin: '8px 0' }}
        />
      )}
      <LabFiles files={order.files} onRemove={readOnly || done ? undefined : (id) => run(() => api.delete(`/lab-files/${id}`))} />

      {!readOnly && (
        <Flex gap={8} wrap style={{ marginTop: 10 }}>
          {!done && (
            <>
              <Upload
                accept={LAB_ACCEPT}
                multiple
                showUploadList={false}
                beforeUpload={(file) => {
                  const problem = labFileProblem(file);
                  if (problem) message.error(`${file.name}: ${problem}`);
                  return problem ? Upload.LIST_IGNORE : true;
                }}
                customRequest={async ({ file, onSuccess, onError }) => {
                  const body = new FormData();
                  body.append('file', file as Blob);
                  try {
                    const res = await api.post(`/lab-orders/${order.id}/files`, body);
                    onSuccess?.(res.data);
                    await refresh();
                  } catch (err) {
                    message.error(errorMessage(err));
                    onError?.(err as Error);
                  }
                }}
              >
                <Button icon={<UploadOutlined />}>Tải ảnh/PDF kết quả</Button>
              </Upload>
              <Button onClick={() => save()} loading={busy} disabled={text === (order.resultText ?? '')}>
                Lưu nháp
              </Button>
              <Button type="primary" icon={<CheckOutlined />} onClick={() => save(true)} loading={busy} disabled={!text.trim() && order.files.length === 0}>
                Trả kết quả
              </Button>
            </>
          )}
          {done && (
            <Button icon={<UndoOutlined />} onClick={() => run(() => api.patch(`/lab-orders/${order.id}`, { done: false }))} loading={busy}>
              Sửa kết quả
            </Button>
          )}
        </Flex>
      )}
    </div>
  );
}

/** Thẻ cận lâm sàng trong trang khám: thêm chỉ định, ghi và trả kết quả. */
export function LabCard({ visitId, orders, readOnly = false }: { visitId: string; orders: LabOrder[]; readOnly?: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const pending = orders.filter((o) => !o.doneAt).length;

  const add = async () => {
    if (name.trim().length < 2) return;
    setAdding(true);
    try {
      await api.post(`/visits/${visitId}/lab-orders`, { name: name.trim() });
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['visit', visitId] });
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card
      title="Cận lâm sàng"
      extra={orders.length > 0 && <Typography.Text type="secondary">{pending ? `${pending} chỉ định chờ kết quả` : 'Đã đủ kết quả'}</Typography.Text>}
    >
      <Flex vertical gap={12}>
        {orders.length === 0 && readOnly && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có chỉ định" />}
        {orders.map((o) => (
          <OrderItem key={`${o.id}-${o.doneAt ?? ''}`} order={o} visitId={visitId} readOnly={readOnly} />
        ))}
        {!readOnly && (
          <Flex gap={8}>
            <AutoComplete
              aria-label="Tên chỉ định cận lâm sàng"
              value={name}
              onChange={setName}
              options={LAB_PRESETS.filter((p) => p.toLowerCase().includes(name.trim().toLowerCase()) && !orders.some((o) => o.name === p)).map((value) => ({ value }))}
              placeholder="Thêm chỉ định: X-quang, siêu âm, xét nghiệm…"
              style={{ flex: 1 }}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
            />
            <Button icon={<PlusOutlined />} onClick={() => void add()} loading={adding} disabled={name.trim().length < 2}>
              Thêm
            </Button>
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
