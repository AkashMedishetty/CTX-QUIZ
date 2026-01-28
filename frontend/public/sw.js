/**
 * Service Worker for CTX Quiz
 * 
 * Provides offline functionality for the Participant App:
 * - Caches static assets (HTML, CSS, JS, fonts, images)
 * - Uses cache-first strategy for static assets
 * - Uses network-first strategy for API calls
 * - Enables offline access to the quiz interface
 * 
 * Requirements: 14.10
 */

const CACHE_NAME = 'ctx-quiz-v1';
const STATIC_CACHE_NAME = 'ctx-quiz-static-v1';
const DYNAMIC_CACHE_NAME = 'ctx-quiz-dynamic-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/join',
  '/manifest.json',
  // Next.js will generate these, but we'll cache them dynamically
];

// Patterns for assets that should be cached
const CACHEABLE_PATTERNS = [
  /\/_next\/static\/.*/,  // Next.js static assets
  /\/fonts\/.*/,          // Fonts
  /\/icons\/.*/,          // Icons
  /\.(?:js|css|woff2?|ttf|otf|eot)$/,  // JS, CSS, fonts
];

// Patterns for requests that should never be cached
const NEVER_CACHE_PATTERNS = [
  /\/api\//,              // API calls
  /socket\.io/,           // WebSocket connections
  /\/_next\/webpack-hmr/, // Hot module replacement
];

/**
 * Install event - cache static assets
 */
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[ServiceWorker] Static assets cached');
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[ServiceWorker] Failed to cache static assets:', error);
      })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete old versions of our caches
              return name.startsWith('ctx-quiz-') && 
                     name !== STATIC_CACHE_NAME && 
                     name !== DYNAMIC_CACHE_NAME;
            })
            .map((name) => {
              console.log('[ServiceWorker] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Activated');
        // Take control of all clients immediately
        return self.clients.claim();
      })
  );
});

/**
 * Check if a request should be cached
 */
function shouldCache(request) {
  const url = new URL(request.url);
  
  // Never cache non-GET requests
  if (request.method !== 'GET') {
    return false;
  }
  
  // Never cache patterns
  for (const pattern of NEVER_CACHE_PATTERNS) {
    if (pattern.test(url.pathname) || pattern.test(url.href)) {
      return false;
    }
  }
  
  // Check if it matches cacheable patterns
  for (const pattern of CACHEABLE_PATTERNS) {
    if (pattern.test(url.pathname) || pattern.test(url.href)) {
      return true;
    }
  }
  
  // Cache same-origin navigation requests (HTML pages)
  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    return true;
  }
  
  return false;
}

/**
 * Fetch event - serve from cache or network
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip WebSocket and API requests
  for (const pattern of NEVER_CACHE_PATTERNS) {
    if (pattern.test(url.pathname) || pattern.test(url.href)) {
      return;
    }
  }
  
  // For navigation requests (HTML pages), use network-first strategy
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, DYNAMIC_CACHE_NAME)
    );
    return;
  }
  
  // For static assets, use cache-first strategy
  if (shouldCache(request)) {
    event.respondWith(
      cacheFirst(request, DYNAMIC_CACHE_NAME)
    );
    return;
  }
});

/**
 * Cache-first strategy
 * Try cache first, fall back to network
 */
async function cacheFirst(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      // Return cached response and update cache in background
      updateCache(request, cacheName);
      return cachedResponse;
    }
    
    // Not in cache, fetch from network
    const networkResponse = await fetch(request);
    
    // Cache the response if it's valid
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[ServiceWorker] Cache-first failed:', error);
    
    // Try to return cached response as fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    
    throw error;
  }
}

/**
 * Network-first strategy
 * Try network first, fall back to cache
 */
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache the response if it's valid
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[ServiceWorker] Network failed, trying cache:', request.url);
    
    // Network failed, try cache
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // For navigation requests, return the cached home page
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/');
      if (fallback) {
        return fallback;
      }
    }
    
    // Return a basic offline response
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Update cache in background (stale-while-revalidate)
 */
async function updateCache(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse);
    }
  } catch (error) {
    // Silently fail - we already have a cached version
  }
}

/**
 * Handle messages from the main thread
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => caches.delete(name))
        );
      })
    );
  }
});

console.log('[ServiceWorker] Script loaded');
