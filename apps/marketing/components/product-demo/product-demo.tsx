"use client";

import Calendar04Icon from "@hugeicons/core-free-icons/Calendar04Icon";
import Layout3ColumnIcon from "@hugeicons/core-free-icons/Layout3ColumnIcon";
import ListMusicIcon from "@hugeicons/core-free-icons/ListMusicIcon";
import Moon02Icon from "@hugeicons/core-free-icons/Moon02Icon";
import Sun01Icon from "@hugeicons/core-free-icons/Sun01Icon";
import UserAdd01Icon from "@hugeicons/core-free-icons/UserAdd01Icon";
import type { IconSvgElement } from "@hugeicons/react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { useState } from "react";

import { DemoButton } from "../ui/demo-control";
import { AssignView, CandidateList } from "./assign-view";
import { navigateDemo, resetAssignments, useDemoRoute } from "./demo-model";
import type { DemoView } from "./demo-model";
import { DemoIcon } from "./demo-parts";
import { plan } from "./fixtures";
import { LineupView } from "./lineup-view";
import { PlanView } from "./plan-view";

import styles from "./product-demo.module.css";

const views: readonly { id: DemoView; label: string; icon: IconSvgElement }[] =
  [
    { id: "assign", label: "Assign", icon: UserAdd01Icon },
    { id: "lineup", label: "Lineup", icon: Layout3ColumnIcon },
    { id: "plan", label: "Plan", icon: ListMusicIcon },
  ];

const viewLabel = (view: DemoView) =>
  views.find((entry) => entry.id === view)?.label ?? "";

const PlanTitle = () => (
  <h2 className={styles["plan-heading"]}>
    <strong>{plan.serviceType}</strong>
    <span> / {plan.title}</span>
    <span> / {plan.when}</span>
  </h2>
);

const Sidebar = ({
  view,
  dark,
  onToggleTheme,
}: {
  view: DemoView;
  dark: boolean;
  onToggleTheme: () => void;
}) => (
  <aside className={styles.sidebar}>
    <p className={styles["sidebar-brand"]}>
      <strong>PCO</strong>Booster
    </p>
    <nav aria-label="Demo navigation">
      <p className={styles["nav-group"]}>
        <DemoIcon icon={Calendar04Icon} />
        Services
      </p>
      <ul>
        {views.map((entry) => (
          <li key={entry.id}>
            <DemoButton
              variant="nav"
              aria-current={entry.id === view ? "page" : undefined}
              onClick={() => {
                navigateDemo({ view: entry.id });
              }}
            >
              <DemoIcon icon={entry.icon} />
              {entry.label}
            </DemoButton>
          </li>
        ))}
      </ul>
    </nav>
    <div className={styles["sidebar-footer"]}>
      <DemoButton variant="nav" onClick={onToggleTheme}>
        <DemoIcon icon={dark ? Sun01Icon : Moon02Icon} />
        {dark ? "Light mode" : "Dark mode"}
      </DemoButton>
      <DemoButton variant="nav" onClick={resetAssignments}>
        <RotateCcw className={styles.icon} aria-hidden />
        Reset demo
      </DemoButton>
    </div>
  </aside>
);

/** The full clickable replica: app shell, Assign, Lineup, and Plan. */
export const ProductDemo = () => {
  const { view, positionId } = useDemoRoute();
  const [dark, setDark] = useState(false);

  return (
    <div className={`${styles.demo} ${dark ? "dark" : ""}`} data-demo-root="">
      <Sidebar
        view={view}
        dark={dark}
        onToggleTheme={() => {
          setDark((value) => !value);
        }}
      />
      <div className={styles.inset}>
        <header className={styles.topbar}>
          <span className={styles.crumbs}>
            Services <ChevronRight aria-hidden size={14} />
            <strong>{viewLabel(view)}</strong>
          </span>
          <span className={styles["sample-badge"]}>Sample data</span>
        </header>
        <nav className={styles["mobile-tabs"]} aria-label="Demo views">
          {views.map((entry) => (
            <DemoButton
              key={entry.id}
              variant="tab"
              aria-current={entry.id === view ? "page" : undefined}
              onClick={() => {
                navigateDemo({ view: entry.id });
              }}
            >
              {entry.label}
            </DemoButton>
          ))}
        </nav>
        <div className={styles.content}>
          <PlanTitle />
          {view === "assign" ? (
            <AssignView
              positionId={positionId}
              onSelectPosition={(id) => {
                navigateDemo({ positionId: id });
              }}
            />
          ) : null}
          {view === "lineup" ? (
            <LineupView
              onOpenPosition={(id) => {
                navigateDemo({ view: "assign", positionId: id });
              }}
            />
          ) : null}
          {view === "plan" ? <PlanView /> : null}
        </div>
      </div>
    </div>
  );
};

/** Lineup board on its own; open spots jump the hero replica into Assign. */
export const LineupShowcase = ({ demoAnchorId }: { demoAnchorId: string }) => (
  <div className={`${styles.demo} ${styles.embedded}`}>
    <div className={styles.content}>
      <LineupView
        onOpenPosition={(id) => {
          navigateDemo({ view: "assign", positionId: id });
          document
            .querySelector(`#${demoAnchorId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
    </div>
  </div>
);

/** A few Acoustic Guitar candidates with one person's history already open. */
export const HistoryShowcase = () => (
  <div className={`${styles.demo} ${styles.embedded}`}>
    <div className={styles.content}>
      <h3 className={styles["position-heading"]}>
        Acoustic Guitar<span>Band</span>
      </h3>
      <CandidateList
        positionId="acoustic"
        limit={4}
        showFilter={false}
        openHistoryFor="p01"
      />
    </div>
  </div>
);
