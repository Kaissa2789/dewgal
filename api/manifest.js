// Manifeste propre à une conversation : l'appli installée s'ouvre directement dessus
export default function handler(req, res) {
  const t = new URL(req.url, 'http://x').searchParams.get('t') || '';
  const ok = /^[0-9a-f-]{36}$/i.test(t);
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({
    name: 'Dewgal · Messages',
    short_name: 'Dewgal',
    lang: 'fr',
    id: ok ? `/conversation.html?t=${t}` : '/annonces.html',
    start_url: ok ? `/conversation.html?t=${t}` : '/annonces.html',
    scope: '/',
    display: 'standalone',
    background_color: '#2a0d16',
    theme_color: '#2a0d16',
    icons: [
      { src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/assets/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }));
}
