import React, { useState, useEffect, useCallback } from 'react';
import exifr from 'exifr';
import { Camera, MapPin, RefreshCw, AlertTriangle, CheckCircle2, XCircle, AlertCircle, ShieldCheck } from 'lucide-react';
import { getProjects } from '../services/projectService';
import { getWatersheds } from '../services/watershedService';
import { evaluateFieldEvidence } from '../utils/evidenceValidationEngine';
import { useAuthStore } from '../store/authStore';
import type { Project, WatershedFeature, EvidenceValidationResult } from '../types';

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
  const [watersheds, setWatersheds] = useState<WatershedFeature[]>([]);
  const [projectId, setProjectId] = useState('');
  const [inspectionType, setInspectionType] = useState<string>(INSPECTION_TYPES[0]);
  const [observation, setObservation] = useState('');

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<ExtractedLocation | null>(null);
  const [exifStatus, setExifStatus] = useState<'idle' | 'reading' | 'found' | 'not-found' | 'error'>('idle');

  const [submitted, setSubmitted] = useState(false);
  const [validation, setValidation] = useState<EvidenceValidationResult | null>(null);

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
    getWatersheds().then(setWatersheds);
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
    if (!location) return;

    // Real, computed trust score — same evidenceValidationEngine used by
    // Geo Image Intel, run on this exact submission's real GPS coordinates,
    // timestamp, and selected project. No satellite call here (kept out
    // deliberately to keep this flow fast) — the engine gives honest
    // partial credit for that, it doesn't fail or fabricate a result.
    const result = evaluateFieldEvidence({
      lat: location.lat,
      lng: location.lng,
      source: 'EXIF Metadata',
      timestamp: location.date ? `${location.date} ${location.time || ''}` : undefined,
      watersheds,
      projects,
      targetProjectId: projectId,
    });
    setValidation(result);

    // Phase 2c: real trust score computed and shown below. Actual
    // persistence (saving this submission so it appears in "My
    // Submissions" and the District Officer's inbox) is Phase 2d — this
    // still does not save anything yet.
    setSubmitted(true);
  };
  const canSubmit = projectId && location && observation.trim().length > 0;

  if (submitted && validation) {
    return (
      <div className="p-6 max-w-xl mx-auto space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary-600" />
              <h1 className="text-sm font-bold text-text-dark">Geo Evidence Trust Score</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-text-dark">{validation.trustScore}<span className="text-xs text-gray-400 font-normal">/100</span></span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                validation.confidenceLevel === 'High' ? 'bg-emerald-100 text-emerald-800' :
                validation.confidenceLevel === 'Medium' ? 'bg-blue-100 text-blue-800' :
                'bg-rose-100 text-rose-800'
              }`}>
                {validation.confidenceLevel} Confidence
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-500">{validation.summary}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {validation.checks.map(chk => (
              <div key={chk.id} className="border border-gray-100 bg-gray-50/70 rounded p-2.5 flex items-start gap-2 text-xs">
                {chk.status === 'pass' && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />}
                {chk.status === 'warn' && <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />}
                {chk.status === 'fail' && <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />}
                <div>
                  <span className="font-bold text-text-dark block">{chk.label}</span>
                  <span className="text-[11px] text-gray-500">{chk.detail}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-gray-400 pt-2 border-t border-gray-100">
            This submission is not yet saved — persistence and appearing in "My Submissions" is a later phase.
          </p>
        </div>

        <button
          onClick={() => {
            setSubmitted(false);
            setValidation(null);
            setImageUrl(null);
            setLocation(null);
            setExifStatus('idle');
            setObservation('');
          }}
          className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-semibold"
        >
          Submit Another
        </button>
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