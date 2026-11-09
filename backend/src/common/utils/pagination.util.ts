import { PageQuery } from '../dto/page-query.dto.js';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const skipTake = (q: PageQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

export const toPage = <T>(items: T[], total: number, q: PageQuery): Page<T> => ({
  items,
  total,
  page: q.page,
  pageSize: q.pageSize,
});
