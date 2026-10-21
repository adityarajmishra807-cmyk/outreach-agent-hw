import DraftStudio from "./draft-studio";

const capabilities = [
  { title: "Evidence before personalization", text: "Use a research bundle containing the user-recorded facts and source URLs, with uncertain observations clearly separated." },
  { title: "Server-side Gemini", text: "The Gemini API key remains on the server. Requests require a separate access key and are disabled until explicitly enabled." },
  { title: "Human-controlled outreach", text: "Generated text stays editable and is not stored or sent. You review, copy, and send manually." }
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
          <p className="eyebrow">HORIZON WORKS · OUTREACH WORKSPACE</p>
          <h2>Turn verified research into more relevant outreach.</h2>
          <p>Prepare evidence in the Chrome extension, paste its research bundle here, and generate an editable draft for human review. The app does not scrape sources or send Instagram messages.</p>
        </div>
        <div className="hero-card">
          <span className="label">Campaign capacity</span>
          <strong>100 leads</strong>
          <span className="note">Maximum per campaign in the MVP</span>
        </div>
      </section>
      <h2 className="section-title">Drafting workflow</h2>
      <section className="grid">
        {capabilities.map((item) => (
          <article className="card" key={item.title}>
            <span className="pill">MVP FOUNDATION</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </section>
      <DraftStudio />
      <p className="footer">Local research in Chrome · Server-side Gemini only · Drafts are not saved · No automated Instagram message sending</p>
    </main>
  );
}
