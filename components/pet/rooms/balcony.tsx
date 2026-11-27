// Room scene: ระเบียงยามเย็น (balcony). Static SVG, no hooks, server-component safe.
export function BalconyScene() {
  return (
    <svg
      viewBox="0 0 390 520"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="0" width="390" height="120" fill="#ffe3c4" />
      <rect x="0" y="120" width="390" height="90" fill="#ffcfa3" />
      <rect x="0" y="210" width="390" height="90" fill="#ffb98a" />
      <circle cx="250" cy="250" r="62" fill="#ffe08a" />
      <circle cx="250" cy="250" r="78" fill="#ffe08a" opacity=".35" />
      <ellipse cx="80" cy="80" rx="40" ry="12" fill="#fff4e6" />
      <ellipse cx="104" cy="72" rx="24" ry="12" fill="#fff4e6" />
      <ellipse cx="320" cy="130" rx="30" ry="9" fill="#fff4e6" opacity=".8" />
      <path d="M150 60 q8 -8 16 0 q8 -8 16 0" fill="none" stroke="#b4532a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M196 86 q6 -6 12 0 q6 -6 12 0" fill="none" stroke="#b4532a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M0 300 V250 H30 V230 H58 V262 H84 V214 H120 V256 H150 V240 H176 V300 Z" fill="#e8907a" />
      <path d="M176 300 V258 H214 V236 H236 V262 H290 V222 H322 V250 H352 V232 H390 V300 Z" fill="#e8907a" />
      <g fill="#ffe8b8">
        <rect x="94" y="226" width="6" height="8" />
        <rect x="106" y="240" width="6" height="8" />
        <rect x="300" y="232" width="6" height="8" />
        <rect x="310" y="248" width="6" height="8" />
        <rect x="40" y="242" width="6" height="8" />
        <rect x="362" y="244" width="6" height="8" />
      </g>
      <rect x="0" y="296" width="390" height="10" fill="#d97a62" />
      <path d="M40 0 V40" stroke="#8c3c18" strokeWidth="2" />
      <rect x="28" y="40" width="24" height="30" rx="8" fill="#ff9e6b" />
      <ellipse cx="40" cy="74" rx="16" ry="6" fill="#ffe08a" opacity=".7" />
      <path d="M350 0 V56" stroke="#8c3c18" strokeWidth="2" />
      <rect x="338" y="56" width="24" height="30" rx="8" fill="#ff9e6b" />
      <ellipse cx="350" cy="90" rx="16" ry="6" fill="#ffe08a" opacity=".7" />
      <rect x="0" y="306" width="390" height="214" fill="#f6cdae" />
      <g stroke="#ecb894" strokeWidth="2">
        <line x1="0" y1="360" x2="390" y2="360" />
        <line x1="0" y1="420" x2="390" y2="420" />
        <line x1="0" y1="480" x2="390" y2="480" />
        <line x1="78" y1="306" x2="78" y2="520" />
        <line x1="156" y1="306" x2="156" y2="520" />
        <line x1="234" y1="306" x2="234" y2="520" />
        <line x1="312" y1="306" x2="312" y2="520" />
      </g>
      <rect x="0" y="312" width="390" height="8" rx="4" fill="#fff4ea" />
      <g fill="#fff4ea">
        <rect x="10" y="320" width="6" height="56" />
        <rect x="44" y="320" width="6" height="56" />
        <rect x="78" y="320" width="6" height="56" />
        <rect x="306" y="320" width="6" height="56" />
        <rect x="340" y="320" width="6" height="56" />
        <rect x="374" y="320" width="6" height="56" />
      </g>
      <rect x="0" y="372" width="96" height="6" fill="#fff4ea" />
      <rect x="300" y="372" width="90" height="6" fill="#fff4ea" />
      <path d="M106 380 L118 340 H150 L162 380 Z" fill="#e07a52" />
      <ellipse cx="124" cy="330" rx="12" ry="22" fill="#7cbf8e" transform="rotate(-22 124 330)" />
      <ellipse cx="144" cy="328" rx="12" ry="24" fill="#68ad7b" transform="rotate(18 144 328)" />
      <circle cx="134" cy="316" r="9" fill="#ff8fa0" />
      <path d="M232 380 L242 350 H270 L280 380 Z" fill="#e07a52" />
      <circle cx="246" cy="338" r="10" fill="#ffd36b" />
      <circle cx="264" cy="334" r="10" fill="#ffd36b" />
      <circle cx="256" cy="322" r="10" fill="#ffd36b" />
      <circle cx="256" cy="336" r="6" fill="#b4532a" />
      <rect x="164" y="398" width="60" height="8" rx="4" fill="#fff4ea" />
      <rect x="190" y="406" width="8" height="26" fill="#fff4ea" />
      <rect x="178" y="430" width="32" height="6" rx="3" fill="#fff4ea" />
      <rect x="176" y="380" width="14" height="18" rx="4" fill="#ff9e6b" />
      <rect x="198" y="380" width="14" height="18" rx="4" fill="#ffd36b" />
      <line x1="186" y1="380" x2="190" y2="368" stroke="#fff" strokeWidth="2" />
      <line x1="208" y1="380" x2="204" y2="368" stroke="#fff" strokeWidth="2" />
      <ellipse cx="80" cy="484" rx="62" ry="16" fill="#ff9e7a" />
      <ellipse cx="300" cy="484" rx="62" ry="16" fill="#ffc07a" />
    </svg>
  );
}
