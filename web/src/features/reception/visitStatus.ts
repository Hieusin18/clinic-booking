import type { VisitStatus } from '../../lib/types';

export const VISIT_STATUS: Record<VisitStatus, { label: string; color: string }> = {
  WAITING: { label: 'Đang chờ', color: 'gold' },
  IN_PROGRESS: { label: 'Đang khám', color: 'processing' },
  DONE: { label: 'Đã khám', color: 'success' },
  LEFT: { label: 'Bỏ về', color: 'default' },
};
