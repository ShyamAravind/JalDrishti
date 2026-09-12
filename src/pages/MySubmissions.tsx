import React, { useEffect, useState } from 'react';
import { ClipboardList, RefreshCw, AlertTriangle } from 'lucide-react';
import { getMyFieldEvidence, type FieldEvidenceSubmissionRecord } from '../services/fieldEvidenceService';
import { useAuthStore } from '../store/authStore';

const MySubmissions: React.FC = () => {
  const officer = useAuthStore(s => s.officer);
  const [submissions, setSubmissions] = useState<FieldEvidenceSubmissionRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!officer) return;
    getMyFieldEvidence(officer.id).then(outcome => {
      if (outcome.ok) {
        setSubmissions(outcome.data);
        setStatus('done');
      } else {
        setError(outcome.error);
        setStatus('error');
      }
    });
  }, [officer]);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-secondary-100 flex items-center justify-center flex-shrink-0">
          <ClipboardList className="w-5 h-5 text-secondary-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-text-dark">My Submissions</h1>
          <p className="text-xs text-gray-500">Field evidence you've submitted, most recent first.</p>
        </div>
      </div>

      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading your submissions...
        </div>
      )}

      {status === 'error' && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {status === 'done' && submissions.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-400">
          No submissions yet. Submit your first field evidence to see it here.
        </div>
      )}

      {status === 'done' && submissions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider bg-gray-50">
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Project</th>
                <th className="text-left px-4 py-2.5 font-medium">Type</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Trust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {submissions.map(s => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                    {new Date(s.submittedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-text-dark">{s.projectName}</td>
                  <td className="px-4 py-2.5 text-gray-600">{s.inspectionType}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      s.status === 'Accepted' ? 'bg-emerald-100 text-emerald-800' :
                      s.status === 'Flagged' ? 'bg-rose-100 text-rose-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-text-dark">
                    {s.trustScore ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MySubmissions;   