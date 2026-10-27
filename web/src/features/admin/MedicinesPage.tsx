import { Button, Card, Form, Input, Modal, Space, Switch, Table, Tag } from 'antd';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAction, usePagedList } from '../../lib/hooks';
import type { Medicine } from '../../lib/types';
import { PageHeader } from './PageHeader';

type FormValues = { name: string; activeIngredient?: string; strength?: string; unit: string };

export function MedicinesPage() {
  const list = usePagedList<Medicine>('medicines', '/medicines', { includeInactive: true });
  const [editing, setEditing] = useState<Medicine | 'new' | null>(null);
  const [form] = Form.useForm<FormValues>();

  const save = useAction(
    (v: FormValues) => (editing && editing !== 'new' ? api.patch(`/medicines/${editing.id}`, v) : api.post('/medicines', v)),
    { success: 'Đã lưu thuốc', invalidate: ['medicines'] },
  );
  const toggle = useAction((m: Medicine) => api.patch(`/medicines/${m.id}`, { isActive: !m.isActive }), {
    success: 'Đã cập nhật trạng thái',
    invalidate: ['medicines'],
  });

  const open = (m: Medicine | 'new') => {
    setEditing(m);
    form.resetFields();
    if (m !== 'new') form.setFieldsValue({ name: m.name, activeIngredient: m.activeIngredient ?? '', strength: m.strength ?? '', unit: m.unit });
  };

  return (
    <Card>
      <PageHeader title="Danh mục thuốc" onSearch={list.search} searchPlaceholder="Tìm theo tên hoặc hoạt chất" onAdd={() => open('new')} addLabel="Thêm thuốc" />
      <Table<Medicine>
        rowKey="id"
        loading={list.isFetching}
        dataSource={list.data?.items}
        pagination={list.pagination}
        columns={[
          { title: 'Tên thuốc', dataIndex: 'name', render: (v, m) => <Space>{v}{!m.isActive && <Tag>Ngừng dùng</Tag>}</Space> },
          { title: 'Hoạt chất', dataIndex: 'activeIngredient', render: (v) => v || '—' },
          { title: 'Hàm lượng', dataIndex: 'strength', width: 120, render: (v) => v || '—' },
          { title: 'Đơn vị', dataIndex: 'unit', width: 90 },
          {
            title: 'Đang dùng',
            width: 110,
            align: 'center',
            render: (_, m) => <Switch checked={m.isActive} onChange={() => toggle.mutate(m)} />,
          },
          { title: '', width: 80, render: (_, m) => <Button size="small" onClick={() => open(m)}>Sửa</Button> },
        ]}
      />
      <Modal
        title={editing === 'new' ? 'Thêm thuốc' : 'Sửa thông tin thuốc'}
        open={editing !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={save.isPending}
        onCancel={() => setEditing(null)}
        onOk={() => form.validateFields().then((v) => save.mutateAsync(v)).then(() => setEditing(null)).catch(() => {})}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item label="Tên thuốc" name="name" rules={[{ required: true, min: 2, message: 'Nhập tên thuốc' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Hoạt chất" name="activeIngredient">
            <Input />
          </Form.Item>
          <Space.Compact block>
            <Form.Item label="Hàm lượng" name="strength" style={{ flex: 1 }}>
              <Input placeholder="500mg" />
            </Form.Item>
            <Form.Item label="Đơn vị bán" name="unit" rules={[{ required: true, message: 'Nhập đơn vị' }]} style={{ width: 160 }}>
              <Input placeholder="viên, chai, tuýp…" />
            </Form.Item>
          </Space.Compact>
        </Form>
      </Modal>
    </Card>
  );
}
