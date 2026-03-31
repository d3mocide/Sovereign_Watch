import { useState } from "react";

export function useSidebarState() {
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false);
  const [isSystemHealthOpen, setIsSystemHealthOpen] = useState(false);
  const [isAIAnalystOpen, setIsAIAnalystOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  return {
    isAlertsOpen,
    setIsAlertsOpen,
    isSystemSettingsOpen,
    setIsSystemSettingsOpen,
    isSystemHealthOpen,
    setIsSystemHealthOpen,
    isAIAnalystOpen,
    setIsAIAnalystOpen,
    isTerminalOpen,
    setIsTerminalOpen,
    isUserMenuOpen,
    setIsUserMenuOpen,
  };
}
