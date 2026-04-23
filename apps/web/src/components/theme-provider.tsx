"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme") as Theme | null;
      const preferred =
        saved ??
        (window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light");
      setTheme(preferred);
      document.documentElement.classList.toggle("dark", preferred === "dark");
    } catch {
      // ignore SSR / private-browsing errors
    }
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem("theme", next);
        document.documentElement.classList.toggle("dark", next === "dark");
      } catch {}
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
