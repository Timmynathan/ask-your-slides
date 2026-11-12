import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentReturn } from "@/components/plans/payment-return";

export const metadata: Metadata = { title: "Payment · Ask Your Slides" };

type Props = { searchParams: Promise<{ reference?: string; trxref?: string }> };

// Paystack sends the student here after paying (?reference=…&trxref=…). The page asks our server
// to verify the payment with Paystack; it never trusts the redirect itself.
async function Loaded({ searchParams }: Props) {
  const sp = await searchParams;
  return <PaymentReturn reference={sp.reference ?? sp.trxref ?? ""} />;
}

export default function PayReturn(props: Props) {
  return (
    <Suspense fallback={<PaymentReturn reference="" pending />}>
      <Loaded {...props} />
    </Suspense>
  );
}
