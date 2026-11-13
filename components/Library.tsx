"use client";
import { TitleTransition } from "@/components/TitleTransition";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  ArrowUpRight,
  RotateCcw,
  ChevronDown,
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
import { SocialSection } from "./SocialSection";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KineticHero } from "./KineticHero";
import heroStyles from "./KineticHero.module.css";

const PUBLISHED = publishedShowcase();
/** What the homepage filters: every skill, the shelf's clips. */
const HOME: HomeData = { skills, clips: cartoonShowcase(PUBLISHED), published: PUBLISHED };
const USE_CASE_IDS = useCases.map((u) => u.id);

type Option = { id: string; label: string; en?: string; count: number };

/**
 * "อยากทำอะไร": one calm row of chips (shadcn ToggleGroup, single: a radio
 * group, arrows move). Thai label only; the count is small and muted. One
 * chip is always checked. At phone widths the row scrolls sideways.
 */
function UseCaseRow({ label, options, value, onPick }: { label: string; options: readonly Option[]; value: string; onPick: (id: string) => void }) {
  return (
    <ToggleGroup
      type="single"
      // Phones: one row that scrolls sideways (bleeds to the screen edge)
      // instead of wrapping into several rows.
      className="filter-chips categories max-[560px]:-mx-[5.5vw] max-[560px]:flex-nowrap max-[560px]:overflow-x-auto max-[560px]:px-[5.5vw] max-[560px]:py-1.5 max-[560px]:[scrollbar-width:none]"
      aria-label={label}
      data-filter="use"
      value={value}
      onValueChange={(id) => id && onPick(id)}
    >
      {options.map((item) => (
        <ToggleGroupItem
          key={item.id}
          value={item.id}
          data-value={item.id}
          {...(item.count === 0 ? { "data-empty": "" } : {})}
          className="gap-1.5 data-empty:not-data-[state=on]:opacity-50"
        >
          {item.label}
          <span className="font-brand text-xs text-muted-foreground group-data-[state=on]/toggle:text-inherit group-data-[state=on]/toggle:opacity-80">{item.count}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * "แนวภาพ" / "แนวเรื่อง": a compact trigger that shows the current value
 * ("แนวภาพ: ทั้งหมด ▾") and opens a shadcn DropdownMenu of radio items (Thai
 * name, small English name, count). Radix gives the menu semantics: arrows,
 * Home/End, type-ahead, Esc returns focus to the trigger.
 */
function FacetMenu({ label, name, options, value, onPick }: { label: string; name: string; options: readonly Option[]; value: string; onPick: (id: string) => void }) {
  const current = options.find((o) => o.id === value) ?? options[0];
  const active = value !== "all";
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-filter={name}
          data-active={active ? "" : undefined}
          aria-label={`${label}: ${current.label}`}
          className="facet-trigger rounded-full px-4 text-sm data-active:border-primary data-active:bg-secondary data-active:text-secondary-foreground"
        >
          <span className="text-muted-foreground in-data-active:text-inherit">{label}:</span>
          <span className="max-w-[12em] truncate font-semibold">{current.label}</span>
          <ChevronDown className="size-4 opacity-70" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(70vh,440px)] min-w-[260px]">
        <DropdownMenuLabel className="px-2 pt-1 pb-1.5 text-[13px] font-semibold text-muted-foreground">{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(id) => id && onPick(id)}>
          {options.map((o) => (
            <DropdownMenuRadioItem
              key={o.id}
              value={o.id}
              data-value={o.id}
              className={o.count === 0 && o.id !== value ? "opacity-60" : undefined}
            >
              <span className="min-w-0 flex-1">
                {o.label}
                {o.en && (
                  <small lang="en" className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {o.en}
                  </small>
                )}
              </span>
              <span className="font-brand text-xs font-normal text-muted-foreground">{o.count}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
  links = { pricing: false, roadmap: false },
}: {
  articles: ArticleTeaser[];
  /** Optional pages that ship in this build (lib/site-routes hasPage). */
  links?: { pricing: boolean; roadmap: boolean };
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
        pricing={links.pricing}
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
      <SocialSection pricing={links.pricing} roadmap={links.roadmap} />
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
            <Search size={19} aria-hidden="true" />
            <span className="sr-only">ค้นหาในรายการ</span>
            <Input
              type="search"
              value={query}
              onChange={(event) => set({ query: event.target.value })}
              placeholder="ค้นหาในรายการ"
              className="h-auto rounded-none border-0 bg-transparent p-0 focus-visible:outline-0"
            />
          </label>
        </div>
        {/* Calm filter bar (owner, 2026-11-12): one row of use-case chips and
            two compact menus for แนวภาพ / แนวเรื่อง; same filter, same URL. */}
        <div className="filter-bar">
          <UseCaseRow label="อยากทำอะไร" options={useCaseOptions} value={useCase} onPick={(id) => set({ useCase: id })} />
          <div className="filter-menus">
            <FacetMenu label="แนวภาพ" name="visual" options={facetOptions("visual", HOME, filter)} value={filter.visual} onPick={(id) => set({ visual: id })} />
            <FacetMenu label="แนวเรื่อง" name="story" options={facetOptions("story", HOME, filter)} value={filter.story} onPick={(id) => set({ story: id })} />
            <span className="result-line" role="status" aria-live="polite">
              {total} รายการ
            </span>
          </div>
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
            <Button type="button" variant="outline" onClick={reset}>
              <RotateCcw size={16} aria-hidden="true" />
              ล้างตัวกรอง
            </Button>
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
