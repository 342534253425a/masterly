import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 16, background: 'linear-gradient(135deg, #6a5cff, #b67cff)' }}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          <path d="M12.5 26V13l7.5 6.7L27.5 13v13" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
