import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../auth/decorators.js';
import { ICD10 } from './icd10.data.js';

/** Mã ICD-10: chữ cái + 2 chữ số, có thể thêm phần thập phân 1–2 chữ số (J02, J02.9, M54.16). */
export const ICD_REGEX = /^[A-Z]\d{2}(\.\d{1,2})?$/;

/** Bỏ dấu tiếng Việt để tìm "viem hong" ra "Viêm họng". */
export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const INDEX = ICD10.map(([code, name]) => ({ code, name, code_: code.toLowerCase(), name_: fold(name), words: fold(`${code} ${name}`).split(/[\s,()[\]–-]+/) }));

/**
 * Tìm theo mã hoặc tên: mỗi từ gõ vào phải là đầu của một từ trong tên/mã ("hong" khớp "họng"
 * nhưng không khớp "không"). Mã khớp đầu và cụm từ liền nhau được xếp lên trước.
 */
export function searchIcd(q?: string, limit = 20) {
  const text = fold(q ?? '').trim();
  const terms = text.split(/\s+/).filter(Boolean);
  return INDEX.filter((e) => terms.every((t) => e.words.some((w) => w.startsWith(t))))
    .map((e) => ({ e, rank: e.code_.startsWith(text) ? 0 : e.name_.startsWith(text) ? 1 : e.name_.includes(text) ? 2 : 3 }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ e }) => ({ code: e.code, name: e.name }));
}

export const icdName = (code?: string | null) => (code ? ICD10.find(([c]) => c === code)?.[1] : undefined);

class IcdQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

@ApiTags('icd10')
@ApiBearerAuth()
@Controller('icd10')
export class Icd10Controller {
  /** Tìm mã ICD-10 theo mã hoặc tên bệnh (không cần gõ dấu) */
  @Roles('DOCTOR')
  @Get()
  search(@Query() q: IcdQuery) {
    return searchIcd(q.q);
  }
}

@Module({ controllers: [Icd10Controller] })
export class Icd10Module {}
