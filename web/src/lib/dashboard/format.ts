const numberFormatter = new Intl.NumberFormat("ko-KR");
const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function formatAmount(value: number | null) {
  return value === null ? "—" : `${formatNumber(value)}원`;
}

export function formatTime(value: string) {
  return timeFormatter.format(new Date(value));
}
