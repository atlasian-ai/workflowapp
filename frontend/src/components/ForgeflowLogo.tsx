interface ForgeflowLogoProps {
  /** Icon size in px */
  iconSize?: number
  /** Show the wordmark text next to the icon */
  showWordmark?: boolean
  /** Tailwind classes for the wordmark text */
  textClass?: string
}

/**
 * Forgeflow brand logo.
 *
 * Icon: two stacked chevrons (>>) inside a blue rounded square —
 * communicates "workflow" / "forward flow" at a glance.
 * Wordmark: "forgeflow" in bold tracking-tight.
 */
export default function ForgeflowLogo({
  iconSize = 32,
  showWordmark = true,
  textClass = 'text-xl font-bold text-blue-900 tracking-tight',
}: ForgeflowLogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        {/* Background */}
        <rect width="36" height="36" rx="8" fill="#1D4ED8" />

        {/* Left chevron — white */}
        <path
          d="M9 11.5 L17.5 18 L9 24.5"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Right chevron — lighter blue, offset right */}
        <path
          d="M18 11.5 L26.5 18 L18 24.5"
          stroke="#93C5FD"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {showWordmark && (
        <span className={textClass}>forgeflow</span>
      )}
    </div>
  )
}
