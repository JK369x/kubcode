import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="reading">
      <h1>ไม่พบรายการนี้</h1>
      <p>รายการอาจยังไม่อยู่ในคลังต้นแบบ</p>
      <Link href="/">กลับไปเลือกจากคลัง</Link>
    </main>
  );
}
