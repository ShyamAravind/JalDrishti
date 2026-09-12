export interface OfficerAccount {
  id: string;
  name: string;
  role: string;
  district: string; // '' = all districts (admin)
  isAdmin: boolean;
  isFieldOfficer: boolean;
}

// Two-account prototype access: a District Watershed Officer (full
// analytics/decision-support access) and a Field Officer (simplified
// evidence-submission access, no GIS/analysis tooling). Both
// authenticated against the real backend (bcrypt + signed JWT) — see
// authStore.ts.
export const OFFICER_ACCOUNTS: OfficerAccount[] = [
  { id: 'dungarpur', name: 'Officer K. Patel', role: 'District Watershed Officer', district: 'Dungarpur', isAdmin: false, isFieldOfficer: false },
  { id: 'ravi-field', name: 'Ravi Kumar', role: 'Field Officer', district: 'Dungarpur', isAdmin: false, isFieldOfficer: true },
];