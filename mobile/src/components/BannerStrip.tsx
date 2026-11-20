import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, type ScrollViewInstance, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { colors } from '@/components/ui';
import { API_URL, api } from '@/lib/api';
import { addDismissed, bannerImageUri, bannerTarget, splitBanners, type Banner } from '@/lib/banner';
import { dismissedBanners } from '@/lib/storage';

const ROTATE_MS = 6000;
/** Chạm hoặc vuốt thì dừng tự chuyển chừng này */
const PAUSE_MS = 15000;

function open(link: string | null) {
  const t = bannerTarget(link);
  if (!t) return;
  if ('app' in t) router.push(t.app as never);
  else void Linking.openURL(t.web);
}

/** Dải thông báo của phòng khám (nghỉ lễ, đổi giờ…): màu cảnh báo, ẩn được bằng ✕. */
function Notice({ b, onClose }: { b: Banner; onClose: () => void }) {
  const target = bannerTarget(b.link);
  return (
    <View style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.warningSoft, borderRadius: 12, paddingVertical: 10, paddingLeft: 12, paddingRight: 4 }}>
      <View style={{ paddingTop: 2 }}>
        <Icon name="alert" color={colors.warning} size={18} strokeWidth={2} />
      </View>
      <Pressable style={{ flex: 1, gap: 2 }} disabled={!target} onPress={() => open(b.link)} accessibilityRole={target ? 'link' : undefined}>
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: colors.text }}>{b.title}</Text>
        {b.body ? <Text style={{ fontSize: 13.5, lineHeight: 19, color: colors.text }}>{b.body}</Text> : null}
        {target ? <Text style={{ fontSize: 13, fontWeight: '600', color: colors.warning }}>Xem chi tiết ›</Text> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ẩn thông báo ${b.title}`} onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
        <Icon name="close" color={colors.muted} size={18} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

/** Banner ảnh vuốt ngang (tỉ lệ 2:1), tự chuyển 6 giây, có chấm vị trí. */
function Promos({ list }: { list: Banner[] }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollViewInstance>(null);
  const pausedUntil = useRef(0);

  useEffect(() => {
    if (list.length < 2 || !width) return;
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setIndex((i) => {
        const next = (i + 1) % list.length;
        ref.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [list.length, width]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: 8 }}>
      {width ? (
        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => (pausedUntil.current = Date.now() + PAUSE_MS)}
          onMomentumScrollEnd={onScrollEnd}
        >
          {list.map((b) => (
            <Pressable
              key={b.id}
              accessibilityRole={bannerTarget(b.link) ? 'link' : 'image'}
              accessibilityLabel={b.body ? `${b.title}. ${b.body}` : b.title}
              onPress={() => open(b.link)}
              style={{ width }}
            >
              <Image source={{ uri: bannerImageUri(API_URL, b)! }} style={{ width, height: width / 2, borderRadius: 16, backgroundColor: colors.seg }} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {list.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {list.map((b, i) => (
            <View key={b.id} style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.ink : colors.border }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Banner đầu tab Đặt lịch: thông báo vận hành trước, ảnh giới thiệu sau. Lỗi mạng thì ẩn, không làm phiền. */
export function BannerStrip() {
  const banners = useQuery({
    queryKey: ['banners'],
    queryFn: async () => (await api.get<Banner[]>('/banners')).data,
    staleTime: 5 * 60_000,
  });
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  useEffect(() => {
    void dismissedBanners.get().then(setDismissed);
  }, []);

  if (!banners.data || dismissed === null) return null;
  const { notices, promos } = splitBanners(banners.data, dismissed);
  if (!notices.length && !promos.length) return null;

  const close = (id: string) => {
    const next = addDismissed(dismissed, id);
    setDismissed(next);
    void dismissedBanners.set(next);
  };

  return (
    <View style={{ gap: 10 }}>
      {notices.map((b) => (
        <Notice key={b.id} b={b} onClose={() => close(b.id)} />
      ))}
      {promos.length ? <Promos list={promos} /> : null}
    </View>
  );
}
