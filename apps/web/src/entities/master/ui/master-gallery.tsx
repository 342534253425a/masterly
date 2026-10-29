'use client';

import type { MasterCard } from '@masterly/contracts';
import { Images } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { illustrationFor } from '@/entities/catalog/@x/master';
import { cn } from '@/shared/lib';
import { DeviceIllustration } from '@/shared/ui';
import { MasterAvatar } from './master-bits';

/**
 * Галерея работ в карточке (как на Авито): на десктопе кадр меняется движением мыши по превью,
 * на телефоне — свайпом (scroll-snap). Без работ — аватар мастерской на фирменном градиенте.
 */
export function MasterGallery({ master, overlay, onOpen, className }: { master: MasterCard; overlay?: ReactNode; onOpen?: () => void; className?: string }) {
  const [active, setActive] = useState(0);
  const shots = master.gallery;
  const hueOf = (index: number) => (master.hue + index * 25) % 360;

  return (
    <div
      className={cn('group/gallery relative isolate overflow-hidden rounded-2xl bg-surface-2', onOpen && 'cursor-pointer', className)}
      // Клик по фото открывает мастера (как на Авито); кнопки поверх фото (избранное) работают сами
      onClick={(event) => {
        if (onOpen && !(event.target as HTMLElement).closest('button, a')) onOpen();
      }}
    >
      {shots.length === 0 ? (
        <div className="flex size-full items-center justify-center" style={{ background: `radial-gradient(90% 80% at 50% 30%, hsl(${master.hue} 70% 55% / 0.28), transparent 70%)` }}>
          <MasterAvatar master={master} size="xl" />
        </div>
      ) : (
        <>
          {/* Телефон: лента со свайпом */}
          <div
            className="flex size-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
            onScroll={(event) => setActive(Math.round(event.currentTarget.scrollLeft / Math.max(1, event.currentTarget.clientWidth)))}
          >
            {shots.map((shot, index) => (
              <Shot key={shot.id} serviceId={shot.serviceId} caption={shot.caption} hue={hueOf(index)} className="w-full shrink-0 snap-center" />
            ))}
          </div>
          {/* Десктоп: кадр под курсором — зоны по ширине превью */}
          <div className="absolute inset-0 hidden sm:block" onMouseLeave={() => setActive(0)}>
            {shots.map((shot, index) => (
              <Shot key={shot.id} serviceId={shot.serviceId} caption={shot.caption} hue={hueOf(index)} className={cn('absolute inset-0 transition-opacity duration-200', index === active ? 'opacity-100' : 'opacity-0')} />
            ))}
            <div className="absolute inset-0 z-10 flex">
              {shots.map((shot, index) => (
                <span key={shot.id} className="h-full flex-1" onMouseEnter={() => setActive(index)} />
              ))}
            </div>
          </div>
          {shots.length > 1 ? (
            <div className="pointer-events-none absolute inset-x-2.5 bottom-2 z-20 flex gap-1">
              {shots.map((shot, index) => (
                <span key={shot.id} className={cn('h-[3px] flex-1 rounded-full transition-colors', index === active ? 'bg-white' : 'bg-white/40')} />
              ))}
            </div>
          ) : null}
          {master.photosCount > shots.length ? (
            <span className="pointer-events-none absolute bottom-4 right-2.5 z-20 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
              <Images className="size-3" aria-hidden />
              {master.photosCount}
            </span>
          ) : null}
        </>
      )}
      {overlay ? <div className="pointer-events-none absolute inset-0 z-30 [&>*]:pointer-events-auto">{overlay}</div> : null}
    </div>
  );
}

function Shot({ serviceId, caption, hue, className }: { serviceId: string; caption: string; hue: number; className?: string }) {
  return (
    <figure className={cn('relative size-full', className)}>
      <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(90% 80% at 50% 30%, hsl(${hue} 70% 50% / 0.3), transparent 72%)` }} />
      <DeviceIllustration variant={illustrationFor(serviceId)} hue={hue} className="absolute inset-0 m-auto size-[82%]" title={caption} />
    </figure>
  );
}
