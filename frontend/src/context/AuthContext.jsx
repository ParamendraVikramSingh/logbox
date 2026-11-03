import { createContext, useState, useEffect } from "react";

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);

  // ✅ load from localStorage on refresh
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    const storedRole = localStorage.getItem("role");

    if (storedUser && storedRole) {
      setUser(storedUser);
      setRole(storedRole);
    }
  }, []);

  // ✅ login function
  const login = (userData) => {
    setUser(userData);
    setRole(userData.role);

    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("role", userData.role);
  };

  // ✅ logout
  const logout = () => {
    setUser(null);
    setRole(null);

    localStorage.removeItem("user");
    localStorage.removeItem("role");
  };

  return (
    <AuthContext.Provider value={{ user, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}