import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ICD_REGEX } from '../../icd10/icd10.util.js';

const ICD_MESSAGE = 'Mã ICD-10 không hợp lệ (ví dụ J02.9)';

/** Ô để trống trên form gửi "" hoặc null: coi như không nhập. */
const EmptyToUndefined = () => Transform(({ value }) => (value === '' || value === null ? undefined : value));

/** Mã ICD: bỏ khoảng trắng thừa, viết hoa; ô trống coi như không nhập. */
const IcdInput = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value === null ? undefined : value));
const ICD_LIST = /^[A-Z]\d{2}(\.\d{1,2})?(\s*,\s*[A-Z]\d{2}(\.\d{1,2})?)*$/;

/** Bệnh án ngoại trú, bố cục theo mẫu bệnh án của Bộ Y tế. Chỉ quá trình bệnh lý và chẩn đoán là bắt buộc. */
export class RecordDto {
  // III. Hỏi bệnh
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  /** Quá trình bệnh lý (bệnh sử, triệu chứng) */
  @IsString() @MinLength(2) @MaxLength(2000) symptoms: string;
  @IsOptional() @IsString() @MaxLength(1000) personalHistory?: string;
  @IsOptional() @IsString() @MaxLength(1000) familyHistory?: string;

  // IV. Khám bệnh
  @IsOptional() @Type(() => Number) @IsInt() @Min(20) @Max(250) pulse?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(30) @Max(45) temperature?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(40) @Max(300) bpSystolic?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(20) @Max(200) bpDiastolic?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(80) respiratoryRate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(50) @Max(100) spo2?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(0.5) @Max(400) weight?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(30) @Max(250) height?: number;
  @IsOptional() @IsString() @MaxLength(2000) generalExam?: string;
  @IsOptional() @IsString() @MaxLength(2000) organExam?: string;
  @IsOptional() @IsString() @MaxLength(2000) labSummary?: string;
  /** Chỉ định cận lâm sàng: xét nghiệm, chẩn đoán hình ảnh… */
  @IsOptional() @IsString() @MaxLength(2000) orders?: string;

  // V. Chẩn đoán
  @IsString() @MinLength(2) @MaxLength(1000) diagnosis: string;
  @IcdInput() @IsOptional() @Matches(ICD_REGEX, { message: ICD_MESSAGE }) icdCode?: string;
  @IsOptional() @IsString() @MaxLength(1000) secondaryDiagnosis?: string;
  /** Mã ICD-10 bệnh kèm theo, cách nhau bởi dấu phẩy */
  @IcdInput() @IsOptional() @Matches(ICD_LIST, { message: ICD_MESSAGE }) secondaryIcdCodes?: string;

  // VI. Điều trị
  @IsOptional() @IsString() @MaxLength(2000) treatment?: string;
  /** Hẹn tái khám, YYYY-MM-DD */
  @EmptyToUndefined()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày tái khám dạng YYYY-MM-DD' })
  followUpDate?: string;
}
