import { KeyOutlined } from '@ant-design/icons';
import { Alert, Button, Modal, Popconfirm, Typography } from 'antd';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { NUM } from '../../lib/theme';

/**
 * Nhân viên quên mật khẩu: admin tạo mật khẩu tạm (chỉ hiện một lần), đưa tận tay người đó;
 * người đó phải đổi ở lần đăng nhập đầu. Các máy đang đăng nhập tài khoản này bị đăng xuất ngay.
 */
export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [temp, setTemp] = useState<string | null>(null);
  const reset = useAction(async () => (await api.post<{ temporaryPassword: string }>(`/users/${userId}/reset-password`)).data);

  return (
    <>
      <Popconfirm
        title={`Đặt lại mật khẩu cho ${name}?`}
        description="Mật khẩu cũ hết hiệu lực và các máy đang đăng nhập sẽ bị đăng xuất."
        okText="Đặt lại"
        cancelText="Hủy"
        onConfirm={() =>
          reset.mutateAsync(undefined).then(
            (r) => setTemp(r.temporaryPassword),
            () => undefined,
          )
        }
      >
        <Button size="small" icon={<KeyOutlined />} loading={reset.isPending}>
          Đặt lại mật khẩu
        </Button>
      </Popconfirm>
      <Modal
        title={`Mật khẩu tạm của ${name}`}
        open={temp !== null}
        onCancel={() => setTemp(null)}
        footer={
          <Button type="primary" onClick={() => setTemp(null)}>
            Đã ghi lại
          </Button>
        }
        destroyOnHidden
      >
        <Typography.Paragraph
          copyable={{ text: temp ?? '', tooltips: ['Sao chép', 'Đã sao chép'] }}
          style={{ fontFamily: NUM, fontSize: 30, fontWeight: 700, letterSpacing: 1, margin: '8px 0 16px' }}
        >
          {temp}
        </Typography.Paragraph>
        <Alert
          type="info"
          showIcon
          title="Mật khẩu này chỉ hiện một lần"
          description="Đưa trực tiếp cho người dùng (không gửi qua nhóm chat chung). Ở lần đăng nhập đầu, hệ thống sẽ bắt họ đặt mật khẩu mới."
        />
      </Modal>
    </>
  );
}
