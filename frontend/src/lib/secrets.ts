import { invoke } from "@tauri-apps/api/core";

/**
 * Desktop only: secrets in the operating system's credential store (Windows Credential Manager, macOS Keychain,
 * Linux Secret Service) through the app's secret_* commands (desktop-tauri/src/lib.rs). Keys must start with "aklatone_".
 * Each call rejects when the computer has no credential store; callers then keep the old localStorage behaviour.
 */
export const secretGet = (key: string) => invoke<string | null>("secret_get", { key });
export const secretSet = (key: string, value: string) => invoke<void>("secret_set", { key, value });
export const secretDelete = (key: string) => invoke<void>("secret_delete", { key });
