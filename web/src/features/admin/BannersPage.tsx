import { DeleteOutlined, EditOutlined, PictureOutlined, PlusOutlined, UploadOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Flex, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Switch, Table, Tag, Typography, Upload } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { formatDate, formatTime } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import { C } from '../../lib/theme';
import { useDoctorOptions } from '../reception/useDoctorOptions';
import { parseLink, toPayload, type AdminBanner, type BannerForm } from './bannerForm';

const STATE = {
  SHOWING: { label: 'Đang hiện', color: 'success' },
  SCHEDULED: { label: 'Hẹn giờ', color: 'processing' },
  EXPIRED: { label: 'Hết hạn', color: 'default' },
  OFF: { label: 'Đã tắt', color: 'default' },
} as const;

const imageUrl = (b: Pick<AdminBanner, 'id' | 'imageVersion'>) =>
  b.imageVersion == null ? undefined : `${api.defaults.baseURL}/banners/${b.id}/image?v=${b.imageVersion}`;

/** Xem trước banner giống trên app (khung rộng như điện thoại) */
function Preview({ kind, title, body, image }: { kind: AdminBanner['kind']; title?: string; body?: string; image?: string }) {
  return (
    <div style={{ width: 340, background: C.paper, borderRadius: 16, padding: 14, border: `1px solid ${C.line}` }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Xem trước trên app
      </Typography.Text>
      {kind === 'NOTICE' ? (
        <Flex gap={10} style={{ background: C.amberSoft, borderRadius: 12, padding: '10px 12px', marginTop: 6 }}>
          <WarningOutlined style={{ color: C.amber, marginTop: 3 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{title || 'Tiêu đề thông báo'}</div>
            {body && <div style={{ fontSize: 13 }}>{body}</div>}
          </div>
          <span style={{ color: C.muted }}>✕</span>
        </Flex>
      ) : image ? (
        <img src={image} alt={title} style={{ width: '100%', aspectRatio: '2 / 1', objectFit: 'cover', borderRadius: 16, marginTop: 6, display: 'block' }} />
      ) : (
        <Flex align="center" justify="center" vertical gap={4} style={{ aspectRatio: '2 / 1', borderRadius: 16, marginTop: 6, background: C.seg, color: C.muted }}>
          <PictureOutlined style={{ fontSize: 28 }} />
          <span style={{ fontSize: 12.5 }}>Lưu rồi tải ảnh 1200×600</span>
        </Flex>
      )}
    </div>
  );
}

function ImageUpload({ banner, onDone }: { banner: AdminBanner; onDone: () => void }) {
  const { message } = App.useApp();
  return (
    <Upload
      accept="image/jpeg,image/png,image/webp"
      showUploadList={false}
      beforeUpload={(file) => {
        if (file.size > 1024 * 1024) {
          message.error('Ảnh banner tối đa 1 MB');
          return Upload.LIST_IGNORE;
        }
        return true;
      }}
      customRequest={async ({ file, onSuccess, onError }) => {
        const body = new FormData();
        body.append('file', file as Blob);
        try {
          const res = await api.post(`/admin/banners/${banner.id}/image`, body);
          message.success('Đã tải ảnh banner');
          onDone();
          onSuccess?.(res.data);
        } catch (err) {
          message.error(errorMessage(err));
          onError?.(err as Error);
        }
      }}
    >
      <Button size="small" icon={<UploadOutlined />} type={banner.imageVersion ? 'default' : 'primary'}>
        {banner.imageVersion ? 'Đổi ảnh' : 'Tải ảnh'}
      </Button>
    </Upload>
  );
}

/** Admin: banner trên tab Đặt lịch của app bệnh nhân (thông báo nghỉ lễ, đổi giờ; ảnh giới thiệu dịch vụ). */
export function BannersPage() {
  const queryClient = useQueryClient();
  const doctors = useDoctorOptions();
  const [editing, setEditing] = useState<AdminBanner | 'new' | null>(null);
  const [form] = Form.useForm<BannerForm>();
  const kind = Form.useWatch('kind', form) ?? 'NOTICE';
  const title = Form.useWatch('title', form);
  const body = Form.useWatch('body', form);
  const linkType = Form.useWatch('linkType', form) ?? 'none';

  const list = useQuery({ queryKey: ['admin-banners'], queryFn: async () => (await api.get<AdminBanner[]>('/admin/banners')).data });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
  const save = useAction(
    (f: BannerForm) => (editing && editing !== 'new' ? api.put(`/admin/banners/${editing.id}`, toPayload(f)) : api.post('/admin/banners', toPayload(f))),
    { success: 'Đã lưu banner', invalidate: ['admin-banners'] },
  );
  // Bật/tắt: gửi lại đủ các trường như đã lưu, chỉ đổi "active"
  const toggle = useAction(
    (b: AdminBanner) =>
      api.put(`/admin/banners/${b.id}`, { kind: b.kind, title: b.title, body: b.body, link: b.link, startsAt: b.startsAt, endsAt: b.endsAt, sortOrder: b.sortOrder, active: !b.active }),
    { invalidate: ['admin-banners'] },
  );
  const remove = useAction((id: string) => api.delete(`/admin/banners/${id}`), { success: 'Đã xóa banner', invalidate: ['admin-banners'] });

  const openForm = (b: AdminBanner | 'new') => {
    form.resetFields();
    if (b === 'new') {
      form.setFieldsValue({ kind: 'NOTICE', linkType: 'none', active: true, sortOrder: 0 });
    } else {
      form.setFieldsValue({
        kind: b.kind,
        title: b.title,
        body: b.body ?? undefined,
        ...parseLink(b.link),
        range: b.startsAt || b.endsAt ? [b.startsAt ? dayjs(b.startsAt) : null, b.endsAt ? dayjs(b.endsAt) : null] : null,
        sortOrder: b.sortOrder,
        active: b.active,
      });
    }
    setEditing(b);
  };
  const current = editing && editing !== 'new' ? (list.data?.find((x) => x.id === editing.id) ?? editing) : null;

  return (
    <Card>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 12 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Banner trên app
          </Typography.Title>
          <Typography.Text type="secondary">
            Hiện ở đầu tab Đặt lịch của app bệnh nhân: thông báo (nghỉ lễ, đổi giờ) luôn ở trên, ảnh giới thiệu vuốt ngang bên dưới.
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm('new')}>
          Thêm banner
        </Button>
      </Flex>
      <Table<AdminBanner>
        rowKey="id"
        loading={list.isLoading}
        dataSource={list.data}
        pagination={false}
        locale={{ emptyText: 'Chưa có banner' }}
        columns={[
          {
            title: 'Banner',
            width: 190,
            render: (_, b) =>
              b.kind === 'NOTICE' ? (
                <Tag icon={<WarningOutlined />} color="warning">
                  Thông báo
                </Tag>
              ) : imageUrl(b) ? (
                <img src={imageUrl(b)} alt={b.title} style={{ width: 160, aspectRatio: '2 / 1', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
              ) : (
                <Tag icon={<PictureOutlined />} color="warning">
                  Chưa có ảnh
                </Tag>
              ),
          },
          {
            title: 'Nội dung',
            render: (_, b) => (
              <div>
                <Typography.Text strong>{b.title}</Typography.Text>
                {b.body && <div style={{ fontSize: 13 }}>{b.body}</div>}
                {b.link && (
                  <Typography.Text type="secondary" style={{ fontSize: 12.5, display: 'block' }}>
                    → {b.link.startsWith('/') ? `${b.link.startsWith('/book') ? 'Đặt lịch' : 'Hồ sơ'} ${doctors.data?.find((d) => b.link!.endsWith(d.id))?.user.fullName ?? 'bác sĩ'}` : b.link}
                  </Typography.Text>
                )}
              </div>
            ),
          },
          {
            title: 'Thời gian hiện',
            width: 200,
            render: (_, b) =>
              b.startsAt || b.endsAt ? (
                <span style={{ fontSize: 13 }}>
                  {b.startsAt ? `${formatTime(b.startsAt)} ${formatDate(b.startsAt)}` : 'Ngay'} → {b.endsAt ? `${formatTime(b.endsAt)} ${formatDate(b.endsAt)}` : 'Không hạn'}
                </span>
              ) : (
                <Typography.Text type="secondary">Luôn hiện</Typography.Text>
              ),
          },
          { title: 'Thứ tự', dataIndex: 'sortOrder', width: 70, align: 'center' },
          {
            title: 'Trạng thái',
            width: 150,
            render: (_, b) => (
              <Flex vertical gap={6} align="flex-start">
                <Tag color={STATE[b.state].color}>{b.kind === 'PROMO' && !b.imageVersion && b.state === 'SHOWING' ? 'Chờ ảnh' : STATE[b.state].label}</Tag>
                <Switch size="small" checked={b.active} onChange={() => toggle.mutate(b)} aria-label={b.active ? `Tắt ${b.title}` : `Bật ${b.title}`} />
              </Flex>
            ),
          },
          {
            title: '',
            width: 200,
            render: (_, b) => (
              <Flex gap={6} wrap>
                {b.kind === 'PROMO' && <ImageUpload banner={b} onDone={refresh} />}
                <Button size="small" icon={<EditOutlined />} onClick={() => openForm(b)} aria-label={`Sửa ${b.title}`} />
                <Popconfirm title="Xóa banner này?" okText="Xóa" cancelText="Hủy" onConfirm={() => remove.mutate(b.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Xóa ${b.title}`} />
                </Popconfirm>
              </Flex>
            ),
          },
        ]}
      />

      <Modal
        title={editing === 'new' ? 'Thêm banner' : 'Sửa banner'}
        open={!!editing}
        okText="Lưu"
        cancelText="Hủy"
        width={820}
        confirmLoading={save.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Flex gap={24} align="flex-start" wrap>
          <Form<BannerForm> form={form} layout="vertical" requiredMark={false} style={{ flex: 1, minWidth: 340 }} onFinish={(f) => save.mutate(f, { onSuccess: () => setEditing(null) })}>
            <Form.Item name="kind" label="Loại">
              <Radio.Group
                optionType="button"
                options={[
                  { value: 'NOTICE', label: 'Thông báo (chữ)' },
                  { value: 'PROMO', label: 'Ảnh giới thiệu' },
                ]}
              />
            </Form.Item>
            <Form.Item name="title" label={kind === 'NOTICE' ? 'Tiêu đề' : 'Tiêu đề (đọc cho người khiếm thị, không hiện trên ảnh)'} rules={[{ required: true, whitespace: true, message: 'Nhập tiêu đề' }]}>
              <Input maxLength={80} showCount placeholder={kind === 'NOTICE' ? 'Vd. Nghỉ Tết từ 28/1 đến hết 3/2' : 'Vd. Gói khám sức khỏe tổng quát'} />
            </Form.Item>
            <Form.Item name="body" label="Nội dung thêm">
              <Input.TextArea maxLength={200} showCount rows={2} placeholder="Vd. Từ 4/2 phòng khám mở cửa lại bình thường" />
            </Form.Item>
            <Form.Item name="linkType" label="Bấm vào thì mở">
              <Select
                options={[
                  { value: 'none', label: 'Không mở gì' },
                  { value: 'doctor', label: 'Hồ sơ một bác sĩ' },
                  { value: 'book', label: 'Đặt lịch với một bác sĩ' },
                  { value: 'web', label: 'Trang web (https)' },
                ]}
              />
            </Form.Item>
            {(linkType === 'doctor' || linkType === 'book') && (
              <Form.Item name="doctorId" label="Bác sĩ" rules={[{ required: true, message: 'Chọn bác sĩ' }]}>
                <Select showSearch optionFilterProp="label" options={doctors.options} placeholder="Chọn bác sĩ" />
              </Form.Item>
            )}
            {linkType === 'web' && (
              <Form.Item name="url" label="Địa chỉ" rules={[{ required: true, pattern: /^https:\/\/\S+$/, message: 'Địa chỉ phải bắt đầu bằng https://' }]}>
                <Input placeholder="https://…" />
              </Form.Item>
            )}
            <Form.Item name="range" label="Thời gian hiện" extra="Bỏ trống = hiện ngay và không hết hạn">
              <DatePicker.RangePicker showTime={{ format: 'HH:mm' }} format="DD/MM/YYYY HH:mm" allowEmpty={[true, true]} style={{ width: '100%' }} />
            </Form.Item>
            <Flex gap={16}>
              <Form.Item name="sortOrder" label="Thứ tự (nhỏ trước)">
                <InputNumber min={0} max={999} />
              </Form.Item>
              <Form.Item name="active" label="Bật" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Flex>
            {kind === 'PROMO' && (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                Ảnh 1200×600 (tỉ lệ 2:1), JPG/PNG/WebP, tối đa 1 MB; tải ảnh sau khi lưu. Banner ảnh chỉ hiện khi đã có ảnh. Lưu ý: quảng cáo dịch vụ khám chữa bệnh cần được cơ quan
                y tế xác nhận nội dung.
              </Typography.Paragraph>
            )}
          </Form>
          <Flex vertical gap={8}>
            <Preview kind={kind} title={title} body={body} image={current ? imageUrl(current) : undefined} />
            {current && current.kind === 'PROMO' && kind === 'PROMO' && <ImageUpload banner={current} onDone={refresh} />}
          </Flex>
        </Flex>
      </Modal>
    </Card>
  );
}
