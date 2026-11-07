import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/Icon';
import { fontFor } from '@/components/Text';
import { colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const icon = (name: IconName) => ({ color }: { color: ColorValue }) => <Icon name={name} color={String(color)} size={24} />;

export default function TabsLayout() {
  const { user, loading } = useAuth();
  // Chữ Be Vietnam Pro cao hơn chữ hệ thống (dấu tiếng Việt): nới thanh tab để nhãn không bị cắt
  const insets = useSafeAreaInsets();
  if (!loading && !user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.stamp,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fontFor('600'), fontSize: 12, lineHeight: 18 },
        tabBarStyle: { borderTopColor: colors.border, height: 70 + insets.bottom, paddingTop: 4, paddingBottom: insets.bottom + 4 },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: fontFor('700'), fontSize: 17, color: colors.text },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Đặt lịch', headerShown: false, tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="appointments" options={{ title: 'Lịch hẹn', headerShown: false, tabBarIcon: icon('list') }} />
      <Tabs.Screen name="ticket" options={{ title: 'Lấy số', headerShown: false, tabBarIcon: icon('qr') }} />
      <Tabs.Screen name="history" options={{ title: 'Lịch sử', headerShown: false, tabBarIcon: icon('clock') }} />
      <Tabs.Screen name="profile" options={{ title: 'Hồ sơ', headerShown: false, tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
