/** Kiểu dữ liệu trả về từ backend (xem Swagger tại /api/docs). */

export type Role = 'PATIENT' | 'RECEPTIONIST' | 'DOCTOR' | 'ADMIN';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type VisitStatus = 'WAITING' | 'IN_PROGRESS' | 'DONE' | 'LEFT';
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

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
}

export interface Specialty {
  id: string;
  name: string;
  description: string | null;
  _count?: { doctors: number };
}

/** Một mốc trong quá trình đào tạo hoặc công tác; toYear null = đến nay */
export interface HistoryItem {
  id: string;
  fromYear: number;
  toYear: number | null;
  title: string;
  place: string;
}

/** Bác sĩ theo API công khai (không có SĐT, email) */
export interface Doctor {
  id: string;
  title: string | null;
  bio: string | null;
  practiceSince: number | null;
  experienceYears: number | null;
  /** Thế mạnh chuyên môn */
  expertise: string[];
  /** Phiên bản ảnh đại diện; null = chưa có ảnh */
  avatarVersion: number | null;
  specialty: { id: string; name: string };
  user: { fullName: string };
  /** Có khi xem hồ sơ (GET /doctors/:id) */
  education?: HistoryItem[];
  career?: HistoryItem[];
}

/** Số giờ còn trống của bác sĩ trong một ngày */
export interface DayAvailability {
  date: string;
  free: number;
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
  createdAt: string;
  patient: { id: string; fullName: string; phone: string; dateOfBirth: string; gender: Gender; allergies: string | null };
  doctor: DoctorRef;
}

/** Vị trí trong hàng đợi, tính theo đúng quy tắc gọi số của phòng khám */
export interface QueuePosition {
  visit: Visit;
  /** A01 (đặt lịch) hoặc B03 (vãng lai) */
  label: string;
  peopleAhead: number;
  estimatedCallAt: string | null;
  /** Người đặt lịch đã đến giờ hẹn, đang được ưu tiên */
  due: boolean;
  currentLabel: string | null;
}

/** Số lần không đến gần đây và hạn khóa đặt lịch online */
export interface BookingStanding {
  recentNoShows: number;
  limit: number;
  windowDays: number;
  /** Ngày cuối bị khóa (YYYY-MM-DD) */
  lockedUntil: string | null;
}

export interface Appointment {
  id: string;
  status: AppointmentStatus;
  reason: string | null;
  createdAt: string;
  schedule: { id: string; startTime: string; endTime: string; doctor: DoctorRef };
  patient: { id: string; fullName: string; phone: string };
  visit?: { id: string; queueNumber: number; source: 'ONLINE' | 'WALK_IN'; status: VisitStatus } | null;
  /** Có ở /appointments/mine: khung giờ được check-in */
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

export interface VisitDetail extends Visit {
  medicalRecord: MedicalRecord | null;
  prescriptions?: Prescription[];
  prescription: Prescription | null;
}
