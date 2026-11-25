// Virtual Office scene: one desk per role in a top-front view of a room. Pure SVG + CSS,
// driven only by the desk states that OfficeView projects from real events.
import type { DeskView } from "./OfficeView";

const COLS = [130, 370, 610, 850];
const ROWS = [250, 470];
const SKIN = [
  "#f1c7a3",
  "#d9a37c",
  "#c58c63",
  "#e8b896",
  "#a8754f",
  "#f3d0b3",
  "#d49a72",
  "#bd8358",
];
const SHIRT: Record<string, string> = {
  po: "#d9a23c",
  orchestrator: "#3f97b8",
  ba: "#5f8fd6",
  architect: "#8c6cc9",
  be: "#3c9f78",
  fe: "#d0708f",
  tester: "#c98a3a",
  release: "#6b7c8c",
};

const BUSY = new Set(["working", "reading", "editing", "building"]);

function Desk({ d, x, y, i }: { d: DeskView; x: number; y: number; i: number }) {
  const busy = BUSY.has(d.state);
  const shirt = SHIRT[d.id] ?? "#6b7c8c";
  const say = d.say.length > 90 ? `${d.say.slice(0, 88)}…` : d.say;
  const body = (
    <g className={`o-desk s-${d.state}${busy ? " busy" : ""}`} transform={`translate(${x} ${y})`}>
      <title>{`${d.name} · ${d.state}\n${d.say}`}</title>
      {/* floor shadow + chair */}
      <ellipse cx="0" cy="78" rx="96" ry="12" className="o-shadow" />
      <rect x="-26" y="-14" width="52" height="58" rx="10" className="o-chair" />
      {/* person */}
      <g className="o-person">
        <rect x="-24" y="-6" width="48" height="44" rx="16" fill={shirt} />
        <circle cx="0" cy="-26" r="19" fill={SKIN[i % SKIN.length]} />
        <path d="M-19 -30 a19 19 0 0 1 38 0 q-19 -10 -38 0z" className="o-hair" />
        <text x="0" y="-20" className="o-ini">
          {d.ini}
        </text>
        {/* arms: typing on the keyboard, or one raised when waiting for the PO */}
        <g className="o-arm o-arm-l">
          <rect x="-30" y="6" width="12" height="34" rx="6" fill={shirt} />
        </g>
        <g className="o-arm o-arm-r">
          <rect x="18" y="6" width="12" height="34" rx="6" fill={shirt} />
        </g>
      </g>
      {/* desk with monitor and keyboard (in front of the person) */}
      <rect x="-86" y="36" width="172" height="40" rx="6" className="o-table" />
      <rect x="-80" y="72" width="8" height="12" className="o-leg" />
      <rect x="72" y="72" width="8" height="12" className="o-leg" />
      <rect x="-30" y="40" width="60" height="9" rx="3" className="o-keys" />
      <g transform="translate(62 -2)">
        <rect x="-4" y="30" width="8" height="12" className="o-leg" />
        <rect x="-30" y="-6" width="60" height="40" rx="4" className="o-monitor" />
        <rect x="-26" y="-2" width="52" height="32" rx="2" className="o-screen" />
        {busy && (
          <g className="o-code">
            <rect x="-22" y="3" width="30" height="3" />
            <rect x="-18" y="10" width="36" height="3" />
            <rect x="-18" y="17" width="22" height="3" />
            <rect x="-22" y="24" width="28" height="3" />
          </g>
        )}
      </g>
      <rect x="-74" y="44" width="14" height="16" rx="3" className="o-mug" />
      {/* status badge */}
      {d.state === "done" && (
        <text x="-58" y="-30" className="o-badge o-ok">
          ✓
        </text>
      )}
      {d.state === "blocked" && (
        <text x="-58" y="-30" className="o-badge o-bad">
          !
        </text>
      )}
      {d.state === "waiting" && (
        <text x="-58" y="-30" className="o-badge o-wait">
          ✋
        </text>
      )}
      {d.state === "idle" && (
        <text x="26" y="-40" className="o-zzz">
          z z
        </text>
      )}
      {/* name plate */}
      <text x="0" y="98" className="o-name">
        {d.name}
      </text>
      <text x="0" y="114" className="o-state">
        {d.state}
      </text>
      {/* speech bubble */}
      {d.say !== "—" && (
        <foreignObject x="-110" y="-128" width="220" height="80">
          <div className="o-bubble">
            <span>{say}</span>
          </div>
        </foreignObject>
      )}
    </g>
  );
  return d.link ? (
    <a href={d.link} aria-label={`${d.name}: ${d.state}`}>
      {body}
    </a>
  ) : (
    body
  );
}

export function OfficeScene({ desks }: { desks: DeskView[] }) {
  return (
    <div className="o-wrap">
      <svg viewBox="0 0 980 600" className="o-svg" role="img" aria-label="Virtual Office">
        {/* wall */}
        <rect x="0" y="0" width="980" height="110" className="o-wall" />
        <rect x="0" y="104" width="980" height="6" className="o-skirting" />
        <g className="o-window">
          <rect x="60" y="18" width="150" height="70" rx="4" />
          <line x1="135" y1="18" x2="135" y2="88" />
          <line x1="60" y1="53" x2="210" y2="53" />
        </g>
        <g className="o-board">
          <rect x="390" y="16" width="200" height="76" rx="4" />
          <text x="490" y="40">
            Furwatch sprint
          </text>
          <rect x="406" y="52" width="40" height="26" className="o-sticky a" />
          <rect x="456" y="52" width="40" height="26" className="o-sticky b" />
          <rect x="506" y="52" width="40" height="26" className="o-sticky c" />
          <rect x="556" y="58" width="22" height="20" className="o-sticky d" />
        </g>
        <g className="o-clock" transform="translate(800 52)">
          <circle r="24" />
          <line x1="0" y1="0" x2="0" y2="-14" />
          <line x1="0" y1="0" x2="10" y2="4" />
        </g>
        <g className="o-plant" transform="translate(930 92)">
          <rect x="-12" y="0" width="24" height="18" rx="3" />
          <ellipse cx="-8" cy="-10" rx="8" ry="14" />
          <ellipse cx="8" cy="-12" rx="8" ry="16" />
          <ellipse cx="0" cy="-20" rx="7" ry="14" />
        </g>
        {/* floor */}
        <rect x="0" y="110" width="980" height="490" className="o-floor" />
        <rect x="40" y="356" width="900" height="2" className="o-aisle" />
        {desks.map((d, i) => (
          <Desk key={d.id} d={d} i={i} x={COLS[i % 4] ?? 130} y={ROWS[Math.floor(i / 4)] ?? 250} />
        ))}
      </svg>
    </div>
  );
}
