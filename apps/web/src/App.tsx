import { useEffect } from "react";
import { BottomPanel } from "./components/BottomPanel";
import { CallMode } from "./components/CallMode";
import { Composer } from "./components/Composer";
import { Conversation } from "./components/Conversation";
import { Dialogs } from "./components/Dialogs";
import { Sidebar } from "./components/Sidebar";
import { SubagentBoard } from "./components/SubagentBoard";
import { SummaryPanel } from "./components/SummaryPanel";
import { Topbar } from "./components/Topbar";
import { useStore } from "./lib/store";

export function App() {
  const { connect, ui, send } = useStore();
  useEffect(() => {
    connect();
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        send({ type: "new_session" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connect, send]);

  const cls = [
    "app",
    ui.sidebar ? "" : "no-sidebar",
    ui.side ? "" : "no-side",
    ui.bottom ? "" : "no-bottom",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <Topbar />
      {ui.sidebar ? <Sidebar /> : <div className="sidebar" style={{ display: "none" }} />}
      <main className="main">
        <Conversation />
        <Composer />
      </main>
      {ui.side ? <SubagentBoard /> : <div />}
      <BottomPanel />
      <CallMode />
      <Dialogs />
      <SummaryPanel />
    </div>
  );
}
