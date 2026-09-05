import { createContext, useContext } from "react";
// Every overlay inherits the same scoped theme as its owning React root.
export const PortalContainerContext = createContext<HTMLElement | undefined>(undefined);
export const usePortalContainer = () => useContext(PortalContainerContext);
