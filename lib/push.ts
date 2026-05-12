import webpush from "web-push";
import { prisma } from "@/lib/prisma";

let vapidInitialised = false;

function ensureVapid() {
  if (vapidInitialised) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  vapidInitialised = true;
}

export async function sendTurnNotification(userId: string, disputeId: string) {
  ensureVapid();
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  const payload = JSON.stringify({
    title: "Your turn!",
    body: "It's your turn to make your argument.",
    url: `/dispute/${disputeId}`,
  });

  await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );
}
