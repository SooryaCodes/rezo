import { AsideCard, AuthShell } from "@/components/AuthShell";
import { AuthFlow } from "@/components/AuthFlow";

export const metadata = { title: "Sign in — Rezo" };

export default function SigninPage() {
  return (
    <AuthShell
      aside={
        <div className="flex flex-col gap-6 max-w-[420px]">
          <h2 className="text-3xl font-bold tracking-tighter">
            Welcome back.
          </h2>
          <AsideCard
            quote={
              "Two of our own orders sat in dispute limbo for 25 days. One parcel was neither " +
              "delivered nor returned, so no refund could ever trigger, and nobody was told. " +
              "That is the failure this was built for."
            }
            attribution="Why Rezo exists"
          />
        </div>
      }
    >
      <AuthFlow intent="signin" />
    </AuthShell>
  );
}
