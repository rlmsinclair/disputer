import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { registrationId, tournamentId } = session.metadata ?? {};
    if (!registrationId || !tournamentId) return NextResponse.json({ ok: true });

    const user = await prisma.tournamentRegistration.findUnique({
      where: { id: registrationId },
      include: { user: { select: { elo: true } } },
    });
    if (!user) return NextResponse.json({ ok: true });

    await prisma.$transaction(async (tx) => {
      await tx.tournamentRegistration.update({
        where: { id: registrationId },
        data: {
          status: "REGISTERED",
          stripePaymentIntentId: session.payment_intent as string ?? null,
          seedElo: user.user.elo,
        },
      });

      const tournament = await tx.tournament.findUnique({
        where: { id: tournamentId },
        select: { entryFeePence: true },
      });

      if (tournament) {
        await tx.tournament.update({
          where: { id: tournamentId },
          data: { prizePoolPence: { increment: tournament.entryFeePence } },
        });
      }
    });
  }

  return NextResponse.json({ ok: true });
}
