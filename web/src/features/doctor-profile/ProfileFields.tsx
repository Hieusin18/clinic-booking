import { DeleteOutlined, PlusOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Checkbox, Flex, Form, Input, InputNumber, Popconfirm, Select, Typography, Upload } from 'antd';
import { App } from 'antd';
import { api, errorMessage } from '../../lib/api';
import type { Doctor } from '../../lib/types';
import { avatarProblem, avatarUrl } from './profileForm';

const THIS_YEAR = new Date().getFullYear();

/** Danh sách mốc năm (đào tạo hoặc công tác) trong form hồ sơ. */
function HistoryList({ name, label, titleLabel, placeLabel, addLabel }: { name: 'education' | 'career'; label: string; titleLabel: string; placeLabel: string; addLabel: string }) {
  return (
    <Form.Item label={label} required={false}>
      <Form.List name={name}>
        {(fields, { add, remove }) => (
          <Flex vertical gap={8}>
            {fields.map((f, i) => (
              <Flex key={f.key} gap={8} wrap align="start" style={{ padding: 8, border: '1px solid #f0f0f0', borderRadius: 8 }}>
                <Form.Item name={[f.name, 'fromYear']} rules={[{ required: true, message: 'Năm bắt đầu' }]} style={{ margin: 0 }}>
                  <InputNumber aria-label={`${label} ${i + 1}: từ năm`} placeholder="Từ năm" min={1950} max={THIS_YEAR} style={{ width: 100 }} />
                </Form.Item>
                <Form.Item noStyle shouldUpdate>
                  {({ getFieldValue }) => {
                    const current = getFieldValue([name, f.name, 'current']);
                    return (
                      <Form.Item
                        name={[f.name, 'toYear']}
                        dependencies={[[name, f.name, 'fromYear'], [name, f.name, 'current']]}
                        rules={[
                          ({ getFieldValue: get }) => ({
                            validator: (_, v) => {
                              if (current) return Promise.resolve();
                              if (v == null) return Promise.reject(new Error('Năm kết thúc hoặc chọn “Đến nay”'));
                              const from = get([name, f.name, 'fromYear']);
                              return from != null && v < from ? Promise.reject(new Error('Phải từ năm bắt đầu trở đi')) : Promise.resolve();
                            },
                          }),
                        ]}
                        style={{ margin: 0 }}
                      >
                        <InputNumber aria-label={`${label} ${i + 1}: đến năm`} placeholder="Đến năm" min={1950} max={THIS_YEAR} disabled={current} style={{ width: 100 }} />
                      </Form.Item>
                    );
                  }}
                </Form.Item>
                <Form.Item name={[f.name, 'current']} valuePropName="checked" style={{ margin: '5px 0 0' }}>
                  <Checkbox>Đến nay</Checkbox>
                </Form.Item>
                <Form.Item name={[f.name, 'title']} rules={[{ required: true, min: 2, message: `Nhập ${titleLabel.toLowerCase()}` }]} style={{ margin: 0, flex: '1 1 160px' }}>
                  <Input aria-label={`${label} ${i + 1}: ${titleLabel}`} placeholder={titleLabel} maxLength={200} />
                </Form.Item>
                <Form.Item name={[f.name, 'place']} rules={[{ required: true, min: 2, message: `Nhập ${placeLabel.toLowerCase()}` }]} style={{ margin: 0, flex: '1 1 160px' }}>
                  <Input aria-label={`${label} ${i + 1}: ${placeLabel}`} placeholder={placeLabel} maxLength={200} />
                </Form.Item>
                <Button aria-label={`Xóa dòng ${i + 1} của ${label.toLowerCase()}`} icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
              </Flex>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ current: false })} style={{ alignSelf: 'flex-start' }}>
              {addLabel}
            </Button>
          </Flex>
        )}
      </Form.List>
    </Form.Item>
  );
}

/** Các ô hồ sơ bác sĩ, dùng trong form của admin và trang "Hồ sơ của tôi" của bác sĩ. */
export function ProfileFields() {
  return (
    <>
      <Form.Item label="Năm bắt đầu hành nghề" name="practiceSince" extra="Số năm kinh nghiệm tự tính theo năm này">
        <InputNumber min={1950} max={THIS_YEAR} placeholder="Ví dụ: 2012" style={{ width: 160 }} />
      </Form.Item>
      <Form.Item label="Giới thiệu" name="bio">
        <Input.TextArea rows={3} maxLength={2000} showCount />
      </Form.Item>
      <Form.Item label="Thế mạnh chuyên môn" name="expertise" extra="Gõ từng mục rồi nhấn Enter, ví dụ: Tăng huyết áp">
        <Select mode="tags" tokenSeparators={[',']} open={false} placeholder="Bệnh hoặc kỹ thuật bác sĩ thạo" maxCount={15} />
      </Form.Item>
      <HistoryList name="career" label="Quá trình công tác" titleLabel="Chức vụ, vị trí" placeLabel="Nơi công tác" addLabel="Thêm nơi công tác" />
      <HistoryList name="education" label="Quá trình đào tạo" titleLabel="Văn bằng, chứng chỉ" placeLabel="Cơ sở đào tạo" addLabel="Thêm văn bằng" />
    </>
  );
}

/** Ảnh đại diện: xem, tải ảnh mới, xóa. `endpoint` = /doctors/:id/avatar hoặc /doctors/me/avatar. */
export function AvatarField({ doctor, endpoint, onChange }: { doctor: Doctor; endpoint: string; onChange: (d: Doctor) => void }) {
  const { message } = App.useApp();
  const src = avatarUrl(doctor);
  return (
    <Flex align="center" gap={16}>
      <Avatar size={80} src={src} icon={src ? undefined : <UserOutlined />} alt={`Ảnh ${doctor.user.fullName}`} />
      <Flex vertical gap={4}>
        <Flex gap={8}>
          <Upload
            accept="image/jpeg,image/png,image/webp"
            showUploadList={false}
            beforeUpload={(file) => {
              const problem = avatarProblem(file);
              if (problem) message.error(problem);
              return problem ? Upload.LIST_IGNORE : true;
            }}
            customRequest={async ({ file, onSuccess, onError }) => {
              const body = new FormData();
              body.append('file', file as Blob);
              try {
                const res = await api.post<Doctor>(endpoint, body);
                onChange(res.data);
                message.success('Đã cập nhật ảnh');
                onSuccess?.(res.data);
              } catch (err) {
                message.error(errorMessage(err));
                onError?.(err as Error);
              }
            }}
          >
            <Button icon={<UploadOutlined />}>{src ? 'Đổi ảnh' : 'Tải ảnh lên'}</Button>
          </Upload>
          {src && (
            <Popconfirm
              title="Xóa ảnh đại diện?"
              okText="Xóa"
              cancelText="Hủy"
              onConfirm={async () => {
                try {
                  onChange((await api.delete<Doctor>(endpoint)).data);
                } catch (err) {
                  message.error(errorMessage(err));
                }
              }}
            >
              <Button danger>Xóa ảnh</Button>
            </Popconfirm>
          )}
        </Flex>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>JPG, PNG hoặc WebP, tối đa 2 MB. Nên dùng ảnh vuông, chụp chính diện.</Typography.Text>
      </Flex>
    </Flex>
  );
}
