import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** Format a date/time in Korea Standard Time (UTC+9). */
export function formatKST(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export function statusColor(status: string): string {
  switch (status) {
    case 'in_progress': return 'bg-blue-100 text-blue-800'
    case 'completed': return 'bg-green-100 text-green-800'
    case 'rejected': return 'bg-red-100 text-red-800'
    case 'cancelled': return 'bg-gray-100 text-gray-600'
    case 'published': return 'bg-green-100 text-green-800'
    case 'draft': return 'bg-gray-100 text-gray-700'
    case 'archived': return 'bg-yellow-100 text-yellow-800'
    default: return 'bg-gray-100 text-gray-700'
  }
}
