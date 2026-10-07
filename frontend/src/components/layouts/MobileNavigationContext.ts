import { createContext, useContext } from 'react';

interface MobileNavigation {
  toolsOpen: boolean;
  setToolsOpen: (open: boolean) => void;
  closePanels: () => void;
}
export const MobileNavigationContext = createContext<MobileNavigation>({
  toolsOpen: false,
  setToolsOpen: () => {},
  closePanels: () => {},
});
export const useMobileNavigation = () => useContext(MobileNavigationContext);
