import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
])

export default clerkMiddleware(async (auth, request) => {
  const { userId, redirectToSignIn } = auth()

  if (!userId && !isPublicRoute(request)) {
    return redirectToSignIn({ returnBackUrl: request.url })
  }
})

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
}
