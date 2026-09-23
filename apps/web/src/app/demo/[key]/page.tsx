import type { Metadata } from "next";

import { DemoEntry } from "./demo-entry";

export const metadata: Metadata = {
  title: "Demo · PCOBooster",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

interface DemoPageProps {
  params: Promise<{ key: string }>;
}

const DemoPage = async ({ params }: DemoPageProps) => {
  const { key } = await params;
  return <DemoEntry demoKey={key} />;
};

export default DemoPage;
