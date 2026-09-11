export interface OfficerAccount {
  id: string;
  name: string;
  role: string;
  district: string; // '' = all districts (admin)
  isAdmin: boolean;
}

// Single-account prototype access, restricted to the Dungarpur District
// Watershed Officer. Authenticated against the real backend (bcrypt +
// signed JWT) — see authStore.ts.
export const OFFICER_ACCOUNTS: OfficerAccount[] = [
  { id: 'dungarpur', name: 'Officer K. Patel', role: 'District Watershed Officer', district: 'Dungarpur', isAdmin: false },
];
