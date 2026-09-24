export type UUID = string & { readonly __uuid: unique symbol };
export type LocalDate = string & { readonly __localDate: unique symbol };
export type Instant = string;

export function newId(): UUID {
  return crypto.randomUUID() as UUID;
}

export function localDate(value: string): LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Fecha inválida.');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Fecha inválida.');
  }
  return value as LocalDate;
}

export interface OwnedRecord {
  readonly id: UUID;
  readonly personId: UUID;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export interface Revision extends OwnedRecord {
  readonly planId: UUID;
  readonly parentRevisionId: UUID | null;
  readonly name: string;
}
