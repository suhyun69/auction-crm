import Link from "next/link";
export function AppNavigation({ active }: { active: "dashboard" | "simulator" }) {
  return <nav className="app-navigation" aria-label="주요 메뉴">
    <Link href="/" className={active === "dashboard" ? "is-active" : ""} aria-current={active === "dashboard" ? "page" : undefined}>경매 대시보드</Link>
    <Link href="/simulator" className={active === "simulator" ? "is-active" : ""} aria-current={active === "simulator" ? "page" : undefined}>시뮬레이터</Link>
  </nav>;
}
