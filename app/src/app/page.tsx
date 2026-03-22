"use client";

import { Canvas } from "@/components/Canvas";
import { Chat } from "@/components/Chat";
import { Logo } from "@/components/Logo";
import { Settings } from "@/components/Settings";

export default function Home() {
  return (
    <div className="relative h-screen w-screen">
      <Logo />
      <Canvas />
      <Chat />
      <Settings />
    </div>
  );
}
