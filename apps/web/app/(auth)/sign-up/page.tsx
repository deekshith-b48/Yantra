import { SignUp } from "@clerk/nextjs"

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <SignUp
        appearance={{
          variables: {
            colorBackground: "#18181b",
            colorText: "#fafafa",
            colorPrimary: "#6366f1",
            colorInputBackground: "#27272a",
            colorInputText: "#fafafa",
          },
        }}
      />
    </div>
  )
}
