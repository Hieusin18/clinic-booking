/**
 * Bản điện tử của bệnh án ngoại trú (trang 1) và đơn thuốc (trang 2), xuất ra PDF và Word.
 *
 * Bố cục:
 *  - Bệnh án theo các mục của mẫu bệnh án ngoại trú Bộ Y tế: I. Hành chính, II. Lý do đến khám,
 *    III. Hỏi bệnh, IV. Khám bệnh, V. Chẩn đoán (ICD-10), VI. Điều trị, chữ ký bác sĩ.
 *  - Đơn thuốc theo các trường của mẫu đơn thuốc, Phụ lục I Thông tư 26/2025/TT-BYT.
 *
 * Cả hai định dạng dùng chung một "mô hình in" (PrintDoc) để nội dung PDF và Word luôn giống nhau.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageBreak,
  Paragraph,
  Tab,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
} from 'docx';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces.js';
import { clinicInfo } from '../common/clinic.js';
import { icdName } from '../icd10/icd10.js';

const require = createRequire(import.meta.url);
// pdfmake chỉ có bản CommonJS
const pdfmake = require('pdfmake') as {
  setFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(cb: (url: string) => boolean): void;
  setLocalAccessPolicy(cb: (path: string) => boolean): void;
  createPdf(doc: TDocumentDefinitions): { getBuffer(): Promise<Buffer> };
};

const FONT_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
// Thiếu font (vd. Dockerfile quên copy assets/) thì dừng ngay lúc khởi động thay vì lỗi khi bệnh nhân tải file
if (!existsSync(`${FONT_DIR}Tinos-Regular.ttf`)) throw new Error(`Không tìm thấy font tại ${FONT_DIR}`);
pdfmake.setFonts({
  Tinos: {
    normal: `${FONT_DIR}Tinos-Regular.ttf`,
    bold: `${FONT_DIR}Tinos-Bold.ttf`,
    italics: `${FONT_DIR}Tinos-Italic.ttf`,
    bolditalics: `${FONT_DIR}Tinos-BoldItalic.ttf`,
  },
});
// Không cho tài liệu tải ảnh/tệp bên ngoài; chỉ đọc font của chính ứng dụng
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((path) => path.startsWith(FONT_DIR));

// ---------- Dữ liệu đầu vào ----------

type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type ExportVisit = {
  id: string;
  date: Date;
  queueNumber: number;
  source: 'ONLINE' | 'WALK_IN';
  createdAt: Date;
  patient: {
    id: string;
    fullName: string;
    dateOfBirth: Date;
    gender: Gender;
    phone: string;
    nationalId: string | null;
    address: string | null;
    insuranceNo: string | null;
    insuranceExpiry: Date | null;
    allergies: string | null;
    occupation: string | null;
    ethnicity: string | null;
    relativeName: string | null;
    relativePhone: string | null;
  };
  doctor: { title: string | null; user: { fullName: string }; specialty: { name: string } | null };
  medicalRecord: {
    reason: string | null;
    symptoms: string;
    personalHistory: string | null;
    familyHistory: string | null;
    pulse: number | null;
    temperature: number | null;
    bpSystolic: number | null;
    bpDiastolic: number | null;
    respiratoryRate: number | null;
    spo2: number | null;
    weight: number | null;
    height: number | null;
    generalExam: string | null;
    organExam: string | null;
    labSummary: string | null;
    orders: string | null;
    diagnosis: string;
    icdCode: string | null;
    secondaryDiagnosis: string | null;
    secondaryIcdCodes: string | null;
    treatment: string | null;
    followUpDate: Date | null;
  };
  prescription: {
    id: string;
    code: string | null;
    advice: string | null;
    finalizedAt: Date | null;
    items: {
      quantity: number;
      dosePerTime: string;
      timesPerDay: number;
      days: number;
      note: string | null;
      medicine: { name: string; activeIngredient: string | null; strength: string | null; unit: string };
    }[];
  } | null;
};

// ---------- Định dạng ----------

const TZ = 'Asia/Ho_Chi_Minh';
const BLANK = '……………………';
const GENDER: Record<Gender, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };

/** Cột @db.Date lưu nửa đêm UTC: đọc theo UTC để không lệch ngày. */
const day = (d: Date | null | undefined) => (d ? d.toLocaleDateString('vi-VN', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const vnParts = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { dd: p.day, mm: p.month, yyyy: p.year, hh: p.hour, mi: p.minute };
};
/** "Ngày 06 tháng 11 năm 2026" như dòng ký tên trên giấy tờ */
const signDate = (d: Date) => {
  const p = vnParts(d);
  return `Ngày ${p.dd} tháng ${p.mm} năm ${p.yyyy}`;
};
const dateTime = (d: Date) => {
  const p = vnParts(d);
  return `${p.hh} giờ ${p.mi} phút, ngày ${p.dd}/${p.mm}/${p.yyyy}`;
};
/** Thông tư 26/2025: số lượng dưới 10 ghi thêm số 0 phía trước */
const qty = (n: number) => (n < 10 ? `0${n}` : String(n));
const num = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

function ageOf(dob: Date, at: Date) {
  const months = (at.getUTCFullYear() - dob.getUTCFullYear()) * 12 + (at.getUTCMonth() - dob.getUTCMonth()) - (at.getUTCDate() < dob.getUTCDate() ? 1 : 0);
  return { months, years: Math.floor(months / 12) };
}

/** Tên thuốc theo Thông tư 26/2025: tên chung quốc tế (hoạt chất), tên thương mại trong ngoặc. */
export function medicineLabel(m: { name: string; activeIngredient: string | null; strength: string | null }) {
  const inn = m.activeIngredient?.trim();
  const base = inn && inn.toLowerCase() !== m.name.toLowerCase() ? `${inn} (${m.name})` : m.name;
  return [base, m.strength].filter(Boolean).join(' ');
}

const withIcd = (text: string, codes: string | null) => (codes ? `${text} (${codes})` : text);

// ---------- Mô hình in dùng chung ----------

/** Một ô "nhãn: giá trị". Giá trị rỗng in thành dòng chấm như mẫu giấy. */
type Field = { label: string; value?: string | null; bold?: boolean };
type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'fields'; fields: Field[] } // nhiều ô cùng một dòng
  | { kind: 'text'; text: string; italic?: boolean; bold?: boolean; indent?: boolean }
  | { kind: 'grid'; cells: Field[]; columns: number } // bảng dấu hiệu sinh tồn
  | { kind: 'medicine'; index: number; name: string; quantity: string; usage: string };

type Page = {
  headerLeft: string[];
  headerRight: string[];
  title: string;
  subtitle?: string;
  blocks: Block[];
  sign: { date: string; role: string; name: string };
  /** Ghi chú cuối trang nội dung (đơn thuốc) */
  note?: string;
};

export function buildPrintDoc(v: ExportVisit, now = new Date()) {
  const clinic = clinicInfo();
  const r = v.medicalRecord;
  const p = v.patient;
  const age = ageOf(p.dateOfBirth, v.date);
  const isYoungChild = age.months < 72;
  const ageText = isYoungChild ? `${age.months} tháng` : `${age.years}`;
  const doctorName = [v.doctor.title, v.doctor.user.fullName].filter(Boolean).join(' ');
  const recordNo = `BA-${day(v.date).split('/').reverse().join('')}-${String(v.queueNumber).padStart(3, '0')}`;
  const headerLeft = [clinic.name.toUpperCase(), clinic.address, clinic.phone && `Điện thoại: ${clinic.phone}`].filter(Boolean) as string[];
  const exported = `Bản điện tử xuất từ hệ thống đặt lịch khám lúc ${dateTime(now)}. Mã tra cứu: ${v.id}`;

  const bmi = r.weight && r.height ? num(r.weight / (r.height / 100) ** 2) : null;
  const unit = (n: number | null, u: string) => (n == null ? null : `${num(n)} ${u}`);
  const icdText = (code: string | null) => (code ? `${code}${icdName(code) && icdName(code) !== r.diagnosis ? ` – ${icdName(code)}` : ''}` : null);

  const record: Page = {
    headerLeft,
    headerRight: [`Số bệnh án: ${recordNo}`, `Mã người bệnh: ${p.id.slice(0, 8).toUpperCase()}`],
    title: 'BỆNH ÁN NGOẠI TRÚ',
    subtitle: v.doctor.specialty ? `Chuyên khoa: ${v.doctor.specialty.name}` : undefined,
    blocks: [
      { kind: 'heading', text: 'I. HÀNH CHÍNH' },
      { kind: 'fields', fields: [{ label: '1. Họ và tên (in hoa)', value: p.fullName.toUpperCase(), bold: true }] },
      { kind: 'fields', fields: [{ label: '2. Ngày sinh', value: day(p.dateOfBirth) }, { label: 'Tuổi', value: ageText }, { label: '3. Giới tính', value: GENDER[p.gender] }] },
      { kind: 'fields', fields: [{ label: '4. Nghề nghiệp', value: p.occupation }, { label: '5. Dân tộc', value: p.ethnicity }] },
      { kind: 'fields', fields: [{ label: '6. Số định danh cá nhân/CCCD', value: p.nationalId }, { label: 'Điện thoại', value: p.phone }] },
      { kind: 'fields', fields: [{ label: '7. Địa chỉ', value: p.address }] },
      {
        kind: 'fields',
        fields: [
          { label: '8. Đối tượng', value: p.insuranceNo ? 'BHYT' : 'Thu phí' },
          { label: 'Số thẻ BHYT', value: p.insuranceNo },
          { label: 'Giá trị đến', value: day(p.insuranceExpiry) },
        ],
      },
      {
        kind: 'fields',
        fields: [{ label: '9. Họ tên, điện thoại người nhà khi cần báo tin', value: [p.relativeName, p.relativePhone].filter(Boolean).join(' – ') }],
      },
      {
        kind: 'fields',
        fields: [
          { label: '10. Đến khám lúc', value: dateTime(v.createdAt) },
          { label: 'Hình thức', value: v.source === 'ONLINE' ? 'Đặt lịch trực tuyến' : 'Đến trực tiếp' },
        ],
      },
      { kind: 'fields', fields: [{ label: '11. Tiền sử dị ứng', value: p.allergies ?? 'Chưa ghi nhận' }] },

      { kind: 'heading', text: 'II. LÝ DO ĐẾN KHÁM' },
      { kind: 'text', text: r.reason || BLANK, indent: true },

      { kind: 'heading', text: 'III. HỎI BỆNH' },
      { kind: 'fields', fields: [{ label: '1. Quá trình bệnh lý', value: r.symptoms }] },
      { kind: 'text', text: '2. Tiền sử bệnh:' },
      { kind: 'fields', fields: [{ label: '   – Bản thân', value: r.personalHistory }] },
      { kind: 'fields', fields: [{ label: '   – Gia đình', value: r.familyHistory }] },

      { kind: 'heading', text: 'IV. KHÁM BỆNH' },
      {
        kind: 'grid',
        columns: 4,
        cells: [
          { label: 'Mạch', value: unit(r.pulse, 'lần/phút') },
          { label: 'Nhiệt độ', value: unit(r.temperature, '°C') },
          { label: 'Huyết áp', value: r.bpSystolic != null && r.bpDiastolic != null ? `${r.bpSystolic}/${r.bpDiastolic} mmHg` : null },
          { label: 'Nhịp thở', value: unit(r.respiratoryRate, 'lần/phút') },
          { label: 'SpO₂', value: unit(r.spo2, '%') },
          { label: 'Cân nặng', value: unit(r.weight, 'kg') },
          { label: 'Chiều cao', value: unit(r.height, 'cm') },
          { label: 'BMI', value: bmi },
        ],
      },
      { kind: 'fields', fields: [{ label: '1. Toàn thân', value: r.generalExam }] },
      { kind: 'fields', fields: [{ label: '2. Các bộ phận', value: r.organExam }] },
      { kind: 'fields', fields: [{ label: '3. Tóm tắt kết quả cận lâm sàng', value: r.labSummary }] },
      { kind: 'fields', fields: [{ label: '4. Chỉ định cận lâm sàng', value: r.orders }] },

      { kind: 'heading', text: 'V. CHẨN ĐOÁN' },
      { kind: 'fields', fields: [{ label: '1. Bệnh chính', value: r.diagnosis, bold: true }, { label: 'Mã ICD-10', value: icdText(r.icdCode) }] },
      { kind: 'fields', fields: [{ label: '2. Bệnh kèm theo', value: r.secondaryDiagnosis }, { label: 'Mã ICD-10', value: r.secondaryIcdCodes }] },

      { kind: 'heading', text: 'VI. ĐIỀU TRỊ' },
      { kind: 'fields', fields: [{ label: '1. Hướng xử trí, điều trị', value: r.treatment }] },
      {
        kind: 'fields',
        fields: [
          {
            label: '2. Đơn thuốc',
            value: v.prescription
              ? `Có, ${v.prescription.items.length} loại thuốc${v.prescription.code ? ` – mã đơn ${v.prescription.code}` : ''} (xem trang sau)`
              : 'Không kê đơn',
          },
        ],
      },
      { kind: 'fields', fields: [{ label: '3. Hẹn tái khám', value: r.followUpDate ? `ngày ${day(r.followUpDate)}` : 'Khi có dấu hiệu bất thường' }] },
    ],
    sign: { date: signDate(v.createdAt), role: 'BÁC SĨ KHÁM BỆNH', name: doctorName },
  };

  const pages = [record];
  const rx = v.prescription;
  if (rx) {
    const blocks: Block[] = [
      { kind: 'fields', fields: [{ label: 'Họ tên', value: p.fullName.toUpperCase(), bold: true }] },
      { kind: 'fields', fields: [{ label: 'Ngày sinh', value: day(p.dateOfBirth) }, { label: isYoungChild ? 'Tuổi' : 'Cân nặng', value: isYoungChild ? ageText : unit(r.weight, 'kg') }, { label: 'Giới tính', value: GENDER[p.gender] }] },
      ...(isYoungChild ? [{ kind: 'fields', fields: [{ label: 'Cân nặng', value: unit(r.weight, 'kg') }] } as Block] : []),
      { kind: 'fields', fields: [{ label: 'Số định danh cá nhân/CCCD/hộ chiếu (nếu có)', value: p.nationalId }] },
      { kind: 'fields', fields: [{ label: 'Mã số bảo hiểm y tế (nếu có)', value: p.insuranceNo }] },
      { kind: 'fields', fields: [{ label: 'Nơi thường trú/tạm trú/ở hiện tại', value: p.address }] },
      {
        kind: 'fields',
        fields: [
          {
            label: 'Chẩn đoán',
            value: [withIcd(r.diagnosis, r.icdCode), r.secondaryDiagnosis && withIcd(r.secondaryDiagnosis, r.secondaryIcdCodes)].filter(Boolean).join('; '),
          },
        ],
      },
      { kind: 'text', text: 'Thuốc điều trị:', bold: true },
      ...rx.items.map(
        (i, idx): Block => ({
          kind: 'medicine',
          index: idx + 1,
          name: medicineLabel(i.medicine),
          quantity: `SL: ${qty(i.quantity)} ${i.medicine.unit}`,
          usage: `Mỗi lần ${i.dosePerTime}, ngày ${qty(i.timesPerDay)} lần, dùng ${qty(i.days)} ngày.${i.note ? ` ${i.note}` : ''}`,
        }),
      ),
      { kind: 'fields', fields: [{ label: 'Lời dặn', value: rx.advice }] },
      ...(r.followUpDate ? [{ kind: 'fields', fields: [{ label: 'Hẹn tái khám', value: `ngày ${day(r.followUpDate)}` }] } as Block] : []),
      ...(isYoungChild ? [{ kind: 'fields', fields: [{ label: 'Họ tên người đưa trẻ đến khám bệnh, chữa bệnh', value: p.relativeName }] } as Block] : []),
    ];
    pages.push({
      headerLeft,
      headerRight: [`Mã đơn thuốc: ${rx.code ?? rx.id.slice(0, 12)}`],
      title: 'ĐƠN THUỐC',
      blocks,
      sign: { date: signDate(rx.finalizedAt ?? v.createdAt), role: 'BÁC SĨ/Y SỸ KHÁM BỆNH', name: doctorName },
      note: `${clinic.phone ? `Số điện thoại liên hệ: ${clinic.phone}. ` : ''}Khám lại xin mang theo đơn này.`,
    });
  }
  return { pages, footer: exported, fileName: `benh-an-${recordNo}` };
}

// ---------- PDF ----------

const fieldText = (f: Field) => [
  { text: `${f.label}: `, bold: false },
  { text: f.value?.toString().trim() || BLANK, bold: !!f.bold },
];

function pdfBlock(b: Block): Content {
  switch (b.kind) {
    case 'heading':
      return { text: b.text, bold: true, margin: [0, 6, 0, 2] };
    case 'text':
      return { text: b.text, italics: b.italic, bold: b.bold, margin: [b.indent ? 12 : 0, 1, 0, 1] };
    case 'fields':
      return b.fields.length === 1
        ? { text: fieldText(b.fields[0]), margin: [0, 1, 0, 1] }
        : { columns: b.fields.map((f, i) => ({ text: fieldText(f), width: i === b.fields.length - 1 ? '*' : 'auto' })), columnGap: 28, margin: [0, 1, 0, 1] };
    case 'grid': {
      const rows: Content[][] = [];
      for (let i = 0; i < b.cells.length; i += b.columns) {
        rows.push(b.cells.slice(i, i + b.columns).map((f) => ({ text: fieldText(f), fontSize: 11 })));
      }
      return { table: { widths: Array(b.columns).fill('*'), body: rows }, layout: 'lightHorizontalLines', margin: [0, 2, 0, 4] };
    }
    case 'medicine':
      return {
        margin: [0, 3, 0, 2],
        stack: [
          { columns: [{ text: `${b.index}. ${b.name}`, bold: true, width: '*' }, { text: b.quantity, bold: true, width: 'auto' }] },
          { text: b.usage, italics: true, margin: [14, 1, 0, 0] },
        ],
      };
  }
}

function pdfPage(page: Page, first: boolean): Content[] {
  return [
    {
      ...(first ? {} : { pageBreak: 'before' as const }),
      columns: [
        { stack: page.headerLeft.map((t, i) => ({ text: t, bold: i === 0, fontSize: i === 0 ? 12 : 11 })), width: '*' },
        { stack: page.headerRight.map((t) => ({ text: t, alignment: 'right', fontSize: 11 })), width: 'auto' },
      ],
    },
    { text: page.title, alignment: 'center', bold: true, fontSize: 17, margin: [0, 10, 0, 2] },
    ...(page.subtitle ? [{ text: page.subtitle, alignment: 'center', italics: true, margin: [0, 0, 0, 6] } as Content] : [{ text: '', margin: [0, 0, 0, 6] } as Content]),
    ...page.blocks.map(pdfBlock),
    {
      columns: [
        { text: '', width: '*' },
        {
          width: 230,
          stack: [
            { text: page.sign.date, italics: true, alignment: 'center' },
            { text: page.sign.role, bold: true, alignment: 'center' },
            { text: '(Ký, ghi rõ họ tên)', italics: true, alignment: 'center', fontSize: 10 },
            { text: page.sign.name, bold: true, alignment: 'center', margin: [0, 34, 0, 0] },
          ],
        },
      ],
      margin: [0, 8, 0, 0],
      unbreakable: true,
    },
    ...(page.note ? [{ text: page.note, italics: true, fontSize: 10, margin: [0, 8, 0, 0] } as Content] : []),
  ];
}

export async function renderPdf(doc: ReturnType<typeof buildPrintDoc>): Promise<Buffer> {
  const definition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [56, 36, 42, 40],
    defaultStyle: { font: 'Tinos', fontSize: 11.5, lineHeight: 1.1 },
    info: { title: doc.pages.map((p) => p.title).join(' – '), creator: 'Hệ thống đặt lịch khám' },
    content: doc.pages.flatMap((p, i) => pdfPage(p, i === 0)),
    footer: (current, total) => ({
      columns: [
        { text: doc.footer, width: '*' },
        { text: `Trang ${current}/${total}`, width: 'auto' },
      ],
      columnGap: 12,
      fontSize: 8,
      italics: true,
      color: '#666666',
      margin: [56, 8, 42, 0],
    }),
  };
  return pdfmake.createPdf(definition).getBuffer();
}

// ---------- Word (.docx) ----------

const FONT = 'Times New Roman';
const SIZE = 11.5;
const run = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: Math.round((opts.size ?? SIZE) * 2), bold: opts.bold, italics: opts.italics });
const tab = () => new TextRun({ children: [new Tab()] });
type ParaOpts = { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; indent?: number; rightTab?: boolean; keepNext?: boolean };
const para = (children: TextRun[], opts: ParaOpts = {}) =>
  new Paragraph({
    children,
    alignment: opts.align,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 20, line: 264 },
    indent: opts.indent ? { left: opts.indent } : undefined,
    tabStops: opts.rightTab ? [{ type: TabStopType.RIGHT, position: 9900 }] : undefined,
    keepNext: opts.keepNext,
  });
const fieldRuns = (f: Field) => [run(`${f.label}: `), run(f.value?.toString().trim() || BLANK, { bold: f.bold })];

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
const CELL_MARGINS = { top: 30, bottom: 30, left: 80, right: 80 };
const cell = (children: Paragraph[], width: number) => new TableCell({ children, width: { size: width, type: WidthType.PERCENTAGE }, margins: CELL_MARGINS });

function docxBlock(b: Block): (Paragraph | Table)[] {
  switch (b.kind) {
    case 'heading':
      return [para([run(b.text, { bold: true })], { before: 120, after: 40, keepNext: true })];
    case 'text':
      return [para([run(b.text, { italics: b.italic, bold: b.bold })], { indent: b.indent ? 240 : undefined, keepNext: b.bold })];
    case 'fields':
      // Nhiều ô trên một dòng: cách nhau bằng tab để người dùng Word dễ sửa
      return [para(b.fields.flatMap((f, i) => [...(i ? [tab(), tab()] : []), ...fieldRuns(f)]))];
    case 'grid': {
      const rows: TableRow[] = [];
      for (let i = 0; i < b.cells.length; i += b.columns) {
        rows.push(new TableRow({ children: b.cells.slice(i, i + b.columns).map((f) => cell([para(fieldRuns(f), { after: 0 })], 100 / b.columns)) }));
      }
      return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }), para([], { after: 40 })];
    }
    case 'medicine':
      return [
        para([run(`${b.index}. ${b.name}`, { bold: true }), tab(), run(b.quantity, { bold: true })], { before: 60, rightTab: true, keepNext: true }),
        para([run(b.usage, { italics: true })], { indent: 280 }),
      ];
  }
}

function docxPage(page: Page, last: boolean): (Paragraph | Table)[] {
  const header = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          cell(page.headerLeft.map((t, i) => para([run(t, { bold: i === 0, size: 11 })], { before: 0, after: 0 })), 60),
          cell(page.headerRight.map((t) => para([run(t, { size: 11 })], { align: AlignmentType.RIGHT, before: 0, after: 0 })), 40),
        ],
      }),
    ],
  });
  const sign = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell([para([])], 50),
          cell(
            [
              para([run(page.sign.date, { italics: true })], { align: AlignmentType.CENTER, before: 120 }),
              para([run(page.sign.role, { bold: true })], { align: AlignmentType.CENTER }),
              para([run('(Ký, ghi rõ họ tên)', { italics: true, size: 10 })], { align: AlignmentType.CENTER }),
              para([run(page.sign.name, { bold: true })], { align: AlignmentType.CENTER, before: 760 }),
            ],
            50,
          ),
        ],
      }),
    ],
  });
  return [
    header,
    para([run(page.title, { bold: true, size: 17 })], { align: AlignmentType.CENTER, before: 200, after: 20 }),
    ...(page.subtitle ? [para([run(page.subtitle, { italics: true })], { align: AlignmentType.CENTER, after: 120 })] : []),
    ...page.blocks.flatMap(docxBlock),
    sign,
    ...(page.note ? [para([run(page.note, { italics: true, size: 10 })], { before: 200 })] : []),
    ...(last ? [] : [new Paragraph({ children: [new PageBreak()] })]),
  ];
}

export async function renderDocx(doc: ReturnType<typeof buildPrintDoc>): Promise<Buffer> {
  const document = new Document({
    creator: 'Hệ thống đặt lịch khám',
    title: doc.pages.map((p) => p.title).join(' – '),
    styles: { default: { document: { run: { font: FONT, size: SIZE * 2 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 1130, right: 840, footer: 360 } } },
        footers: { default: new Footer({ children: [para([run(doc.footer, { italics: true, size: 8 })])] }) },
        children: doc.pages.flatMap((p, i) => docxPage(p, i === doc.pages.length - 1)),
      },
    ],
  });
  return Packer.toBuffer(document);
}
