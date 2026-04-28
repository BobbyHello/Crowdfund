export function HeroSection() {
  return (
    <section className="mt-10 grid gap-10 sm:mt-14 sm:grid-cols-12 sm:gap-12">
      <div className="sm:col-span-8">
        <p className="smallcaps text-[11px] font-medium text-accent">
          A Reading on Patronage
        </p>
        <h2 className="mt-4 font-serif text-[2.6rem] font-black leading-[1.04] tracking-tight sm:text-[3.25rem]">
          Back the work <em className="italic">that matters</em>, or get every stroop refunded.
        </h2>
        <p className="dropcap mt-6 text-base leading-relaxed text-muted sm:text-lg">
          Folio is goal-based crowdfunding on Stellar testnet. Pledge XLM into a Soroban escrow contract; if a campaign closes its goal in time, the beneficiary claims the pot in a single on-chain transfer. If the goal slips, every backer can pull their pledge straight out of escrow. Each pledge mints a soulbound supporter badge that stays in your wallet forever, win or lose.
        </p>
      </div>
      <aside className="sm:col-span-4 sm:border-l sm:border-border sm:pl-6">
        <p className="smallcaps text-[11px] font-medium text-subtle">In This Issue</p>
        <ol className="mt-4 space-y-4 text-sm">
          <Step n="01" label="Open a campaign" desc="Set a title, a goal in XLM, and a deadline." />
          <Step n="02" label="Pledge in XLM" desc="Funds escrow on-chain via the native asset contract." />
          <Step n="03" label="Claim or refund" desc="After the deadline, the contract decides who gets paid." />
        </ol>
      </aside>
    </section>
  );
}

function Step({ n, label, desc }: { n: string; label: string; desc: string }) {
  return (
    <li className="flex gap-4">
      <span className="font-mono text-xs font-medium text-accent">{n}</span>
      <div>
        <div className="font-medium text-fg">{label}</div>
        <div className="text-subtle">{desc}</div>
      </div>
    </li>
  );
}
