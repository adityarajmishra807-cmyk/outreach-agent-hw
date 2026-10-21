export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasDraftAccessKey = Boolean(process.env.DRAFT_STUDIO_ACCESS_KEY && process.env.DRAFT_STUDIO_ACCESS_KEY.length >= 24);
  const configured = hasGeminiKey && hasDraftAccessKey;
  const enabled = process.env.GEMINI_DRAFTS_ENABLED === "true" && configured;

  return Response.json({
    status: "ok",
    service: "horizon-works-outreach-agent",
    phase: 4,
    integrations: {
      gemini: hasGeminiKey ? "server_key_configured" : "not_configured",
      geminiDraftGeneration: enabled
        ? "enabled"
        : configured
          ? "disabled_until_explicitly_enabled"
          : "not_configured",
      supabase: "not_configured",
      leadSources: "manual_assisted_only",
      instagramSending: "not_supported"
    }
  }, {
    headers: { "Cache-Control": "no-store" }
  });
}
