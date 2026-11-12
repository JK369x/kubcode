import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { categories, type Skill } from "@/lib/catalog";
import { coverFor } from "@/lib/media-covers";
import { showcaseForSkill } from "@/lib/showcase";
import { hasWithheldMedia } from "@/lib/publication";
import { skillBadges } from "@/lib/skill-badges";
import { playPreview, stopPreview } from "./hoverPreview";
import { CardDownloadAction } from "./CardDownloadAction";
import { SkillIcon, getSkillTools } from "./ToolChips";
import { ToolMark, resolveToolMark } from "./ToolMark";
import { SkeletonImage } from "./SkeletonImage";
import styles from "./MediaSkillCard.module.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/*
 * Full-media catalog card.
 *
 * The real poster covers the whole portrait card; title, authors and the
 * (unavailable) download action sit over a dark bottom scrim. The poster is
 * cropped to fill here on purpose — the intrinsic, uncropped framing belongs
 * to the playable featured/detail preview, not to this catalog cover.
 *
 * Layering: one full-card preview button sits behind everything. Overlay
 * containers ignore pointer events so empty areas fall through to it; only
 * the real links/buttons opt back in. Nothing interactive is nested inside
 * another interactive element.
 *
 * Skills with no media keep an honest no-media cover: the category glyph,
 * the skill's own category, "no preview yet" (or "rights pending" when this
 * build withheld existing media), and the declared requirements — no
 * substitute artwork.
 */

/** Card width in the catalog grid (.skill-grid: 4, 3, then 2 columns). */
const CARD_SIZES = "(max-width: 850px) 50vw, (max-width: 1180px) 33vw, 300px";

/** Workflow name for the no-media cover, from the skill's own category. */
function emptyTitle(category: string): string {
  if (category === "audio") return "เวิร์กโฟลว์เสียงไทย";
  const label = categories.find((item) => item.id === category && item.id !== "all")?.label;
  return label ? "เวิร์กโฟลว์" + label : "เวิร์กโฟลว์";
}

export function MediaSkillCard({
  skill,
  onSelectSkill,
  eager = false,
}: {
  skill: Skill;
  onSelectSkill: (slug: string) => void;
  eager?: boolean;
}) {
  // An approved clip made with this skill gives the card its cover (in every
  // media mode) and opens the skill page, where those clips are; otherwise
  // the skill's own cover under the media policy, if any.
  const showcase = showcaseForSkill(skill.slug);
  const poster = showcase?.cover.poster.src ?? coverFor(skill);
  const tools = getSkillTools(skill);
  const authors = getSkillTools(skill, true);
  const detailHref = "/skills/" + encodeURIComponent(skill.slug);
  const badges = skillBadges(skill);
  // The style's muted preview loop; plays on hover or focus only (hoverPreview).
  const preview = showcase?.cover.preview ?? null;

  return (
    <Card
      as="article"
      variant="media"
      className={"skill-card " + styles.card}
      data-media={poster ? "poster" : "none"}
      data-category={skill.category}
      data-skill={skill.slug}
      onPointerEnter={(e) => e.pointerType !== "touch" && playPreview(e.currentTarget)}
      onPointerLeave={(e) => stopPreview(e.currentTarget)}
      onFocus={(e) => playPreview(e.currentTarget)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) stopPreview(e.currentTarget);
      }}
    >
      {showcase && poster ? (
        <Link className={"card-preview " + styles.hit} href={detailHref} aria-label={"ดูคลิปตัวอย่าง " + skill.name}>
          <SkeletonImage
            className={styles.poster}
            src={poster}
            alt=""
            fill
            sizes={CARD_SIZES}
            loading={eager ? "eager" : "lazy"}
            draggable={false}
          />
          {preview && (
            <video
              className={styles.video}
              data-src={preview.src}
              muted
              loop
              playsInline
              preload="none"
              aria-hidden="true"
              tabIndex={-1}
            />
          )}
        </Link>
      ) : (
        <button
          type="button"
          className={
            "card-preview " + styles.hit + (poster ? "" : " without-media")
          }
          aria-label={"ดูผลงาน " + skill.name}
          onClick={() => onSelectSkill(skill.slug)}
        >
          {poster ? (
            <SkeletonImage
              className={styles.poster}
              src={poster}
              alt=""
              fill
              sizes={CARD_SIZES}
              loading={eager ? "eager" : "lazy"}
              draggable={false}
            />
          ) : (
            <span className={styles.empty}>
              <span className={styles.emptyGlyph}>
                <SkillIcon category={skill.category} size={30} />
              </span>
              <strong className={styles.emptyTitle}>
                {emptyTitle(skill.category)}
              </strong>
              <span className={styles.emptyNote}>
                {hasWithheldMedia(skill)
                  ? "สื่อตัวอย่างรอยืนยันสิทธิ์เผยแพร่"
                  : "ยังไม่มีสื่อพรีวิว"}
              </span>
            </span>
          )}
        </button>
      )}

      <div className={styles.top}>
        {tools.length > 0 && (
          <ul className={styles.tools} aria-label="เครื่องมือที่ต้องใช้">
            {tools.map(({ name }) => (
              <li
                className={styles.tool}
                key={name}
                title={name}
                data-tool={resolveToolMark(name).key}
              >
                <span role="img" aria-label={name} className={styles.toolMark}>
                  <ToolMark name={name} size={18} className={styles.mark} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!poster && skill.requirements.length > 0 && (
        <div className={styles.needs}>
          <p className={styles.needsTitle}>สิ่งที่ต้องมี</p>
          <ul className={styles.needsList}>
            {skill.requirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.bottom}>
        <ul className={styles.badges} aria-label="ข้อมูลสำคัญ">
          {badges.map((b) => (
            <li key={b.key} title={b.title}>
              <Badge variant="media" className={styles.badge} data-badge={b.key}>
                {b.label}
              </Badge>
            </li>
          ))}
        </ul>
        <h3 className={styles.title}>
          <Link className={styles.titleLink} href={detailHref}>
            <span>{skill.name}</span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </h3>
        <p className={styles.srOnly}>{skill.description}</p>
        {authors.length > 0 && (
          <ul className={styles.authors + " " + styles.srOnly} aria-label="ผู้เขียนโค้ด">
            {authors.map(({ name }) => (
              <li className={styles.author} key={name}>
                <span className={styles.authorMark}>
                  <ToolMark name={name} size={16} className={styles.mark} />
                </span>
                {name}
              </li>
            ))}
          </ul>
        )}
        <div className={styles.action}>
          <CardDownloadAction slug={skill.slug} name={skill.name} />
        </div>
      </div>
    </Card>
  );
}
