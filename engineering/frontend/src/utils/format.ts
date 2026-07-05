/** 将后端 UTC 时间字符串格式化为本地时间，返回 "YYYY-MM-DD HH:MM" */
export const formatDateTime = (dt: string | null): string => {
  if (!dt) return '-';
  const dateStr = dt.endsWith('Z') ? dt : dt + 'Z';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};
