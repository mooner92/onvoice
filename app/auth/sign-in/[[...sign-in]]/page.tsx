import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="w-full h-full items-center justify-center">
      <SignIn />
    </main>
  );
}
