/**
 * Thống kê cho admin (GET /stats/overview?from=YYYY-MM-DD&to=YYYY-MM-DD): tính trực tiếp từ dữ liệu khám.
 *
 * Định nghĩa (ghi rõ để số trên slide giải thích được):
 *  - Lượt tiếp nhận: mọi phiếu số trong kỳ (theo ngày khám); lượt khám xong: trạng thái DONE.
 *  - Thời gian chờ: từ lúc lấy số tới lúc được gọi lần đầu. Với lượt đặt online, tính từ lúc lấy số hoặc
 *    giờ hẹn, mốc nào muộn hơn (đến sớm mà chờ tới giờ hẹn không tính là phải chờ). Dùng trung vị.
 *  - Thời gian khám: từ lúc được gọi tới lúc hoàn tất, chỉ các lượt không đi cận lâm sàng.
 *  - Thời gian có kết quả CLS: từ lúc gửi đi làm tới lúc có kết quả (chế độ quay lại).
 *  - Tỷ lệ không đến: lịch hẹn bị tính "không đến" / lịch hẹn đã tới giờ và không bị hủy.
 *  - Bệnh nhân mới: lần khám đầu tiên ở phòng khám rơi vào kỳ này.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { dateOnly } from '../common/utils/time.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DAY, MAX_RANGE_DAYS, MINUTE, daysBetween, median, percent } from './utils/stats.util.js';

const VN_OFFSET = 7 * 60 * MINUTE;
const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / MINUTE;
const vnHour = (at: Date) => new Date(at.getTime() + VN_OFFSET).getUTCHours();
const doctorLabel = (d: { title: string | null; user: { fullName: string } }) => (d.title ? `${d.title} ${d.user.fullName}` : d.user.fullName);

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(from: string, to: string, now = new Date()) {
    const start = dateOnly(from);
    const end = dateOnly(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('Ngày không hợp lệ');
    const days = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
    if (days < 1) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    if (days > MAX_RANGE_DAYS) throw new BadRequestException(`Chỉ thống kê tối đa ${MAX_RANGE_DAYS} ngày`);

    const current = await this.period(from, to, now);
    // Kỳ trước cùng độ dài, để so sánh tăng/giảm
    const prevTo = new Date(start.getTime() - DAY).toISOString().slice(0, 10);
    const prevFrom = new Date(start.getTime() - days * DAY).toISOString().slice(0, 10);
    const previous = await this.period(prevFrom, prevTo, now);

    return {
      range: { from, to, days },
      previousRange: { from: prevFrom, to: prevTo },
      kpis: current.kpis,
      previous: previous.kpis,
      daily: current.daily,
      hourly: current.hourly,
      doctors: current.doctors,
      diagnoses: current.diagnoses,
      medicines: current.medicines,
      appointments: current.appointments,
      labs: current.labs,
    };
  }

  private async period(from: string, to: string, now: Date) {
    const range = { gte: dateOnly(from), lte: dateOnly(to) };
    const visits = await this.prisma.visit.findMany({
      where: { date: range },
      select: {
        id: true,
        date: true,
        source: true,
        status: true,
        patientId: true,
        doctorId: true,
        appointmentAt: true,
        calledAt: true,
        completedAt: true,
        resultMode: true,
        sentForTestsAt: true,
        resultsReadyAt: true,
        createdAt: true,
        medicalRecord: { select: { icdCode: true, diagnosis: true } },
      },
    });

    // ---- Chỉ số chính ----
    const done = visits.filter((v) => v.status === 'DONE');
    const patientIds = [...new Set(visits.map((v) => v.patientId))];
    const firstVisits = patientIds.length
      ? await this.prisma.visit.groupBy({ by: ['patientId'], where: { patientId: { in: patientIds } }, _min: { date: true } })
      : [];
    const newPatients = firstVisits.filter((f) => f._min.date && f._min.date >= range.gte).length;

    const waitOf = (v: (typeof visits)[number]) => {
      if (!v.calledAt) return null;
      const from = v.source === 'ONLINE' && v.appointmentAt && v.appointmentAt > v.createdAt ? v.appointmentAt : v.createdAt;
      return Math.max(0, minutesBetween(from, v.calledAt));
    };
    const waits = (list: typeof visits) => list.map(waitOf).filter((m): m is number => m !== null);
    const examOf = (v: (typeof visits)[number]) =>
      v.status === 'DONE' && v.calledAt && v.completedAt && !v.resultMode ? minutesBetween(v.calledAt, v.completedAt) : null;
    const exams = (list: typeof visits) => list.map(examOf).filter((m): m is number => m !== null);

    const online = visits.filter((v) => v.source === 'ONLINE');
    const walkIn = visits.filter((v) => v.source === 'WALK_IN');

    // ---- Lịch hẹn ----
    const appts = await this.prisma.appointment.groupBy({
      by: ['status'],
      where: { schedule: { date: range } },
      _count: { _all: true },
    });
    const apptCount = (s: string) => appts.find((a) => a.status === s)?._count._all ?? 0;
    const apptTotal = appts.reduce((n, a) => n + a._count._all, 0);
    // Lịch đã tới giờ (không tính lịch tương lai còn chờ)
    const pastNotCancelled = await this.prisma.appointment.count({
      where: { schedule: { date: range, startTime: { lte: now } }, status: { not: 'CANCELLED' } },
    });

    const kpis = {
      visits: visits.length,
      completed: done.length,
      left: visits.filter((v) => v.status === 'LEFT').length,
      patients: patientIds.length,
      newPatients,
      onlineShare: percent(online.length, visits.length),
      waitMedian: median(waits(visits)),
      waitOnlineMedian: median(waits(online)),
      waitWalkInMedian: median(waits(walkIn)),
      examMedian: median(exams(visits)),
      noShowRate: percent(apptCount('NO_SHOW'), pastNotCancelled),
    };

    // ---- Theo ngày ----
    const byDay = new Map(daysBetween(from, to).map((d) => [d, { date: d, online: 0, walkIn: 0, completed: 0 }]));
    for (const v of visits) {
      const row = byDay.get(v.date.toISOString().slice(0, 10));
      if (!row) continue;
      if (v.source === 'ONLINE') row.online++;
      else row.walkIn++;
      if (v.status === 'DONE') row.completed++;
    }

    // ---- Theo giờ lấy số (giờ Việt Nam) ----
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, online: 0, walkIn: 0 }));
    for (const v of visits) hourly[vnHour(v.createdAt)][v.source === 'ONLINE' ? 'online' : 'walkIn']++;
    const busy = hourly.filter((h) => h.online + h.walkIn > 0).map((h) => h.hour);
    const hourlyTrimmed = busy.length ? hourly.slice(Math.min(7, busy[0]), Math.max(17, busy.at(-1)!) + 1) : hourly.slice(7, 18);

    // ---- Theo bác sĩ ----
    const doctorRows = await this.prisma.doctor.findMany({
      where: { id: { in: [...new Set(visits.map((v) => v.doctorId))] } },
      select: { id: true, title: true, room: true, user: { select: { fullName: true } }, specialty: { select: { name: true } } },
    });
    const doctors = doctorRows
      .map((d) => {
        const mine = visits.filter((v) => v.doctorId === d.id);
        return {
          id: d.id,
          name: doctorLabel(d),
          specialty: d.specialty.name,
          room: d.room,
          visits: mine.length,
          completed: mine.filter((v) => v.status === 'DONE').length,
          waitMedian: median(waits(mine)),
          examMedian: median(exams(mine)),
        };
      })
      .sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name, 'vi'));

    // ---- Chẩn đoán thường gặp (theo mã ICD-10, chưa có mã thì theo tên) ----
    const dx = new Map<string, { code: string | null; name: string; count: number }>();
    for (const v of done) {
      const r = v.medicalRecord;
      if (!r?.diagnosis) continue;
      const key = r.icdCode?.toUpperCase() || r.diagnosis.trim().toLowerCase();
      const row = dx.get(key) ?? { code: r.icdCode?.toUpperCase() ?? null, name: r.diagnosis.trim(), count: 0 };
      row.count++;
      dx.set(key, row);
    }
    const diagnoses = [...dx.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi')).slice(0, 8);

    // ---- Thuốc kê nhiều nhất (đơn đã hoàn tất, không tính đơn đã bị thay) ----
    const items = await this.prisma.prescriptionItem.groupBy({
      by: ['medicineId'],
      where: { prescription: { status: 'FINALIZED', replacedBy: { is: null }, visit: { date: range } } },
      _count: { _all: true },
      _sum: { quantity: true },
      orderBy: { _count: { medicineId: 'desc' } },
      take: 8,
    });
    const meds = await this.prisma.medicine.findMany({ where: { id: { in: items.map((i) => i.medicineId) } }, select: { id: true, name: true, unit: true } });
    const medicines = items.map((i) => {
      const m = meds.find((x) => x.id === i.medicineId);
      return { name: m?.name ?? '?', unit: m?.unit ?? '', prescriptions: i._count._all, quantity: i._sum.quantity ?? 0 };
    });

    // ---- Cận lâm sàng ----
    const sent = visits.filter((v) => v.resultMode);
    const turnaround = sent
      .filter((v) => v.resultMode === 'RETURN' && v.sentForTestsAt && v.resultsReadyAt)
      .map((v) => minutesBetween(v.sentForTestsAt!, v.resultsReadyAt!));
    const labs = {
      visitsWithTests: sent.length,
      returnMode: sent.filter((v) => v.resultMode === 'RETURN').length,
      onlineMode: sent.filter((v) => v.resultMode === 'ONLINE').length,
      turnaroundMedian: median(turnaround),
    };

    return {
      kpis,
      daily: [...byDay.values()],
      hourly: hourlyTrimmed,
      doctors,
      diagnoses,
      medicines,
      appointments: {
        total: apptTotal,
        completed: apptCount('COMPLETED'),
        noShow: apptCount('NO_SHOW'),
        cancelled: apptCount('CANCELLED'),
        upcoming: apptCount('PENDING') + apptCount('CONFIRMED'),
      },
      labs,
    };
  }
}
