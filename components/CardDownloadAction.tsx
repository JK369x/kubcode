"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LockKeyhole, ArrowUpRight, Download } from "lucide-react";
import { approvedPackageFor } from "@/lib/packages";
import { fetchAvailable, fetchSignedIn, startDownload } from "@/lib/downloads/client";
import { downloadPhase, PHASE_STATE } from "@/lib/downloads/view";
import styles from "./CardDownloadAction.module.css";
import { toast } from "@/components/ui/toaster";

/**
 * The download control on catalogue cards and skill pages. Skills without an
 * approved package keep the honest locked state. Skills with one check the
 * session and the server, then offer sign-in or a real download (ADR 0002).
 */
export function CardDownloadAction({ slug, name, conditions = true }: {
  slug: string; name?: string; conditions?: boolean;
}) {
  const label = "ดูเงื่อนไขการดาวน์โหลด" + (name ? " " + name : "");
  const state = "download-state-" + encodeURIComponent(slug);
  const hasPackage = approvedPackageFor(slug) !== null;
  return (
    <div className={styles.root} data-conditions={conditions ? "link" : "none"}>
      {hasPackage ? <PackageDownload slug={slug} stateId={state} /> : (
        <button type="button" className={styles.unavailable} disabled aria-describedby={state}>
          <LockKeyhole size={15} aria-hidden="true" />
          <span className={styles.copy}>
            <span className={styles.label}>ดาวน์โหลด skill</span>
            <span className={styles.state} id={state}>{PHASE_STATE.none}</span>
          </span>
        </button>
      )}
      {conditions && <Link className={styles.conditions} href={"/skills/" + encodeURIComponent(slug) + "#download"} aria-label={label}>
        <ArrowUpRight size={16} aria-hidden="true" />
        <span>เงื่อนไข</span>
      </Link>}
    </div>
  );
}

function PackageDownload({ slug, stateId }: { slug: string; stateId: string }) {
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  const [available, setAvailable] = useState<boolean | undefined>(undefined);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let live = true;
    fetchSignedIn().then((v) => live && setSignedIn(v));
    fetchAvailable(slug).then((v) => live && setAvailable(v));
    return () => {
      live = false;
    };
  }, [slug]);

  const phase = downloadPhase({ hasPackage: true, signedIn, available, working });
  const copy = (
    <span className={styles.copy}>
      <span className={styles.label}>ดาวน์โหลด skill</span>
      <span className={styles.state} id={stateId}>{PHASE_STATE[phase]}</span>
    </span>
  );

  if (phase === "signin") {
    return (
      <Link className={styles.ready} href="/account" aria-describedby={stateId}>
        <LockKeyhole size={15} aria-hidden="true" />
        {copy}
      </Link>
    );
  }

  const ready = phase === "ready";
  async function onClick() {
    setWorking(true);
    const message = await startDownload(slug);
    setWorking(false);
    if (message) toast.error("ดาวน์โหลดไม่สำเร็จ", { description: message });
  }
  return (
    <span className={styles.stack}>
      <button
        type="button"
        className={ready ? styles.ready : styles.unavailable}
        disabled={!ready}
        aria-describedby={stateId}
        onClick={ready ? onClick : undefined}
      >
        {ready ? <Download size={15} aria-hidden="true" /> : <LockKeyhole size={15} aria-hidden="true" />}
        {copy}
      </button>
    </span>
  );
}
