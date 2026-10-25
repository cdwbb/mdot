interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 18, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      className={className}
      role="img"
      aria-label="mdot"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <defs>
        <linearGradient id="mdot-bg" x1="0" y1="0" x2="0.45" y2="1">
          <stop offset="0" stopColor="#5B94F7" />
          <stop offset="0.55" stopColor="#4A83EF" />
          <stop offset="1" stopColor="#3E73E1" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="200" fill="url(#mdot-bg)" />
      <g fill="none" stroke="#FFFFFF" strokeWidth="67" strokeLinecap="butt">
        <path d="M116 688V520C116 470 265 470 265 520V688M265 520C265 470 414 470 414 520V688" />
      </g>
      <path d="M672 340h70v348h-70z" fill="#FFFFFF" />
      <circle cx="580" cy="568" r="85" fill="none" stroke="#FFFFFF" strokeWidth="70" />
      <circle cx="868" cy="582" r="96" fill="#FBBC05" />
    </svg>
  );
}
