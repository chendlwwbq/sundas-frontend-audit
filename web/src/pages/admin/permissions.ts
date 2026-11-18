import { createContext, useContext } from "react";
export const AdminPermissionsContext = createContext<string[]>([]);
export function useAdminPermissions() { return useContext(AdminPermissionsContext); }
