import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

/**
 * Dev-only verification route. Throws once so we can confirm Sentry wiring during setup.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const error = new Error("Sentry verification error from garden");
  Sentry.captureException(error);
  throw error;
}
