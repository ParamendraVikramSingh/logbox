import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import "../styles/auth.css";

function Signup() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    await axios.post("http://localhost:5001/api/auth/signup", form);
    alert("Signup successful");
    navigate("/login");
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
            <p>Monitor, filter, and analyze your application logs</p>
          </div>
        </div>

        <div className="auth-right">
          <h2>Create account</h2>
          <p className="auth-subtitle">Join LogBox to get started</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <input
              className="auth-input"
              name="name"
              placeholder="Full name"
              onChange={handleChange}
            />
            <input
              className="auth-input"
              name="email"
              placeholder="Email address"
              onChange={handleChange}
            />
            <input
              className="auth-input"
              name="password"
              type="password"
              placeholder="Password"
              onChange={handleChange}
            />

            <button className="auth-btn" type="submit">Create account</button>
          </form>

          <p className="auth-footer">
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Signup;