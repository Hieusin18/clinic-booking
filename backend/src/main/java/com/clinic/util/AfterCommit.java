package com.clinic.util;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Chạy việc phụ (báo realtime, gửi thông báo) sau khi transaction hiện tại đã ghi xong, để máy khách nhận sự kiện
 * rồi gọi API là thấy dữ liệu mới. Không có transaction thì chạy ngay.
 */
public final class AfterCommit {
  private AfterCommit() {}

  public static void run(Runnable task) {
    if (TransactionSynchronizationManager.isSynchronizationActive() && TransactionSynchronizationManager.isActualTransactionActive()) {
      TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
        @Override
        public void afterCommit() {
          safe(task);
        }
      });
    } else {
      safe(task);
    }
  }

  private static void safe(Runnable task) {
    try {
      task.run();
    } catch (RuntimeException e) {
      org.slf4j.LoggerFactory.getLogger(AfterCommit.class).warn("Việc phụ sau khi ghi dữ liệu bị lỗi: {}", e.toString());
    }
  }
}
