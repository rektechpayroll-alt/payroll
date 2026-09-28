import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public-first: the marketing site (/, /product, /compare, /pricing) stays open to
// anyone, since that's what's meant to be shared and browsed without an account.
// The actual product — /dashboard and everything it talks to — requires a signed-in
// session.
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/api(.*)", "/onboarding(.*)", "/admin(.*)"]);
// Scheduled jobs are called by Vercel Cron, not a signed-in user; they check CRON_SECRET themselves.
const isCronRoute = createRouteMatcher(["/api/cron/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req) && !isCronRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
