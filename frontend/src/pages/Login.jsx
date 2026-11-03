import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AuthContext } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import "../styles/auth.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await axios.post(
        "http://localhost:5001/api/auth/login",
        { email, password }
      );

      const { user } = res.data;
      const role = user.role.toLowerCase();

      login(role, user);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("role", role);

      navigate("/dashboard");
    } catch (err) {
      setError("Login failed. Please check your credentials.");
    }
  };

  const { theme, toggleTheme } = useTheme();

  return (
    <div className="auth-container">
      <button
        className="auth-theme-toggle"
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-label="Toggle theme"
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>
      <div className="auth-card">
        <div className="auth-left">
          <div className="auth-brand">
            <div className="auth-brand-icon">📦</div>
            <h1>LogBox</h1>
            <p>Your centralized log monitoring dashboard</p>
          </div>
        </div>

        <div className="auth-right">
          <h2>Welcome back</h2>
          <p className="auth-subtitle">Sign in to your account</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <input
              className="auth-input"
              type="email"
              placeholder="Email address"
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              className="auth-input"
              type="password"
              placeholder="Password"
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && <p className="auth-error">{error}</p>}

            <button className="auth-btn" type="submit">Sign in</button>
          </form>

          <p className="auth-footer">
            Don't have an account? <a href="/signup">Sign up</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;