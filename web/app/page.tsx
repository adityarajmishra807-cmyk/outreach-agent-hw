const capabilities = [
  { title: "Campaign foundation", text: "Create a campaign with a niche, target location, service offer, source choices, and a maximum of 100 leads." },
  { title: "Persistent workflow", text: "Campaign and lead state will be checkpointed so the queue can resume after interruption." },
  { title: "Draft-only guarantee", text: "The product will prepare research-backed drafts. The user retains the final Send action." }
];

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topline">
        <div className="brand">HW</div>
        <div><p className="eyebrow">HORIZON WORKS</p><h1>Outreach Agent</h1></div>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">PHASE 1 · FOUNDATION</p>
          <h2>Find better prospects. Prepare more relevant outreach.</h2>
          <p>One workspace for lead research, evidence-backed personalization, and manual-first outreach. This dashboard is an initial scaffold; source integrations and AI drafting are not connected yet.</p>
        </div>
        <div className="hero-card">
          <span className="label">Campaign capacity</span>
          <strong>100 leads</strong>
          <span className="note">Maximum per campaign in the MVP</span>
        </div>
      </section>
      <h2 className="section-title">Product boundaries</h2>
      <section className="grid">
        {capabilities.map((item) => (
          <article className="card" key={item.title}>
            <span className="pill">MVP FOUNDATION</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </section>
      <p className="footer">Foundation scaffold · No Meta API · No automated message sending · Source adapters disabled until approved</p>
    </main>
  );
}
