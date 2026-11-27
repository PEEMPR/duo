// Room scene: ห้องนอนสีชมพู (bedroom). Static SVG, no hooks, server-component safe.
export function BedroomScene() {
  return (
    <svg
      viewBox="0 0 390 520"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="0" width="390" height="370" fill="#fbe4e8" />
      <g fill="#f7d3da">
        <circle cx="40" cy="250" r="3" />
        <circle cx="90" cy="300" r="3" />
        <circle cx="190" cy="250" r="3" />
        <circle cx="350" cy="110" r="3" />
        <circle cx="300" cy="60" r="3" />
        <circle cx="200" cy="90" r="3" />
      </g>
      <path d="M10 34 Q100 78 195 44 T380 40" fill="none" stroke="#c98e98" strokeWidth="2" />
      <g fill="#ffd36b">
        <circle cx="40" cy="50" r="6" />
        <circle cx="85" cy="62" r="6" />
        <circle cx="130" cy="64" r="6" />
        <circle cx="175" cy="52" r="6" />
        <circle cx="220" cy="42" r="6" />
        <circle cx="265" cy="46" r="6" />
        <circle cx="310" cy="50" r="6" />
        <circle cx="352" cy="44" r="6" />
      </g>
      <rect x="34" y="96" width="132" height="140" rx="18" fill="#fff" />
      <rect x="44" y="106" width="112" height="120" rx="12" fill="#d9eefa" />
      <ellipse cx="86" cy="150" rx="24" ry="10" fill="#fff" />
      <ellipse cx="104" cy="144" rx="16" ry="10" fill="#fff" />
      <circle cx="132" cy="128" r="10" fill="#ffe39a" />
      <rect x="98" y="106" width="4" height="120" fill="#fff" />
      <rect x="44" y="164" width="112" height="4" fill="#fff" />
      <path d="M26 88 H70 Q60 160 72 248 H26 Z" fill="#f28da0" />
      <path d="M174 88 H130 Q140 160 128 248 H174 Z" fill="#f28da0" />
      <rect x="22" y="82" width="156" height="10" rx="5" fill="#d9728a" />
      <rect x="258" y="112" width="84" height="70" rx="10" fill="#fff" />
      <rect x="266" y="120" width="68" height="54" rx="6" fill="#fde9ee" />
      <path
        d="M300 160 C286 150 280 142 284 135 C288 128 297 130 300 137 C303 130 312 128 316 135 C320 142 314 150 300 160 Z"
        fill="#f06f8c"
      />
      <rect x="0" y="366" width="390" height="10" fill="#eab0bb" />
      <rect x="0" y="376" width="390" height="144" fill="#f5c9d1" />
      <g stroke="#ebb5c0" strokeWidth="2">
        <line x1="0" y1="420" x2="390" y2="420" />
        <line x1="0" y1="468" x2="390" y2="468" />
      </g>
      <rect x="210" y="250" width="166" height="40" rx="14" fill="#e57a90" />
      <rect x="210" y="282" width="166" height="70" rx="12" fill="#fff6f7" />
      <rect x="210" y="300" width="166" height="52" rx="12" fill="#f9b8c5" />
      <rect x="222" y="262" width="56" height="30" rx="12" fill="#fff" />
      <path
        d="M330 296 C314 285 306 276 311 268 C316 260 326 262 330 270 C334 262 344 260 349 268 C354 276 346 285 330 296 Z"
        fill="#f06f8c"
      />
      <rect x="214" y="350" width="10" height="22" rx="4" fill="#c9627a" />
      <rect x="362" y="350" width="10" height="22" rx="4" fill="#c9627a" />
      <rect x="18" y="318" width="40" height="50" rx="10" fill="#e8a27f" />
      <ellipse cx="30" cy="302" rx="12" ry="24" fill="#7cbf8e" transform="rotate(-20 30 302)" />
      <ellipse cx="48" cy="300" rx="12" ry="26" fill="#68ad7b" transform="rotate(18 48 300)" />
      <ellipse cx="38" cy="292" rx="10" ry="26" fill="#86c998" />
      <ellipse cx="190" cy="468" rx="150" ry="34" fill="#f39fb1" />
      <ellipse
        cx="190"
        cy="468"
        rx="118"
        ry="24"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeDasharray="6 8"
        opacity=".8"
      />
    </svg>
  );
}
