/**
 * Animated lightbulb "Idea" icon – pure SVG, no dependencies.
 *
 * Idle: gentle breathing glow.
 * Active (enhancing): filament pulses faster, rays radiate outward.
 */
export function IdeaIcon({
  active = false,
  className,
  size,
}: {
  active?: boolean;
  className?: string;
  /** Explicit pixel size — needed when rendered without our stylesheet (light DOM). */
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width={size}
      height={size}
      aria-hidden="true"
    >
      <defs>
        {/* Warm glow gradient for the "on" state */}
        <radialGradient id="pf-idea-glow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#FDE68A" stopOpacity={active ? 0.7 : 0.15}>
            <animate
              attributeName="stopOpacity"
              values={active ? '0.7;1;0.7' : '0.12;0.22;0.12'}
              dur={active ? '0.8s' : '2.4s'}
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>

        {/* Bulb glass gradient */}
        <linearGradient id="pf-idea-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={active ? '#FEF3C7' : '#E5E7EB'} />
          <stop offset="100%" stopColor={active ? '#FDE68A' : '#D1D5DB'} />
        </linearGradient>

        {/* Filament glow */}
        <filter id="pf-idea-filament-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={active ? '3' : '1.5'} />
        </filter>
      </defs>

      {/* Ambient glow behind bulb */}
      <circle cx="60" cy="48" r={active ? 42 : 32} fill="url(#pf-idea-glow)">
        <animate
          attributeName="r"
          values={active ? '38;46;38' : '28;34;28'}
          dur={active ? '1s' : '3s'}
          repeatCount="indefinite"
        />
      </circle>

      {/* ── Rays (only visible when active) ──────────────────────── */}
      {active && (
        <g opacity="0.6">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
            <line
              key={angle}
              x1="60"
              y1="48"
              x2={60 + 36 * Math.cos((angle * Math.PI) / 180)}
              y2={48 + 36 * Math.sin((angle * Math.PI) / 180)}
              stroke="#FDE68A"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0"
            >
              <animate
                attributeName="opacity"
                values="0;0.8;0"
                dur="1.2s"
                begin={`${i * 0.12}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="x2"
                values={`${60 + 30 * Math.cos((angle * Math.PI) / 180)};${60 + 42 * Math.cos((angle * Math.PI) / 180)};${60 + 30 * Math.cos((angle * Math.PI) / 180)}`}
                dur="1.2s"
                begin={`${i * 0.12}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="y2"
                values={`${48 + 30 * Math.sin((angle * Math.PI) / 180)};${48 + 42 * Math.sin((angle * Math.PI) / 180)};${48 + 30 * Math.sin((angle * Math.PI) / 180)}`}
                dur="1.2s"
                begin={`${i * 0.12}s`}
                repeatCount="indefinite"
              />
            </line>
          ))}
        </g>
      )}

      {/* ── Bulb glass ───────────────────────────────────────────── */}
      <path
        d="M60 14C42.3 14 28 28.3 28 46c0 10.8 5.4 20.3 13.6 26.1 3.2 2.2 5.4 5.8 5.4 9.9v4h26v-4c0-4.1 2.2-7.7 5.4-9.9C86.6 66.3 92 56.8 92 46c0-17.7-14.3-32-32-32z"
        fill="url(#pf-idea-glass)"
        stroke={active ? '#F59E0B' : '#9CA3AF'}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Bulb highlight */}
      <path
        d="M42 36c0-10 8-18 18-18"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={active ? 0.5 : 0.3}
      />

      {/* ── Filament ─────────────────────────────────────────────── */}
      <path
        d="M52 62 C55 50, 57 55, 60 46 C63 55, 65 50, 68 62"
        stroke={active ? '#F59E0B' : '#9CA3AF'}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        filter={active ? 'url(#pf-idea-filament-blur)' : undefined}
      >
        {active && (
          <animate
            attributeName="stroke"
            values="#FDE68A;#F59E0B;#FDE68A"
            dur="0.6s"
            repeatCount="indefinite"
          />
        )}
      </path>

      {/* ── Screw base ───────────────────────────────────────────── */}
      <rect x="44" y="86" width="32" height="5" rx="2.5" fill="#6B7280" stroke="#4B5563" strokeWidth="1" />
      <rect x="46" y="91" width="28" height="4" rx="2" fill="#6B7280" stroke="#4B5563" strokeWidth="1" />
      <rect x="48" y="95" width="24" height="4" rx="2" fill="#6B7280" stroke="#4B5563" strokeWidth="1" />

      {/* Bottom cap */}
      <path
        d="M50 99 Q60 106 70 99"
        fill="#4B5563"
        stroke="#374151"
        strokeWidth="1"
      />
    </svg>
  );
}
