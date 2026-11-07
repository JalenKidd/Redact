function ScanArt() {
  return (
    <>
      <path className="hero-grid" d="M36 43H267M36 72H267M36 101H267M76 18v110m49-110v110m50-110v110m50-110v110" />
      <rect className="hero-sheet" x="86" y="23" width="128" height="99" rx="12" />
      <path className="hero-ink" d="M109 48h73m-73 15h37m-37 30h70m-70 13h44" />
      <path className="hero-coral hero-wipe" d="M109 77h84" />
      <path className="hero-frame" d="M71 46V29h17m123 0h18v17M71 97v17h17m123 0h18V97" />
      <path className="hero-scan-beam" d="M64 46h173" />
      <circle cx="244" cy="111" r="13" className="hero-seal" />
      <path className="hero-check" d="m239 111 3 3 6-7" />
    </>
  );
}

function HistoryArt() {
  return (
    <>
      <path className="hero-grid" d="M36 40h231M36 72h231M36 104h231M65 18v111m42-111v111m43-111v111m43-111v111m42-111v111" />
      <g className="hero-stack-back"><rect x="82" y="24" width="133" height="87" rx="11" transform="rotate(-11 148 67)" /></g>
      <g className="hero-stack-middle"><rect x="101" y="28" width="133" height="87" rx="11" transform="rotate(10 167 72)" /></g>
      <g className="hero-stack-front">
        <rect className="hero-sheet" x="85" y="36" width="132" height="82" rx="11" />
        <path className="hero-ink" d="M105 58h70m-70 15h52m-52 25h44" />
        <path className="hero-coral hero-wipe" d="M105 86h86" />
        <circle cx="206" cy="108" r="14" className="hero-seal" />
        <path className="hero-check" d="M202 108h8m-4-4v8" />
      </g>
    </>
  );
}

function OverviewArt() {
  return (
    <>
      <rect className="hero-chart-bg" x="52" y="24" width="197" height="105" rx="12" />
      <path className="hero-grid" d="M72 48h156M72 70h156M72 92h156M72 112h156" />
      <g className="hero-columns">
        <rect x="81" y="87" width="13" height="25" rx="3" />
        <rect x="108" y="77" width="13" height="35" rx="3" />
        <rect x="135" y="83" width="13" height="29" rx="3" />
        <rect x="162" y="64" width="13" height="48" rx="3" />
        <rect x="189" y="58" width="13" height="54" rx="3" />
        <rect x="216" y="44" width="13" height="68" rx="3" />
      </g>
      <path className="hero-chart-line" pathLength="1" d="m87 79 27-12 27 6 27-18 27-7 27-12" />
      <circle cx="222" cy="36" r="4" className="hero-chart-point" />
    </>
  );
}

const artwork = { scan: ScanArt, history: HistoryArt, overview: OverviewArt };

export function RouteHero({ route, kicker, title, description, children }) {
  const Art = artwork[route];
  return (
    <header className={"route-hero route-hero-" + route}>
      <div className="route-copy" data-arrive>
        <div className="hero-kicker"><span /> {kicker}</div>
        <h1 id={route + "-heading"}>{title}<span>.</span></h1>
        <p>{description}</p>
        {children}
      </div>
      <div className="route-art" aria-hidden="true" data-arrive>
        <svg viewBox="0 0 300 144" fill="none"><Art /></svg>
      </div>
    </header>
  );
}
