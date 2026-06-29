import { invoke } from "@tauri-apps/api/core";

export interface ProjectEntry {
  name: string;
  path: string;
}

export function getProjectsList(): Promise<ProjectEntry[]> {
  return invoke<ProjectEntry[]>("get_projects_list");
}

export function addProject(name: string, path: string): Promise<void> {
  return invoke("add_project", { name, path });
}

export function removeProject(path: string): Promise<void> {
  return invoke("remove_project", { path });
}
