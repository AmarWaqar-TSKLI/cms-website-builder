/**
 * The whole mechanism in one drawing: drafts are overwritten, publish appends a
 * release, one pointer names the live release, and rollback moves that pointer
 * back. Two layouts of the same drawing — wide for desktop, tall for phones —
 * because a horizontal flow squeezed to 390px stops being legible.
 */

const COAL = "var(--color-coal)";
const PAPER = "var(--color-paper)";
const TOMATO = "var(--color-tomato)";
const COBALT = "var(--color-cobalt)";
const MONO = { fontFamily: "var(--font-mono)" } as const;
const SANS = { fontFamily: "var(--font-display)" } as const;

function Markers({ id }: { id: string }) {
  return (
    <defs>
      <marker id={`${id}-coal`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 10 5 0 10z" fill={COAL} />
      </marker>
      <marker id={`${id}-tomato`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 10 5 0 10z" fill={TOMATO} />
      </marker>
    </defs>
  );
}

/** A labelled box. `tone` picks the fill; text colour follows it. */
function Box({
  x, y, w, h, title, sub, tone = "paper",
}: {
  x: number; y: number; w: number; h: number; title: string; sub?: string;
  tone?: "paper" | "cobalt" | "tomato" | "coal";
}) {
  const fill = { paper: PAPER, cobalt: COBALT, tomato: TOMATO, coal: COAL }[tone];
  const ink = tone === "paper" ? COAL : PAPER;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke={COAL} strokeWidth="2" />
      <text x={x + 14} y={sub ? y + h / 2 - 4 : y + h / 2 + 6} fill={ink} fontSize="17" fontWeight="700" style={SANS}>
        {title}
      </text>
      {sub && (
        <text x={x + 14} y={y + h / 2 + 16} fill={ink} fontSize="12" opacity="0.85" style={MONO}>
          {sub}
        </text>
      )}
    </g>
  );
}

function Label({ x, y, children, color = COAL, anchor = "middle" }: {
  x: number; y: number; children: string; color?: string; anchor?: "start" | "middle" | "end";
}) {
  return (
    <text x={x} y={y} fill={color} fontSize="12.5" fontWeight="500" textAnchor={anchor} style={MONO}>
      {children}
    </text>
  );
}

function Wide() {
  return (
    <svg viewBox="0 0 1080 330" className="hidden h-auto w-full md:block" role="img"
      aria-label="Drafts are overwritten; publish appends release R3; sites.live_release_id points at R3 and the site serves it; rollback moves the pointer to R2.">
      <Markers id="w" />

      {/* Drafts */}
      <Label x={20} y={36} anchor="start">EDITOR</Label>
      <Box x={20} y={50} w={210} h={68} title="page_drafts" sub="1 row per page" />
      <text x={20} y={146} fill={COAL} fontSize="13" style={MONO}>autosave every 2s</text>
      <text x={20} y={166} fill={COAL} fontSize="13" style={MONO}>overwrites the row,</text>
      <text x={20} y={186} fill={COAL} fontSize="13" style={MONO}>never piles up</text>

      {/* publish → R3 */}
      <path d="M230 84 H362" stroke={COAL} strokeWidth="2" markerEnd="url(#w-coal)" />
      <Label x={296} y={72}>publish</Label>

      {/* Releases, newest on top */}
      <Label x={370} y={36} anchor="start">RELEASES · APPEND-ONLY</Label>
      <Box x={370} y={50} w={200} h={68} title="R3  v3" sub="live" tone="cobalt" />
      <Box x={370} y={136} w={200} h={68} title="R2  v2" sub="kept forever" />
      <Box x={370} y={222} w={200} h={68} title="R1  v1" sub="kept forever" />

      {/* The pointer */}
      <Label x={700} y={124} anchor="start">ONE MUTABLE VALUE</Label>
      <Box x={700} y={136} w={220} h={68} title="live_release_id" sub="sites table" tone="tomato" />
      <path d="M700 152 C650 152 640 84 574 84" fill="none" stroke={COAL} strokeWidth="2" markerEnd="url(#w-coal)" />
      <Label x={600} y={70} anchor="start">points at</Label>
      <path d="M700 188 C660 188 640 170 574 170" fill="none" stroke={TOMATO} strokeWidth="2.5" strokeDasharray="7 6" markerEnd="url(#w-tomato)" />
      <Label x={636} y={222} color={TOMATO}>rollback:</Label>
      <Label x={636} y={240} color={TOMATO}>move it here</Label>

      {/* Served */}
      <path d="M920 170 H966" stroke={COAL} strokeWidth="2" markerEnd="url(#w-coal)" />
      <Box x={970} y={136} w={100} h={68} title="site" sub="/s/acme" tone="coal" />
      <Label x={1070} y={232} anchor="end">serves whatever</Label>
      <Label x={1070} y={250} anchor="end">the pointer names</Label>
    </svg>
  );
}

function Tall() {
  return (
    <svg viewBox="0 0 360 700" className="h-auto w-full md:hidden" role="img"
      aria-label="Drafts are overwritten; publish appends release R3; sites.live_release_id points at R3 and the site serves it; rollback moves the pointer to R2.">
      <Markers id="t" />

      <Label x={20} y={22} anchor="start">EDITOR</Label>
      <Box x={20} y={32} w={250} h={64} title="page_drafts" sub="1 row per page, overwritten" />

      <path d="M90 96 V150" stroke={COAL} strokeWidth="2" markerEnd="url(#t-coal)" />
      <Label x={100} y={128} anchor="start">publish</Label>

      <Label x={20} y={170} anchor="start">RELEASES · APPEND-ONLY</Label>
      <Box x={20} y={180} w={200} h={60} title="R3  v3" sub="live" tone="cobalt" />
      <Box x={20} y={252} w={200} h={60} title="R2  v2" sub="kept forever" />
      <Box x={20} y={324} w={200} h={60} title="R1  v1" sub="kept forever" />

      <Label x={20} y={444} anchor="start">ONE MUTABLE VALUE</Label>
      <Box x={20} y={454} w={250} h={64} title="live_release_id" sub="sites table" tone="tomato" />
      {/* points at R3: up the right side */}
      <path d="M270 470 H318 V210 H224" fill="none" stroke={COAL} strokeWidth="2" markerEnd="url(#t-coal)" />
      <text transform="translate(336 330) rotate(-90)" fill={COAL} fontSize="12.5" fontWeight="500" textAnchor="middle" style={MONO}>
        points at
      </text>
      {/* rollback to R2 */}
      <path d="M200 454 V420 H246 V282 H224" fill="none" stroke={TOMATO} strokeWidth="2.5" strokeDasharray="7 6" markerEnd="url(#t-tomato)" />
      <Label x={20} y={410} anchor="start" color={TOMATO}>rollback: move it to R2</Label>

      <path d="M90 518 V572" stroke={COAL} strokeWidth="2" markerEnd="url(#t-coal)" />
      <Label x={100} y={550} anchor="start">serves</Label>
      <Box x={20} y={576} w={250} h={64} title="the live site" sub="/s/acme-store" tone="coal" />
    </svg>
  );
}

export function ReleaseDiagram() {
  return (
    <figure>
      <Wide />
      <Tall />
    </figure>
  );
}
