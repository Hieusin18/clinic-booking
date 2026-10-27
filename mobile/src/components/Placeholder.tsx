import { Empty, Screen } from './ui';

/** Màn hình giữ chỗ, được thay bằng màn hình thật trong PR của từng chức năng. */
export function Placeholder({ title }: { title: string }) {
  return (
    <Screen>
      <Empty title={title} hint="Màn hình này sẽ có trong PR của chức năng tương ứng." />
    </Screen>
  );
}
