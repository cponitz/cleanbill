import Link from "next/link";
import { StartForm } from "@/components/InquiryForms";
import { PhotoSlot } from "@/components/ui";
import { HOME } from "@/lib/site";

// Home (SPEC-07 §01): editorial hero + "Start with either" card, photo slot, four-step timeline, navy fee band,
// "You can do this yourself" callout, "Also from …" cards.
export default function Home() {
  return (
    <>
      <section className="wrap grid items-end gap-10 pb-16 pt-12 md:grid-cols-[1.2fr_.8fr] md:gap-16 md:pt-[88px] md:pb-20">
        <div className="flex flex-col gap-5">
          <div className="eyebrow">{HOME.eyebrow}</div>
          <h1 className="display">{HOME.h1}</h1>
          <p className="lead lead-lg" style={{ maxWidth: 560 }}>{HOME.lead}</p>
          <div className="order-last grid grid-cols-3 gap-6 pt-2 md:order-none md:flex md:gap-10">
            {HOME.stats.map(([n, t]) => <div key={t}><div className="stat stat-hero">{n}</div><div className="fine">{t}</div></div>)}
          </div>
        </div>
        <StartForm />
      </section>

      <div className="wrap"><PhotoSlot label={HOME.photo} style={{ height: 420 }} className="max-md:!h-[220px]" /></div>

      <section className="wrap section flex flex-col items-center gap-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="h2 h2-center">{HOME.howTitle}</h2>
          <p className="lead" style={{ maxWidth: 520 }}>{HOME.howSub}</p>
        </div>
        <ol className="timeline m-0 w-full list-none p-0 text-center">
          {HOME.steps.map(([t, b], i) => (
            <li key={t} className="flex flex-col items-center gap-3">
              <span className="timeline-n">{i + 1}</span>
              <div className="h3" style={{ fontSize: 18 }}>{t}</div>
              <p className="text-[15px] text-muted">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-navy py-14 md:py-20">
        <div className="wrap grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <div className="flex flex-col gap-5">
            <h2 className="h2 !text-white">{HOME.fee.title}</h2>
            <p className="body-17 !text-on-dark">{HOME.fee.body}</p>
            <Link href="/pricing" className="btn btn-white self-start">{HOME.fee.cta}</Link>
          </div>
          <div className="ledger ledger-dark rounded-2xl border border-white/15 bg-white/[.06] px-6 py-2">
            {HOME.fee.rows.map(([l, v], i) => (
              <div key={l} className="ledger-row">{i === 2 ? <b>{l}</b> : <span>{l}</span>}{i === 2 ? <b className="text-[18px]">{v}</b> : <b>{v}</b>}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap pt-14 md:pt-[88px]">
        <div className="callout grid items-center gap-8 md:grid-cols-2 md:gap-12">
          <div className="flex flex-col gap-4">
            <h2 className="h2 h2-callout">{HOME.diy.title}</h2>
            <p className="body-lg">{HOME.diy.body}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card card-sm" style={{ gap: 6 }}><div className="h3" style={{ fontSize: 16 }}>{HOME.diy.us[0]}</div><p className="text-[14px] text-body">{HOME.diy.us[1]}</p><p className="text-[14px] text-body">{HOME.diy.us[2]}</p></div>
            <div className="card card-sm card-dark" style={{ gap: 6 }}><div className="h3" style={{ fontSize: 16 }}>{HOME.diy.self[0]}</div><p className="text-[14px]">{HOME.diy.self[1]}</p><p className="text-[14px]">{HOME.diy.self[2]}</p></div>
          </div>
        </div>
      </section>

      <section className="wrap section flex flex-col gap-10">
        <h2 className="h2 h2-center">{HOME.alsoTitle}</h2>
        <div className="grid-3">
          {HOME.also.map((c) => (
            <Link key={c.href} href={c.href} className="card !text-inherit hover:border-teal" style={{ gap: 8 }}>
              <div className={`eyebrow eyebrow-sm ${c.sand ? "eyebrow-sand" : ""}`}>{c.eyebrow}</div>
              <div className="h3">{c.title}</div>
              <p className="text-[15px] text-muted">{c.body}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
