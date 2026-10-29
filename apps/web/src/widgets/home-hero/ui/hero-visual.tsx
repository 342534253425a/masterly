import { BadgeCheck, Clock, MapPin, Star } from 'lucide-react';
import { DeviceIllustration, GlowOrb } from '@/shared/ui';

/** Декоративная композиция героя: «парящие» устройства и карточки предложений (только desktop). */
export function HeroVisual() {
  return (
    <div className="relative hidden h-[460px] lg:block" aria-hidden>
      <GlowOrb className="absolute left-10 top-10 size-80" hue={262} />
      <GlowOrb className="absolute bottom-0 right-0 size-64" hue={220} />
      <DeviceIllustration variant="screen" hue={262} className="absolute left-[18%] top-[6%] h-[360px] w-auto animate-float drop-shadow-[0_40px_60px_rgb(80_40_200/0.35)]" />
      <DeviceIllustration variant="battery" hue={152} className="absolute right-[2%] top-[38%] h-[190px] w-auto animate-float [animation-delay:-2.5s]" />
      <DeviceIllustration variant="water" hue={200} className="absolute bottom-[2%] left-[2%] h-[150px] w-auto animate-float [animation-delay:-4s]" />

      <div className="glass absolute right-[4%] top-[4%] w-60 rounded-3xl border border-line-strong p-4 shadow-float animate-rise [animation-delay:0.25s]">
        <div className="text-xs font-semibold text-muted">Замена дисплея · iPhone 15</div>
        <div className="mt-1 text-2xl font-extrabold tracking-tight">от 9 400 ₽</div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-success">
          <span className="size-1.5 rounded-full bg-success" /> 54 мастера рядом
        </div>
      </div>

      <div className="glass absolute bottom-[14%] right-[10%] flex w-64 items-center gap-3 rounded-3xl border border-line-strong p-3.5 shadow-float animate-rise [animation-delay:0.45s]">
        <span className="flex size-11 items-center justify-center rounded-[30%] bg-[linear-gradient(135deg,hsl(205_85%_62%),hsl(240_78%_52%))] text-sm font-bold text-white">IL</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-sm font-bold">
            iFix Lab <BadgeCheck className="size-4 text-info" />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-0.5">
              <Star className="size-3 fill-amber-400 text-amber-400" strokeWidth={0} /> 4.9
            </span>
            <span className="inline-flex items-center gap-0.5">
              <Clock className="size-3" /> ~8 мин
            </span>
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="size-3" /> 1,2 км
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
