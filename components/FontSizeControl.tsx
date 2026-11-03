"use client";
import { useEffect, useState } from "react";

const STEPS = [0.9, 1, 1.1, 1.2, 1.3];
const KEY = "kb-prose-scale";

function apply(step: number) {
  document.documentElement.style.setProperty("--prose-scale", String(STEPS[step]));
}

/** A−/A+ for the article text only; remembered per browser when storage works. */
export function FontSizeControl() {
  const [step, setStep] = useState(1);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const saved = raw === null ? NaN : Number(raw);
      if (Number.isInteger(saved) && saved >= 0 && saved < STEPS.length) {
        setStep(saved);
        apply(saved);
      }
    } catch {}
  }, []);

  const change = (next: number) => {
    setStep(next);
    apply(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch {}
  };

  return (
    <div className="font-size" role="group" aria-label="ขนาดตัวอักษรของบทความ">
      <button type="button" onClick={() => change(step - 1)} disabled={step === 0} aria-label="ลดขนาดตัวอักษร">
        A−
      </button>
      <span aria-live="polite">{Math.round(STEPS[step] * 100)}%</span>
      <button
        type="button"
        onClick={() => change(step + 1)}
        disabled={step === STEPS.length - 1}
        aria-label="เพิ่มขนาดตัวอักษร"
      >
        A+
      </button>
    </div>
  );
}
