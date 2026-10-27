import { Redirect, Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Biểu tượng tab bằng ký tự để không phụ thuộc thư viện icon. */
const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ fontSize: 20, color }}>{glyph}</Text>;

export default function TabsLayout() {
  const { user, loading } = useAuth();
  if (!loading && !user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Đặt lịch', tabBarIcon: icon('＋') }} />
      <Tabs.Screen name="appointments" options={{ title: 'Lịch hẹn', tabBarIcon: icon('▤') }} />
      <Tabs.Screen name="ticket" options={{ title: 'Lấy số', tabBarIcon: icon('▣') }} />
      <Tabs.Screen name="history" options={{ title: 'Lịch sử', tabBarIcon: icon('☰') }} />
      <Tabs.Screen name="profile" options={{ title: 'Hồ sơ', tabBarIcon: icon('◉') }} />
    </Tabs>
  );
}
