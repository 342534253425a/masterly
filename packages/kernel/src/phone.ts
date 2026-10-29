/** Нормализация российского номера в E.164: «8 (999) 123-45-67» → «+79991234567». */
export function normalizeRuPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) digits = digits.slice(1);
  // Коды городов в РФ начинаются с 3/4/8, мобильные — с 9
  if (digits.length !== 10 || !/^[3489]/.test(digits)) return null;
  return `+7${digits}`;
}

export function formatRuPhone(e164: string): string {
  const d = e164.replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return e164;
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

/** Маскирование контакта до явного согласия клиента/мастера на обмен контактами. */
export function maskPhone(e164: string): string {
  const d = e164.replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return '•••';
  return `+7 ${d.slice(0, 3)} •••-••-${d.slice(8)}`;
}
