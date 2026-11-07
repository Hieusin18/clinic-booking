import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useInbox } from '@/lib/notifications';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors } from './ui';

/** Chuông ở góc tiêu đề các tab: số thông báo chưa đọc, bấm để mở hộp thư. */
export function NotificationBell() {
  const unread = useInbox().data?.unread ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
      onPress={() => router.push('/notifications')}
      hitSlop={8}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        marginTop: 2,
      }}
    >
      <Icon name="bell" color={colors.text} size={22} />
      {unread > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 20,
            height: 20,
            paddingHorizontal: 5,
            borderRadius: 10,
            backgroundColor: colors.stamp,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.bg,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 14 }}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
