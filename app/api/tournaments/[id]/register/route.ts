import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id: tournamentId } = await params;
  const body = await req.json();
  const { side } = body;

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (tournament.status !== "REGISTRATION_OPEN") {
    return NextResponse.json({ error: "Registration is closed" }, { status: 400 });
  }

  const isOpenQuestion = tournament.type === "OPEN_QUESTION";
  if (!isOpenQuestion && side !== "FOR" && side !== "AGAINST") {
    return NextResponse.json({ error: "side must be FOR or AGAINST" }, { status: 400 });
  }

  // Atomic check + insert to prevent race conditions
  try {
    const registration = await prisma.$transaction(async (tx) => {
      const existing = await tx.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId, userId } },
      });
      if (existing) throw new Error("Already registered");

      const user = await tx.user.findUnique({ where: { id: userId }, select: { elo: true } });

      return tx.tournamentRegistration.create({
        data: {
          tournamentId,
          userId,
          side: isOpenQuestion ? null : side,
          seedElo: user?.elo ?? 1200,
          status: tournament.entryFeePence === 0 ? "REGISTERED" : "PENDING_PAYMENT",
        },
      });
    });

    // Free tournament — no Stripe needed
    if (tournament.entryFeePence === 0) {
      return NextResponse.json({ registered: true, registrationId: registration.id });
    }

    // Paid tournament — create Stripe Checkout Session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            unit_amount: tournament.entryFeePence,
            product_data: { name: `Entry: ${tournament.title}` },
          },
          quantity: 1,
        },
      ],
      metadata: { registrationId: registration.id, tournamentId, userId },
      success_url: `${appUrl}/tournaments/${tournamentId}?registered=true`,
      cancel_url: `${appUrl}/tournaments/${tournamentId}`,
    });

    await prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: { stripeCheckoutId: checkoutSession.id },
    });

    return NextResponse.json({ checkoutUrl: checkoutSession.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    if (message === "Already registered") {
      return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
