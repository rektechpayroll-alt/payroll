import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f1f3ee] px-4 py-12">
      <SignUp />
    </div>
  );
}
