export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "horizon-works-outreach-agent",
    phase: 1,
    integrations: {
      gemini: "not_configured",
      supabase: "not_configured",
      leadSources: "disabled_until_reviewed",
      instagramSending: "not_supported"
    }
  });
}
