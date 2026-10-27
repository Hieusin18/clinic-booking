import { PlusOutlined } from '@ant-design/icons';
import { Button, Flex, Input, Typography } from 'antd';

/** Tiêu đề trang quản lý: tên trang, ô tìm kiếm, nút thêm mới. */
export function PageHeader({
  title,
  onSearch,
  searchPlaceholder,
  onAdd,
  addLabel,
}: {
  title: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
      <Typography.Title level={3} style={{ margin: 0 }}>{title}</Typography.Title>
      <Flex gap={8} wrap>
        {onSearch && <Input.Search allowClear placeholder={searchPlaceholder ?? 'Tìm kiếm'} onSearch={onSearch} style={{ width: 260 }} />}
        {onAdd && (
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            {addLabel ?? 'Thêm mới'}
          </Button>
        )}
      </Flex>
    </Flex>
  );
}
