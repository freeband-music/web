import { createRoot } from "react-dom/client";
import { useAddons } from "./store/addons";
import { App } from "./ui/App";
import "./ui/styles.css";

// Pick up manifest changes in the background; startup does not wait for it.
void useAddons.getState().refresh();

createRoot(document.getElementById("root")!).render(<App />);
