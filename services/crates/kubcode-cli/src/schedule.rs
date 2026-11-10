//! The summary the owner confirms before anything is scheduled (scheduler PRD:
//! "ยืนยันตั้งเวลา" on video, cover, title, description, tags, channel and
//! time). The same request is hashed and sent, so what was shown is what runs.

use publishing_lambda::summary::ScheduleRequest;
use time::UtcOffset;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ChannelInfo {
    pub id: Uuid,
    pub platform: String,
    pub name: String,
}

const MONTHS: [&str; 12] = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
];

/// Bangkok wall-clock time, Gregorian year.
pub fn bangkok(t: time::OffsetDateTime) -> String {
    let t = t.to_offset(UtcOffset::from_hms(7, 0, 0).expect("valid offset"));
    format!(
        "{} {} {} {:02}:{:02}",
        t.day(),
        MONTHS[t.month() as usize - 1],
        t.year(),
        t.hour(),
        t.minute()
    )
}

fn platform_label(p: &str) -> &str {
    match p {
        "youtube" => "YouTube",
        "instagram" => "Instagram",
        "tiktok" => "TikTok",
        other => other,
    }
}

pub fn render_summary(req: &ScheduleRequest, channels: &[ChannelInfo], cover_file: &str) -> String {
    let mut s = String::new();
    s.push_str(&format!("คลิป:      {}\n", req.clip_ref));
    s.push_str(&format!("ปก:        {cover_file}\n"));
    s.push_str(&format!("ชื่อ:       {}\n", req.title));
    s.push_str(&format!(
        "คำอธิบาย:  {}\n",
        req.description.replace('\n', "\n           ")
    ));
    s.push_str(&format!("แท็ก:      {}\n", req.tags.join(", ")));
    for t in &req.targets {
        let ch = channels.iter().find(|c| c.id == t.channel);
        let name = ch.map(|c| format!("{} ({})", c.name, platform_label(&c.platform)));
        s.push_str(&format!(
            "ช่อง:       {}\nเวลา:       {} (เวลาไทย)\nการมองเห็น: {}\n",
            name.unwrap_or_else(|| t.channel.to_string()),
            bangkok(t.publish_at),
            t.visibility.as_str()
        ));
        if ch.is_some_and(|c| c.platform == "tiktok") {
            s.push_str(TIKTOK_NOTE);
        }
    }
    s
}

/// What the owner agrees to for TikTok, shown before the confirmation
/// (TikTok asks for the creator's preview and consent on direct posts).
pub const TIKTOK_NOTE: &str = "TikTok:     โพสต์สาธารณะทันทีที่ถึงเวลา (บัญชีที่เชื่อมผ่าน TikTok for Business โพสต์แบบส่วนตัวไม่ได้) · คำบรรยายใช้ \"คำอธิบาย\" ไม่ใช้ชื่อ · เปิดคอมเมนต์ ปิด Duet/Stitch · วิดีโอต้องเป็น 9:16\n";

/// TikTok through Zernio's TikTok for Business connection posts public only.
/// Caught here, before anything is uploaded; the Lambda refuses it too.
pub fn check_visibility(
    targets: &[Uuid],
    channels: &[ChannelInfo],
    visibility: kubcode_publishing::domain::Visibility,
) -> Result<(), String> {
    let tiktok = targets.iter().any(|t| {
        channels
            .iter()
            .any(|c| c.id == *t && c.platform == "tiktok")
    });
    if tiktok && visibility != kubcode_publishing::domain::Visibility::Public {
        return Err(
            "TikTok โพสต์ได้แค่สาธารณะ ใส่ --visibility public (ช่อง YouTube ที่อยากให้เป็นส่วนตัว ให้ตั้งเวลาแยกอีกคำสั่ง)"
                .into(),
        );
    }
    Ok(())
}
