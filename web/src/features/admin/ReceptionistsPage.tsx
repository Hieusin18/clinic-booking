import { Card, Form, Input, Modal, Switch, Table } from 'antd';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAction, usePagedList } from '../../lib/hooks';
import type { User } from '../../lib/types';
import { PageHeader } from './PageHeader';
import { ResetPasswordButton } from './ResetPasswordButton';
import { initialPasswordRules } from '../../lib/password';

type CreateValues = { fullName: string; phone: string; email?: string; password: string };

/** Tài khoản nhân viên không phải bác sĩ: lễ tân hoặc điều dưỡng. */
const KIND = {
  receptionists: { title: 'Tài khoản lễ tân', add: 'Thêm lễ tân', created: 'Đã tạo tài khoản lễ tân', who: 'Lễ tân' },
  nurses: { title: 'Tài khoản điều dưỡng', add: 'Thêm điều dưỡng', created: 'Đã tạo tài khoản điều dưỡng', who: 'Điều dưỡng' },
} as const;

export function StaffAccountsPage({ kind }: { kind: keyof typeof KIND }) {
  const k = KIND[kind];
  const list = usePagedList<User>(kind, `/staff/${kind}`);
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm<CreateValues>();

  const create = useAction((v: CreateValues) => api.post(`/staff/${kind}`, { ...v, email: v.email || undefined }), {
    success: k.created,
    invalidate: [kind],
  });
  const update = useAction(({ id, ...body }: { id: string; isActive?: boolean }) => api.patch(`/staff/${kind}/${id}`, body), {
    success: 'Đã cập nhật tài khoản',
    invalidate: [kind],
  });

  return (
    <Card>
      <PageHeader
        title={k.title}
        onSearch={list.search}
        searchPlaceholder="Tìm theo tên hoặc SĐT"
        onAdd={() => {
          createForm.resetFields();
          setCreating(true);
        }}
        addLabel={k.add}
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
            width: 170,
            render: (_, u) => <ResetPasswordButton userId={u.id} name={u.fullName} />,
          },
        ]}
      />
      <Modal
        title={k.add}
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
          <Form.Item
            label="Mật khẩu ban đầu"
            name="password"
            rules={initialPasswordRules}
            dependencies={['phone']}
            extra={`Ít nhất 8 ký tự, có cả chữ và số. ${k.who} sẽ phải đổi mật khẩu này ở lần đăng nhập đầu.`}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

export const ReceptionistsPage = () => <StaffAccountsPage kind="receptionists" />;
export const NursesPage = () => <StaffAccountsPage kind="nurses" />;
