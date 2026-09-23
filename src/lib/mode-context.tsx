import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type UserMode = "CONTRIBUTOR" | "TRAVELLER";

interface ModeContextType {
  mode: UserMode;
  setMode: (mode: UserMode) => void;
  isContributor: boolean;
  isTraveller: boolean;
  presentationMode: boolean;
  setPresentationMode: (enabled: boolean) => void;
  togglePresentationMode: () => void;
}

const ModeContext = createContext<ModeContextType | null>(null);

const STORAGE_KEY = "beacon_user_mode";
const PRESENTATION_KEY = "beacon_presentation_mode";

export function ModeProvider({ children }: { children: ReactNode }) {
  // Default to CONTRIBUTOR for default operational sensing view
  const [mode, setModeState] = useState<UserMode>("CONTRIBUTOR");
  const [presentationMode, setPresentationModeState] = useState(false);

  // Read saved preference after client mount to prevent SSR hydration mismatch
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "CONTRIBUTOR" || saved === "TRAVELLER") {
        setModeState(saved);
      }
      const savedPres = localStorage.getItem(PRESENTATION_KEY);
      if (savedPres === "true") {
        setPresentationModeState(true);
        document.documentElement.classList.add("presentation-mode");
      }
    } catch {
      // Ignore localStorage errors in restricted environments
    }
  }, []);

  const setMode = (nextMode: UserMode) => {
    setModeState(nextMode);
    try {
      localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // Ignore
    }
  };

  const setPresentationMode = (enabled: boolean) => {
    setPresentationModeState(enabled);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("presentation-mode", enabled);
    }
    try {
      localStorage.setItem(PRESENTATION_KEY, enabled ? "true" : "false");
    } catch {
      // Ignore
    }
  };

  const togglePresentationMode = () => {
    setPresentationMode(!presentationMode);
  };

  return (
    <ModeContext.Provider
      value={{
        mode,
        setMode,
        isContributor: mode === "CONTRIBUTOR",
        isTraveller: mode === "TRAVELLER",
        presentationMode,
        setPresentationMode,
        togglePresentationMode,
      }}
    >
      {children}
    </ModeContext.Provider>
  );
}

export function useUserMode(): ModeContextType {
  const context = useContext(ModeContext);
  if (!context) {
    throw new Error("useUserMode must be used within a ModeProvider");
  }
  return context;
}
