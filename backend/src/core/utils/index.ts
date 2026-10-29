import { z } from 'zod';

// Common validation schemas
export const emailSchema = z.string().email();
export const uuidSchema = z.string().uuid();
export const phoneSchema = z.string().regex(/^\+?[0-9]{10,15}$/);

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Sorting
export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
  };
}

export function errorResponse(error: string, message?: string): ApiResponse {
  return {
    success: false,
    error,
    message,
  };
}

// Paginated response
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// Price utilities (all prices stored in smallest unit - Toman for IRT)
export function formatPrice(amount: number, currency: string = 'IRT'): string {
  if (currency === 'IRT') {
    return `${amount.toLocaleString('fa-IR')} تومان`;
  }
  return `${amount.toLocaleString()} ${currency}`;
}

export function parsePrice(amount: number): number {
  return Math.floor(amount);
}

// Date utilities
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function daysUntil(date: Date): number {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
