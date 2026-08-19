export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function formatDateRange(startDate: string | null, endDate: string | null): string | null {
  if (!startDate || !endDate) return null;
  if (startDate === endDate) return startDate;
  return `${startDate} ~ ${endDate}`;
}

export function formatDateTime(dateTimeStr: string | null): string | null {
  if (!dateTimeStr) return null;
  const date = new Date(dateTimeStr);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
