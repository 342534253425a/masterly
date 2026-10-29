'use client';

import { useEffect, useState } from 'react';

/** Анимированный плейсхолдер: печатает примеры запросов, подсказывая формат ввода. */
export function useTypewriter(phrases: readonly string[], enabled: boolean): string {
  const [text, setText] = useState(phrases[0] ?? '');

  useEffect(() => {
    if (!enabled || phrases.length === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced') return;
    let phrase = 0;
    let index = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = phrases[phrase] ?? '';
      if (!deleting) {
        index++;
        setText(current.slice(0, index));
        if (index >= current.length) {
          deleting = true;
          timer = setTimeout(tick, 1700);
          return;
        }
        timer = setTimeout(tick, 42 + Math.random() * 40);
      } else {
        index--;
        setText(current.slice(0, Math.max(0, index)));
        if (index <= 0) {
          deleting = false;
          phrase = (phrase + 1) % phrases.length;
          timer = setTimeout(tick, 350);
          return;
        }
        timer = setTimeout(tick, 22);
      }
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [enabled, phrases]);

  return text;
}
