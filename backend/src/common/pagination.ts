import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Tham số phân trang dùng chung: ?page=1&pageSize=20&q=từ-khóa */
export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
  @IsOptional() @IsString() q?: string;
}

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
