import React, { useState, useEffect, useCallback } from 'react';
import exifr from 'exifr';
import { Camera, MapPin, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getProjects } from '../services/projectService';
import { useAuthStore } from '../store/authStore';
import type { Project } from '../types';

const INSPECTION_TYPES = [
  'Structure Inspection',
  'Maintenance Check',
  'Routine Verification',
  'Post-Monsoon Assessment',
] as const;

interface ExtractedLocation {
  lat: number;
  lng: number;
  date?: string;
  time?: string;
}

const FieldEvidenceSubmission: React.FC = () => {
  const officer = useAuthStore(s => s.officer);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [inspectionType, setInspectionType] = useState<string>(INSPECTION_TYPES[0]);
  const [observation, setObservation] = useState('');

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<ExtractedLocation | null>(null);
  const [exifStatus, setExifStatus] = useState<'idle' | 'reading' | 'found' | 'not-found' | 'error'>('idle');

  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getProjects().then(all => {
      // Field Officer only sees projects in their own district — same
      // scoping principle used everywhere else in this app.
      const scoped = officer && !officer.isAdmin
        ? all.filter(p => p.district === officer.district)
        : all;
      setProjects(scoped);
      if (scoped.length > 0) setProjectId(scoped[0].id);
    });
  }, [officer]);

  const handlePhoto = useCallback(async (file: File) => {
    setImageUrl(URL.createObjectURL(file));
    setExifStatus('reading');
    setLocation(null);

    try {
      const gps = await exifr.parse(file, true);
      if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
        const dateObj = gps.DateTimeOriginal || gps.CreateDate || gps.ModifyDate;
        const date = dateObj instanceof Date ? dateObj.toLocaleDateString() : undefined;
        const time = dateObj instanceof Date ? dateObj.toLocaleTimeString() : undefined;
        setLocation({ lat: gps.latitude, lng: gps.longitude, date, time });
        setExifStatus('found');
      } else {
        setExifStatus('not-found');
      }
    } catch {
      setExifStatus('error');
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePhoto(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Phase 2b: form + real EXIF extraction only. Trust-score computation
    // and actual persistence are separate phases (2c, 2d) — this
    // deliberately does not save anything yet.
    setSubmitted(true);
  };

  const canSubmit = projectId && location && observation.trim().length > 0;

  if (submitted) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-tertiary-600 mx-auto" />
          <h1 className="text-lg font-bold text-text-dark">Form captured successfully</h1>
          <p className="text-sm text-gray-500">
            This phase only confirms the form and EXIF extraction work end-to-end —
            trust-score computation and saving this submission come in the next phase.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setImageUrl(null);
              setLocation(null);
              setExifStatus('idle');
              setObservation('');
            }}
            className="mt-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-semibold"
          >
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text-dark">Field Evidence Submission</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Photo location is read directly from the image's EXIF metadata in your browser.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Project</label>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary-500"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Inspection Type</label>
          <select
            value={inspectionType}
            onChange={e => setInspectionType(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary-500"
          >
            {INSPECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Field Photo</label>
          {!imageUrl ? (
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-primary-300 text-sm text-gray-500">
              <Camera className="w-5 h-5" />
              Upload Geo-tagged Image
              <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
            </label>
          ) : (
            <div className="flex justify-center bg-gray-100 rounded-lg p-2">
              <img src={imageUrl} alt="Field evidence" className="max-h-48 object-contain rounded" />
            </div>
          )}
        </div>

        {exifStatus === 'reading' && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Reading location from image...
          </div>
        )}

        {exifStatus === 'found' && location && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
            <div className="flex items-center gap-1.5 font-semibold">
              <MapPin className="w-3.5 h-3.5" /> GPS detected
            </div>
            <p className="mt-0.5 font-mono">{location.lat.toFixed(4)}° N, {location.lng.toFixed(4)}° E</p>
            {location.date && <p className="mt-0.5">Captured: {location.date} {location.time}</p>}
          </div>
        )}

        {(exifStatus === 'not-found' || exifStatus === 'error') && (
          <div className="bg-accent-50 border border-accent-200 rounded-lg p-3 text-xs text-accent-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>No GPS coordinates found in this image's metadata. Submission requires a geo-tagged photo.</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Field Observation</label>
          <textarea
            value={observation}
            onChange={e => setObservation(e.target.value)}
            rows={3}
            placeholder="e.g. Structure appears functional. Minor vegetation growth observed."
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary-500 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Submit Evidence
        </button>
      </form>
    </div>
  );
};

export default FieldEvidenceSubmission;