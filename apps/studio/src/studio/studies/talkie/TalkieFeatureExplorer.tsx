"use client";

import {
  BadgeCheck,
  Boxes,
  ListFilter,
  MonitorUp,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { TalkieReceipt, type TalkieReceiptTone } from "./TalkieReceipt";
import "./talkieFeatureExplorer.css";

export type AtlasMaturityKey =
  | "shipped"
  | "experimental"
  | "partial"
  | "legacy";

export type AtlasSurfaceKey =
  | "mac"
  | "agent"
  | "ios"
  | "watch"
  | "keyboard"
  | "share"
  | "server"
  | "cli";

export type AtlasJobKey =
  | "capture"
  | "understand"
  | "transform"
  | "route"
  | "recall";

export interface AtlasFeature {
  name: string;
  job: AtlasJobKey;
  blurb: string;
  surfaces: AtlasSurfaceKey[];
  maturity: AtlasMaturityKey;
}

export interface AtlasJob {
  key: AtlasJobKey;
  index: string;
  title: string;
  verb: string;
  icon: LucideIcon;
}

export interface AtlasSurface {
  label: string;
  short: string;
}

export interface AtlasMaturity {
  label: string;
  code: string;
  blurb: string;
}

interface TalkieFeatureExplorerProps {
  features: AtlasFeature[];
  jobs: AtlasJob[];
  surfaces: Record<AtlasSurfaceKey, AtlasSurface>;
  surfaceOrder: AtlasSurfaceKey[];
  maturities: Record<AtlasMaturityKey, AtlasMaturity>;
  maturityOrder: AtlasMaturityKey[];
}

export function TalkieFeatureExplorer({
  features,
  jobs,
  surfaces,
  surfaceOrder,
  maturities,
  maturityOrder,
}: TalkieFeatureExplorerProps) {
  const [query, setQuery] = useState("");
  const [activeJob, setActiveJob] = useState<AtlasJobKey | null>(null);
  const [activeSurface, setActiveSurface] =
    useState<AtlasSurfaceKey | null>(null);
  const [activeMaturity, setActiveMaturity] =
    useState<AtlasMaturityKey | null>(null);
  const [selectedName, setSelectedName] = useState(features[0]?.name ?? "");

  const model = useMemo(() => {
    const bySurface = Object.fromEntries(
      surfaceOrder.map((surface) => [surface, 0]),
    ) as Record<AtlasSurfaceKey, number>;
    const byJob = Object.fromEntries(
      jobs.map((job) => [job.key, 0]),
    ) as Record<AtlasJobKey, number>;
    const byMaturity = Object.fromEntries(
      maturityOrder.map((maturity) => [maturity, 0]),
    ) as Record<AtlasMaturityKey, number>;
    const cells = Object.fromEntries(
      surfaceOrder.map((surface) => [
        surface,
        Object.fromEntries(jobs.map((job) => [job.key, 0])),
      ]),
    ) as Record<AtlasSurfaceKey, Record<AtlasJobKey, number>>;

    let peak = 0;
    for (const feature of features) {
      byJob[feature.job] += 1;
      byMaturity[feature.maturity] += 1;
      for (const surface of feature.surfaces) {
        bySurface[surface] += 1;
        cells[surface][feature.job] += 1;
        peak = Math.max(peak, cells[surface][feature.job]);
      }
    }

    return { bySurface, byJob, byMaturity, cells, peak };
  }, [features, jobs, maturityOrder, surfaceOrder]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = features.filter((feature) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [
        feature.name,
        feature.blurb,
        maturities[feature.maturity].label,
        ...feature.surfaces.map((surface) => surfaces[surface].label),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);

    return (
      matchesQuery &&
      (activeJob === null || feature.job === activeJob) &&
      (activeSurface === null || feature.surfaces.includes(activeSurface)) &&
      (activeMaturity === null || feature.maturity === activeMaturity)
    );
  });

  const selected =
    visible.find((feature) => feature.name === selectedName) ??
    visible[0] ??
    features.find((feature) => feature.name === selectedName) ??
    features[0];

  const isFiltered =
    query.length > 0 ||
    activeJob !== null ||
    activeSurface !== null ||
    activeMaturity !== null;

  function reset() {
    setQuery("");
    setActiveJob(null);
    setActiveSurface(null);
    setActiveMaturity(null);
  }

  function chooseCell(surface: AtlasSurfaceKey, job: AtlasJobKey) {
    const sameCell = activeSurface === surface && activeJob === job;
    setActiveSurface(sameCell ? null : surface);
    setActiveJob(sameCell ? null : job);
  }

  const selectedJob = selected
    ? jobs.find((job) => job.key === selected.job)
    : undefined;

  return (
    <section className="atlas-nano" aria-labelledby="atlas-nano-title">
      <header className="atlas-nano__chrome">
        <div className="atlas-nano__brand" aria-hidden="true">
          <span>T</span>
          <i />
        </div>
        <div className="atlas-nano__title">
          <span>Talkie / capability field</span>
          <strong id="atlas-nano-title">One model. Every surface.</strong>
        </div>
        <label className="atlas-nano__search">
          <Search size={14} strokeWidth={1.8} />
          <span className="sr-only">Search capabilities</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search capabilities, jobs, surfaces…"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={13} />
            </button>
          ) : null}
        </label>
        <div className="atlas-nano__result">
          <strong>{visible.length}</strong>
          <span>of {features.length}</span>
        </div>
      </header>

      <div className="atlas-nano__workspace">
        <div className="atlas-nano__main">
          <section id="matrix" className="atlas-nano__matrix-panel scroll-mt-6">
            <div className="atlas-nano__section-head">
              <div>
                <span>01 / Surface matrix</span>
                <h2>Where Talkie’s capabilities live.</h2>
              </div>
              <p>Choose a row, column, or cell. The feature field and receipt respond together.</p>
            </div>

            <div className="atlas-nano__matrix-scroll">
              <table className="atlas-nano__matrix">
                <thead>
                  <tr>
                    <th scope="col">Surface</th>
                    {jobs.map((job) => (
                      <th key={job.key} scope="col">
                        <button
                          type="button"
                          data-active={activeJob === job.key}
                          onClick={() =>
                            setActiveJob((current) =>
                              current === job.key ? null : job.key,
                            )
                          }
                        >
                          <span>{job.index}</span>
                          {job.title}
                          <b>{model.byJob[job.key]}</b>
                        </button>
                      </th>
                    ))}
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {surfaceOrder.map((surface) => (
                    <tr key={surface} data-active={activeSurface === surface}>
                      <th scope="row">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveSurface((current) =>
                              current === surface ? null : surface,
                            )
                          }
                        >
                          <span>{surfaces[surface].short}</span>
                          {surfaces[surface].label}
                        </button>
                      </th>
                      {jobs.map((job) => {
                        const count = model.cells[surface][job.key];
                        const active =
                          activeSurface === surface && activeJob === job.key;
                        return (
                          <td key={job.key}>
                            <button
                              type="button"
                              disabled={count === 0}
                              data-active={active}
                              data-empty={count === 0}
                              style={
                                count === 0
                                  ? undefined
                                  : {
                                      ["--atlas-cell" as string]: (
                                        count / model.peak
                                      ).toFixed(3),
                                    }
                              }
                              onClick={() => chooseCell(surface, job.key)}
                              aria-label={`${surfaces[surface].label}, ${job.title}: ${count} capabilities`}
                            >
                              {count === 0 ? "·" : count}
                            </button>
                          </td>
                        );
                      })}
                      <td className="atlas-nano__matrix-total">
                        {model.bySurface[surface]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="index" className="atlas-nano__index scroll-mt-6">
            <div className="atlas-nano__section-head atlas-nano__section-head--index">
              <div>
                <span>02 / Feature field</span>
                <h2>Every capability, ready to inspect.</h2>
              </div>
              <div className="atlas-nano__active-query">
                <ListFilter size={13} />
                {isFiltered ? "Filtered view" : "Complete inventory"}
              </div>
            </div>

            <div className="atlas-nano__filters" aria-label="Feature filters">
              <div className="atlas-nano__filter-group">
                <span>Job</span>
                {jobs.map((job) => (
                  <FilterButton
                    key={job.key}
                    active={activeJob === job.key}
                    label={job.title}
                    count={model.byJob[job.key]}
                    onClick={() =>
                      setActiveJob((current) =>
                        current === job.key ? null : job.key,
                      )
                    }
                  />
                ))}
              </div>
              <div className="atlas-nano__filter-group">
                <span>Maturity</span>
                {maturityOrder.map((maturity) => (
                  <FilterButton
                    key={maturity}
                    active={activeMaturity === maturity}
                    label={maturities[maturity].label}
                    count={model.byMaturity[maturity]}
                    tone={maturity}
                    onClick={() =>
                      setActiveMaturity((current) =>
                        current === maturity ? null : maturity,
                      )
                    }
                  />
                ))}
              </div>
              <div className="atlas-nano__filter-group">
                <span>Surface</span>
                {surfaceOrder.map((surface) => (
                  <FilterButton
                    key={surface}
                    active={activeSurface === surface}
                    label={surfaces[surface].label}
                    count={model.bySurface[surface]}
                    onClick={() =>
                      setActiveSurface((current) =>
                        current === surface ? null : surface,
                      )
                    }
                  />
                ))}
              </div>
              {isFiltered ? (
                <button type="button" className="atlas-nano__reset" onClick={reset}>
                  <X size={12} /> Reset view
                </button>
              ) : null}
            </div>

            <div className="atlas-nano__feature-groups">
              {jobs.map((job) => {
                const rows = visible.filter((feature) => feature.job === job.key);
                if (rows.length === 0) return null;
                const JobIcon = job.icon;
                return (
                  <section key={job.key} className="atlas-nano__feature-group">
                    <header>
                      <span>{job.index}</span>
                      <JobIcon size={14} strokeWidth={1.7} />
                      <strong>{job.title}</strong>
                      <p>{job.verb}</p>
                      <b>{rows.length}</b>
                    </header>
                    <div className="atlas-nano__features">
                      {rows.map((feature) => (
                        <button
                          key={feature.name}
                          type="button"
                          className="atlas-nano__feature"
                          data-active={selected?.name === feature.name}
                          data-maturity={feature.maturity}
                          onClick={() => setSelectedName(feature.name)}
                        >
                          <span className="atlas-nano__feature-signal" />
                          <span className="atlas-nano__feature-copy">
                            <strong>{feature.name}</strong>
                            <small>{feature.blurb}</small>
                          </span>
                          <span className="atlas-nano__feature-surfaces">
                            {surfaceOrder.map((surface) => (
                              <i
                                key={surface}
                                data-on={feature.surfaces.includes(surface)}
                                title={surfaces[surface].label}
                              >
                                {surfaces[surface].short}
                              </i>
                            ))}
                          </span>
                          <span className="atlas-nano__feature-class">
                            {maturities[feature.maturity].code}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}

              {visible.length === 0 ? (
                <div className="atlas-nano__empty">
                  <Search size={20} strokeWidth={1.4} />
                  <strong>No capability matches this view.</strong>
                  <span>Clear a filter or try a broader search.</span>
                  <button type="button" onClick={reset}>Reset the field</button>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="atlas-nano__inspector" aria-label="Selected capability receipt">
          <div className="atlas-nano__inspector-sticky">
            <div className="atlas-nano__inspector-label">
              <span>Live capability receipt</span>
              <b>{selected ? "01" : "00"}</b>
            </div>
            {selected ? (
              <TalkieReceipt
                compact
                eyebrow="Talkie capability"
                title={selected.name}
                meta={`${selectedJob?.index ?? "--"} · ${selectedJob?.title ?? "Unclassified"}`}
                status={maturities[selected.maturity].label}
                tone={selected.maturity as TalkieReceiptTone}
                lines={[
                  {
                    id: "job",
                    icon: <Boxes size={13} />,
                    label: "Job",
                    value: selectedJob?.title ?? "Unclassified",
                  },
                  {
                    id: "surface",
                    icon: <MonitorUp size={13} />,
                    label: "Surface",
                    value: selected.surfaces
                      .map((surface) => surfaces[surface].label)
                      .join(" · "),
                  },
                  {
                    id: "maturity",
                    icon: <BadgeCheck size={13} />,
                    label: "Maturity",
                    value: maturities[selected.maturity].blurb,
                    state:
                      selected.maturity === "shipped" ? "complete" : "attention",
                  },
                  {
                    id: "value",
                    icon: <Sparkles size={13} />,
                    label: "Capability",
                    value: selected.blurb,
                  },
                ]}
                footer={`${selected.surfaces.length} product ${
                  selected.surfaces.length === 1 ? "surface" : "surfaces"
                } · indexed in the verified inventory`}
              />
            ) : null}

            <div className="atlas-nano__inspector-note">
              <span>HOW TO READ THIS</span>
              <p>
                The matrix is density. The field is detail. The receipt is the
                selected capability’s compact, reusable product record.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function FilterButton({
  active,
  label,
  count,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  tone?: AtlasMaturityKey;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="atlas-nano__filter"
      data-active={active}
      data-tone={tone}
      aria-pressed={active}
      onClick={onClick}
    >
      {tone ? <i /> : null}
      {label}
      <b>{count}</b>
    </button>
  );
}
