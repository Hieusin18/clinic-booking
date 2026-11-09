import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { HistoryEntryDto } from './history-entry.dto.js';

/** Phần hồ sơ hiện cho bệnh nhân; bác sĩ tự sửa được, admin cũng sửa được. */
export class DoctorProfileDto {
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  /** Năm bắt đầu hành nghề; null = xóa */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1950) @Max(2100) practiceSince?: number | null;
  /** Thế mạnh chuyên môn */
  @IsOptional() @IsArray() @ArrayMaxSize(15) @IsString({ each: true }) @MaxLength(100, { each: true }) expertise?: string[];
  /** Quá trình đào tạo; gửi lên = thay toàn bộ danh sách cũ */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => HistoryEntryDto) education?: HistoryEntryDto[];
  /** Quá trình công tác đến nay; gửi lên = thay toàn bộ danh sách cũ */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => HistoryEntryDto) career?: HistoryEntryDto[];
}
