import { ImageResponse } from 'next/og';

export const alt = 'Al-Rahma Mosque Borlänge — New Minaret & Hall Fund';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// 1200×630 share image (WhatsApp, Facebook, X). Brand colours only, no photos.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: 80, background: 'linear-gradient(135deg,#1a3c21 0%,#0e2a14 70%)', color: '#f6f4ec'
        }}
      >
        <div style={{ fontSize: 34, color: '#e3c25a', fontWeight: 700, letterSpacing: 2 }}>AL-RAHMA MOSQUE · BORLÄNGE</div>
        <div style={{ fontSize: 88, fontWeight: 800, lineHeight: 1.1, marginTop: 24 }}>New Minaret &amp; Hall Fund</div>
        <div style={{ fontSize: 38, marginTop: 32, color: '#cdd8cb' }}>Give by Swish, bank transfer or a monthly plan</div>
        <div style={{ fontSize: 34, marginTop: 56, color: '#0e2a14', background: '#e3c25a', padding: '16px 36px', borderRadius: 16, alignSelf: 'flex-start', fontWeight: 800 }}>
          donera.alrahmaborlange.se
        </div>
      </div>
    ),
    size
  );
}
