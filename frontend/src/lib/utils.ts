/**
 * Utility functions for the CTX Quiz frontend
 * 
 * Provides common utilities including:
 * - cn() for merging Tailwind CSS classes
 * - formatTime() for timer display
 * - formatScore() for score display
 * - generateId() for unique IDs
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper precedence
 * 
 * Combines clsx for conditional classes with tailwind-merge
 * to handle conflicting Tailwind classes properly.
 * 
 * @param inputs - Class values to merge
 * @returns Merged class string
 * 
 * @example
 * ```tsx
 * cn('px-4 py-2', 'px-6') // => 'py-2 px-6'
 * cn('text-red-500', isActive && 'text-green-500')
 * cn('base-class', { 'conditional-class': condition })
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format seconds into MM:SS display format
 * 
 * @param seconds - Number of seconds
 * @returns Formatted time string (e.g., "01:30")
 * 
 * @example
 * ```ts
 * formatTime(90) // => "01:30"
 * formatTime(5) // => "00:05"
 * formatTime(0) // => "00:00"
 * ```
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.max(0, seconds) % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds into a human-readable string
 * 
 * @param seconds - Number of seconds
 * @returns Human-readable time string
 * 
 * @example
 * ```ts
 * formatTimeHuman(90) // => "1m 30s"
 * formatTimeHuman(5) // => "5s"
 * formatTimeHuman(3600) // => "1h 0m"
 * ```
 */
export function formatTimeHuman(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Format a score number with thousands separators
 * 
 * @param score - Score number
 * @returns Formatted score string
 * 
 * @example
 * ```ts
 * formatScore(1234567) // => "1,234,567"
 * formatScore(100) // => "100"
 * ```
 */
export function formatScore(score: number): string {
  return score.toLocaleString('en-US');
}

/**
 * Format a percentage value
 * 
 * @param value - Value (0-1 or 0-100)
 * @param isDecimal - Whether the value is a decimal (0-1)
 * @param decimals - Number of decimal places
 * @returns Formatted percentage string
 * 
 * @example
 * ```ts
 * formatPercentage(0.75, true) // => "75%"
 * formatPercentage(75, false) // => "75%"
 * formatPercentage(0.756, true, 1) // => "75.6%"
 * ```
 */
export function formatPercentage(
  value: number,
  isDecimal: boolean = true,
  decimals: number = 0
): string {
  const percentage = isDecimal ? value * 100 : value;
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * Generate a unique ID
 * 
 * @param prefix - Optional prefix for the ID
 * @returns Unique ID string
 * 
 * @example
 * ```ts
 * generateId() // => "id_abc123xyz"
 * generateId('btn') // => "btn_abc123xyz"
 * ```
 */
export function generateId(prefix: string = 'id'): string {
  const random = Math.random().toString(36).substring(2, 11);
  return `${prefix}_${random}`;
}

/**
 * Truncate text to a maximum length with ellipsis
 * 
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 * 
 * @example
 * ```ts
 * truncateText('Hello World', 5) // => "Hello..."
 * truncateText('Hi', 5) // => "Hi"
 * ```
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/**
 * Debounce a function
 * 
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function
 * 
 * @param fn - Function to throttle
 * @param limit - Time limit in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Sleep for a specified duration
 * 
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if code is running on the client side
 */
export function isClient(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Check if code is running on the server side
 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 * 
 * @param n - Number
 * @returns Number with ordinal suffix
 * 
 * @example
 * ```ts
 * getOrdinal(1) // => "1st"
 * getOrdinal(2) // => "2nd"
 * getOrdinal(3) // => "3rd"
 * getOrdinal(4) // => "4th"
 * getOrdinal(11) // => "11th"
 * getOrdinal(21) // => "21st"
 * ```
 */
export function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Clamp a number between min and max values
 * 
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * 
 * @param start - Start value
 * @param end - End value
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * clamp(t, 0, 1);
}

/**
 * Map a value from one range to another
 * 
 * @param value - Value to map
 * @param inMin - Input range minimum
 * @param inMax - Input range maximum
 * @param outMin - Output range minimum
 * @param outMax - Output range maximum
 * @returns Mapped value
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}


/**
 * Get the full URL for an image path
 * 
 * Converts relative image paths (like /uploads/filename.png) to full URLs
 * using the API base URL.
 * 
 * @param imagePath - Relative or absolute image path
 * @returns Full image URL
 * 
 * @example
 * ```ts
 * getImageUrl('/uploads/image.png') // => "http://localhost:3001/uploads/image.png"
 * getImageUrl('https://example.com/image.png') // => "https://example.com/image.png"
 * ```
 */
export function getImageUrl(imagePath: string | undefined): string | undefined {
  if (!imagePath) {
    console.log('[getImageUrl] No image path provided');
    return undefined;
  }
  
  // If already a full URL, return as-is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    console.log('[getImageUrl] Already full URL:', imagePath);
    return imagePath;
  }
  
  // Get the API base URL (without /api suffix for static files)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  const baseUrl = apiUrl.replace(/\/api$/, '');
  
  // Ensure path starts with /
  const path = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  
  const fullUrl = `${baseUrl}${path}`;
  console.log('[getImageUrl] Converted path:', { original: imagePath, fullUrl });
  
  return fullUrl;
}


/**
 * Preload an image by creating an Image object
 * 
 * This helps ensure images are cached before they're needed,
 * reducing loading time when displaying questions.
 * 
 * @param imageUrl - URL of the image to preload
 * @returns Promise that resolves when image is loaded
 * 
 * @example
 * ```ts
 * await preloadImage('/uploads/question-image.png');
 * ```
 */
export function preloadImage(imageUrl: string | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (!imageUrl) {
      resolve();
      return;
    }
    
    const fullUrl = getImageUrl(imageUrl);
    if (!fullUrl) {
      resolve();
      return;
    }
    
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve(); // Resolve even on error to not block
    img.src = fullUrl;
  });
}

/**
 * Preload multiple images in parallel
 * 
 * @param imageUrls - Array of image URLs to preload
 * @returns Promise that resolves when all images are loaded
 * 
 * @example
 * ```ts
 * await preloadImages(['/uploads/q1.png', '/uploads/q2.png']);
 * ```
 */
export function preloadImages(imageUrls: (string | undefined)[]): Promise<void[]> {
  return Promise.all(imageUrls.map(preloadImage));
}
