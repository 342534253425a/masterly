import { ImageResponse } from 'next/og';

const SIZES: Record<string, number> = { 'icon-192.png': 192, 'icon-512.png': 512 };

export function generateStaticParams() {
  return Object.keys(SIZES).map((file) => ({ file }));
}

/** PNG-иконки PWA генерируются из кода (без бинарников в репозитории). */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const size = SIZES[file];
  if (!size) return new Response('Not found', { status: 404 });
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #6a5cff 0%, #8b5cf6 50%, #c58cff 100%)' }}>
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 40 40">
          <path d="M14.2 20.2V12.6l5.8 5.2 5.8-5.2v7.6" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 4c-6.6 0-12 5.2-12 11.8 0 8.6 10.2 18 11.1 18.8a1.4 1.4 0 0 0 1.8 0C21.8 33.8 32 24.4 32 15.8 32 9.2 26.6 4 20 4Z" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.6" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
