// Approved geometry from design/final-mockup.html. One fixed sheet: a single
// spill band at the top and half-scale front-facing elevations at the bottom.
const spillRings: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[94, 24], [79, 32], [64, 42], [49, 51], [34, 61], [49, 71], [64, 80], [79, 90], [94, 100], [109, 90], [124, 80], [139, 71], [154, 61], [139, 51], [124, 42], [109, 32]],
  [[94, 40], [82, 47], [70, 55], [59, 62], [70, 69], [82, 77], [94, 85], [106, 77], [118, 69], [129, 62], [118, 55], [106, 47]],
  [[94, 51], [83, 56], [76, 62], [83, 68], [94, 74], [105, 68], [112, 62], [105, 56], [94, 62]],
];
const spillFalls: ReadonlyArray<readonly [number, number]> = [
  [17, 77], [27, 83], [37, 90], [47, 98], [57, 105], [67, 112], [77, 119], [87, 127],
  [97, 132], [107, 126], [117, 119], [127, 112], [137, 105], [147, 98], [157, 90], [167, 83],
];
const elevationGrid: ReadonlyArray<readonly [number, number]> = [
  [2.5, 2.107142857142857], [7.5, 2.107142857142857],
  [0, 6.321428571428571], [5, 6.321428571428571], [10, 6.321428571428571],
];
const contour = "M31 0 Q34 0 37 0 C42 4 51 32 62 49 C66 55 68 58 68 61 C68 69 57 82 51 89 C58 99 68 109 68 118.5 C68 128 58 138 51 148 C58 158 68 168 68 177.5 C68 187 58 197 51 207 C58 219 68 230 68 239 C68 249 63 259 58 266 Q57 268 53 268 H15 Q11 268 10 266 C5 259 0 249 0 239 C0 230 10 219 17 207 C10 197 0 187 0 177.5 C0 168 10 158 17 148 C10 138 0 128 0 118.5 C0 109 10 99 17 89 C11 82 0 69 0 61 C0 58 2 55 6 49 C17 32 26 4 31 0Z";

export function SerpoWallpaper() {
  return (
    <svg className="shell-wallpaper" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ridge-copper" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop stopColor="var(--shadow-glow)" />
          <stop offset=".48" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--shadow-shade)" />
        </linearGradient>
        <linearGradient id="ridge-violet" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop stopColor="var(--shadow-glow)" />
          <stop offset=".48" stopColor="var(--border-soft)" />
          <stop offset="1" stopColor="var(--shadow-shade)" />
        </linearGradient>
        <linearGradient id="pressed-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop stopColor="var(--shadow-shade)" />
          <stop offset=".46" stopColor="var(--accent-light)" />
          <stop offset="1" stopColor="var(--shadow-glow)" />
        </linearGradient>
        <linearGradient id="spill-recess" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop stopColor="var(--shadow-shade)" />
          <stop offset=".45" stopColor="var(--border-soft)" />
          <stop offset="1" stopColor="var(--shadow-glow)" />
        </linearGradient>
        <linearGradient id="elevation-volume" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop stopColor="var(--surface)" />
          <stop offset=".46" stopColor="var(--border-soft)" />
          <stop offset="1" stopColor="var(--shadow-shade)" />
        </linearGradient>
        <linearGradient id="elevation-roll" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop stopColor="var(--shadow-shade)" stopOpacity=".48" />
          <stop offset=".16" stopColor="var(--shadow-shade)" stopOpacity=".12" />
          <stop offset=".43" stopColor="var(--shadow-glow)" stopOpacity=".28" />
          <stop offset=".6" stopColor="var(--shadow-glow)" stopOpacity=".18" />
          <stop offset=".86" stopColor="var(--shadow-shade)" stopOpacity=".26" />
          <stop offset="1" stopColor="var(--shadow-shade)" stopOpacity=".6" />
        </linearGradient>
        <linearGradient id="elevation-edge" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop stopColor="var(--shadow-glow)" />
          <stop offset=".16" stopColor="var(--border-soft)" />
          <stop offset=".84" stopColor="var(--border-soft)" />
          <stop offset="1" stopColor="var(--shadow-shade)" />
        </linearGradient>

        <g id="spill-end">
          <path d="M0-5 2.8-3.4 4 0 2.8 3.4 0 5-2.8 3.4-4 0-2.8-3.4Z" fill="var(--border-soft)" fillOpacity=".78" stroke="url(#ridge-copper)" strokeOpacity=".6" strokeWidth=".55" />
          <ellipse cy="0" rx="1.35" ry="2.5" fill="url(#pressed-gold)" />
        </g>
        <g id="spill-island">
          <path className="spill-left" d="M13 63 Q10 74 16 81 L25 94 39 111 53 131 68 150 81 167 94 183 L94 119Z" />
          <path className="spill-right" d="M94 119 176 63 Q179 73 172 85 L158 106 144 127 130 147 116 167 94 183Z" />
          <path className="spill-shafts" d="M17 77V88 M27 83V101 M37 90V117 M47 98V140 M57 105V159 M67 112V182 M77 119V197 M87 127V211 M97 132V217" />
          <path className="spill-shafts spill-shafts-right" d="M107 126V207 M117 119V192 M127 112V175 M137 105V156 M147 98V138 M157 90V118 M167 83V100" />
          <path className="spill-top" d="M11 62 Q10 55 17 50 L88 10 Q94 6 100 10 L171 50 Q178 55 177 62 Q177 66 171 70 L101 115 Q94 120 87 115 L17 70 Q11 67 11 62Z" />
          <path className="spill-upper" d="M11 62 Q10 55 17 50 L88 10 Q94 6 100 10 L171 50 Q178 55 177 62" />
          {spillRings.map((ring, index) => (
            <g key={index}>{ring.map(([x, y]) => <use key={`${x}-${y}`} href="#spill-end" x={x} y={y} />)}</g>
          ))}
          <g>{spillFalls.map(([x, y]) => <use key={`${x}-${y}`} href="#spill-end" x={x} y={y} />)}</g>
        </g>

        <g id="elevation-mask-end">
          <path d="M0-2 1.4-1.4 2 0 1.4 1.4 0 2-1.4 1.4-2 0-1.4-1.4Z" fill="white" />
        </g>
        <g id="elevation-mask-grid">
          {elevationGrid.map(([x, y]) => <use key={`${x}-${y}`} href="#elevation-mask-end" x={x} y={y} />)}
        </g>
        <pattern id="elevation-mask-tile" width="10" height="8.428571428571429" patternUnits="userSpaceOnUse">
          <use href="#elevation-mask-grid" />
        </pattern>
        <mask id="elevation-dots" x="0" y="0" width="68" height="268" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style={{ maskType: "alpha" }}>
          <rect width="68" height="268" fill="url(#elevation-mask-tile)" />
        </mask>
        <g id="elevation-end">
          <path d="M0-2 1.4-1.4 2 0 1.4 1.4 0 2-1.4 1.4-2 0-1.4-1.4Z" fill="none" stroke="var(--accent)" strokeOpacity=".6" strokeWidth=".45" />
          <path d="M-2 0-1.4-1.4 0-2 1.4-1.4" fill="none" stroke="var(--shadow-glow)" strokeOpacity=".8" strokeWidth=".45" />
          <path d="M2 0 1.4 1.4 0 2-1.4 1.4" fill="none" stroke="var(--shadow-shade)" strokeOpacity=".9" strokeWidth=".45" />
          <circle r=".9" fill="color-mix(in srgb,var(--surface) 55%,white)" />
          <path d="M-.8 0 Q-.8-.8 0-.8" fill="none" stroke="var(--shadow-shade)" strokeWidth=".35" />
          <path d="M.8 0 Q.8 .8 0 .8" fill="none" stroke="var(--shadow-glow)" strokeWidth=".35" />
        </g>
        <g id="elevation-detail-grid">
          {elevationGrid.map(([x, y]) => <use key={`${x}-${y}`} href="#elevation-end" x={x} y={y} />)}
        </g>
        <pattern id="elevation-detail-tile" width="10" height="8.428571428571429" patternUnits="userSpaceOnUse">
          <use href="#elevation-detail-grid" />
        </pattern>
        <path id="elevation-contour" d={contour} />
        <clipPath id="elevation-clip"><use href="#elevation-contour" /></clipPath>
        <g id="elevation-middle">
          <path d="M34 3 Q51 16 65 29.5 Q52 44 34 56 Q16 44 3 29.5 Q17 16 34 3Z" fill="var(--accent-light)" />
          <path d="M34 9 Q47 18 56 29.5 Q47 41 34 50 Q21 41 12 29.5 Q21 18 34 9Z" fill="color-mix(in srgb,var(--surface) 55%,white)" />
          <path d="M34 15 Q44 22 49 29.5 Q44 37 34 44 Q24 37 19 29.5 Q24 22 34 15Z" fill="var(--border-soft)" />
          <path d="M34 22 Q41 25 43 29.5 Q41 34 34 37 Q27 34 25 29.5 Q27 25 34 22Z" fill="var(--accent)" />
        </g>
        <g id="elevation-island">
          <use href="#elevation-contour" className="elevation-silhouette" />
          <g className="elevation-mosaic" mask="url(#elevation-dots)">
            <use href="#elevation-contour" fill="var(--border-soft)" />
            <path d="M34 10 Q52 35 66 57 Q52 76 34 87 Q16 76 2 57 Q16 35 34 10Z" fill="var(--accent-light)" />
            <path d="M34 24 Q48 42 57 57 Q48 71 34 81 Q20 71 11 57 Q20 42 34 24Z" fill="color-mix(in srgb,var(--surface) 55%,white)" />
            <path d="M34 36 Q44 46 50 57 Q44 67 34 74 Q24 67 18 57 Q24 46 34 36Z" fill="var(--border-soft)" />
            <path d="M34 47 Q40 51 43 57 Q40 63 34 67 Q28 63 25 57 Q28 51 34 47Z" fill="var(--accent)" />
            <use href="#elevation-middle" y="89" />
            <use href="#elevation-middle" y="148" />
            <path d="M34 208 Q53 220 66 238 Q60 252 53 267 H15 Q8 252 2 238 Q15 220 34 208Z" fill="var(--accent-light)" />
            <path d="M34 214 Q48 224 57 238 Q49 253 46 260 Q34 265 22 260 Q19 253 11 238 Q20 224 34 214Z" fill="color-mix(in srgb,var(--surface) 55%,white)" />
            <path d="M34 221 Q45 229 50 238 Q45 247 34 256 Q23 247 18 238 Q23 229 34 221Z" fill="var(--border-soft)" />
            <path d="M34 229 Q40 232 43 238 Q40 244 34 248 Q28 244 25 238 Q28 232 34 229Z" fill="var(--accent)" />
          </g>
          <use href="#elevation-contour" fill="url(#elevation-detail-tile)" />
          <use href="#elevation-contour" className="elevation-roll" />
          <use href="#elevation-contour" className="elevation-edge-return" clipPath="url(#elevation-clip)" />
        </g>

        {/* Keep the top pattern's short paint band: no repeating spills down the page. */}
        <pattern id="top-spills" width="505.1814855409225" height="875" patternUnits="userSpaceOnUse" patternTransform="translate(0 -50)">
          <g transform="scale(1.25)">
            <use className="wallpaper-island" href="#spill-island" x="7.0362971081845" y="62.5" />
          </g>
        </pattern>
        <pattern id="bottom-elevations" width="126.2953713852306" height="103.51875" patternUnits="userSpaceOnUse" patternTransform="translate(-63.1476856926153 0)">
          <g className="wallpaper-island" transform="translate(52.0445606926153 0) scale(.3265625)"><use href="#elevation-island" /></g>
        </pattern>
      </defs>
      <rect width="100%" height="320" fill="url(#top-spills)" />
      {/* n=3..14 then n>=16; slots 1, 2 and 15 remain empty without shifting the pitch. */}
      <svg x="0" y="100%" width="100%" height="103.51875" overflow="visible">
        <g transform="translate(0 -103.51875)">
          <rect x="315.7384284630765" y="0" width="1515.544456622767" height="87.51875" fill="url(#bottom-elevations)" />
          <rect x="1957.5782564710742" y="0" width="100%" height="87.51875" fill="url(#bottom-elevations)" />
        </g>
      </svg>
    </svg>
  );
}
