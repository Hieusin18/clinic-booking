import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { StarInput, Stars } from '@/components/Stars';
import { Text } from '@/components/Text';
import { Button, Card, ErrorBox, Muted, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { MAX_COMMENT, RATING_LABEL } from '@/lib/review';
import type { MyReview, VisitReviewState } from '@/lib/types';

/** Đánh giá lượt khám đã xong: chấm sao và góp ý; sửa được trong 30 ngày. */
export function ReviewCard({ visitId }: { visitId: string }) {
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: ['review', visitId],
    queryFn: async () => (await api.get<VisitReviewState>(`/visits/${visitId}/review`)).data,
  });
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [badWords, setBadWords] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => (await api.put<MyReview>(`/visits/${visitId}/review`, { rating, comment: comment.trim() || null })).data,
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['review', visitId] });
      void queryClient.invalidateQueries({ queryKey: ['doctor'] });
    },
    onError: (err) => {
      // Góp ý có từ ngữ không phù hợp: báo ngay dưới ô góp ý để sửa
      const code = err instanceof AxiosError ? (err.response?.data as { code?: string } | undefined)?.code : undefined;
      setBadWords(code === 'INAPPROPRIATE_COMMENT' ? errorMessage(err) : null);
    },
  });

  const s = state.data;
  if (!s || (!s.review && !s.canReview)) return null;
  const review = s.review;

  const startEdit = () => {
    setRating(review?.rating ?? 0);
    setComment(review?.comment ?? '');
    setBadWords(null);
    submit.reset();
    setEditing(true);
  };

  if (review && !editing) {
    return (
      <Card style={{ gap: 8 }}>
        <Text style={styles.title}>Đánh giá của bạn</Text>
        <View style={[styles.row, { gap: 10 }]}>
          <Stars value={review.rating} size={22} />
          <Muted>{RATING_LABEL[review.rating]}</Muted>
        </View>
        {review.comment ? <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{review.comment}</Text> : null}
        {review.hidden ? <Muted>Góp ý này đang được phòng khám xem lại nên chưa hiện trên hồ sơ bác sĩ.</Muted> : null}
        {s.canReview ? (
          <>
            <Muted>Sửa được đến hết ngày {formatDate(s.reviewableUntil!)}.</Muted>
            <Button title="Sửa đánh giá" variant="secondary" onPress={startEdit} />
          </>
        ) : null}
      </Card>
    );
  }

  if (!editing) {
    return (
      <Card style={{ gap: 10 }}>
        <Text style={styles.title}>Bạn thấy lần khám này thế nào?</Text>
        <Muted>Đánh giá giúp phòng khám phục vụ tốt hơn và giúp người bệnh khác chọn bác sĩ. Tên của bạn được rút gọn khi hiện công khai.</Muted>
        <StarInput
          value={0}
          onChange={(n) => {
            setRating(n);
            setComment('');
            setBadWords(null);
            setEditing(true);
          }}
        />
      </Card>
    );
  }

  return (
    <Card style={{ gap: 10 }}>
      <Text style={styles.title}>{review ? 'Sửa đánh giá' : 'Đánh giá lần khám'}</Text>
      <View style={{ gap: 4 }}>
        <StarInput value={rating} onChange={setRating} disabled={submit.isPending} />
        <Muted>{rating ? RATING_LABEL[rating] : 'Chọn số sao'}</Muted>
      </View>
      <View style={[styles.inputBox, { alignItems: 'flex-start', paddingVertical: 10 }, badWords ? { borderColor: colors.danger } : null]}>
        <TextInput
          accessibilityLabel="Góp ý"
          multiline
          maxLength={MAX_COMMENT}
          value={comment}
          onChangeText={(t) => {
            setComment(t);
            if (badWords) setBadWords(null);
          }}
          placeholder="Góp ý về bác sĩ, thời gian chờ, thái độ phục vụ… (không bắt buộc)"
          placeholderTextColor={colors.faint}
          style={{ flex: 1, minHeight: 96, fontSize: 15, lineHeight: 21, color: colors.text, textAlignVertical: 'top' }}
        />
      </View>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        {badWords ? <Text style={[styles.error, { flex: 1 }]}>{badWords}</Text> : <View />}
        <Muted>
          {comment.length}/{MAX_COMMENT}
        </Muted>
      </View>
      <ErrorBox message={submit.error && !badWords ? errorMessage(submit.error) : null} />
      <Button title="Gửi đánh giá" variant="accent" disabled={!rating} loading={submit.isPending} onPress={() => submit.mutate()} />
      <Button title="Để sau" variant="secondary" disabled={submit.isPending} onPress={() => setEditing(false)} />
    </Card>
  );
}
