import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  Clapperboard,
  GitMerge,
  MessageCircleReply,
  MessageSquare,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WaitlistButton, WaitlistProvider } from "@/components/WaitlistButton";
import { CHANGELOG, ROADMAP_STATS } from "@/lib/changelog";
import { thaiDate } from "@/lib/dates";
import { PACKAGES, PRIVATE_PACKAGES } from "@/lib/packages";
import {
  AREA_LABELS,
  BIG_BETS,
  NOT_YET_LABEL,
  ROADMAP_SECTIONS,
  roadmapItem,
  roadmapItems,
  type RoadmapItem,
  type RoadmapStatus,
} from "@/lib/roadmap";
import { VISUAL_STYLES } from "@/lib/taxonomy";
import { RoadmapIcon } from "./RoadmapIcon";
import s from "./roadmap.module.css";

export const metadata: Metadata = {
  title: "แผนที่จะมา — kubcode",
  description:
    "kubcode กำลังไปทางไหน: สิ่งที่ใช้ได้วันนี้ สิ่งที่กำลังสร้าง และสิ่งที่เพิ่งปล่อย สิ่งที่ยังไม่เปิดไม่มีราคาหรือวันที่สัญญาไว้",
  alternates: { canonical: "/roadmap" },
};

const PLATFORMS = ["YouTube", "Instagram", "TikTok"] as const;
const DOT: Record<RoadmapStatus, string> = { now: s.dotNow, next: s.dotNext, later: s.dotLater };

function StatusBadge({ status }: { status: RoadmapStatus }) {
  if (status === "now") return <Badge variant="ok">ใช้ได้แล้ว</Badge>;
  return <Badge variant="warn">{status === "next" ? "กำลังทำ" : "ในอนาคต"} · {NOT_YET_LABEL}</Badge>;
}

function ItemCard({ item }: { item: RoadmapItem }) {
  const live = item.status === "now";
  return (
    <li className={`${s.item} ${live ? s.itemNow : ""}`}>
      <div className={s.itemTop}>
        <span className={s.itemIcon}>
          <RoadmapIcon name={item.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className={s.itemTitle}>{live && item.href ? <Link href={item.href}>{item.titleTh}</Link> : item.titleTh}</h4>
        </div>
      </div>
      <p className={s.itemValue}>{item.valueTh}</p>
      <div className={s.itemFoot}>
        <span className={s.area}>
          <span className="sr-only">หมวด: </span>
          {AREA_LABELS[item.area]}
        </span>
        {live ? <Badge variant="ok">ใช้ได้แล้ว</Badge> : <Badge variant="warn">{NOT_YET_LABEL}</Badge>}
      </div>
      {!live && (
        <div className="flex">
          <WaitlistButton kind="roadmap" id={item.id} label={item.titleTh} showCount className="h-10" />
        </div>
      )}
    </li>
  );
}

function McpMock() {
  return (
    <div className={s.mock} aria-hidden>
      <div className={s.window}>
        <div className={s.windowBar}>
          <span className={s.dots}>
            <i />
            <i />
            <i />
          </span>
          <Terminal size={14} />
          claude — kubcode MCP
        </div>
        <div className={s.chat}>
          <div className={s.msgUser}>ลง TikTok พรุ่งนี้ 19:00 แล้วตั้งให้คอมเมนต์ harness ได้ลิงก์</div>
          <div className={s.msgAgent}>
            <span className={s.agentIcon}>
              <Bot size={16} />
            </span>
            <div className="min-w-0">
              เรียบร้อย ตั้งเวลาโพสต์และกฎตอบคอมเมนต์ให้แล้ว
              <span className={s.tool}>kubcode.schedule_post(channel: "TikTok", at: "พรุ่งนี้ 19:00")</span>
              <span className={s.tool}>kubcode.add_reply_rule(keyword: "harness", reply: ลิงก์)</span>
            </div>
          </div>
        </div>
      </div>
      <div className={s.results}>
        <div className={s.resultCard}>
          <span className={s.resultLabel}>
            <CalendarClock size={15} /> ตั้งเวลาโพสต์
          </span>
          <span className={s.resultTitle}>TikTok · พรุ่งนี้ 19:00</span>
          <span className={s.resultMeta}>คลิปแนวตั้ง 9:16 · รอโพสต์</span>
        </div>
        <div className={s.resultCard}>
          <span className={s.resultLabel}>
            <MessageCircleReply size={15} /> กฎตอบคอมเมนต์
          </span>
          <span className={s.resultTitle}>
            คอมเมนต์ <span className={s.mono}>harness</span>
          </span>
          <span className={s.resultMeta}>ตอบกลับพร้อมลิงก์อัตโนมัติ</span>
        </div>
      </div>
    </div>
  );
}

function ClipQueueMock() {
  const rows = [
    { title: "What If: ถ้าโลกหยุดหมุน 1 วินาที", meta: "แนวตั้ง · 45 วินาที", state: "กำลังทำ" },
    { title: "สารคดีใต้ทะเล: ปลาตกเบ็ด", meta: "แนวตั้ง · 60 วินาที", state: "รอคิว" },
    { title: "รีวิวเครื่องมือ AI ประจำสัปดาห์", meta: "แนวตั้ง · 30 วินาที", state: "รอคิว" },
  ];
  return (
    <div className={s.mock} aria-hidden>
      <div className={s.window}>
        <div className={s.windowBar}>
          <span className={s.dots}>
            <i />
            <i />
            <i />
          </span>
          <Clapperboard size={14} />
          คิวคลิปวันนี้
        </div>
        <ul className={`${s.queue} p-4`}>
          {rows.map((r) => (
            <li key={r.title} className={s.queueItem}>
              <span className={s.thumb}>
                <Clapperboard size={16} />
              </span>
              <span className="min-w-0">
                <span className={`${s.queueTitle} block`}>{r.title}</span>
                <span className={`${s.queueMeta} block`}>{r.meta}</span>
              </span>
              <span className={s.queueMeta}>{r.state}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Roadmap() {
  const stats = [
    { value: PACKAGES.length, label: "skill ฟรีให้โหลด" },
    { value: Object.keys(VISUAL_STYLES).length, label: "แนวภาพในคลัง" },
    { value: PLATFORMS.length, label: "แพลตฟอร์มที่เชื่อมได้" },
    { value: ROADMAP_STATS.prsThisMonth, label: "PR ที่ปล่อยเดือนนี้" },
  ];
  const [mcp, clips] = BIG_BETS;
  const mcpItem = roadmapItem(mcp.itemId)!;
  const clipItem = roadmapItem(clips.itemId)!;

  return (
    <main id="main" className={s.page}>
      <WaitlistProvider>
        <header className={`${s.hero} ${s.column}`}>
          <div className={s.aura} />
          <p className={`${s.eyebrow} ${s.rise}`}>
            <GitMerge size={15} aria-hidden /> แผนที่จะมา · อัปเดต {thaiDate(ROADMAP_STATS.asOf, "short")}
          </p>
          <h1 className={`${s.headline} ${s.rise2}`}>
            จากไอเดียในหัว <em>ถึงคลิปที่โพสต์เอง</em>
          </h1>
          <p className={`${s.mission} ${s.rise3}`}>
            kubcode ช่วยครีเอเตอร์ไทยทำคลิปสั้นด้วย AI agent ของตัวเอง แล้วปล่อยให้ระบบโพสต์และตอบคอมเมนต์แทน
            หน้านี้บอกตรง ๆ ว่าอะไรใช้ได้แล้ว อะไรกำลังทำ และอะไรยังเป็นแผน
          </p>
          <dl className={`${s.stats} ${s.rise3}`}>
            {stats.map((x) => (
              <div key={x.label} className={s.stat}>
                <dt>{x.label}</dt>
                <dd>{x.value}</dd>
              </div>
            ))}
          </dl>
          <p className={s.statsNote}>
            นับจากคลังและประวัติการปล่อยงานของเว็บ ณ {thaiDate(ROADMAP_STATS.asOf, "short")} (เดือนพฤศจิกายน 2569)
          </p>
        </header>

        <div className={s.column}>
          <section className={s.section} aria-labelledby="bets-h">
            <div className={s.sectionHead}>
              <div>
                <h2 id="bets-h">เรื่องใหญ่ที่กำลังมา</h2>
                <p>สองอย่างที่เราลงแรงมากที่สุด ทั้งคู่ยังไม่เปิดให้ใช้ และยังไม่มีราคาหรือวันเปิด</p>
              </div>
            </div>
            <div className={s.bets}>
              <article className={s.bet} aria-labelledby="bet-mcp">
                <div className={s.betCopy}>
                  <div className={s.betMeta}>
                    <span className={s.kicker}>{mcp.kickerTh}</span>
                    <StatusBadge status={mcpItem.status} />
                  </div>
                  <h3 id="bet-mcp">{mcp.headlineTh}</h3>
                  <p>{mcp.bodyTh}</p>
                  <ul className={s.betPoints}>
                    <li>
                      <Check size={16} aria-hidden /> ตั้งเวลาโพสต์ลง YouTube, Instagram หรือ TikTok จากแชต
                    </li>
                    <li>
                      <Check size={16} aria-hidden /> ตั้งกฎตอบคอมเมนต์ด้วยคำสั่งเดียว
                    </li>
                    <li>
                      <Check size={16} aria-hidden /> ใช้ได้กับ Claude Code และ Codex
                    </li>
                  </ul>
                  <p className="sr-only">
                    ตัวอย่าง: พิมพ์ว่า “ลง TikTok พรุ่งนี้ 19:00 แล้วตั้งให้คอมเมนต์ harness ได้ลิงก์” แล้ว agent
                    ตั้งเวลาโพสต์ TikTok พรุ่งนี้ 19:00 และตั้งกฎให้คอมเมนต์ที่มีคำว่า harness ได้คำตอบพร้อมลิงก์
                  </p>
                  <WaitlistButton kind="roadmap" id={mcpItem.id} label={mcpItem.titleTh} showCount />
                </div>
                <McpMock />
              </article>

              <article className={`${s.bet} ${s.betLater}`} aria-labelledby="bet-clips">
                <div className={s.betCopy}>
                  <div className={s.betMeta}>
                    <span className={s.kicker}>{clips.kickerTh}</span>
                    <StatusBadge status={clipItem.status} />
                  </div>
                  <h3 id="bet-clips">{clips.headlineTh}</h3>
                  <p>{clips.bodyTh}</p>
                  <WaitlistButton kind="roadmap" id={clipItem.id} label={clipItem.titleTh} showCount />
                </div>
                <ClipQueueMock />
              </article>
            </div>
          </section>

          <section className={s.section} aria-labelledby="lanes-h">
            <div className={s.sectionHead}>
              <div>
                <h2 id="lanes-h">ภาพรวมทั้งหมด</h2>
                <p>รายการที่ยังไม่เปิดไม่มีราคาและไม่มีวันที่สัญญาไว้ และอาจเปลี่ยนได้ กด “แจ้งฉันเมื่อเปิด” เพื่อบอกเราว่าอยากได้อะไรก่อน</p>
              </div>
            </div>
            <p className={s.swipeHint} aria-hidden>
              ปัดซ้ายเพื่อดู กำลังทำ และ ในอนาคต →
            </p>
            <div className={s.lanes} role="region" aria-label="ภาพรวม: ตอนนี้ กำลังทำ ในอนาคต" tabIndex={0}>
              {ROADMAP_SECTIONS.map((sec) => {
                const items = roadmapItems(sec.status);
                return (
                  <section key={sec.status} className={s.lane} aria-labelledby={`lane-${sec.status}`}>
                    <div className={s.laneHead}>
                      <h3 id={`lane-${sec.status}`} className={s.laneTitle}>
                        <span className={`${s.laneDot} ${DOT[sec.status]}`} aria-hidden />
                        {sec.titleTh} <span className={s.laneEn}>{sec.titleEn}</span>
                      </h3>
                      <span className={s.laneCount} aria-label={`${items.length} รายการ`}>
                        {items.length}
                      </span>
                    </div>
                    <p className={s.laneLead}>{sec.leadTh}</p>
                    <ul className={s.cards}>
                      {items.map((i) => (
                        <ItemCard key={i.id} item={i} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </section>

          <section className={s.section} aria-labelledby="shipped-h">
            <div className={s.sectionHead}>
              <div>
                <h2 id="shipped-h">เพิ่งปล่อย</h2>
                <p>งานจริงที่ขึ้นเว็บแล้ว ใหม่สุดอยู่บน ทุกรายการลิงก์ไปที่ pull request บน GitHub</p>
              </div>
            </div>
            <ol className={s.log}>
              {CHANGELOG.map((e) => (
                <li key={e.pr} className={s.logItem}>
                  <time className={s.logDate} dateTime={e.date}>
                    {thaiDate(e.date, "short").replace(/ \d{4}$/, "")}
                  </time>
                  <div className={s.logBody}>
                    <h3 className={s.logTitle}>
                      {e.href ? <Link href={e.href}>{e.titleTh}</Link> : e.titleTh}
                      <span className={s.pr}>
                        <a href={`https://github.com/JK369x/kubcode/pull/${e.pr}`} aria-label={`pull request หมายเลข ${e.pr} บน GitHub`}>
                          #{e.pr}
                        </a>
                      </span>
                    </h3>
                    <p className={s.logDetail}>{e.detailTh}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className={s.cta} aria-labelledby="cta-h">
            <div>
              <h2 id="cta-h">อยากได้อะไร บอกเรา</h2>
              <p>ทุกรายการในหน้านี้มาจากสิ่งที่ครีเอเตอร์ขอ เขียนมาเล่าได้เลย หรือดูว่าตอนนี้ใช้อะไรได้บ้างในหน้าราคา</p>
            </div>
            <div className={s.ctaActions}>
              <Button asChild variant="feature">
                <Link href="/contact">
                  <MessageSquare aria-hidden /> บอกเราว่าอยากได้อะไร
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11">
                <Link href="/pricing">
                  ดูราคา <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
          </section>
        </div>
      </WaitlistProvider>
    </main>
  );
}
