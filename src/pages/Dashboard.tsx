import React, { useEffect, useState, useMemo } from 'react';
import {
  Layers,
  CheckCircle,
  AlertTriangle,
  Star,
  Activity,
  ShieldCheck,
} from 'lucide-react';

import StatCard from '../components/StatCard';
import AlertsList from '../components/AlertsList';
import StatusChart from '../components/StatusChart';

import { getProjects } from '../services/projectService';
import { getWatersheds } from '../services/watershedService';
import { getAlerts } from '../services/alertService';
import {
  getGeoEvidence,
  computeAverageTrustScore,
} from '../services/evidenceService';

import { useAuthStore } from '../store/authStore';
import { useFilterStore } from '../store/filterStore';

import type {
  Project,
  MaintenanceAlert,
  GeoEvidence,
  WatershedFeature,
} from '../types';

const Dashboard: React.FC = () => {
  const officer = useAuthStore(s => s.officer);

  const district = useFilterStore(s => s.district);
  const setDistrict = useFilterStore(s => s.setDistrict);

  const watershedId = useFilterStore(s => s.watershedId);
  const setWatershedId = useFilterStore(s => s.setWatershedId);

  const [rawProjects, setRawProjects] = useState<Project[]>([]);
  const [rawWatersheds, setRawWatersheds] = useState<WatershedFeature[]>([]);
  const [alerts, setAlerts] = useState<MaintenanceAlert[]>([]);
  const [evidence, setEvidence] = useState<GeoEvidence[]>([]);

  useEffect(() => {
    Promise.all([
      getProjects(),
      getWatersheds(),
      getAlerts(),
      getGeoEvidence(),
    ]).then(
      ([allProjects, allWatersheds, allAlerts, allEvidence]) => {
        setRawProjects(allProjects);
        setRawWatersheds(allWatersheds);
        setAlerts(allAlerts);
        setEvidence(allEvidence);
      }
    );
  }, []);

  const districts = useMemo(() => {
    const dSet = new Set(
      rawWatersheds.map(w => w.properties.district)
    );

    return Array.from(dSet).sort();
  }, [rawWatersheds]);

  const availableWatersheds = useMemo(() => {
    if (!district) return rawWatersheds;

    return rawWatersheds.filter(
      w => w.properties.district === district
    );
  }, [rawWatersheds, district]);

  /*
   * Projects are scoped using both:
   * 1. Logged-in officer's district
   * 2. Global district/watershed filters
   */
  const filteredProjects = useMemo(() => {
    return rawProjects.filter(p => {
      // Non-admin officers can only see their own district
      if (
        officer &&
        !officer.isAdmin &&
        p.district !== officer.district
      ) {
        return false;
      }

      // Apply selected district filter
      if (district && p.district !== district) {
        return false;
      }

      // Apply selected watershed filter
      if (
        watershedId &&
        p.watershed_id !== watershedId
      ) {
        return false;
      }

      return true;
    });
  }, [rawProjects, officer, district, watershedId]);

  /*
   * Watersheds are also scoped to the logged-in officer.
   */
  const filteredWatersheds = useMemo(() => {
    return availableWatersheds.filter(w => {
      if (
        officer &&
        !officer.isAdmin &&
        w.properties.district !== officer.district
      ) {
        return false;
      }

      if (
        watershedId &&
        w.properties.id !== watershedId
      ) {
        return false;
      }

      return true;
    });
  }, [availableWatersheds, officer, watershedId]);

  /*
   * Only projects visible to the current officer/filter scope
   * are used to determine which alerts and evidence belong
   * to the current dashboard.
   */
  const scopedIds = useMemo(
    () => new Set(filteredProjects.map(p => p.id)),
    [filteredProjects]
  );

  const filteredAlerts = useMemo(
    () =>
      alerts.filter(a =>
        scopedIds.has(a.project_id)
      ),
    [alerts, scopedIds]
  );

  const filteredEvidence = useMemo(
    () =>
      evidence.filter(e =>
        scopedIds.has(e.project_id)
      ),
    [evidence, scopedIds]
  );

  /*
   * Dashboard statistics.
   */
  const stats = useMemo(() => {
    const completed = filteredProjects.filter(
      p => p.status === 'Completed'
    ).length;

    const pct = filteredProjects.length
      ? Math.round(
          (completed / filteredProjects.length) * 100
        )
      : 0;

    const avgTrust =
      computeAverageTrustScore(filteredEvidence);

    const spatiallyVerified =
      filteredEvidence.filter(
        e => e.gps_check === 'pass'
      ).length;

    const spvPct = filteredEvidence.length
      ? Math.round(
          (spatiallyVerified /
            filteredEvidence.length) *
            100
        )
      : 0;

    return {
      completed,
      pct,
      avgTrust,
      spvPct,
    };
  }, [filteredProjects, filteredEvidence]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Page header */}
      <div className="border-b border-gray-200 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-dark">
            Dashboard
          </h1>

          <p className="text-sm text-gray-500 mt-0.5">
            Watershed Development Monitoring — SIH26015
            &nbsp;|&nbsp; Ministry of Rural Development /
            Dept. of Land Resources
          </p>
        </div>

        {/* Global Scalability District & Watershed Filter */}
        <div className="flex flex-wrap items-center gap-2.5 bg-white border border-gray-200 rounded-lg p-2 shadow-sm">

          {officer?.isAdmin && (
            <select
              value={district}
              onChange={e => {
                setDistrict(e.target.value);
                setWatershedId('');
              }}
              className="text-xs border border-gray-200 rounded px-2.5 py-1.5 bg-white text-gray-700 font-medium"
            >
              <option value="">
                All Districts
              </option>

              {districts.map(d => (
                <option key={d} value={d}>
                  {d} District
                </option>
              ))}
            </select>
          )}

          <select
            value={watershedId}
            onChange={e =>
              setWatershedId(e.target.value)
            }
            className="text-xs border border-gray-200 rounded px-2.5 py-1.5 bg-white text-gray-700 font-medium"
          >
            <option value="">
              All Watersheds
            </option>

            {availableWatersheds.map(w => (
              <option
                key={w.properties.id}
                value={w.properties.id}
              >
                {w.properties.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Provider Status Callout */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">

        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-dark">
            Satellite Engine:
          </span>

          <span className="bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
            Google Earth Engine (Live Sentinel-1 SAR &amp; Landsat)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-dark">
            SRISHTI-DRISHTI:
          </span>

          <span className="bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
            Integration Ready (Provider Adapter Online)
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">

        <StatCard
          label="Total Interventions"
          value={filteredProjects.length}
          icon={Layers}
          iconBg="bg-primary-100"
          sub={`Across ${filteredWatersheds.length} watersheds`}
        />

        <StatCard
          label="% Completed"
          value={`${stats.pct}%`}
          icon={CheckCircle}
          iconBg="bg-tertiary-100"
          sub={`${stats.completed} of ${filteredProjects.length}`}
        />

        <StatCard
          label="Watersheds Monitored"
          value={filteredWatersheds.length}
          icon={Activity}
          iconBg="bg-secondary-100"
          sub="Configured basins"
        />

        <StatCard
          label="Active Alerts"
          value={filteredAlerts.length}
          icon={AlertTriangle}
          iconBg="bg-accent-100"
          sub="Maintenance flags"
        />

        <StatCard
          label="Avg Trust Score"
          value={`${stats.avgTrust}/5`}
          icon={Star}
          iconBg="bg-primary-50"
          sub={`${stats.spvPct}% spatially verified`}
        />

      </div>

      {/* Quick metrics strip */}
      <div className="bg-primary-700 text-white rounded-lg px-5 py-3 flex flex-wrap gap-4 text-sm">

        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary-200" />

          <span className="text-primary-200">
            Spatially Verified:
          </span>

          <span className="font-bold">
            {stats.spvPct}% of evidence
          </span>
        </div>

        <div className="text-primary-400 hidden sm:block">
          |
        </div>

        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary-200" />

          <span className="text-primary-200">
            Delayed Interventions:
          </span>

          <span className="font-bold">
            {
              filteredProjects.filter(
                p => p.status === 'Delayed'
              ).length
            }
          </span>
        </div>

        <div className="text-primary-400 hidden sm:block">
          |
        </div>

        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary-200" />

          <span className="text-primary-200">
            States Covered:
          </span>

          <span className="font-bold">
            {
              [
                ...new Set(
                  filteredWatersheds.map(
                    w => w.properties.state
                  )
                ),
              ].join(', ')
            }
          </span>
        </div>

      </div>

      {/* Status charts + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Charts */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm p-4">

          <h2 className="text-sm font-semibold text-text-dark mb-3">
            Intervention Breakdown
          </h2>

          <StatusChart
            projects={filteredProjects}
          />

        </div>

        {/* Alerts panel */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">

          <div className="flex items-center justify-between mb-3">

            <h2 className="text-sm font-semibold text-text-dark">
              Maintenance Alerts
            </h2>

            <span className="text-xs text-accent-600 font-semibold">
              {filteredAlerts.length} active
            </span>

          </div>

          <AlertsList
            alerts={filteredAlerts}
            limit={5}
          />

        </div>

      </div>

      {/* Watershed summary table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">

        <h2 className="text-sm font-semibold text-text-dark mb-3">
          Watershed Overview
        </h2>

        <div className="overflow-x-auto">

          <table className="w-full text-sm">

            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">

                <th className="text-left pb-2 pr-4 font-medium">
                  Watershed
                </th>

                <th className="text-left pb-2 pr-4 font-medium">
                  District, State
                </th>

                <th className="text-right pb-2 pr-4 font-medium">
                  Interventions
                </th>

                <th className="text-right pb-2 pr-4 font-medium">
                  Completed
                </th>

                <th className="text-right pb-2 pr-4 font-medium">
                  Delayed
                </th>

                <th className="text-right pb-2 font-medium">
                  Area (km²)
                </th>

              </tr>
            </thead>

            <tbody>

              {filteredWatersheds.map(ws => {

                const wsProjects =
                  filteredProjects.filter(
                    p =>
                      p.watershed_id ===
                      ws.properties.id
                  );

                const done =
                  wsProjects.filter(
                    p => p.status === 'Completed'
                  ).length;

                const delayed =
                  wsProjects.filter(
                    p => p.status === 'Delayed'
                  ).length;

                return (
                  <tr
                    key={ws.properties.id}
                    className="border-b border-gray-100 hover:bg-surface-card"
                  >

                    <td className="py-2 pr-4 font-medium text-primary-700">
                      {ws.properties.name}
                    </td>

                    <td className="py-2 pr-4 text-gray-500">
                      {ws.properties.district},{' '}
                      {ws.properties.state}
                    </td>

                    <td className="py-2 pr-4 text-right">
                      {wsProjects.length}
                    </td>

                    <td className="py-2 pr-4 text-right text-tertiary-600 font-medium">
                      {done}
                    </td>

                    <td className="py-2 pr-4 text-right">

                      {delayed > 0 ? (
                        <span className="text-accent-600 font-medium">
                          {delayed}
                        </span>
                      ) : (
                        <span className="text-gray-400">
                          —
                        </span>
                      )}

                    </td>

                    <td className="py-2 text-right text-gray-500">
                      {ws.properties.area_sq_km.toLocaleString()}
                    </td>

                  </tr>
                );
              })}

            </tbody>

          </table>

        </div>
      </div>

    </div>
  );
};

export default Dashboard; 