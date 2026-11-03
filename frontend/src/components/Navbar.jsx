import { useTheme } from "../context/ThemeContext";
import "../styles/Navbar.css";

function Navbar({ user, logout, title = "Logs" }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="topbar">
      <div className="topbar-left">
        <span className="topbar-project">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          LogBox
        </span>
      </div>

      <div className="topbar-title">
        <span className="topbar-title-label">{title}</span>
      </div>

      <div className="topbar-right">
        <button
          className="topbar-icon-btn"
          onClick={toggleTheme}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          {theme === "dark" ? "Sun" : "Moon"}
        </button>
        {user && (
          <>
            <div className="topbar-avatar">{(user.name || "U")[0].toUpperCase()}</div>
            <button className="topbar-dots" onClick={logout} title="Logout">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
