import type { Prisma } from "@prisma/client";

export type NotificationType = "REQUEST_APPROVED" | "REQUEST_REJECTED" | "OVERDUE" | "DUE_SOON" | "RETURN_RECORDED" | "BOOK_BORROWED" | "SUGGESTION_UPDATE";

/** Creates an in-app notification inside the caller's transaction. */
export async function notifyTx(
  db: Prisma.TransactionClient,
  n: { userId: string; type: NotificationType; title: string; message: string; transactionId?: string | null; createdById?: string | null },
): Promise<void> {
  await db.notification.create({ data: { ...n, transactionId: n.transactionId ?? null, createdById: n.createdById ?? null } });
}
