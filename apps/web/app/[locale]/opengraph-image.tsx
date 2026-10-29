import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Masterly — trusted repair specialists nearby';

/** Динамическая OG-картинка (Satori). Для кириллицы в продакшене подключается шрифт Manrope из CDN. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: 'radial-gradient(circle at 15% 10%, #3b2a8f 0%, #06060c 55%)', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 22, background: 'linear-gradient(135deg, #6a5cff, #c58cff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 800 }}>M</div>
          <div style={{ fontSize: 44, fontWeight: 800 }}>Masterly</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Trusted repair specialists</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: '#b593ff' }}>in minutes</div>
        </div>
        <div style={{ fontSize: 28, color: '#a3a3bd' }}>Moscow · Saint Petersburg · Krasnodar · no commission</div>
      </div>
    ),
    size,
  );
}
