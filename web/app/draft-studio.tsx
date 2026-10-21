"use client";

import { useState, type FormEvent } from "react";

interface DraftResponse {
  ok?: boolean;
  error?: { code?: string; message?: string };
  draft?: {
    draftText: string;
    evidenceRefs: string[];
    reviewNotes: string[];
    model: string;
    status: "needs_review";
    requiresManualReview: true;
    saved: false;
  };
}

export default function DraftStudio() {
  const [accessKey, setAccessKey] = useState("");
  const [evidenceBundle, setEvidenceBundle] = useState("");
  const [tone, setTone] = useState("warm_professional");
  const [draftText, setDraftText] = useState("");
  const [evidenceRefs, setEvidenceRefs] = useState<string[]>([]);
  const [reviewNotes, setReviewNotes] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  async function generateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setDraftText("");
    setEvidenceRefs([]);
    setReviewNotes([]);
    setModel("");

    if (!accessKey.trim()) {
      setError("Enter the draft-studio access key configured on the server.");
      return;
    }
    if (!evidenceBundle.trim()) {
      setError("Paste the research evidence bundle from the extension first.");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-draft-studio-key": accessKey
        },
        cache: "no-store",
        body: JSON.stringify({ evidenceBundle, tone })
      });
      const payload = await response.json() as DraftResponse;
      if (!response.ok || !payload.ok || !payload.draft) {
        setError(payload.error?.message || "Draft generation failed. Your research bundle was not changed.");
        return;
      }

      setDraftText(payload.draft.draftText);
      setEvidenceRefs(payload.draft.evidenceRefs);
      setReviewNotes(payload.draft.reviewNotes);
      setModel(payload.draft.model);
      setStatus("Draft generated. It is not saved and must be reviewed before you use it.");
    } catch {
      setError("Could not reach the draft API. Check the app connection and try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyDraft() {
    if (!draftText.trim()) return;
    setError("");
    setStatus("");
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(draftText);
      setStatus("Current edited draft copied to the clipboard. It has not been sent.");
    } catch {
      setError("Clipboard access was unavailable. Select the draft text and copy it manually.");
    } finally {
      setIsCopying(false);
    }
  }

  return (
    <section className="draft-studio" aria-labelledby="draft-studio-title">
      <div className="studio-heading">
        <div>
          <p className="eyebrow">PHASE 4 · AI DRAFTING</p>
          <h2 id="draft-studio-title">Evidence-backed draft studio</h2>
        </div>
        <span className="studio-badge">MANUAL REVIEW</span>
      </div>
      <p className="studio-intro">
        Paste a research evidence bundle prepared by the Chrome extension. Gemini receives only the supplied bundle; this endpoint does not fetch source pages or open social profiles.
      </p>

      <form className="studio-form" onSubmit={generateDraft}>
        <label className="studio-field">
          <span>Draft-studio access key</span>
          <input
            type="password"
            autoComplete="off"
            value={accessKey}
            onChange={(event) => setAccessKey(event.target.value)}
            placeholder="Enter the server-configured access key"
            required
          />
          <small>Held only in this page's memory for this session. It is not saved to local storage.</small>
        </label>

        <label className="studio-field">
          <span>Research evidence bundle</span>
          <textarea
            value={evidenceBundle}
            onChange={(event) => {
              setEvidenceBundle(event.target.value);
              setDraftText("");
              setEvidenceRefs([]);
              setReviewNotes([]);
              setModel("");
              setStatus("");
            }}
            rows={13}
            maxLength={18000}
            placeholder={"Paste the full text from Prepare a research bundle in the extension.\n\nIt should include CAMPAIGN CONTEXT, BUSINESS PROFILE, source URLs, research notes, and SAFE USE."}
            required
          />
          <small>{evidenceBundle.length.toLocaleString()} / 18,000 characters</small>
        </label>

        <label className="studio-field studio-tone">
          <span>Writing tone</span>
          <select value={tone} onChange={(event) => setTone(event.target.value)}>
            <option value="warm_professional">Warm professional</option>
            <option value="concise">Concise and direct</option>
            <option value="consultative">Consultative</option>
          </select>
        </label>

        <p className="studio-privacy-note">
          The Gemini API key stays on the server. The separate access key is a single shared gate, not a multi-user login system. Only enable this endpoint behind appropriate access controls.
        </p>

        <div className="studio-actions">
          <button className="studio-primary" type="submit" disabled={isGenerating}>
            {isGenerating ? "Generating…" : "Generate draft"}
          </button>
          {isGenerating && <span role="status" className="studio-live">Waiting for Gemini. No messages will be sent.</span>}
        </div>
      </form>

      {error && <p className="studio-message studio-error" role="alert">{error}</p>}
      {status && <p className="studio-message studio-success" role="status">{status}</p>}

      {draftText && (
        <div className="draft-result">
          <div className="draft-result-heading">
            <div>
              <p className="eyebrow">DRAFT OUTPUT</p>
              <h3>Editable message</h3>
            </div>
            <span className="draft-review-state">Needs review</span>
          </div>
          <label className="studio-field">
            <span>Message text — edit before copying</span>
            <textarea
              className="draft-editor"
              value={draftText}
              onChange={(event) => {
                setDraftText(event.target.value);
                setStatus("Draft edited in this page only. Review it before copying.");
              }}
              rows={6}
              maxLength={1200}
            />
          </label>
          <div className="studio-actions">
            <button className="studio-primary" type="button" disabled={isCopying} onClick={copyDraft}>
              {isCopying ? "Copying…" : "Copy edited draft"}
            </button>
            {model && <span className="studio-model">Model: {model}</span>}
          </div>

          <div className="draft-review-panel">
            <h4>Before use</h4>
            <p>Review the business-specific wording against the original source yourself. Generated content is a suggestion, not a verified fact or an automatically saved record.</p>
            {reviewNotes.length > 0 && (
              <ul>{reviewNotes.map((note, index) => <li key={index}>{note}</li>)}</ul>
            )}
            {evidenceRefs.length > 0 && (
              <>
                <h4>Evidence references returned by the model</h4>
                <ul className="evidence-reference-list">
                  {evidenceRefs.map((url) => (
                    <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
