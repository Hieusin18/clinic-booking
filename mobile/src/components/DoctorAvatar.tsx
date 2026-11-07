import { Image, View } from 'react-native';
import { Text } from '@/components/Text';
import { colors } from '@/components/ui';
import { API_URL } from '@/lib/api';
import { avatarUri, initial } from '@/lib/doctor';
import { doctorName } from '@/lib/format';
import type { Doctor } from '@/lib/types';

/** Ảnh đại diện tròn; chưa có ảnh thì hiện chữ cái đầu của tên. */
export function DoctorAvatar({ doctor, size }: { doctor: Doctor; size: number }) {
  const uri = avatarUri(API_URL, doctor);
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[round, { backgroundColor: colors.primarySoft }]} accessibilityLabel={`Ảnh ${doctorName(doctor)}`} />;
  return (
    <View style={[round, { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.primaryDark, fontWeight: '700', fontSize: size * 0.4 }}>{initial(doctor.user.fullName)}</Text>
    </View>
  );
}

