import type { Specialty } from './types';

/** Một chuyên khoa được gợi ý cùng các triệu chứng đã chọn khớp với khoa đó */
export interface SpecialtySuggestion {
  specialty: Specialty;
  matched: string[];
}

const norm = (s: string) => s.trim().toLocaleLowerCase('vi');

/** Mọi triệu chứng của các khoa, bỏ trùng (không phân biệt hoa thường), giữ thứ tự khoa */
export function allSymptoms(specialties: Specialty[]): string[] {
  const seen = new Map<string, string>();
  for (const s of specialties) for (const x of s.symptoms ?? []) if (!seen.has(norm(x))) seen.set(norm(x), x.trim());
  return [...seen.values()];
}

/** Khoa phù hợp với các triệu chứng đã chọn: khớp nhiều triệu chứng hơn xếp trước */
export function suggestSpecialties(specialties: Specialty[], picked: string[]): SpecialtySuggestion[] {
  const want = new Set(picked.map(norm));
  if (want.size === 0) return [];
  return specialties
    .map((specialty) => ({ specialty, matched: (specialty.symptoms ?? []).filter((x) => want.has(norm(x))) }))
    .filter((s) => s.matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length || a.specialty.name.localeCompare(b.specialty.name, 'vi'));
}
