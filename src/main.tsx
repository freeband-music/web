import { createRoot } from "react-dom/client";
import { startSession } from "./store/session";
import { App } from "./ui/App";
import { startRouter } from "./ui/router";
import "./ui/styles.css";

startRouter();
startSession();

createRoot(document.getElementById("root")!).render(<App />);
