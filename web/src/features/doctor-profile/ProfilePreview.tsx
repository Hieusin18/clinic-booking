import { UserOutlined } from '@ant-design/icons';
import { Avatar, Flex, Tag } from 'antd';
import { C } from '../../lib/theme';
import type { Doctor } from '../../lib/types';
import { avatarUrl, toProfilePayload, yearRange, type ProfileFormValues } from './profileForm';

/** Xem trước hồ sơ như bệnh nhân thấy trên app, cập nhật theo form đang sửa (chưa cần lưu). */
export function ProfilePreview({ doctor, values }: { doctor: Doctor; values: ProfileFormValues }) {
  const p = toProfilePayload(values);
  const years = p.practiceSince ? Math.max(0, new Date().getFullYear() - p.practiceSince) : null;
  const now = p.career.find((c) => c.toYear == null);
  const timeline = [...p.career].sort((a, b) => (b.toYear ?? 9999) - (a.toYear ?? 9999) || b.fromYear - a.fromYear);

  return (
    <div aria-label="Bệnh nhân sẽ thấy" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 20, padding: 20, position: 'sticky', top: 24 }}>
      <div style={{ color: C.stamp, fontWeight: 700, fontSize: 12, letterSpacing: 0.4, marginBottom: 12 }}>BỆNH NHÂN SẼ THẤY</div>
      <Flex gap={12} align="center">
        <Avatar size={56} src={avatarUrl(doctor)} icon={<UserOutlined />} style={{ background: C.stampSoft, color: C.stamp }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>
            {doctor.title ? `${doctor.title} ` : ''}
            {doctor.user.fullName}
          </div>
          <div style={{ color: C.muted, fontSize: 13 }}>
            {doctor.specialty.name}
            {years != null ? ` · ${years} năm kinh nghiệm` : ''}
          </div>
        </div>
      </Flex>
      {now && (
        <div style={{ background: C.paper, borderRadius: 12, padding: '10px 12px', marginTop: 14 }}>
          <div style={{ color: C.muted, fontSize: 12 }}>Hiện tại</div>
          <div style={{ fontWeight: 600 }}>{now.title}</div>
          <div style={{ color: C.muted, fontSize: 13 }}>{now.place}</div>
        </div>
      )}
      {p.bio && <p style={{ margin: '14px 0 0', lineHeight: 1.6 }}>{p.bio}</p>}
      {p.expertise.length > 0 && (
        <Flex wrap gap={6} style={{ marginTop: 14 }}>
          {p.expertise.map((e) => (
            <Tag key={e} style={{ margin: 0 }}>
              {e}
            </Tag>
          ))}
        </Flex>
      )}
      {timeline.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: C.stamp, fontWeight: 700, fontSize: 12, letterSpacing: 0.4, marginBottom: 8 }}>QUÁ TRÌNH CÔNG TÁC</div>
          {timeline.map((h, i) => (
            <Flex key={i} gap={12} style={{ padding: '6px 0', borderTop: i ? `1px solid ${C.line}` : undefined }}>
              <span className="num" style={{ width: 86, flex: 'none', fontSize: 17, fontWeight: 600, color: h.toYear == null ? C.stamp : C.ink }}>
                {h.fromYear ? yearRange(h) : '—'}
              </span>
              <div>
                <div style={{ fontWeight: 600 }}>{h.title || '…'}</div>
                <div style={{ color: C.muted, fontSize: 13 }}>{h.place}</div>
              </div>
            </Flex>
          ))}
        </div>
      )}
    </div>
  );
}
