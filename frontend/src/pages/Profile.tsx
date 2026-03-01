import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Sun, Moon, Monitor, Terminal, Check, User } from 'lucide-react'
import { updateProfile } from '@/lib/api'
import { useAuthStore } from '@/hooks/useAuth'
import { useTheme, type Theme } from '@/hooks/useTheme'

function splitName(fullName: string | null | undefined) {
  const parts = (fullName ?? '').trim().split(/\s+/)
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  }
}

const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
  { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
  { value: 'retro', label: 'Retro', icon: <Terminal className="h-4 w-4" /> },
]

export default function Profile() {
  const { user, updateUser } = useAuthStore()
  const { theme, setTheme } = useTheme()

  const initial = splitName(user?.full_name)
  const [firstName, setFirstName] = useState(initial.firstName)
  const [lastName, setLastName] = useState(initial.lastName)
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({ full_name: `${firstName.trim()} ${lastName.trim()}`.trim() }),
    onSuccess: (updatedUser) => {
      updateUser({ full_name: updatedUser.full_name })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const initials =
    (firstName?.[0] ?? '') + (lastName?.[0] ?? '') ||
    user?.email?.[0]?.toUpperCase() ||
    '?'

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Profile</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage your personal information and preferences
        </p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4 mb-6 p-5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="h-16 w-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0 uppercase">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            {user?.full_name ?? '—'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium capitalize">
            {user?.role}
          </span>
        </div>
      </div>

      {/* Personal info */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Personal Information
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Email
          </label>
          <input
            type="email"
            value={user?.email ?? ''}
            disabled
            className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Email is managed by your sign-in provider and cannot be changed here.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400 font-medium">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {mutation.isError && (
            <span className="text-sm text-red-600 dark:text-red-400">
              Failed to save — please try again.
            </span>
          )}
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sun className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Appearance</h3>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Choose how forgeflow looks to you.
        </p>

        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                theme === t.value
                  ? t.value === 'retro'
                    ? 'bg-green-950 border-green-400 text-green-400'
                    : 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600',
              ].join(' ')}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
