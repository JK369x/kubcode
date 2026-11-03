"use client";
import { useEffect, useState } from "react";
import { Shader, LinearGradient, SimplexNoise } from "shaders/react";
import { Pause, Play } from "lucide-react";
export function ShaderField({ selection }: { selection: string }) {
  const [mode, setMode] = useState("checking");
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () =>
      setMode(
        media.matches ? "reduced" : "gpu" in navigator ? "gpu" : "unsupported",
      );
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const live = mode === "gpu" && !paused;
  return (
    <div className="shader-block">
      <div
        className="shader-field"
        data-renderer={
          ready && live ? "webgpu-ready" : "static-or-initializing"
        }
        aria-hidden="true"
      >
        {live && (
          <Shader
            key={selection}
            disableTelemetry
            onReady={() => setReady(true)}
            className="shader-canvas"
            onUnavailable={() => setMode("unsupported")}
          >
            <LinearGradient colorA="#662cde" colorB="#bf9bff" angle={35} />
            <SimplexNoise
              colorA="#301050"
              colorB="#b18aff"
              scale={2.5}
              speed={0.22}
              opacity={0.5}
            />
          </Shader>
        )}
        <div className="static-field" hidden={live}>
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="shader-caption">
        <span>
          {mode === "reduced"
            ? "ภาพนิ่ง · ลดการเคลื่อนไหว"
            : mode === "unsupported"
              ? "ภาพนิ่ง · WebGPU ไม่พร้อม"
              : paused
                ? "Visual field · หยุดแล้ว"
                : "Visual field / shaders"}
        </span>
        <button
          aria-label={paused ? "เล่น visual field" : "หยุด visual field"}
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
          disabled={mode !== "gpu"}
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
      </div>
    </div>
  );
}
