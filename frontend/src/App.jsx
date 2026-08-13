import { useState } from "react";
import EnrollTab from "./EnrollTab";
import LiveAttendanceTab from "./LiveAttendanceTab";

export default function App() {
  const [tab, setTab] = useState("enroll");

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
      <h1>Facial Recognition Attendance</h1>
      <nav style={{ marginBottom: 20 }}>
        <button onClick={() => setTab("enroll")} disabled={tab === "enroll"}>
          Enroll
        </button>{" "}
        <button onClick={() => setTab("live")} disabled={tab === "live"}>
          Live Attendance
        </button>
      </nav>
      {tab === "enroll" ? <EnrollTab /> : <LiveAttendanceTab />}
    </div>
  );
}
