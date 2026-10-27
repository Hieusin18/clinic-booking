import { Button, Card, Form, Input, Modal, Switch, Table } from 'antd';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAction, usePagedList } from '../../lib/hooks';
import type { User } from '../../lib/types';
import { PageHeader } from './PageHeader';

type CreateValues = { fullName: string; phone: string; email?: string; password: string };

export function ReceptionistsPage() {
  const list = usePagedList<User>('receptionists', '/staff/receptionists');
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [createForm] = Form.useForm<CreateValues>();
  const [resetForm] = Form.useForm<{ password: string }>();

  const create = useAction((v: CreateValues) => api.post('/staff/receptionists', { ...v, email: v.email || undefined }), {
    success: 'Đã tạo tài khoản lễ tân',
    invalidate: ['receptionists'],
  });
  const update = useAction(({ id, ...body }: { id: string; isActive?: boolean; password?: string }) => api.patch(`/staff/receptionists/${id}`, body), {
    success: 'Đã cập nhật tài khoản',
    invalidate: ['receptionists'],
  });

  return (
    <Card>
      <PageHeader
        title="Tài khoản lễ tân"
        onSearch={list.search}
        searchPlaceholder="Tìm theo tên hoặc SĐT"
        onAdd={() => {
          createForm.resetFields();
          setCreating(true);
        }}
        addLabel="Thêm lễ tân"
      />
      <Table<User>
        rowKey="id"
        loading={list.isFetching}
        dataSource={list.data?.items}
        pagination={list.pagination}
        columns={[
          { title: 'Họ tên', dataIndex: 'fullName' },
          { title: 'Số điện thoại (đăng nhập)', dataIndex: 'phone' },
          { title: 'Email', dataIndex: 'email', render: (v) => v || '—' },
          {
            title: 'Hoạt động',
            width: 110,
            align: 'center',
            render: (_, u) => <Switch checked={u.isActive} onChange={(isActive) => update.mutate({ id: u.id, isActive })} />,
          },
          {
            title: '',
            width: 150,
            render: (_, u) => (
              <Button
                size="small"
                onClick={() => {
                  resetForm.resetFields();
                  setResetting(u);
                }}
              >
                Đặt lại mật khẩu
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title="Thêm tài khoản lễ tân"
        open={creating}
        okText="Tạo"
        cancelText="Hủy"
        confirmLoading={create.isPending}
        onCancel={() => setCreating(false)}
        onOk={() => createForm.validateFields().then((v) => create.mutateAsync(v)).then(() => setCreating(false)).catch(() => {})}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" requiredMark={false}>
          <Form.Item label="Họ tên" name="fullName" rules={[{ required: true, min: 2, message: 'Nhập họ tên' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Số điện thoại" name="phone" rules={[{ required: true, pattern: /^0\d{9}$/, message: 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0' }]}>
            <Input inputMode="tel" />
          </Form.Item>
          <Form.Item label="Email" name="email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Mật khẩu ban đầu" name="password" rules={[{ required: true, min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`Đặt lại mật khẩu cho ${resetting?.fullName ?? ''}`}
        open={resetting !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={update.isPending}
        onCancel={() => setResetting(null)}
        onOk={() =>
          resetForm
            .validateFields()
            .then((v) => update.mutateAsync({ id: resetting!.id, password: v.password }))
            .then(() => setResetting(null))
            .catch(() => {})
        }
        destroyOnHidden
      >
        <Form form={resetForm} layout="vertical" requiredMark={false}>
          <Form.Item label="Mật khẩu mới" name="password" rules={[{ required: true, min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
