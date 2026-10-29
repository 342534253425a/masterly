/** Русская плюрализация: plural(5, 'год', 'года', 'лет') → «лет». */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function warrantyLabel(days: number): string {
  if (days >= 365) return 'год';
  if (days >= 180) return 'полгода';
  if (days >= 30) {
    const months = Math.round(days / 30);
    return months === 1 ? 'месяц' : `${months} ${plural(months, 'месяц', 'месяца', 'месяцев')}`;
  }
  return `${days} ${plural(days, 'день', 'дня', 'дней')}`;
}
