import { describe, expect, it } from "vitest";
import { finalizeUploadInput } from "@/lib/domain/inputs";

const base = { documentId: "a".repeat(32), fileName: "invoice.pdf" };
const accepts = (fileUrl: string) => finalizeUploadInput.safeParse({ ...base, fileUrl }).success;

describe("finalize upload file location", () => {
  it("accepts EdgeStore file URLs", () => {
    expect(accepts("https://p-fjrt55498xyeqp.esfiles.dev/invoiceFiles/ws/doc/invoice.pdf")).toBe(true);
    expect(accepts("https://files.edgestore.dev/abc/invoiceFiles/_public/invoice.pdf")).toBe(true);
  });

  it("rejects other hosts, look-alikes and plain http", () => {
    expect(accepts("https://evil.example.com/invoice.pdf")).toBe(false);
    expect(accepts("https://esfiles.dev.evil.com/invoice.pdf")).toBe(false);
    expect(accepts("https://evilesfiles.dev/invoice.pdf")).toBe(false);
    expect(accepts("http://p-abc.esfiles.dev/invoice.pdf")).toBe(false);
  });
});
