import { describe, it, expect } from "vitest";
import { pack, unpack, isEncrypted, validateDump, safeName, msUntilNextRun } from "../src/modules/backup/backup.service.js";

const SQL = Buffer.from(["CREATE TABLE `_prisma_migrations` (x int);", "CREATE TABLE `Book` (x int);", "CREATE TABLE `User` (x int);", "CREATE TABLE `BorrowingTransaction` (x int);", "INSERT INTO `Book` VALUES (1);"].join("\n"));

describe("database backup files", () => {
  it("round-trips plain (gzip) and password-protected backups", () => {
    expect(unpack(pack(SQL)).equals(SQL)).toBe(true);
    const enc = pack(SQL, "Backup-Pass-1");
    expect(isEncrypted(enc)).toBe(true);
    expect(enc.includes(Buffer.from("INSERT INTO"))).toBe(false);
    expect(unpack(enc, "Backup-Pass-1").equals(SQL)).toBe(true);
  });

  it("refuses a wrong or missing backup password", () => {
    const enc = pack(SQL, "Backup-Pass-1");
    expect(() => unpack(enc)).toThrow(/password-protected/);
    expect(() => unpack(enc, "wrong-password")).toThrow(/Wrong backup password/);
  });

  it("accepts a plain .sql file (e.g. exported with phpMyAdmin)", () => {
    expect(unpack(SQL).equals(SQL)).toBe(true);
  });

  it("only restores AklatOne dumps that stay inside this database", () => {
    expect(() => validateDump(SQL)).not.toThrow();
    expect(() => validateDump(Buffer.from("CREATE TABLE `employees` (x int);"))).toThrow(/not an AklatOne/);
    expect(() => validateDump(Buffer.concat([SQL, Buffer.from("\nUSE `montalban_hris`;\n")]))).toThrow(/refused/);
    expect(() => validateDump(Buffer.concat([Buffer.from("CREATE DATABASE x;\n"), SQL]))).toThrow(/refused/);
    expect(() => validateDump(Buffer.concat([SQL, Buffer.from("\nGRANT ALL ON *.* TO x;\n")]))).toThrow(/refused/);
  });

  it("server file names cannot escape the backup folder", () => {
    expect(safeName("auto-2026-11-24-0200.sql.gz")).toBe(true);
    expect(safeName("aklatone-2026-11-24-0915.sql.gz.enc")).toBe(true);
    expect(safeName("../../.env")).toBe(false);
    expect(safeName("..%2F.env.sql.gz")).toBe(false);
    expect(safeName("notes.txt")).toBe(false);
  });

  it("schedules the daily backup at 2 AM Philippine time", () => {
    const at = (iso: string) => new Date(iso).getTime();
    // 01:00 PH (17:00 UTC the day before) -> 1 hour; 03:00 PH -> 23 hours.
    expect(msUntilNextRun(at("2026-11-23T17:00:00Z"), 2)).toBe(3600_000);
    expect(msUntilNextRun(at("2026-11-23T19:00:00Z"), 2)).toBe(23 * 3600_000);
  });
});
