import React, { useEffect, useState } from 'react';
import { Camera, ClipboardList, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getAssignedTasks, type FieldTask } from '../services/fieldTaskService';

const FieldOfficerDashboard: React.FC = () => {
  const officer = useAuthStore(s => s.officer);
  const [tasks, setTasks] = useState<FieldTask[]>([]);

  useEffect(() => {
    if (officer) getAssignedTasks(officer.id).then(setTasks);
  }, [officer]);

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

            <Link
        to="/submit-evidence"
        className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 flex items-start gap-4 hover:border-primary-300 transition-colors"
      >
        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
          <Camera className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-dark">Submit Field Evidence</h2>
          <p className="text-xs text-gray-500 mt-1">
            Upload a geo-tagged photo, select a project, and add your field observation.
          </p>
        </div>
      </Link>

      <Link
        to="/my-submissions"
        className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 flex items-start gap-4 hover:border-primary-300 transition-colors"
      >
        <div className="w-10 h-10 rounded-full bg-secondary-100 flex items-center justify-center flex-shrink-0">
          <ClipboardList className="w-5 h-5 text-secondary-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-dark">My Submissions</h2>
          <p className="text-xs text-gray-500 mt-1">
            View your submission history and trust scores.
          </p>
        </div>
      </Link>

      {tasks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-text-dark">Today's Field Tasks</h2>
          {tasks.map(task => (
            <div key={task.id} className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${task.priority === 'high' ? 'text-rose-500' : 'text-amber-500'}`} />
                <div>
                  <p className="text-sm font-semibold text-text-dark">{task.projectName}</p>
                  <p className="text-xs text-gray-500">{task.description}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Due: {task.dueLabel}</p>
                </div>
              </div>
              <Link
                to="/submit-evidence"
                className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-3 py-1.5 rounded shadow-sm whitespace-nowrap"
              >
                Submit Inspection
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FieldOfficerDashboard;