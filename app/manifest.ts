import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Al-Rahma Mosque — Donations',
    short_name: 'Al-Rahma',
    description: 'Donate to the Al-Rahma Mosque New Minaret & Hall Fund.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e2a14',
    theme_color: '#0e2a14',
    icons: [
      { src: '/icon.png', sizes: '128x128', type: 'image/png' },
      { src: '/logo.png', sizes: '739x738', type: 'image/png', purpose: 'any' }
    ]
  };
}
