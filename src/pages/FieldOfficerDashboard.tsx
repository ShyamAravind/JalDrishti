import React from 'react';
import { Camera, ClipboardList } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const FieldOfficerDashboard: React.FC = () => {
  const officer = useAuthStore(s => s.officer);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-xl font-bold text-text-dark">
          Welcome, {officer?.name}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Field Officer — {officer?.district} District
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
          <Camera className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-dark">Field Evidence Submission</h2>
          <p className="text-xs text-gray-500 mt-1">
            The evidence upload form is coming in the next phase — this page confirms
            your Field Officer login and routing work correctly first.
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-secondary-100 flex items-center justify-center flex-shrink-0">
          <ClipboardList className="w-5 h-5 text-secondary-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-dark">Assigned Tasks</h2>
          <p className="text-xs text-gray-500 mt-1">
            Task assignments will appear here in a later phase.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FieldOfficerDashboard;