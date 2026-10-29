'use client';

import type { User } from '@masterly/contracts';
import { ArrowLeft, MessageSquareLock, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { errorMessage } from '@/shared/api';
import { Button, Field, Input } from '@/shared/ui';
import { useRequestOtp, useVerifyOtp } from '../model/use-auth';

/** «+7 (999) 123-45-67» по мере ввода. */
function formatPhoneInput(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('8') || digits.startsWith('7')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)];
  let result = '+7';
  if (parts[0]) result += ` (${parts[0]}`;
  if (parts[0]?.length === 3) result += ')';
  if (parts[1]) result += ` ${parts[1]}`;
  if (parts[2]) result += `-${parts[2]}`;
  if (parts[3]) result += `-${parts[3]}`;
  return result;
}

export function PhoneLoginForm({ onSuccess }: { onSuccess?: (user: User) => void }) {
  const t = useTranslations('auth');
  const [phone, setPhone] = useState('+7');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<{ requestId: string; phoneMasked: string; demoCode: string | null; resendAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!challenge) return;
    codeRef.current?.focus();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  const sendCode = (event?: FormEvent) => {
    event?.preventDefault();
    requestOtp.mutate(phone, {
      onSuccess: (result) =>
        setChallenge({ requestId: result.requestId, phoneMasked: result.phoneMasked, demoCode: result.demoCode, resendAt: Date.now() + result.resendInSec * 1000 }),
    });
  };

  const verify = (value: string) => {
    if (!challenge || value.length < 4) return;
    verifyOtp.mutate({ requestId: challenge.requestId, code: value }, { onSuccess: (session) => session.user && onSuccess?.(session.user) });
  };

  if (!challenge) {
    return (
      <form onSubmit={sendCode} className="flex flex-col gap-4">
        <Field label={t('phone')} htmlFor="login-phone" error={requestOtp.error ? errorMessage(requestOtp.error) : undefined}>
          <Input
            id="login-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            inputSize="lg"
            leading={<Phone />}
            placeholder={t('phonePlaceholder')}
            value={phone}
            onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
            invalid={Boolean(requestOtp.error)}
          />
        </Field>
        <Button type="submit" size="lg" loading={requestOtp.isPending} disabled={phone.replace(/\D/g, '').length < 11}>
          {t('sendCode')}
        </Button>
        <p className="text-xs leading-relaxed text-subtle">{t('consent')}</p>
      </form>
    );
  }

  const resendIn = Math.max(0, Math.ceil((challenge.resendAt - now) / 1000));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('codeSent', { phone: challenge.phoneMasked })}</p>
      {challenge.demoCode ? (
        <div className="flex items-center gap-2 rounded-2xl border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-sm font-semibold">
          <MessageSquareLock className="size-4 text-accent" aria-hidden />
          {t('demoCode', { code: challenge.demoCode })}
        </div>
      ) : null}
      <Field label={t('code')} htmlFor="login-code" error={verifyOtp.error ? errorMessage(verifyOtp.error) : undefined}>
        <Input
          ref={codeRef}
          id="login-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          inputSize="lg"
          maxLength={6}
          className="text-center text-2xl font-bold tracking-[0.6em]"
          value={code}
          onChange={(event) => {
            const value = event.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(value);
            if (value.length === 4) verify(value);
          }}
          invalid={Boolean(verifyOtp.error)}
        />
      </Field>
      <Button size="lg" loading={verifyOtp.isPending} disabled={code.length < 4} onClick={() => verify(code)}>
        {t('verify')}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <Button variant="ghost" size="sm" onClick={() => setChallenge(null)}>
          <ArrowLeft />
          {t('changePhone')}
        </Button>
        <Button variant="link" size="sm" disabled={resendIn > 0} onClick={() => sendCode()}>
          {resendIn > 0 ? t('resendIn', { seconds: resendIn }) : t('resend')}
        </Button>
      </div>
    </div>
  );
}
