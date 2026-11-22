/**
 * Module quản lý lịch hẹn nhắc nhở và tạo liên kết Google Calendar an toàn.
 * Tuyệt đối không đưa email/username, mật khẩu hoặc ghi chú nhạy cảm vào URL Google Calendar.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MyNoteReminder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  function pad2(num) {
    return String(num).padStart(2, '0');
  }

  function toDatetimeLocalValue(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';

    const yyyy = date.getFullYear();
    const mm = pad2(date.getMonth() + 1);
    const dd = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const min = pad2(date.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }

  function fromDatetimeLocalValue(localValue) {
    if (!localValue || !String(localValue).trim()) return '';
    const date = new Date(localValue);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
  }

  function formatReminderDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';

    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(
      date.getHours()
    )}:${pad2(date.getMinutes())}`;
  }

  function getReminderStatus(item, nowMs = Date.now()) {
    if (!item || !item.remindAt) {
      return { state: 'none', label: '', ts: 0, daysLeft: null };
    }

    const ts = Date.parse(item.remindAt);
    if (Number.isNaN(ts)) {
      return { state: 'none', label: '', ts: 0, daysLeft: null };
    }

    if (item.remindDone) {
      return { state: 'done', label: 'Đã xong', ts, daysLeft: null };
    }

    const diffMs = ts - nowMs;
    if (diffMs <= 0) {
      return { state: 'overdue', label: 'Quá hạn', ts, daysLeft: 0 };
    }

    const daysLeft = Math.ceil(diffMs / ONE_DAY_MS);
    if (diffMs <= SEVEN_DAYS_MS) {
      const label = diffMs < ONE_DAY_MS ? 'Trong 24h tới' : `Còn ${daysLeft} ngày`;
      return { state: 'soon', label, ts, daysLeft };
    }

    return { state: 'scheduled', label: 'Đã đặt lịch', ts, daysLeft };
  }

  function formatGoogleUtcDate(date) {
    return (
      date.getUTCFullYear() +
      pad2(date.getUTCMonth() + 1) +
      pad2(date.getUTCDate()) +
      'T' +
      pad2(date.getUTCHours()) +
      pad2(date.getUTCMinutes()) +
      pad2(date.getUTCSeconds()) +
      'Z'
    );
  }

  function buildGoogleCalendarUrl(item) {
    if (!item || !item.remindAt) return '';
    const start = new Date(item.remindAt);
    if (Number.isNaN(start.getTime())) return '';

    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const title = String(item.title || 'Tài khoản').trim();
    const note = String(item.remindNote || '').trim();

    const eventText = note
      ? `[My Note] ${title} — ${note}`
      : `[My Note] Nhắc xử lý/hủy: ${title}`;

    const detailLines = [
      `Dịch vụ: ${title}`,
      note ? `Việc cần làm: ${note}` : 'Việc cần làm: Kiểm tra hoặc hủy gói/tài khoản đúng hạn.',
      '',
      '(Email, mật khẩu và ghi chú mật được giữ an toàn trong My Note Vault, không gửi sang Google Calendar.)',
    ];

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: eventText,
      dates: `${formatGoogleUtcDate(start)}/${formatGoogleUtcDate(end)}`,
      details: detailLines.join('\n'),
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  return {
    toDatetimeLocalValue,
    fromDatetimeLocalValue,
    formatReminderDate,
    getReminderStatus,
    buildGoogleCalendarUrl,
  };
});
