import type { Person } from './person.model';

/** Stable human labels distinguish homonyms without exposing storage identities. */
export function personDescription(person: Person, people: Person[]): string {
  const role = person.kind === 'personal' ? 'Mi espacio' : 'Cliente';
  const matches = people.filter(item => item.kind === person.kind && item.displayName.localeCompare(person.displayName, 'es', { sensitivity: 'base' }) === 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const ordinal = matches.length > 1 ? ` ${matches.findIndex(item => item.id === person.id) + 1}` : '';
  return `${role}${ordinal}${person.reference ? ` · ${person.reference}` : ''}`;
}
export function personLabel(person: Person, people: Person[]): string {
  return `${person.displayName} · ${personDescription(person, people)}`;
}
