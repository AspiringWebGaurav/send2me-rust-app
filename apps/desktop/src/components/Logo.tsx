

export function Logo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="primaryGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0ea5e9" /> {/* Teal / light blue */}
          <stop offset="100%" stopColor="#0369a1" /> {/* Deep blue */}
        </linearGradient>
        <linearGradient id="secondaryGradient" x1="100%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#38bdf8" /> {/* Cyan accent */}
          <stop offset="100%" stopColor="#0c4a6e" /> {/* Very dark blue */}
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Background shape representing Device 1 */}
      <rect 
        x="15" y="15" width="45" height="45" rx="12" 
        fill="url(#secondaryGradient)" 
        opacity="0.8"
      />
      
      {/* Foreground shape representing Device 2 intersecting and synchronizing */}
      <rect 
        x="40" y="40" width="45" height="45" rx="12" 
        fill="url(#primaryGradient)" 
        filter="url(#glow)"
      />

      {/* Abstract sync/movement lines inside the intersection */}
      <path 
        d="M 45 35 L 65 35" 
        stroke="white" 
        strokeWidth="4" 
        strokeLinecap="round" 
        opacity="0.9"
      />
      <path 
        d="M 35 65 L 55 65" 
        stroke="white" 
        strokeWidth="4" 
        strokeLinecap="round" 
        opacity="0.9"
      />
    </svg>
  );
}
