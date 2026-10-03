/**
 * Przełącznik trybu pracy bez backendu.
 *
 * Funkcja, a nie stała, żeby testy mogły zmieniać `import.meta.env` przez `vi.stubEnv`.
 */
export function shouldUseFixtures(): boolean {
  return import.meta.env.VITE_USE_FIXTURES === 'true';
}
