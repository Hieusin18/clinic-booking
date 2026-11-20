/** Kiểu dữ liệu trả về từ backend (xem Swagger tại /api/docs). */

export type Role = 'PATIENT' | 'RECEPTIONIST' | 'DOCTOR' | 'ADMIN' | 'NURSE';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type VisitStatus = 'WAITING' | 'IN_PROGRESS' | 'AWAITING_RESULTS' | 'DONE' | 'LEFT';
/** Cách nhận kết quả cận lâm sàng: quay lại phòng khám hoặc nhận online */
export type ResultMode = 'RETURN' | 'ONLINE';
/** PENDING = chờ lễ tân duyệt, REJECTED = bị từ chối / hết giờ mà chưa duyệt */
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' | 'REJECTED';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface User {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: Role;
  isActive: boolean;
  /** Đang dùng mật khẩu tạm (admin tạo hoặc đặt lại): phải đổi trước khi dùng hệ thống */
  mustChangePassword?: boolean;
}

export interface Specialty {
  id: string;
  name: string;
  description: string | null;
  _count?: { doctors: number };
}

/** Một mốc trong quá trình đào tạo hoặc công tác; toYear null = đến nay */
export interface HistoryItem {
  id?: string;
  fromYear: number;
  toYear: number | null;
  title: string;
  place: string;
}

export interface Doctor {
  id: string;
  title: string | null;
  bio: string | null;
  /** Phòng khám, ví dụ "Phòng 2" */
  room?: string | null;
  /** Năm bắt đầu hành nghề */
  practiceSince: number | null;
  experienceYears: number | null;
  /** Thế mạnh chuyên môn */
  expertise: string[];
  /** Phiên bản ảnh đại diện; null = chưa có ảnh */
  avatarVersion: number | null;
  specialty: { id: string; name: string };
  /** API công khai chỉ có fullName; trang admin có thêm tài khoản đăng nhập */
  user: { id: string; fullName: string; phone: string; email: string | null; isActive: boolean };
  /** Có khi xem hồ sơ đầy đủ */
  education?: HistoryItem[];
  career?: HistoryItem[];
  /** Có ở danh sách: số giờ còn trống hôm nay, công việc hiện tại */
  freeToday?: number;
  currentPosition?: string | null;
}

export interface Medicine {
  id: string;
  name: string;
  activeIngredient: string | null;
  strength: string | null;
  unit: string;
  isActive: boolean;
}

export interface Patient {
  id: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  gender: Gender;
  nationalId: string | null;
  address: string | null;
  insuranceNo: string | null;
  insuranceExpiry: string | null;
  allergies: string | null;
  occupation: string | null;
  ethnicity: string | null;
  relativeName: string | null;
  relativePhone: string | null;
  userId: string | null;
}

export interface Slot {
  id: string;
  startTime: string;
  endTime: string;
  isBooked?: boolean;
  appointments?: {
    id: string;
    status: AppointmentStatus;
    reason: string | null;
    patient: { id: string; fullName: string; phone: string };
  }[];
}

export interface DoctorRef {
  id: string;
  title: string | null;
  /** Phòng khám, ví dụ "Phòng 2" */
  room?: string | null;
  user: { fullName: string };
  specialty?: { id: string; name: string };
}

export interface Visit {
  id: string;
  date: string;
  queueNumber: number;
  source: 'ONLINE' | 'WALK_IN';
  checkinMethod: 'QR' | 'RECEPTION';
  status: VisitStatus;
  reason: string | null;
  appointmentId: string | null;
  /** Giờ hẹn (lượt đặt online) */
  appointmentAt?: string | null;
  /** Lễ tân check-in ngoài khung giờ */
  checkinOverride?: boolean;
  calledAt?: string | null;
  callRule?: CallRule | null;
  createdAt: string;
  patient: { id: string; fullName: string; phone: string; dateOfBirth: string; gender: Gender; allergies: string | null };
  doctor: DoctorRef;
  /** Có ở /queue/doctor và /vitals/today: sinh hiệu điều dưỡng đã đo (null = chưa đo) */
  vitals?: Vitals | null;
  /** Có ở /queue/today và /queue/doctor: thứ tự gọi dự kiến (0 = người tiếp theo) của người đang chờ */
  predictedOrder?: number | null;
  estimatedCallAt?: string | null;
  /** Người đặt lịch đã đến giờ hẹn, được ưu tiên */
  due?: boolean;
  /** Cận lâm sàng: cách nhận kết quả (null = chưa gửi đi), lúc gửi đi, lúc quay lại hàng chờ với kết quả */
  resultMode?: ResultMode | null;
  sentForTestsAt?: string | null;
  resultsReadyAt?: string | null;
  /** Tên các chỉ định cận lâm sàng và đã có kết quả chưa */
  labOrders?: { id: string; name: string; doneAt: string | null }[];
}

/** Bác sĩ gọi lượt này theo quy tắc nào */
export type CallRule = 'FAIRNESS' | 'APPOINTMENT' | 'ARRIVAL' | 'MANUAL' | 'RESULTS';

export interface Appointment {
  id: string;
  status: AppointmentStatus;
  reason: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  rejectReason?: string | null;
  /** Lịch tái khám bác sĩ đặt cho lượt khám này */
  followUpOfVisitId?: string | null;
  schedule: { id: string; startTime: string; endTime: string; doctor: DoctorRef };
  patient: { id: string; fullName: string; phone: string };
  visit?: { id: string; queueNumber: number; source: 'ONLINE' | 'WALK_IN'; status: VisitStatus } | null;
  /** Khung giờ được check-in theo lịch hẹn */
  checkinOpensAt?: string;
  checkinClosesAt?: string;
}

/** Bệnh án ngoại trú theo bố cục mẫu Bộ Y tế */
export interface MedicalRecord {
  id: string;
  reason: string | null;
  /** Quá trình bệnh lý */
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
  /** Chỉ định cận lâm sàng */
  orders: string | null;
  diagnosis: string;
  icdCode: string | null;
  secondaryDiagnosis: string | null;
  secondaryIcdCodes: string | null;
  treatment: string | null;
  /** Hẹn tái khám (ISO, cột ngày) */
  followUpDate: string | null;
}

export interface PrescriptionItem {
  id: string;
  quantity: number;
  dosePerTime: string;
  timesPerDay: number;
  days: number;
  note: string | null;
  medicine: { id: string; name: string; activeIngredient: string | null; strength: string | null; unit: string };
}

export interface Prescription {
  id: string;
  /** Mã đơn thuốc, cấp khi hoàn tất đơn */
  code: string | null;
  status: 'DRAFT' | 'FINALIZED';
  advice: string | null;
  createdAt: string;
  finalizedAt: string | null;
  replacesId: string | null;
  items: PrescriptionItem[];
}

/** Tệp kết quả; `url` (tương đối với API) có chữ ký, hết hạn sau 1 giờ */
export interface LabFile {
  id: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  size: number;
  createdAt: string;
  url: string;
}

/** Một chỉ định cận lâm sàng và kết quả */
export interface LabOrder {
  id: string;
  name: string;
  note: string | null;
  resultText: string | null;
  /** Lúc trả kết quả; null = chưa có kết quả */
  doneAt: string | null;
  createdAt: string;
  files: LabFile[];
}

/** Sinh hiệu điều dưỡng đo khi bệnh nhân chờ khám */
export interface Vitals {
  pulse: number | null;
  temperature: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  respiratoryRate: number | null;
  spo2: number | null;
  weight: number | null;
  height: number | null;
  note: string | null;
  measuredAt: string;
  measuredBy: { id: string; fullName: string } | null;
}

export interface VisitDetail extends Omit<Visit, 'labOrders'> {
  medicalRecord: MedicalRecord | null;
  /** Có ở bác sĩ/admin: sinh hiệu đo trước (null = chưa đo) */
  vitals?: Vitals | null;
  /** Lịch tái khám bác sĩ đã đặt sẵn (null = chưa đặt) */
  followUpAppointment?: Appointment | null;
  prescriptions?: Prescription[];
  prescription: Prescription | null;
  labOrders: LabOrder[];
}

/** Lịch đặt online chờ lễ tân duyệt, kèm thông tin giúp nhận ra đặt lịch hàng loạt */
export interface PendingAppointment extends Appointment {
  patientInfo: {
    dateOfBirth: string;
    gender: Gender;
    accountCreatedAt: string | null;
    completed: number;
    noShow: number;
    cancelled: number;
    rejected: number;
    /** Số lịch đang chờ duyệt của cùng người */
    waiting: number;
  };
}

/** Ca khám của bác sĩ: các khung giờ liền nhau trong một ngày được gộp lại */
export interface DoctorShift {
  date: string;
  startTime: string;
  endTime: string;
  slots: number;
  booked: number;
}

/** Ca trực của lễ tân do admin xếp */
export interface StaffShift {
  id: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
}

/** GET /work-schedule: lịch làm việc của bác sĩ và lễ tân trong khoảng ngày */
export interface WorkSchedule {
  from: string;
  to: string;
  doctors: {
    id: string;
    fullName: string;
    title: string | null;
    room: string | null;
    specialty: { id: string; name: string };
    shifts: DoctorShift[];
  }[];
  receptionists: { id: string; fullName: string; phone: string; shifts: StaffShift[] }[];
  nurses?: { id: string; fullName: string; phone: string; shifts: StaffShift[] }[];
}

/** Một mốc trong lịch sử bệnh án: lần lưu bệnh án hoặc mốc đơn thuốc */
export type RecordEvent =
  | {
      kind: 'RECORD';
      id: string;
      version: number;
      /** BASELINE = nội dung đã có trước khi hệ thống ghi lịch sử */
      action: 'CREATE' | 'UPDATE' | 'BASELINE';
      at: string;
      afterDone: boolean;
      editedBy: { id: string; fullName: string; role: Role } | null;
      changes: { field: keyof MedicalRecord; before: string | number | null; after: string | number | null }[];
    }
  | { kind: 'PRESCRIPTION'; id: string; action: 'FINALIZED' | 'REPLACED'; at: string; code: string | null };

/** GET /admin/records */
export type AdminRecordRow = Visit & {
  medicalRecord: Pick<MedicalRecord, 'diagnosis' | 'icdCode' | 'followUpDate'>;
  recordUpdatedAt: string;
  history: { revisions: number; editedAfterDone: boolean };
};

/** GET /admin/reviews */
export interface AdminReview {
  id: string;
  visitId: string;
  rating: number;
  comment: string | null;
  hidden: boolean;
  hiddenReason: string | null;
  createdAt: string;
  updatedAt: string;
  patient: { id: string; fullName: string };
  doctor: { id: string; title: string | null; user: { fullName: string } };
}
