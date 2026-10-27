import { Redirect } from 'expo-router';
import { Loading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Điểm vào: đã đăng nhập thì vào các tab, chưa thì sang màn hình đăng nhập. */
export default function Index() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  return <Redirect href={user ? '/(tabs)' : '/login'} />;
}
