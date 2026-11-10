"use client";
import { TitleTransition } from "@/components/TitleTransition";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  ArrowUpRight,
  RotateCcw,
} from "lucide-react";
import { skills, useCases, styles, type Skill } from "@/lib/catalog";
import { Preview } from "./Preview";
import { ToolChips } from "./ToolChips";
import { MediaSkillCard } from "./MediaSkillCard";
import { GetStarted } from "./GetStarted";
import { statusLabel } from "@/lib/status-labels";
import { skillBadges } from "@/lib/skill-badges";
import { cartoonShowcase, publishedShowcase, showcaseForSkill, type StyleTool } from "@/lib/showcase";
import {
  facetOptions,
  filterFromSearch,
  filterHomeClips,
  filterHomeSkills,
  lookFiltered,
  NO_FILTER,
  searchFromFilter,
  type HomeData,
  type HomeFilter,
} from "@/lib/facets";
import { ClipResults } from "./ClipResults";
import { KineticHero } from "./KineticHero";
import heroStyles from "./KineticHero.module.css";

const PUBLISHED = publishedShowcase();
/** What the homepage filters: every skill, the shelf's clips. */
const HOME: HomeData = { skills, clips: cartoonShowcase(PUBLISHED), published: PUBLISHED };
const USE_CASE_IDS = useCases.map((u) => u.id);

/** One row of toggle chips; the pressed one is the row's value. */
function FilterRow({
  label,
  name,
  options,
  value,
  onPick,
}: {
  label: string;
  name: string;
  options: readonly { id: string; label: string; count: number }[];
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="filter-row" data-filter={name}>
      <span className="filter-label" aria-hidden="true">{label}</span>
      <nav className="categories" aria-label={label}>
        {options.map((item) => (
          <button
            key={item.id}
            type="button"
            data-value={item.id}
            {...(item.count === 0 ? { "data-empty": "" } : {})}
            aria-pressed={value === item.id}
            onClick={() => onPick(item.id)}
          >
            {item.label}
            <span>{item.count}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Article teaser data passed from the server page (content loads from disk). */
export type ArticleTeaser = { slug: string; title: string; description: string };

/**
 * Splits skills into those with an approved clip (full cards that play it)
 * and those without (a small text group at the end), keeping catalogue order.
 */
export function splitByClips<T extends { slug: string }>(items: readonly T[]): { withClip: T[]; without: T[] } {
  const withClip = items.filter((s) => showcaseForSkill(s.slug));
  return { withClip, without: items.filter((s) => !withClip.includes(s)) };
}

/** A skill without a clip: name, one line and its badges, linking its page. */
function NoClipItem({ skill }: { skill: Skill }) {
  return (
    <li>
      <Link className="no-clip-item" href={"/skills/" + encodeURIComponent(skill.slug)}>
        <strong>
          {skill.name} <ArrowUpRight size={16} aria-hidden="true" />
        </strong>
        <span className="no-clip-desc">{skill.description}</span>
        <span className="no-clip-badges">
          {skillBadges(skill).map((b) => (
            <span key={b.key} className="skill-badge" data-badge={b.key}>
              {b.label}
            </span>
          ))}
        </span>
      </Link>
    </li>
  );
}

export function Library({
  articles,
  styleTools,
}: {
  articles: ArticleTeaser[];
  /** Homepage style cards' tools with logos (see lib/showcase styleToolsFrom). */
  styleTools?: Readonly<Record<string, readonly StyleTool[]>>;
}) {
  const [filter, setFilter] = useState<HomeFilter>(NO_FILTER);
  const { query, useCase } = filter;
  const set = (patch: Partial<HomeFilter>) => setFilter((f) => ({ ...f, ...patch }));
  // Filters live in the address (?use=&visual=&story=&q=) so a filtered
  // view can be shared; the page itself stays static.
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      const from = filterFromSearch(window.location.search, { useCases: USE_CASE_IDS });
      if (searchFromFilter(from)) setFilter(from);
      return;
    }
    const url = window.location.pathname + searchFromFilter(filter) + window.location.hash;
    window.history.replaceState(window.history.state, "", url);
  }, [filter]);
  const [selected, setSelected] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewOrigin = useRef<HTMLElement | null>(null);
  // Only skills with an approved clip get a full card; the rest go last.
  const results = filterHomeSkills(HOME, filter);
  const clipResults = filterHomeClips(HOME.clips, filter);
  const byLook = lookFiltered(filter);
  const total = results.length + (byLook ? clipResults.length : 0);
  const useCaseOptions = useCases.map((item) => ({
    ...item,
    count: (() => {
      const g = { ...filter, query: "", useCase: item.id };
      return filterHomeSkills(HOME, g).length + (lookFiltered(g) ? filterHomeClips(HOME.clips, g).length : 0);
    })(),
  }));
  const { withClip, without } = splitByClips(results);
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
    setFilter(NO_FILTER);
  }
  return (
    <main id="main" className="library-page">
      <KineticHero
        styleTools={styleTools}
        skills={skills}
        activeSlug={selected ?? ""}
        onSelectSkill={selectSkill}
      />
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
              onChange={(event) => set({ query: event.target.value })}
              placeholder="ค้นหาในรายการ"
            />
          </label>
        </div>
        <div className="filter-bar">
          <div className="filter-rows">
            <FilterRow label="อยากทำอะไร" name="use" options={useCaseOptions} value={useCase} onPick={(id) => set({ useCase: id })} />
            <FilterRow label="แนวภาพ" name="visual" options={facetOptions("visual", HOME, filter)} value={filter.visual} onPick={(id) => set({ visual: id })} />
            <FilterRow label="แนวเรื่อง" name="story" options={facetOptions("story", HOME, filter)} value={filter.story} onPick={(id) => set({ story: id })} />
          </div>
          <span className="result-line" role="status" aria-live="polite">
            {total} รายการ
          </span>
        </div>
        {total ? (
          <>
            {byLook && clipResults.length > 0 && <ClipResults clips={clipResults} />}
            {withClip.length > 0 && (
              <div className="skill-grid">
                {withClip.map((skill, index) => (
                  <MediaSkillCard key={skill.slug} skill={skill} eager={index < 4} onSelectSkill={selectSkill} />
                ))}
              </div>
            )}
            {without.length > 0 && (
              <section className="no-clip" aria-labelledby="no-clip-heading">
                <h3 id="no-clip-heading">ยังไม่มีคลิปตัวอย่าง</h3>
                <p>ดูสิ่งที่ต้องมีและรายละเอียดได้ที่หน้าของแต่ละรายการ</p>
                <ul>
                  {without.map((skill) => (
                    <NoClipItem key={skill.slug} skill={skill} />
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <div className="empty">
            <Search size={32} />
            <h3>ยังไม่มีรายการที่ตรงกัน</h3>
            <p>
              {query
                ? "ลองค้นชื่อสไตล์ หรือเครื่องมือ เช่น Canvas, Remotion, เสียง"
                : "ตัวกรองชุดนี้ยังไม่มีรายการจริง เราไม่สร้าง skill ขึ้นมาเติมช่องว่าง"}
            </p>
            <button onClick={reset}>
              <RotateCcw size={16} />
              ล้างตัวกรอง
            </button>
          </div>
        )}
      </section>
      <GetStarted />
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
