"use client";
import { PUBLICATION_NOTICE } from "@/lib/publication";
import { TitleTransition } from "@/components/TitleTransition";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  ArrowUpRight,
  ArrowRight,
  RotateCcw,
  LockKeyhole,
} from "lucide-react";
import { skills, categories, filterSkills, styles } from "@/lib/catalog";
import { Preview } from "./Preview";
import { ToolChips } from "./ToolChips";
import { MediaSkillCard } from "./MediaSkillCard";
import { statusLabel } from "@/lib/status-labels";
import type { StyleTool } from "@/lib/showcase";
import { KineticHero } from "./KineticHero";
import heroStyles from "./KineticHero.module.css";

/** Article teaser data passed from the server page (content loads from disk). */
export type ArticleTeaser = { slug: string; title: string; description: string };

export function Library({
  articles,
  styleTools,
}: {
  articles: ArticleTeaser[];
  /** Homepage style cards' tools with logos (see lib/showcase styleToolsFrom). */
  styleTools?: Readonly<Record<string, readonly StyleTool[]>>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewOrigin = useRef<HTMLElement | null>(null);
  const results = filterSkills(skills, query, category);
  const active = skills.find((skill) => skill.slug === selected) || skills[0];
  function selectSkill(slug: string) {
    previewOrigin.current = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    setSelected(slug);
    setPreviewOpen(true);
    requestAnimationFrame(() => {
      const preview = document.getElementById("selected-example");
      preview?.focus({ preventScroll: true });
      preview?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
  }
  function reset() {
    setQuery("");
    setCategory("all");
  }
  return (
    <main id="main" className="library-page">
      <KineticHero
        styleTools={styleTools}
        skills={skills}
        activeSlug={selected ?? ""}
        onSelectSkill={selectSkill}
      >
        <label className="search">
          <Search size={19} />
          <span className="sr-only">ค้นหาทักษะหรือเครื่องมือ</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหา skill / เครื่องมือ"
            onKeyDown={(event) => {
              if (event.key === "Enter")
                document
                  .getElementById("skill-index")
                  ?.scrollIntoView({ block: "start" });
            }}
          />
        </label>
        <a className={heroStyles.browse} href="#skill-index">
          {query ? `${results.length} รายการ · ดูผลค้นหา` : "ดูคลังทั้งหมด"}
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      </KineticHero>
      <div className={heroStyles.selected} hidden={!previewOpen}>
        <button
          type="button"
          className={heroStyles.closePreview}
          onClick={() => {
            setPreviewOpen(false);
            requestAnimationFrame(() => previewOrigin.current?.focus({ preventScroll: true }));
          }}
        >
          ปิดตัวอย่าง
        </button>
        <div className="featured-work">
          <Preview key={active.slug} skill={active} compact>
            <div className="featured-copy">
              <h2>{active.name}</h2>
              <p>{active.description}</p>
              <div className="feature-meta">
                <div className="feature-tools">
                  <span>เครื่องมือที่ต้องใช้</span>
                  <ToolChips skill={active} />
                </div>
                {active.examples.length > 0 && (
                  <div className="feature-authors">
                    <span>ผู้เขียนโค้ด / งานต้นทาง</span>
                    <ToolChips skill={active} authors />
                  </div>
                )}
              </div>
              <div className="feature-actions">
                <Link className="feature-link" href={"/skills/" + active.slug}>
                  ดู skill และวิธีทำ <ArrowUpRight size={17} />
                </Link>
                <span className="draft-note">
                  {statusLabel(active.status)}{" "}
                  · v{active.version}
                </span>
              </div>
            </div>
          </Preview>
        </div>
      </div>
      <p className="local-notice">
        <LockKeyhole size={14} />
        {PUBLICATION_NOTICE}
      </p>
      <section
        className="catalog-section"
        id="skill-index"
        tabIndex={-1}
        aria-labelledby="catalog-heading"
      >
        <div className="catalog-heading">
          <div>
            <h2 id="catalog-heading">เลือกงานที่อยากลองทำ</h2>
            <p>เริ่มจากภาพที่ชอบ แล้วค่อยเลือกเครื่องมือที่เหมาะ</p>
          </div>
          <label className="search">
            <Search size={19} />
            <span className="sr-only">ค้นหาในรายการ</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาในรายการ"
            />
          </label>
        </div>
        <div className="filter-bar">
          <nav className="categories" aria-label="หมวดทักษะ">
            {categories.map((item) => (
              <button
                key={item.id}
                aria-pressed={category === item.id}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
                <span>{filterSkills(skills, "", item.id).length}</span>
              </button>
            ))}
          </nav>
          <span className="result-line" role="status" aria-live="polite">
            {results.length} รายการ
          </span>
        </div>
        {results.length ? (
          <div className="skill-grid">
            {results.map((skill, index) => (
              <MediaSkillCard key={skill.slug} skill={skill} eager={index < 4} onSelectSkill={selectSkill} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <Search size={32} />
            <h3>ยังไม่มีรายการที่ตรงกัน</h3>
            <p>
              {query
                ? "ลองค้นชื่อสไตล์ หรือเครื่องมือ เช่น Canvas, Remotion, เสียง"
                : "หมวดนี้ยังไม่มีรายการจริง เราไม่สร้าง skill ขึ้นมาเติมช่องว่าง"}
            </p>
            <button onClick={reset}>
              <RotateCcw size={16} />
              ล้างตัวกรอง
            </button>
          </div>
        )}
      </section>
      <section className="article-teasers">
        <div>
          <h2>อ่านก่อนลงมือทำ</h2>
          <p>แยกให้ออกว่าอะไรคือสไตล์ ผู้เขียน และเครื่องมือ</p>
          <Link href="/articles">
            บทความทั้งหมด <ArrowUpRight size={17} />
          </Link>
        </div>
        <div>
          {articles.map((article) => (
            <Link
              className="article-row"
              key={article.slug}
              href={"/articles/" + article.slug}
            >
              <div>
                <TitleTransition kind="article" slug={article.slug}>
                  <h3>{article.title}</h3>
                </TitleTransition>
                <p>{article.description}</p>
              </div>
              <ArrowUpRight size={23} />
            </Link>
          ))}
        </div>
      </section>
      <details className="style-register">
        <summary>
          ทะเบียนแนวภาพ <span>{styles.length} แนว · ดูสถานะและเวอร์ชัน</span>
        </summary>
        <p>สถานะการเลือกภาพไม่ใช่ความพร้อมแจกจ่าย</p>
        {styles.map((style) => (
          <div className="register-row" key={style.id}>
            <span>{style.name}</span>
            <span>
              {statusLabel(style.status)}{" "}
              · v{style.version}
            </span>
          </div>
        ))}
      </details>
    </main>
  );
}
