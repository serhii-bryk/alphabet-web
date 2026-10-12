/**
 * PWA foundation only. A future service worker should be versioned independently,
 * cache immutable shell assets only after explicit review, and never cache personalized
 * responses. Push and background synchronization are intentionally not implemented.
 */
export const pwaConfig = { startUrl: '/en/casino', display: 'standalone' } as const;
