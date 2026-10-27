import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table } from 'antd';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAction, usePagedList } from '../../lib/hooks';
import type { Specialty } from '../../lib/types';
import { PageHeader } from './PageHeader';

type FormValues = { name: string; description?: string };

export function SpecialtiesPage() {
  const list = usePagedList<Specialty>('specialties', '/specialties');
  const [editing, setEditing] = useState<Specialty | 'new' | null>(null);
  const [form] = Form.useForm<FormValues>();

  const save = useAction(
    (v: FormValues) => (editing && editing !== 'new' ? api.patch(`/specialties/${editing.id}`, v) : api.post('/specialties', v)),
    { success: 'Đã lưu chuyên khoa', invalidate: ['specialties'] },
  );
  const remove = useAction((id: string) => api.delete(`/specialties/${id}`), { success: 'Đã xóa chuyên khoa', invalidate: ['specialties'] });

  const open = (s: Specialty | 'new') => {
    setEditing(s);
    form.setFieldsValue(s === 'new' ? { name: '', description: '' } : { name: s.name, description: s.description ?? '' });
  };

  return (
    <Card>
      <PageHeader title="Chuyên khoa" onSearch={list.search} searchPlaceholder="Tìm theo tên" onAdd={() => open('new')} addLabel="Thêm chuyên khoa" />
      <Table<Specialty>
        rowKey="id"
        loading={list.isFetching}
        dataSource={list.data?.items}
        pagination={list.pagination}
        columns={[
          { title: 'Tên chuyên khoa', dataIndex: 'name' },
          { title: 'Mô tả', dataIndex: 'description', render: (v) => v || '—' },
          { title: 'Số bác sĩ', width: 110, align: 'center', render: (_, s) => s._count?.doctors ?? 0 },
          {
            title: '',
            width: 160,
            render: (_, s) => (
              <Space>
                <Button size="small" onClick={() => open(s)}>Sửa</Button>
                <Popconfirm title={`Xóa chuyên khoa "${s.name}"?`} okText="Xóa" cancelText="Hủy" onConfirm={() => remove.mutate(s.id)}>
                  <Button size="small" danger disabled={(s._count?.doctors ?? 0) > 0}>Xóa</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing === 'new' ? 'Thêm chuyên khoa' : 'Sửa chuyên khoa'}
        open={editing !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={save.isPending}
        onCancel={() => setEditing(null)}
        onOk={() => form.validateFields().then((v) => save.mutateAsync(v)).then(() => setEditing(null)).catch(() => {})}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item label="Tên chuyên khoa" name="name" rules={[{ required: true, min: 2, message: 'Tên tối thiểu 2 ký tự' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Mô tả" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
