/**
 * AppleberryIcon — SVG recreation of the Appleberry Care Centre apple icon.
 * Orange → coral → pink gradient, outline-style, with leaf and bite.
 * Use wherever you need just the apple mark (no text).
 */
export function AppleberryIcon({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 92"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Appleberry"
    >
      <defs>
        <linearGradient
          id="ab-mark-grad"
          x1="40"
          y1="0"
          x2="40"
          y2="92"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%"   stopColor="#FB923C" />
          <stop offset="42%"  stopColor="#F43F5E" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>

      {/* Leaf */}
      <path
        d="M44 12 C50 3 65 7 56 22"
        stroke="url(#ab-mark-grad)"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Apple body — open path; the gap at upper-right is the "bite" */}
      <path
        d="M40 20
           C 26 20, 11 31, 7 47
           C 3 61, 9 77, 21 84
           C 27 88, 35 89, 40 87
           C 45 89, 53 88, 59 84
           C 71 77, 77 61, 73 47
           C 69 35, 59 25, 50 21"
        stroke="url(#ab-mark-grad)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
