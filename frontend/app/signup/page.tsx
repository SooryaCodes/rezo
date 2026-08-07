import { AsideCard, AuthShell } from "@/components/AuthShell";
import { AuthFlow } from "@/components/AuthFlow";

export const metadata = { title: "Start free — Rezo" };

export default function SignupPage() {
  return (
    <AuthShell
      aside={
        <div className="flex flex-col gap-6 max-w-[420px]">
          <h2 className="text-3xl font-bold tracking-tighter">
            Your disputes, settled before you&rsquo;ve finished reading them.
          </h2>
          <AsideCard
            points={[
              "Three minutes to set up. Answer a few questions and we compile the policy your agents cite.",
              "Starts cautious. A new store resolves only small claims on its own until you raise the limit.",
              "Nothing hidden. Every decision carries the clause, the evidence and a full audit trail.",
              "Free for your first 50 cases, and a case that comes to you costs nothing.",
            ]}
          />
        </div>
      }
    >
      <AuthFlow intent="signup" />
    </AuthShell>
  );
}
