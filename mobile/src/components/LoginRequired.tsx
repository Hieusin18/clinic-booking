import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import type { ComponentType } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { currentPath } from '@/lib/path';
import { setReturnTo } from '@/lib/returnTo';
import { Icon } from './Icon';
import { Text } from './Text';
import { Button, Card, Loading, Screen, colors } from './ui';

interface Options {
  /** Tiêu đề lớn (màn tab không có thanh tiêu đề) */
  title?: string;
  /** Vì sao cần đăng nhập, vd. "Đăng nhập để đặt lịch khám" */
  reason: string;
  hint?: string;
}

/** Màn hình mời đăng nhập, hiện thay cho tính năng cần tài khoản khi người dùng chưa đăng nhập. */
export function LoginRequired({ title, reason, hint }: Options) {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const go = (to: '/login' | '/register') => {
    setReturnTo(currentPath(pathname, params));
    router.push(to);
  };
  return (
    <Screen title={title}>
      <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="lock" color={colors.stamp} size={26} />
        </View>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' }}>{reason}</Text>
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center' }}>
          {hint ?? 'Bạn vẫn xem được danh sách và hồ sơ bác sĩ mà không cần tài khoản.'}
        </Text>
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 4 }}>
          <Button title="Đăng nhập" onPress={() => go('/login')} />
          <Button title="Tạo tài khoản" variant="secondary" onPress={() => go('/register')} />
        </View>
      </Card>
    </Screen>
  );
}

/** Bọc một màn hình cần tài khoản: chưa đăng nhập thì hiện lời mời đăng nhập, không gọi API của màn hình. */
export function withLogin<P extends object>(Content: ComponentType<P>, options: Options) {
  function Guarded(props: P) {
    const { user, loading } = useAuth();
    if (loading) {
      return (
        <Screen title={options.title}>
          <Loading />
        </Screen>
      );
    }
    if (!user) return <LoginRequired {...options} />;
    return <Content {...props} />;
  }
  Guarded.displayName = `withLogin(${Content.displayName ?? Content.name ?? 'Screen'})`;
  return Guarded;
}
