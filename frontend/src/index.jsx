import "./index.css";
import ReactDOM from "react-dom/client";
import { AppRouter } from "./app/AppRouter";
const rootEl = document.getElementById("root");
if (rootEl) {
    ReactDOM.createRoot(rootEl).render(<AppRouter />);
}
