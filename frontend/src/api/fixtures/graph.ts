import type { GraphResponse } from '@/api/graph';

/**
 * Fixture grafu uprawnień — dokładnie w kształcie oczekiwanej odpowiedzi 4.6.
 *
 * Literał TS z jawnym typem (nie `.json`), więc literówka w nazwie pola jest błędem kompilacji.
 * 12 węzłów: 5 osób zespołu QA, 4 osoby zespołu DEV i 3 repozytoria; 9 krawędzi dzierżaw
 * (po jednej na osobę). Repozytorium `core-api` ma wyłącznie dzierżawy `ACTIVE`, więc filtr
 * „Tylko podwyższone ryzyko” ma co odfiltrować. Status węzła to najgorszy status jego dzierżaw.
 */
export const graphFixture: GraphResponse = {
  nodes: [
    { id: 'user:anna-qa', type: 'user', data: { label: 'anna-qa', team: 'QA', status: 'ACTIVE' } },
    {
      id: 'user:bartek-qa',
      type: 'user',
      data: { label: 'bartek-qa', team: 'QA', status: 'ACTIVE' },
    },
    {
      id: 'user:celina-qa',
      type: 'user',
      data: { label: 'celina-qa', team: 'QA', status: 'WARNING' },
    },
    {
      id: 'user:dawid-qa',
      type: 'user',
      data: { label: 'dawid-qa', team: 'QA', status: 'EXPIRED' },
    },
    { id: 'user:ewa-qa', type: 'user', data: { label: 'ewa-qa', team: 'QA', status: 'ACTIVE' } },
    {
      id: 'user:filip-dev',
      type: 'user',
      data: { label: 'filip-dev', team: 'DEV', status: 'ACTIVE' },
    },
    {
      id: 'user:gosia-dev',
      type: 'user',
      data: { label: 'gosia-dev', team: 'DEV', status: 'WARNING' },
    },
    {
      id: 'user:hubert-dev',
      type: 'user',
      data: { label: 'hubert-dev', team: 'DEV', status: 'ACTIVE' },
    },
    {
      id: 'user:irek-dev',
      type: 'user',
      data: { label: 'irek-dev', team: 'DEV', status: 'WARNING' },
    },
    { id: 'repo:core-api', type: 'repo', data: { label: 'core-api', status: 'ACTIVE' } },
    { id: 'repo:payment-gw', type: 'repo', data: { label: 'payment-gw', status: 'EXPIRED' } },
    {
      id: 'repo:qa-automation',
      type: 'repo',
      data: { label: 'qa-automation', status: 'WARNING' },
    },
  ],
  edges: [
    {
      id: 'lease:anna-qa:qa-automation',
      source: 'user:anna-qa',
      target: 'repo:qa-automation',
      data: { role: 'write', status: 'ACTIVE' },
    },
    {
      id: 'lease:bartek-qa:qa-automation',
      source: 'user:bartek-qa',
      target: 'repo:qa-automation',
      data: { role: 'read', status: 'ACTIVE' },
    },
    {
      id: 'lease:celina-qa:payment-gw',
      source: 'user:celina-qa',
      target: 'repo:payment-gw',
      data: { role: 'read', status: 'WARNING' },
    },
    {
      id: 'lease:dawid-qa:payment-gw',
      source: 'user:dawid-qa',
      target: 'repo:payment-gw',
      data: { role: 'read', status: 'EXPIRED' },
    },
    {
      id: 'lease:ewa-qa:core-api',
      source: 'user:ewa-qa',
      target: 'repo:core-api',
      data: { role: 'read', status: 'ACTIVE' },
    },
    {
      id: 'lease:filip-dev:core-api',
      source: 'user:filip-dev',
      target: 'repo:core-api',
      data: { role: 'write', status: 'ACTIVE' },
    },
    {
      id: 'lease:gosia-dev:payment-gw',
      source: 'user:gosia-dev',
      target: 'repo:payment-gw',
      data: { role: 'write', status: 'WARNING' },
    },
    {
      id: 'lease:hubert-dev:core-api',
      source: 'user:hubert-dev',
      target: 'repo:core-api',
      data: { role: 'admin', status: 'ACTIVE' },
    },
    {
      id: 'lease:irek-dev:qa-automation',
      source: 'user:irek-dev',
      target: 'repo:qa-automation',
      data: { role: 'read', status: 'WARNING' },
    },
  ],
};
