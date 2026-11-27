// Room scene: ห้องดูดาว (stargaze). Static SVG, no hooks, server-component safe.
export function StargazeScene() {
  return (
    <svg
      viewBox="0 0 390 520"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="0" width="390" height="370" fill="#1f1c2e" />
      <circle cx="195" cy="170" r="112" fill="#2c2742" />
      <circle cx="195" cy="170" r="100" fill="#2f3a6b" />
      <circle cx="195" cy="170" r="100" fill="none" stroke="#3d3658" strokeWidth="10" />
      <line x1="95" y1="170" x2="295" y2="170" stroke="#3d3658" strokeWidth="6" />
      <line x1="195" y1="70" x2="195" y2="270" stroke="#3d3658" strokeWidth="6" />
      <circle cx="236" cy="122" r="24" fill="#fff1c1" />
      <circle cx="248" cy="114" r="22" fill="#2f3a6b" />
      <g fill="#fff1c1">
        <circle cx="130" cy="120" r="2.5" />
        <circle cx="160" cy="96" r="2" />
        <circle cx="148" cy="210" r="2.5" />
        <circle cx="250" cy="216" r="2" />
        <circle cx="270" cy="160" r="2.5" />
        <circle cx="214" cy="236" r="2" />
        <circle cx="122" cy="168" r="2" />
        <circle cx="170" cy="140" r="1.8" />
      </g>
      <path d="M160 200 l4 -10 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 z" fill="#ffe08a" />
      <g fill="#3d3658">
        <circle cx="36" cy="60" r="2" />
        <circle cx="350" cy="44" r="2" />
        <circle cx="330" cy="300" r="2" />
        <circle cx="54" cy="300" r="2" />
      </g>
      <path d="M0 26 Q60 56 120 30" fill="none" stroke="#4b4370" strokeWidth="2" />
      <path d="M270 30 Q330 58 390 26" fill="none" stroke="#4b4370" strokeWidth="2" />
      <g fill="#ffd36b">
        <circle cx="24" cy="38" r="5" />
        <circle cx="60" cy="44" r="5" />
        <circle cx="96" cy="38" r="5" />
        <circle cx="294" cy="38" r="5" />
        <circle cx="330" cy="44" r="5" />
        <circle cx="366" cy="38" r="5" />
      </g>
      <rect x="0" y="366" width="390" height="10" fill="#3d3658" />
      <rect x="0" y="376" width="390" height="144" fill="#2a2640" />
      <g stroke="#332e4d" strokeWidth="2">
        <line x1="0" y1="420" x2="390" y2="420" />
        <line x1="0" y1="468" x2="390" y2="468" />
      </g>
      <line x1="316" y1="300" x2="300" y2="372" stroke="#8a7fb8" strokeWidth="5" strokeLinecap="round" />
      <line x1="316" y1="300" x2="336" y2="372" stroke="#8a7fb8" strokeWidth="5" strokeLinecap="round" />
      <line x1="316" y1="300" x2="318" y2="372" stroke="#8a7fb8" strokeWidth="5" strokeLinecap="round" />
      <rect x="270" y="268" width="84" height="22" rx="10" fill="#c9b8ff" transform="rotate(-28 312 279)" />
      <rect x="334" y="250" width="20" height="28" rx="6" fill="#a998e6" transform="rotate(-28 344 264)" />
      <ellipse cx="46" cy="336" rx="26" ry="8" fill="#ffe08a" opacity=".25" />
      <rect x="38" y="300" width="16" height="66" rx="6" fill="#4b4370" />
      <circle cx="46" cy="292" r="16" fill="#ffd36b" />
      <circle cx="46" cy="292" r="28" fill="#ffd36b" opacity=".18" />
      <ellipse cx="190" cy="470" rx="160" ry="36" fill="#4a4370" />
      <ellipse
        cx="190"
        cy="470"
        rx="128"
        ry="26"
        fill="none"
        stroke="#6a5f99"
        strokeWidth="2"
        strokeDasharray="5 8"
      />
      <ellipse cx="110" cy="460" rx="60" ry="30" fill="#6d5aa8" />
      <ellipse cx="110" cy="448" rx="44" ry="18" fill="#7f6bbd" />
    </svg>
  );
}
