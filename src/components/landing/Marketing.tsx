"use client";

/**
 * The homepage — for the person who wants a website, not the engineer reviewing
 * how it's built.
 *
 * Warm and light, huge friendly type, plain words, and one 3D moment: a little
 * site building itself out of coloured blocks, drifting with the pointer. Every
 * benefit maps to something real in the product (drag blocks, one-click publish,
 * roll back, sell / blog / collect, export) — said the way a person would say it.
 *
 * All of the landing's look lives in one scoped stylesheet below, namespaced
 * under `.lp`, so it never inherits or fights the app's cooler product palette.
 * The old architecture film still exists under /how-it-works for the curious.
 */
import Link from "next/link";
import { Reveal, useParallax } from "./Reveal";

export default function Marketing() {
  const stage = useParallax<HTMLDivElement>();

  return (
    <main className="lp">
      <style>{LP_CSS}</style>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <span className="lp-brand">
            <span className="lp-brand-mark" aria-hidden>◈</span>
            Blockwrite
          </span>
          <div className="lp-nav-actions">
            <Link href="/how-it-works" className="lp-navlink lp-nav-hide">How it works</Link>
            <Link href="/login" className="lp-navlink">Sign in</Link>
            <Link href="/login" className="lp-btn lp-btn--primary lp-btn--sm">Start free</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="lp-hero">
        <div className="lp-glow" aria-hidden />
        <div className="lp-wrap lp-hero-in">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow lp-fade" style={{ animationDelay: "40ms" }}>
              The website builder for the rest of us
            </p>
            <h1 className="lp-h1 lp-fade" style={{ animationDelay: "120ms" }}>
              Build a website
              <br />
              you&rsquo;re <em>proud</em> of.
            </h1>
            <p className="lp-lead lp-fade" style={{ animationDelay: "240ms" }}>
              Drag beautiful blocks into place, click&nbsp;<strong>Publish</strong>, and
              you&rsquo;re online. No code. No stress. No designer needed.
            </p>
            <div className="lp-hero-cta lp-fade" style={{ animationDelay: "360ms" }}>
              <Link href="/login" className="lp-btn lp-btn--primary">
                Start building — it&rsquo;s free
                <span className="lp-btn-arrow" aria-hidden>→</span>
              </Link>
              <Link href="/how-it-works" className="lp-btn lp-btn--ghost">
                See how it works
              </Link>
            </div>
            <p className="lp-trust lp-fade" style={{ animationDelay: "480ms" }}>
              Free to try · No card needed · Online in minutes
            </p>
          </div>

          {/* The 3D moment: a site assembling itself from coloured blocks. */}
          <div className="lp-stage" ref={stage} aria-hidden>
            <div className="lp-browser">
              <div className="lp-browser-bar">
                <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
                <span className="lp-url">yourname.site</span>
              </div>
              <div className="lp-canvas">
                <div className="lp-blk lp-blk--hero" style={{ animationDelay: "600ms" }}>
                  <span className="lp-blk-title" />
                  <span className="lp-blk-line" />
                  <span className="lp-blk-line lp-blk-line--short" />
                  <span className="lp-blk-pill" />
                </div>
                <div className="lp-row">
                  <div className="lp-blk lp-blk--card lp-c-teal" style={{ animationDelay: "760ms" }} />
                  <div className="lp-blk lp-blk--card lp-c-amber" style={{ animationDelay: "860ms" }} />
                </div>
                <div className="lp-row">
                  <div className="lp-blk lp-blk--tile lp-c-rose" style={{ animationDelay: "960ms" }} />
                  <div className="lp-blk lp-blk--tile lp-c-blue" style={{ animationDelay: "1020ms" }} />
                  <div className="lp-blk lp-blk--tile lp-c-teal" style={{ animationDelay: "1080ms" }} />
                </div>
              </div>
            </div>

            {/* Loose blocks floating in, the palette you build from. */}
            <span className="lp-chip lp-chip--1 lp-c-amber" style={{ animationDelay: "1200ms" }} />
            <span className="lp-chip lp-chip--2 lp-c-rose" style={{ animationDelay: "1320ms" }} />
            <span className="lp-chip lp-chip--3 lp-c-teal" style={{ animationDelay: "1440ms" }} />
          </div>
        </div>
      </header>

      {/* ── Play ────────────────────────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-wrap lp-split">
          <Reveal className="lp-split-copy">
            <p className="lp-kick">Building</p>
            <h2 className="lp-h2">Building a page feels like&nbsp;play.</h2>
            <p className="lp-sub">
              Pick a block — a big headline, a photo, a row of features, a pricing table — and drop
              it where you want. Want to change a word? Click it and type. That&rsquo;s the whole
              learning curve.
            </p>
          </Reveal>
          <Reveal className="lp-split-art" delay={120}>
            <div className="lp-demo">
              <div className="lp-palette">
                {["Heading", "Photo", "Button", "Columns", "Gallery", "Pricing"].map((b, i) => (
                  <span key={b} className={`lp-tag lp-c-${["blue", "teal", "amber", "rose", "blue", "teal"][i]}`}>
                    {b}
                  </span>
                ))}
              </div>
              <div className="lp-demo-page">
                <span className="lp-blk-title" />
                <span className="lp-blk-line" />
                <div className="lp-row">
                  <span className="lp-mini lp-c-teal" />
                  <span className="lp-mini lp-c-amber" />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Publish ─────────────────────────────────────────────────────── */}
      <section className="lp-section lp-section--tint">
        <div className="lp-wrap lp-split lp-split--rev">
          <Reveal className="lp-split-copy">
            <p className="lp-kick">Going live</p>
            <h2 className="lp-h2">One button puts you&nbsp;online.</h2>
            <p className="lp-sub">
              When it looks right, press <strong>Publish</strong>. Seconds later your site has a real
              web address you can share with anyone. Changed your mind? Roll back to any earlier
              version in a single click — nothing is ever lost.
            </p>
          </Reveal>
          <Reveal className="lp-split-art" delay={120}>
            <div className="lp-publish">
              <div className="lp-publish-btn">Publish</div>
              <div className="lp-publish-flow">
                <span className="lp-step">Saved</span>
                <span className="lp-step-arrow">→</span>
                <span className="lp-step">Building</span>
                <span className="lp-step-arrow">→</span>
                <span className="lp-step lp-step--live">Live ✓</span>
              </div>
              <p className="lp-publish-url">yourname.site is online</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Grow ────────────────────────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-wrap">
          <Reveal className="lp-center">
            <p className="lp-kick">More than a page</p>
            <h2 className="lp-h2">Room to grow into.</h2>
            <p className="lp-sub lp-sub--center">
              Turn on what you need, when you need it. Your builder grows with you.
            </p>
          </Reveal>
          <div className="lp-cards">
            {[
              { c: "teal", t: "Sell your things", d: "Add products, take orders, watch the money add up. A real shop, built from the same blocks.", i: "🛍" },
              { c: "amber", t: "Write a blog", d: "Publish posts on their own pages, show them anywhere on your site, keep every version.", i: "✍" },
              { c: "rose", t: "Collect messages", d: "Drop in a contact or newsletter form and read what people send in a tidy inbox.", i: "✉" },
            ].map((card, i) => (
              <Reveal key={card.t} className={`lp-card lp-card--${card.c}`} delay={i * 110}>
                <span className="lp-card-icon" aria-hidden>{card.i}</span>
                <h3 className="lp-card-title">{card.t}</h3>
                <p className="lp-card-text">{card.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Ownership ───────────────────────────────────────────────────── */}
      <section className="lp-section lp-section--tint">
        <div className="lp-wrap lp-own">
          <Reveal>
            <p className="lp-kick">Yours, always</p>
            <h2 className="lp-h2 lp-h2--wide">
              It&rsquo;s your site. You can take it&nbsp;anywhere.
            </h2>
            <p className="lp-sub lp-sub--center">
              Download your whole website whenever you like and host it wherever you like. Pictures
              and all, working offline, with nothing else to set up. You&rsquo;re never locked in.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────────────────── */}
      <section className="lp-cta">
        <div className="lp-glow lp-glow--cta" aria-hidden />
        <Reveal className="lp-wrap lp-cta-in">
          <h2 className="lp-cta-h">Ready to build?</h2>
          <p className="lp-cta-sub">Your first page is a drag away.</p>
          <Link href="/login" className="lp-btn lp-btn--primary lp-btn--lg">
            Start building — it&rsquo;s free
            <span className="lp-btn-arrow" aria-hidden>→</span>
          </Link>
        </Reveal>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <span className="lp-brand lp-brand--sm">
            <span className="lp-brand-mark" aria-hidden>◈</span> Blockwrite
          </span>
          <div className="lp-footer-links">
            <Link href="/how-it-works" className="lp-navlink">How it works</Link>
            <Link href="/login" className="lp-navlink">Sign in</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

const LP_CSS = `
.lp{
  --paper:#faf7f2; --paper-2:#ffffff; --sink:#f3ede3;
  --ink:#1b1712; --ink-2:#4a453d; --ink-3:#8a8275; --line:#ece5d9;
  --blue:#1f5fa9; --blue-d:#184c87;
  --teal:#0f8f7f; --amber:#e0992e; --rose:#d76d90; --blue-b:#3f74c0;
  position:relative; background:var(--paper); color:var(--ink);
  font-family:var(--font-sans); overflow-x:clip; -webkit-font-smoothing:antialiased;
}
.lp *{box-sizing:border-box;}
.lp-wrap{width:100%; max-width:1180px; margin:0 auto; padding-inline:clamp(20px,5vw,48px);}
.lp em{font-style:italic; color:var(--blue);}
.lp strong{font-weight:600; color:var(--ink);}

/* ── nav ── */
.lp-nav{position:sticky; top:0; z-index:20; background:color-mix(in oklab,var(--paper) 82%,transparent); backdrop-filter:blur(12px); border-bottom:1px solid var(--line);}
.lp-nav-in{display:flex; align-items:center; justify-content:space-between; height:66px;}
.lp-brand{display:inline-flex; align-items:center; gap:9px; font-weight:650; font-size:18px; letter-spacing:-0.01em; color:var(--ink);}
.lp-brand-mark{display:grid; place-items:center; width:30px; height:30px; border-radius:9px; background:var(--blue); color:#fff; font-size:15px;}
.lp-brand--sm{font-size:16px;}
.lp-nav-actions{display:flex; align-items:center; gap:clamp(10px,2.4vw,26px);}
.lp-navlink{color:var(--ink-2); font-size:15px; font-weight:500; text-decoration:none; transition:color .15s;}
.lp-navlink:hover{color:var(--ink);}

/* ── buttons ── */
.lp-btn{display:inline-flex; align-items:center; gap:10px; font-family:inherit; font-weight:600; text-decoration:none; border-radius:999px; cursor:pointer; border:1px solid transparent; transition:transform .16s cubic-bezier(.2,.7,.2,1), box-shadow .16s, background .16s; white-space:nowrap;}
.lp-btn--primary{background:var(--blue); color:#fff; padding:16px 28px; font-size:17px; box-shadow:0 10px 24px -10px color-mix(in oklab,var(--blue) 70%,transparent);}
.lp-btn--primary:hover{background:var(--blue-d); transform:translateY(-2px); box-shadow:0 16px 30px -12px color-mix(in oklab,var(--blue) 70%,transparent);}
.lp-btn--ghost{background:var(--paper-2); color:var(--ink); padding:16px 26px; font-size:17px; border-color:var(--line); box-shadow:0 1px 0 var(--line);}
.lp-btn--ghost:hover{border-color:#d8cfc0; transform:translateY(-2px);}
.lp-btn--sm{padding:10px 18px; font-size:15px;}
.lp-btn--lg{padding:20px 38px; font-size:20px;}
.lp-btn-arrow{transition:transform .18s;}
.lp-btn:hover .lp-btn-arrow{transform:translateX(4px);}

/* ── hero ── */
.lp-hero{position:relative; overflow:hidden; padding-block:clamp(48px,9vw,104px);}
.lp-glow{position:absolute; inset:-20% -10% auto -10%; height:120%; pointer-events:none;
  background:radial-gradient(60% 55% at 22% 30%, color-mix(in oklab,var(--amber) 26%,transparent), transparent 70%),
             radial-gradient(55% 55% at 82% 18%, color-mix(in oklab,var(--blue) 22%,transparent), transparent 68%);
  filter:blur(6px); opacity:.9;}
.lp-hero-in{position:relative; display:grid; grid-template-columns:1.05fr .95fr; gap:clamp(32px,5vw,64px); align-items:center;}
.lp-eyebrow{font-size:15px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--blue);}
.lp-h1{font-family:var(--font-display); font-weight:600; font-size:clamp(3rem,8.4vw,6.6rem); line-height:.96; letter-spacing:-0.02em; margin:18px 0 0; text-wrap:balance; color:var(--ink);}
.lp-lead{margin:26px 0 0; font-size:clamp(1.15rem,1.9vw,1.5rem); line-height:1.5; color:var(--ink-2); max-width:30ch;}
.lp-hero-cta{display:flex; flex-wrap:wrap; gap:14px; margin-top:34px;}
.lp-trust{margin-top:22px; font-size:15px; color:var(--ink-3);}

/* ── hero 3D stage ── */
.lp-stage{position:relative; perspective:1400px; --mx:0; --my:0;}
.lp-browser{position:relative; z-index:2; border-radius:18px; background:var(--paper-2); border:1px solid var(--line);
  box-shadow:0 40px 80px -34px rgba(40,30,15,.4), 0 8px 24px -12px rgba(40,30,15,.18);
  transform:rotateY(calc(var(--mx)*-9deg)) rotateX(calc(var(--my)*7deg)) translateZ(0); transform-style:preserve-3d; transition:transform .2s ease-out; overflow:hidden;}
.lp-browser-bar{display:flex; align-items:center; gap:7px; padding:13px 16px; border-bottom:1px solid var(--line); background:var(--sink);}
.lp-dot{width:10px; height:10px; border-radius:50%; background:#d9cfbf;}
.lp-url{margin-left:12px; font-size:12.5px; color:var(--ink-3); background:var(--paper-2); border:1px solid var(--line); border-radius:7px; padding:4px 12px;}
.lp-canvas{padding:18px; display:flex; flex-direction:column; gap:14px;}
.lp-blk{border-radius:12px; animation:lp-pop .6s both cubic-bezier(.2,.8,.2,1);}
.lp-blk--hero{background:linear-gradient(135deg, color-mix(in oklab,var(--blue) 16%,var(--paper-2)), var(--paper-2)); border:1px solid var(--line); padding:20px; display:flex; flex-direction:column; gap:10px;}
.lp-blk-title{height:16px; width:62%; border-radius:6px; background:var(--blue);}
.lp-blk-line{height:9px; width:88%; border-radius:5px; background:#e4dccf;}
.lp-blk-line--short{width:54%;}
.lp-blk-pill{height:26px; width:120px; border-radius:999px; background:var(--amber); margin-top:4px;}
.lp-row{display:flex; gap:14px;}
.lp-blk--card{flex:1; height:78px;}
.lp-blk--tile{flex:1; height:52px;}
.lp-c-teal{background:color-mix(in oklab,var(--teal) 24%,var(--paper-2)); border:1px solid color-mix(in oklab,var(--teal) 30%,var(--line));}
.lp-c-amber{background:color-mix(in oklab,var(--amber) 26%,var(--paper-2)); border:1px solid color-mix(in oklab,var(--amber) 32%,var(--line));}
.lp-c-rose{background:color-mix(in oklab,var(--rose) 24%,var(--paper-2)); border:1px solid color-mix(in oklab,var(--rose) 30%,var(--line));}
.lp-c-blue{background:color-mix(in oklab,var(--blue) 18%,var(--paper-2)); border:1px solid color-mix(in oklab,var(--blue) 26%,var(--line));}
.lp-chip{position:absolute; border-radius:14px; z-index:3; box-shadow:0 16px 30px -14px rgba(40,30,15,.4); animation:lp-pop .6s both cubic-bezier(.2,.8,.2,1);}
.lp-chip--1{width:66px; height:66px; top:-26px; right:8%; transform:translate3d(calc(var(--mx)*26px), calc(var(--my)*26px), 0) rotate(-8deg);}
.lp-chip--2{width:52px; height:52px; bottom:6%; left:-24px; transform:translate3d(calc(var(--mx)*-34px), calc(var(--my)*-20px), 0) rotate(9deg);}
.lp-chip--3{width:44px; height:44px; bottom:-22px; right:22%; transform:translate3d(calc(var(--mx)*20px), calc(var(--my)*30px), 0) rotate(6deg);}

/* ── sections ── */
.lp-section{padding-block:clamp(60px,9vw,128px);}
.lp-section--tint{background:linear-gradient(var(--sink),var(--sink));}
.lp-kick{font-size:14px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--blue); margin:0 0 14px;}
.lp-h2{font-family:var(--font-display); font-weight:600; font-size:clamp(2rem,4.6vw,3.4rem); line-height:1.05; letter-spacing:-0.02em; margin:0; color:var(--ink); text-wrap:balance;}
.lp-h2--wide{max-width:16ch; margin-inline:auto;}
.lp-sub{margin:20px 0 0; font-size:clamp(1.05rem,1.6vw,1.3rem); line-height:1.6; color:var(--ink-2); max-width:46ch;}
.lp-sub--center{margin-inline:auto; text-align:center;}
.lp-split{display:grid; grid-template-columns:1fr 1fr; gap:clamp(32px,6vw,80px); align-items:center;}
.lp-split--rev .lp-split-copy{order:2;}
.lp-center{text-align:center; max-width:40ch; margin:0 auto 52px;}
.lp-own{text-align:center; max-width:46ch; margin:0 auto;}

/* drag/drop demo */
.lp-demo{background:var(--paper-2); border:1px solid var(--line); border-radius:20px; padding:22px; box-shadow:0 30px 60px -34px rgba(40,30,15,.32);}
.lp-palette{display:flex; flex-wrap:wrap; gap:8px; padding-bottom:18px; border-bottom:1px dashed var(--line); margin-bottom:18px;}
.lp-tag{font-size:13px; font-weight:600; padding:7px 13px; border-radius:9px; color:var(--ink);}
.lp-c-blue.lp-tag{background:color-mix(in oklab,var(--blue) 14%,#fff);}
.lp-c-teal.lp-tag{background:color-mix(in oklab,var(--teal) 16%,#fff);}
.lp-c-amber.lp-tag{background:color-mix(in oklab,var(--amber) 18%,#fff);}
.lp-c-rose.lp-tag{background:color-mix(in oklab,var(--rose) 16%,#fff);}
.lp-demo-page{display:flex; flex-direction:column; gap:12px;}
.lp-mini{flex:1; height:60px; border-radius:11px;}

/* publish demo */
.lp-publish{background:var(--paper-2); border:1px solid var(--line); border-radius:20px; padding:34px; text-align:center; box-shadow:0 30px 60px -34px rgba(40,30,15,.32);}
.lp-publish-btn{display:inline-block; background:var(--blue); color:#fff; font-weight:600; font-size:18px; padding:15px 40px; border-radius:999px; box-shadow:0 10px 22px -10px color-mix(in oklab,var(--blue) 70%,transparent);}
.lp-publish-flow{display:flex; align-items:center; justify-content:center; gap:12px; margin-top:28px; flex-wrap:wrap;}
.lp-step{font-size:14px; font-weight:600; padding:8px 16px; border-radius:999px; background:var(--sink); color:var(--ink-2);}
.lp-step--live{background:color-mix(in oklab,var(--teal) 18%,#fff); color:var(--teal);}
.lp-step-arrow{color:var(--ink-3);}
.lp-publish-url{margin:24px 0 0; font-size:15px; color:var(--ink-3);}

/* grow cards */
.lp-cards{display:grid; grid-template-columns:repeat(3,1fr); gap:22px; margin-top:56px;}
.lp-card{background:var(--paper-2); border:1px solid var(--line); border-radius:20px; padding:32px; box-shadow:0 26px 54px -36px rgba(40,30,15,.3); transition:transform .2s, box-shadow .2s;}
.lp-card:hover{transform:translateY(-4px); box-shadow:0 34px 60px -34px rgba(40,30,15,.34);}
.lp-card-icon{display:grid; place-items:center; width:56px; height:56px; border-radius:15px; font-size:26px; margin-bottom:20px;}
.lp-card--teal .lp-card-icon{background:color-mix(in oklab,var(--teal) 16%,#fff);}
.lp-card--amber .lp-card-icon{background:color-mix(in oklab,var(--amber) 18%,#fff);}
.lp-card--rose .lp-card-icon{background:color-mix(in oklab,var(--rose) 16%,#fff);}
.lp-card-title{font-family:var(--font-display); font-weight:600; font-size:1.5rem; margin:0 0 10px; color:var(--ink);}
.lp-card-text{margin:0; font-size:1.02rem; line-height:1.55; color:var(--ink-2);}

/* closing */
.lp-cta{position:relative; overflow:hidden; text-align:center; padding-block:clamp(72px,11vw,140px);}
.lp-glow--cta{inset:-30% -10% -30% -10%; height:auto; opacity:.85;}
.lp-cta-in{position:relative;}
.lp-cta-h{font-family:var(--font-display); font-weight:600; font-size:clamp(2.6rem,7vw,5rem); line-height:1; letter-spacing:-0.02em; margin:0; color:var(--ink);}
.lp-cta-sub{margin:20px 0 36px; font-size:clamp(1.1rem,2vw,1.4rem); color:var(--ink-2);}

/* footer */
.lp-footer{border-top:1px solid var(--line); padding-block:34px;}
.lp-footer-in{display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap;}
.lp-footer-links{display:flex; gap:22px;}

/* ── motion ── */
.lp-reveal{opacity:0; transform:translateY(26px); transition:opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1);}
.lp-reveal.is-in{opacity:1; transform:none;}
.lp-fade{opacity:0; animation:lp-fade-up .8s both cubic-bezier(.2,.7,.2,1);}
@keyframes lp-fade-up{from{opacity:0; transform:translateY(20px);} to{opacity:1; transform:none;}}
@keyframes lp-pop{from{opacity:0; transform:translateY(16px) scale(.96);} to{opacity:1; transform:none;}}
.lp-chip--1{animation-name:lp-pop, lp-float;} .lp-chip--2{animation-name:lp-pop, lp-float;} .lp-chip--3{animation-name:lp-pop, lp-float;}
.lp-chip{animation-duration:.6s, 6s; animation-iteration-count:1, infinite; animation-timing-function:cubic-bezier(.2,.8,.2,1), ease-in-out;}
@keyframes lp-float{0%,100%{translate:0 0;} 50%{translate:0 -10px;}}

/* ── responsive ── */
@media (max-width:560px){ .lp-nav-hide{display:none;} }
@media (max-width:880px){
  .lp-hero-in{grid-template-columns:1fr; gap:48px;}
  .lp-stage{max-width:460px; margin:0 auto;}
  .lp-split{grid-template-columns:1fr; gap:36px;}
  .lp-split--rev .lp-split-copy{order:0;}
  .lp-cards{grid-template-columns:1fr; gap:16px;}
  .lp-lead{max-width:38ch;}
}
@media (prefers-reduced-motion:reduce){
  .lp-reveal,.lp-fade{opacity:1 !important; transform:none !important; animation:none !important;}
  .lp-blk,.lp-chip{animation:none !important; opacity:1 !important;}
  .lp-browser{transform:none !important;}
}
`;
