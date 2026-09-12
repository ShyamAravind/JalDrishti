const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface FieldEvidenceSubmissionInput {
  officerId: string;
  officerName: string;
  district: string;
  projectId: string;
  projectName: string;
  inspectionType: string;
  observation: string;
  lat: number;
  lng: number;
  capturedDate?: string;
  capturedTime?: string;
  trustScore: number;
  confidenceLevel: string;
  checks: { id: string; label: string; status: string; detail: string }[];
}

export async function submitFieldEvidence(
  input: FieldEvidenceSubmissionInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/field-evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.message || `Server error (${res.status})` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the backend server.' };
  }
}