import { prisma } from "../config/prisma.js";
import type { Prisma } from "@prisma/client";

export interface AuditEvent {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(event: AuditEvent): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: event.actorId ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      metadata: (event.metadata ?? null) as never,
    },
  });
}

export async function writeAuditTx(
  db: Prisma.TransactionClient,
  event: AuditEvent,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: event.actorId ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      metadata: (event.metadata ?? null) as never,
    },
  });
}